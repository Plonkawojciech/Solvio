import { auth } from '@/lib/auth-compat'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { expenses, categories, bankTransactions, bankAccounts } from '@/lib/db/schema'
import { eq, gte, and, asc } from 'drizzle-orm'
import { getAIClient } from '@/lib/ai-client'
import { rateLimit } from '@/lib/rate-limit'
import { z } from 'zod'

const AnalysisRequestSchema = z.object({
  lang: z.enum(['pl', 'en']).optional().default('en'),
  currency: z.string().length(3).optional().default('PLN'),
})

export async function POST(request: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const rl = rateLimit(`ai:analysis:${userId}`, { maxRequests: 10, windowMs: 60 * 60 * 1000 })
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Try again later.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
    )
  }

  const rawBody = await request.json().catch(() => ({}))
  const parsedReq = AnalysisRequestSchema.safeParse(rawBody)
  const { lang, currency } = parsedReq.success ? parsedReq.data : { lang: 'en' as const, currency: 'PLN' }

  const since = new Date()
  since.setDate(since.getDate() - 90)
  const sinceStr = since.toISOString().slice(0, 10)

  const since365 = new Date()
  since365.setDate(since365.getDate() - 365)

  const [expensesData, cats, bankTxns, bankAccs] = await Promise.all([
    db.select().from(expenses)
      .where(and(eq(expenses.userId, userId), gte(expenses.date, sinceStr)))
      .orderBy(asc(expenses.date)),
    db.select().from(categories).where(eq(categories.userId, userId)),
    db.select({
      id: bankTransactions.id,
      amount: bankTransactions.amount,
      currency: bankTransactions.currency,
      date: bankTransactions.date,
      description: bankTransactions.description,
      counterpartyName: bankTransactions.counterpartyName,
      category: bankTransactions.category,
      mccCode: bankTransactions.mccCode,
    }).from(bankTransactions)
      .where(and(
        eq(bankTransactions.userId, userId),
        gte(bankTransactions.date, since365.toISOString().slice(0, 10)),
      ))
      .orderBy(asc(bankTransactions.date)),
    db.select({ id: bankAccounts.id, balance: bankAccounts.balance, currency: bankAccounts.currency, accountName: bankAccounts.accountName })
      .from(bankAccounts)
      .where(eq(bankAccounts.userId, userId)),
  ])

  const catById = new Map(cats.map(c => [c.id, c]))

  if ((!expensesData || expensesData.length === 0) && (!bankTxns || bankTxns.length === 0)) {
    return NextResponse.json({
      insights: [],
      recommendations: [],
      anomalies: [],
      summary: lang === 'pl'
        ? 'Brak danych do analizy. Dodaj wydatki, aby zobaczyć spersonalizowane wskazówki AI.'
        : 'No data to analyze yet. Add expenses to see personalized AI insights.',
      categoryTrends: [],
      predictedMonthlySpend: null,
      bankStats: null,
    })
  }

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

  const byMonth: Record<string, number> = {}
  for (const r of rows) {
    const ym = r.date?.slice(0, 7) ?? ''
    byMonth[ym] = (byMonth[ym] || 0) + r.amount
  }

  const bankDebits = bankTxns.filter(t => t.category === 'debit')
  const bankCredits = bankTxns.filter(t => t.category === 'credit')
  const bankTotalDebit = bankDebits.reduce((s, t) => s + Math.abs(parseFloat(t.amount || '0')), 0)
  const bankTotalCredit = bankCredits.reduce((s, t) => s + Math.abs(parseFloat(t.amount || '0')), 0)

  const merchantMap: Record<string, number> = {}
  for (const t of bankDebits) {
    const name = t.counterpartyName || t.description || 'Unknown'
    merchantMap[name] = (merchantMap[name] || 0) + Math.abs(parseFloat(t.amount || '0'))
  }
  const topMerchants = Object.entries(merchantMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, amount]) => ({ name, amount: amount.toFixed(2) }))

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
- Bank accounts: ${bankAccs.length > 0 ? JSON.stringify(bankAccs.map(a => ({ name: a.accountName, balance: a.balance, currency: a.currency }))) : 'none connected'}
- Bank transactions (last 365 days): ${bankTxns.length} total (${bankDebits.length} debits, ${bankCredits.length} credits)
- Bank total debited (365 days): ${bankTotalDebit.toFixed(2)} ${currency}
- Bank total credited (365 days): ${bankTotalCredit.toFixed(2)} ${currency}
- Top 10 merchants by spending (from bank): ${JSON.stringify(topMerchants)}
- Data sources: ${bankTxns.length > 0 ? 'receipts + bank transactions' : 'receipts only'}

Return a JSON object with EXACTLY this structure:
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

  const ai = getAIClient()

  const buildFallback = () => {
    const topCat = Object.entries(byCategory).sort((a, b) => b[1] - a[1])[0]
    return {
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
      bankStats: bankTxns.length > 0 ? {
        totalTransactions: bankTxns.length,
        totalDebit: bankTotalDebit,
        totalCredit: bankTotalCredit,
        topMerchants,
        accountCount: bankAccs.length,
      } : null,
    }
  }

  if (!ai) {
    console.warn('[analysis/ai] No AI client configured — returning fallback')
    return NextResponse.json(buildFallback())
  }

  try {
    const completion = await ai.client.chat.completions.create({
      model: ai.model,
      max_tokens: 1500,
      temperature: 0.4,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: 'You respond with raw JSON only matching the requested schema. No markdown, no code fences, no prose.' },
        { role: 'user', content: prompt },
      ],
    })

    const raw = completion.choices[0]?.message?.content?.trim() || '{}'
    const cleaned = raw.replace(/^```(?:json)?\s*|\s*```$/g, '')
    const parsed = JSON.parse(cleaned)

    return NextResponse.json({
      ...parsed,
      bankStats: bankTxns.length > 0 ? {
        totalTransactions: bankTxns.length,
        totalDebit: bankTotalDebit,
        totalCredit: bankTotalCredit,
        topMerchants,
        accountCount: bankAccs.length,
      } : null,
    })
  } catch (err) {
    console.error(`[analysis/ai] ${ai.backend} error:`, err)
    return NextResponse.json(buildFallback())
  }
}
