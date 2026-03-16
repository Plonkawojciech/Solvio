import { auth } from '@/lib/auth-compat'
import { NextResponse } from 'next/server'
import { db, expenses, weeklySummaries, categories } from '@/lib/db'
import { eq, gte, lte, and, desc, sql } from 'drizzle-orm'
import OpenAI from 'openai'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export async function POST(request: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { lang = 'pl', currency = 'PLN' } = body
  const isPolish = lang === 'pl'

  try {
    // Calculate date range (last 7 days)
    const now = new Date()
    const weekEnd = now.toISOString().slice(0, 10)
    const weekStartDate = new Date(now)
    weekStartDate.setDate(now.getDate() - 7)
    const weekStart = weekStartDate.toISOString().slice(0, 10)

    // Get last 7 days of expenses
    const recentExpenses = await db
      .select({
        title: expenses.title,
        amount: expenses.amount,
        date: expenses.date,
        vendor: expenses.vendor,
        categoryId: expenses.categoryId,
      })
      .from(expenses)
      .where(
        and(
          eq(expenses.userId, userId),
          gte(expenses.date, weekStart),
          lte(expenses.date, weekEnd)
        )
      )
      .orderBy(desc(expenses.date))

    if (recentExpenses.length === 0) {
      return NextResponse.json({ error: 'no_data', message: 'No expenses in the last 7 days' })
    }

    // Calculate total spent this week
    const totalSpent = recentExpenses.reduce((sum, e) => sum + parseFloat(e.amount || '0'), 0)

    // Get all-time average weekly spending (last 90 days)
    const ninetyDaysAgo = new Date()
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)
    const avgResult = await db
      .select({ total: sql<string>`COALESCE(SUM(CAST(amount AS DECIMAL)), 0)` })
      .from(expenses)
      .where(
        and(
          eq(expenses.userId, userId),
          gte(expenses.date, ninetyDaysAgo.toISOString().slice(0, 10))
        )
      )

    const totalLast90 = parseFloat(avgResult[0]?.total || '0')
    const avgWeeklySpending = totalLast90 / 13 // ~13 weeks in 90 days
    const comparedToAvg = avgWeeklySpending > 0
      ? ((totalSpent - avgWeeklySpending) / avgWeeklySpending) * 100
      : 0

    // Get categories for expense mapping
    const userCategories = await db
      .select({ id: categories.id, name: categories.name })
      .from(categories)
      .where(eq(categories.userId, userId))

    const catById = new Map(userCategories.map(c => [c.id, c.name]))

    // Build expense summary for AI
    const expenseSummary = recentExpenses.map(e => ({
      name: e.title,
      amount: parseFloat(e.amount || '0'),
      vendor: e.vendor,
      category: e.categoryId ? catById.get(e.categoryId) : 'Other',
      date: e.date,
    }))

    // Category totals
    const categoryTotals = new Map<string, number>()
    for (const e of expenseSummary) {
      const cat = e.category || 'Other'
      categoryTotals.set(cat, (categoryTotals.get(cat) || 0) + e.amount)
    }
    const topCategory = [...categoryTotals.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null

    // AI analysis for saving tips
    const prompt = isPolish
      ? `Przeanalizuj wydatki z ostatniego tygodnia i podaj konkretne wskazówki oszczędnościowe.

Wydatki (${currency}):
${expenseSummary.map(e => `- ${e.name}: ${e.amount.toFixed(2)} ${currency} w ${e.vendor || 'nieznanym sklepie'} (${e.category})`).join('\n')}

Łącznie: ${totalSpent.toFixed(2)} ${currency}
Średnia tygodniowa: ${avgWeeklySpending.toFixed(2)} ${currency}
${comparedToAvg > 0 ? `Wydano ${comparedToAvg.toFixed(0)}% WIĘCEJ niż średnia` : `Wydano ${Math.abs(comparedToAvg).toFixed(0)}% MNIEJ niż średnia`}

Zwróć JSON:
{
  "aiSummary": "Krótkie podsumowanie tygodnia (2-3 zdania)",
  "savingsTips": [
    {
      "product": "nazwa produktu",
      "currentStore": "obecny sklep",
      "currentPrice": 5.99,
      "alternativeStore": "tańszy sklep",
      "alternativePrice": 3.99,
      "saving": 2.00
    }
  ]
}`
      : `Analyze last week's expenses and provide specific saving tips.

Expenses (${currency}):
${expenseSummary.map(e => `- ${e.name}: ${e.amount.toFixed(2)} ${currency} at ${e.vendor || 'unknown store'} (${e.category})`).join('\n')}

Total: ${totalSpent.toFixed(2)} ${currency}
Weekly average: ${avgWeeklySpending.toFixed(2)} ${currency}
${comparedToAvg > 0 ? `Spent ${comparedToAvg.toFixed(0)}% MORE than average` : `Spent ${Math.abs(comparedToAvg).toFixed(0)}% LESS than average`}

Return JSON:
{
  "aiSummary": "Brief week summary (2-3 sentences)",
  "savingsTips": [
    {
      "product": "product name",
      "currentStore": "current store",
      "currentPrice": 5.99,
      "alternativeStore": "cheaper store",
      "alternativePrice": 3.99,
      "saving": 2.00
    }
  ]
}`

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are a helpful financial assistant that returns only valid JSON.' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.7,
      max_tokens: 2000,
      response_format: { type: 'json_object' },
    })

    const content = completion.choices[0]?.message?.content || '{}'
    let aiResult: any
    try {
      aiResult = JSON.parse(content)
    } catch {
      aiResult = { aiSummary: null, savingsTips: [] }
    }

    // Store in database
    const [summary] = await db
      .insert(weeklySummaries)
      .values({
        userId,
        weekStart,
        weekEnd,
        totalSpent: totalSpent.toFixed(2),
        comparedToAvg: comparedToAvg.toFixed(2),
        topCategory,
        savingsTips: aiResult.savingsTips || [],
        aiSummary: aiResult.aiSummary || null,
      })
      .returning()

    return NextResponse.json({ summary })
  } catch (err) {
    console.error('[weekly-summary POST]', err)
    return NextResponse.json({ error: 'Failed to generate weekly summary' }, { status: 500 })
  }
}
