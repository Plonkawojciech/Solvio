import { auth } from '@/lib/auth-compat'
import { NextResponse } from 'next/server'
import { getAIClient } from '@/lib/ai-client'
import { rateLimitPersistent } from '@/lib/rate-limit'
import { z } from 'zod'

// SECURITY (round 2 / A2): bound the AI-suggest body. Caps array sizes so
// the prompt cost is predictable and an attacker can't burn AI credits by
// sending huge `items` / `members` arrays.
const AiSuggestSchema = z.object({
  items: z.array(z.object({
    name: z.string().max(200),
    price: z.union([z.number().nonnegative(), z.string()]).optional(),
  })).min(1).max(100),
  members: z.array(z.object({
    name: z.string().max(120),
  })).min(1).max(30),
  context: z.string().max(2000).optional().nullable(),
  lang: z.enum(['pl', 'en']).optional().default('en'),
})

export async function POST(request: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // SECURITY FIX: Rate limit AI endpoint to prevent cost abuse
  const rl = await rateLimitPersistent(`ai:group-suggest:${userId}`, { maxRequests: 10, windowMs: 3600000 })
  if (!rl.allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } })

  const ai = getAIClient()
  if (!ai) {
    return NextResponse.json({ error: 'AI service not configured' }, { status: 503 })
  }

  try {
    const rawBody = await request.json().catch(() => null)
    if (!rawBody) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

    const parsed = AiSuggestSchema.safeParse(rawBody)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      )
    }
    const { items, members, context, lang } = parsed.data

    const isPolish = lang === 'pl'
    const langInstruction = isPolish
      ? 'Odpowiadaj WYŁĄCZNIE po polsku. Rozumiesz polskie nazwy produktów (np. "Piwo" = alkohol, "Sok" = bezalkoholowe, "Zupka" = zupa).'
      : 'Respond ONLY in English. You understand Polish product names (e.g. "Piwo" = beer/alcohol, "Sok" = juice/non-alcoholic, "Zupka" = soup).'

    const prompt = `You are a smart expense-splitting assistant. Given receipt items and group members, suggest how to assign items to people.

${langInstruction}

ITEMS:
${items.map((item, i) => `${i}. "${item.name}" — ${item.price ?? ''}`).join('\n')}

MEMBERS:
${members.map((m) => `- ${m.name}`).join('\n')}

${context ? `CONTEXT: ${context}` : ''}

RULES:
- If an item looks like alcohol (beer, wine, vodka, piwo, wino, wódka), suggest only adults/likely drinkers
- If an item is a kids meal or children-specific, suggest parents pay
- Shared items (bread, water, appetizers, etc.) should be split equally
- Fuel/tolls should be split between car passengers
- If unclear, default to equal split among all members
- Be smart about Polish product names

Return ONLY valid JSON (no markdown, no extra text):
{
  "suggestions": [
    { "itemIndex": 0, "memberNames": ["Name1", "Name2"], "reason": "brief reason" }
  ],
  "summary": "1-2 sentence summary of the suggested split"
}`

    const completion = await ai.client.chat.completions.create({
      model: ai.model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 1000,
      response_format: { type: 'json_object' },
    })

    const raw = completion.choices[0]?.message?.content || '{}'
    const parsedAi = JSON.parse(raw)

    return NextResponse.json(parsedAi)
  } catch (err) {
    console.error('[groups/ai-suggest] error:', err)
    return NextResponse.json(
      { error: 'Failed to generate AI suggestions' },
      { status: 500 }
    )
  }
}
