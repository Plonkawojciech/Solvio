import { auth } from '@/lib/auth-compat'
import { NextResponse } from 'next/server'
import { db, expenses, monthlyBudgets, savingsGoals } from '@/lib/db'
import { eq, and, gte, lte, sql } from 'drizzle-orm'
import { getAIClient } from '@/lib/ai-client'
import { rateLimit } from '@/lib/rate-limit'

export async function POST(request: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // SECURITY FIX: Rate limiting for OpenAI-powered endpoint
  const rl = rateLimit(`ai:afford:${userId}`, { maxRequests: 20, windowMs: 60 * 60 * 1000 })
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Try again later.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
    )
  }

  const ai = getAIClient()
  if (!ai) {
    return NextResponse.json({ error: 'AI service not configured' }, { status: 503 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { item, price, currency = 'PLN', lang = 'pl', month } = body

  if (!item || !price) {
    return NextResponse.json({ error: 'Item and price are required' }, { status: 400 })
  }

  const currentMonth = month || new Date().toISOString().slice(0, 7)
  const isPolish = lang === 'pl'

  try {
    // Get monthly budget
    const [budget] = await db
      .select()
      .from(monthlyBudgets)
      .where(and(eq(monthlyBudgets.userId, userId), eq(monthlyBudgets.month, currentMonth)))

    // Get total spent this month
    const monthStart = `${currentMonth}-01`
    const nextMonth = new Date(`${currentMonth}-01`)
    nextMonth.setMonth(nextMonth.getMonth() + 1)
    const monthEnd = nextMonth.toISOString().slice(0, 10)

    const [spentResult] = await db
      .select({ total: sql<string>`COALESCE(SUM(CAST(amount AS DECIMAL)), 0)` })
      .from(expenses)
      .where(
        and(
          eq(expenses.userId, userId),
          gte(expenses.date, monthStart),
          lte(expenses.date, monthEnd)
        )
      )

    const totalSpent = parseFloat(spentResult?.total || '0')
    const income = budget ? parseFloat(budget.totalIncome || '0') : 0
    const savingsTarget = budget ? parseFloat(budget.savingsTarget || '0') : 0

    // Get active savings goals
    const goals = await db
      .select({ name: savingsGoals.name, targetAmount: savingsGoals.targetAmount, currentAmount: savingsGoals.currentAmount, deadline: savingsGoals.deadline })
      .from(savingsGoals)
      .where(and(eq(savingsGoals.userId, userId), eq(savingsGoals.isCompleted, false)))

    // Ask AI to evaluate
    const prompt = isPolish
      ? `Użytkownik chce kupić "${item}" za ${price} ${currency}.

Dane finansowe:
- Przychody w tym miesiącu: ${income} ${currency}
- Wydano dotąd: ${totalSpent.toFixed(2)} ${currency}
- Pozostało: ${(income - totalSpent).toFixed(2)} ${currency}
- Cel oszczędnościowy na miesiąc: ${savingsTarget} ${currency}
${goals.length > 0 ? `- Aktywne cele oszczędnościowe: ${goals.map(g => `${g.name} (${g.currentAmount}/${g.targetAmount})`).join(', ')}` : ''}

Oceń czy użytkownik może sobie na to pozwolić. Zwróć JSON:
{
  "verdict": "yes" | "no" | "maybe",
  "explanation": "krótkie wyjaśnienie (2-3 zdania)",
  "impact": ["wpływ na budżet", "wpływ na cele oszczędnościowe"]
}`
      : `User wants to buy "${item}" for ${price} ${currency}.

Financial data:
- Monthly income: ${income} ${currency}
- Spent so far: ${totalSpent.toFixed(2)} ${currency}
- Remaining: ${(income - totalSpent).toFixed(2)} ${currency}
- Monthly savings target: ${savingsTarget} ${currency}
${goals.length > 0 ? `- Active savings goals: ${goals.map(g => `${g.name} (${g.currentAmount}/${g.targetAmount})`).join(', ')}` : ''}

Evaluate if the user can afford this. Return JSON:
{
  "verdict": "yes" | "no" | "maybe",
  "explanation": "brief explanation (2-3 sentences)",
  "impact": ["impact on budget", "impact on savings goals"]
}`

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
    const result = JSON.parse(content)

    return NextResponse.json({
      verdict: result.verdict || 'maybe',
      explanation: result.explanation || '',
      impact: result.impact || [],
    })
  } catch (err) {
    console.error('[afford POST]', err)
    return NextResponse.json({ error: 'Failed to check affordability' }, { status: 500 })
  }
}
