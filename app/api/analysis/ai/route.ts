import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { db, expenses, categories } from '@/lib/db'
import { eq, gte, and, asc } from 'drizzle-orm'
import OpenAI from 'openai'

export async function POST(request: Request) {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { lang = 'en', currency = 'PLN' } = await request.json().catch(() => ({}))

  // Fetch last 90 days of expenses with categories
  const since = new Date()
  since.setDate(since.getDate() - 90)
  const sinceStr = since.toISOString().slice(0, 10)

  const [expensesData, cats] = await Promise.all([
    db.select().from(expenses)
      .where(and(eq(expenses.userId, userId), gte(expenses.date, sinceStr)))
      .orderBy(asc(expenses.date)),
    db.select().from(categories).where(eq(categories.userId, userId)),
  ])

  const catById = new Map(cats.map(c => [c.id, c]))

  if (!expensesData || expensesData.length === 0) {
    return NextResponse.json({
      insights: [],
      recommendations: [],
      anomalies: [],
      summary: lang === 'pl'
        ? 'Brak danych do analizy. Dodaj wydatki, aby zobaczyć spersonalizowane wskazówki AI.'
        : 'No data to analyze yet. Add expenses to see personalized AI insights.',
      categoryTrends: [],
      predictedMonthlySpend: null,
    })
  }

  // Aggregate data for prompt
  const rows = expensesData.map(e => ({
    date: e.date,
    title: e.title || '',
    category: e.categoryId ? (catById.get(e.categoryId)?.name || 'Other') : 'Other',
    amount: typeof e.amount === 'number' ? e.amount : parseFloat(String(e.amount)) || 0,
  }))

  const totalSpend = rows.reduce((s, r) => s + r.amount, 0)
  const byCategory: Record<string, number> = {}
  for (const r of rows) {
    byCategory[r.category] = (byCategory[r.category] || 0) + r.amount
  }

  // Monthly breakdown for the prompt
  const byMonth: Record<string, number> = {}
  for (const r of rows) {
    const ym = r.date?.slice(0, 7) ?? ''
    byMonth[ym] = (byMonth[ym] || 0) + r.amount
  }

  const isPolish = lang === 'pl'
  const langInstruction = isPolish
    ? 'Odpowiadaj WYŁĄCZNIE po polsku. Używaj naturalnego, przyjaznego języka.'
    : 'Respond ONLY in English. Use natural, friendly language.'

  const prompt = `You are a personal finance AI analyst. Analyze this user's expense data from the last 90 days.

${langInstruction}

DATA:
- Total spent: ${totalSpend.toFixed(2)} ${currency}
- Number of transactions: ${rows.length}
- Spending by category: ${JSON.stringify(byCategory, null, 2)}
- Monthly totals: ${JSON.stringify(byMonth, null, 2)}
- Recent transactions (last 10): ${JSON.stringify(rows.slice(-10), null, 2)}

Return a JSON object with EXACTLY this structure (no markdown, no extra text, just raw JSON):
{
  "summary": "2-3 sentence overall analysis",
  "insights": [
    { "type": "positive|warning|info", "title": "short title", "description": "2-3 sentences", "icon": "emoji" }
  ],
  "recommendations": [
    { "priority": "high|medium|low", "title": "short action title", "description": "concrete actionable advice", "potentialSaving": number_or_null }
  ],
  "anomalies": [
    { "date": "YYYY-MM-DD or month", "category": "category name", "description": "what's unusual", "amount": number }
  ],
  "categoryTrends": [
    { "category": "name", "trend": "increasing|decreasing|stable", "changePercent": number, "note": "brief note" }
  ],
  "predictedMonthlySpend": number
}

Provide 3-5 insights, 3-4 recommendations, 0-3 anomalies, and trends for the top 5 categories.`

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.4,
      max_tokens: 1500,
      response_format: { type: 'json_object' },
    })

    const raw = completion.choices[0]?.message?.content || '{}'
    const parsed = JSON.parse(raw)

    return NextResponse.json(parsed)
  } catch (err) {
    console.error('[analysis/ai] OpenAI error:', err)
    // Return fallback without AI if OpenAI fails
    const topCat = Object.entries(byCategory).sort((a, b) => b[1] - a[1])[0]
    return NextResponse.json({
      summary: isPolish
        ? `W ciągu ostatnich 90 dni wydałeś łącznie ${totalSpend.toFixed(2)} ${currency} w ${rows.length} transakcjach. Największa kategoria to ${topCat?.[0] || 'Inne'}.`
        : `Over the last 90 days you spent ${totalSpend.toFixed(2)} ${currency} across ${rows.length} transactions. Your top category is ${topCat?.[0] || 'Other'}.`,
      insights: [],
      recommendations: [],
      anomalies: [],
      categoryTrends: Object.entries(byCategory).slice(0, 5).map(([cat]) => ({
        category: cat, trend: 'stable', changePercent: 0, note: '',
      })),
      predictedMonthlySpend: totalSpend / 3,
      fallback: true,
    })
  }
}
