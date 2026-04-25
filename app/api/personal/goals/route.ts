import { auth } from '@/lib/auth-compat'
import { NextResponse } from 'next/server'
import { db, savingsGoals, savingsDeposits } from '@/lib/db'
import { eq, desc } from 'drizzle-orm'
import { getAIClient } from '@/lib/ai-client'
import { rateLimit } from '@/lib/rate-limit'
import { z } from 'zod'

const CreateGoalSchema = z.object({
  name: z.string().min(1).max(255),
  emoji: z.string().max(10).optional(),
  targetAmount: z.union([z.number().positive(), z.string().regex(/^\d+(\.\d+)?$/).transform(Number)]),
  deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  priority: z.enum(['low', 'medium', 'high']).optional().default('medium'),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().default('#6366f1'),
  category: z.string().max(50).optional().default('custom'),
  currency: z.string().length(3).optional().default('PLN'),
  lang: z.enum(['pl', 'en']).optional().default('en'),
})

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const goals = await db
      .select()
      .from(savingsGoals)
      .where(eq(savingsGoals.userId, userId))
      .orderBy(desc(savingsGoals.createdAt))

    // Get deposits for each goal
    const goalIds = goals.map(g => g.id)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let deposits: any[] = []
    if (goalIds.length > 0) {
      deposits = await db
        .select()
        .from(savingsDeposits)
        .where(eq(savingsDeposits.userId, userId))
        .orderBy(desc(savingsDeposits.createdAt))
    }

    const depositsByGoal = new Map<string, typeof deposits>()
    for (const d of deposits) {
      const arr = depositsByGoal.get(d.goalId) || []
      arr.push(d)
      depositsByGoal.set(d.goalId, arr)
    }

    const goalsWithDeposits = goals.map(g => ({
      ...g,
      deposits: depositsByGoal.get(g.id) || [],
    }))

    return NextResponse.json({ goals: goalsWithDeposits })
  } catch (err) {
    console.error('[goals GET]', err)
    return NextResponse.json({ error: 'Failed to fetch goals' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // SECURITY FIX: Rate limiting for OpenAI-powered endpoint
  const rl = rateLimit(`ai:goals:${userId}`, { maxRequests: 10, windowMs: 60 * 60 * 1000 })
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Try again later.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
    )
  }

  const ai = getAIClient()

  const rawBody = await request.json().catch(() => null)
  if (!rawBody) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })

  const parsedGoal = CreateGoalSchema.safeParse(rawBody)
  if (!parsedGoal.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsedGoal.error.flatten().fieldErrors }, { status: 400 })
  }

  const { name, emoji, targetAmount, deadline, priority, color, category, currency, lang } = parsedGoal.data

  try {
    // Generate AI tips for the goal (optional — skip if AI not configured)
    let aiTips: string[] = []
    if (ai) {
      try {
        const isPolish = lang === 'pl'
        const prompt = isPolish
          ? `Użytkownik chce zaoszczędzić ${targetAmount} ${currency || 'PLN'} na "${name}" (kategoria: ${category || 'custom'}). ${deadline ? `Termin: ${deadline}.` : 'Bez terminu.'} Podaj 3 krótkie, praktyczne wskazówki jak szybciej osiągnąć ten cel. Zwróć JSON: { "tips": ["tip1", "tip2", "tip3"] }`
          : `User wants to save ${targetAmount} ${currency || 'PLN'} for "${name}" (category: ${category || 'custom'}). ${deadline ? `Deadline: ${deadline}.` : 'No deadline.'} Give 3 short practical tips to reach this goal faster. Return JSON: { "tips": ["tip1", "tip2", "tip3"] }`

        const completion = await ai.client.chat.completions.create({
          model: ai.model,
          messages: [
            { role: 'system', content: 'You are a helpful financial advisor. Return only valid JSON.' },
            { role: 'user', content: prompt },
          ],
          temperature: 0.7,
          max_tokens: 500,
          response_format: { type: 'json_object' },
        })

        const content = completion.choices[0]?.message?.content || '{}'
        const parsed = JSON.parse(content)
        aiTips = parsed.tips || []
      } catch {
        // AI tips are optional, don't fail the request
      }
    }

    const [goal] = await db
      .insert(savingsGoals)
      .values({
        userId,
        name,
        emoji: emoji || '🎯',
        targetAmount: String(targetAmount),
        deadline: deadline || null,
        priority: priority || 'medium',
        color: color || '#6366f1',
        category: category || 'custom',
        currency: currency || 'PLN',
        aiTips: aiTips.length > 0 ? aiTips : null,
      })
      .returning()

    return NextResponse.json({ goal })
  } catch (err) {
    console.error('[goals POST]', err)
    return NextResponse.json({ error: 'Failed to create goal' }, { status: 500 })
  }
}
