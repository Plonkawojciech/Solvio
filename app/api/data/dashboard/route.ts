import { auth, getHubAuth } from '@/lib/auth-compat'
import { NextResponse } from 'next/server'
import { db, expenses, receipts, categories, userSettings, categoryBudgets, monthlyBudgets } from '@/lib/db'
import { eq, gte, lte, and, sql } from 'drizzle-orm'

export async function GET(request: Request) {
  let userId = (await auth()).userId
  if (!userId) {
    const hubAuth = getHubAuth(request)
    if (hubAuth) userId = hubAuth.userId
  }
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Allow `?since=all` to fetch all expenses (iOS uses this by default)
  const url = new URL(request.url)
  const showAll = url.searchParams.get('since') === 'all'

  const since = new Date()
  since.setDate(since.getDate() - 29)
  const sinceStr = since.toISOString().slice(0, 10)

  const prev30 = new Date()
  prev30.setDate(prev30.getDate() - 59)
  const prev30Str = prev30.toISOString().slice(0, 10)

  try {
    const currentMonth = new Date().toISOString().slice(0, 7)
    const expenseFilter = showAll
      ? eq(expenses.userId, userId)
      : and(eq(expenses.userId, userId), gte(expenses.date, sinceStr))
    const receiptFilter = showAll
      ? eq(receipts.userId, userId)
      : and(eq(receipts.userId, userId), gte(receipts.date, sinceStr))

    const [cats, settings, budgets, exps, recsCount, prevCatTotals, monthBudget] = await Promise.all([
      db.select().from(categories).where(eq(categories.userId, userId)),
      db.select().from(userSettings).where(eq(userSettings.userId, userId)).limit(1),
      db.select().from(categoryBudgets).where(eq(categoryBudgets.userId, userId)),
      db.select({
        id: expenses.id,
        title: expenses.title,
        amount: expenses.amount,
        currency: expenses.currency,
        date: expenses.date,
        categoryId: expenses.categoryId,
        receiptId: expenses.receiptId,
        vendor: expenses.vendor,
        isRecurring: expenses.isRecurring,
        exchangeRate: receipts.exchangeRate,
      }).from(expenses)
        .leftJoin(receipts, eq(expenses.receiptId, receipts.id))
        .where(expenseFilter),
      db.select({ count: sql<number>`count(*)::int` }).from(receipts)
        .where(receiptFilter),
      // Server-side aggregation: per-category totals with exchange rate conversion
      db.select({
        categoryId: expenses.categoryId,
        total: sql<string>`COALESCE(SUM(
          CASE WHEN ${receipts.exchangeRate} IS NOT NULL
            THEN ${expenses.amount}::numeric * ${receipts.exchangeRate}::numeric
            ELSE ${expenses.amount}::numeric
          END
        ), 0)`,
      }).from(expenses)
        .leftJoin(receipts, eq(expenses.receiptId, receipts.id))
        .where(and(eq(expenses.userId, userId), gte(expenses.date, prev30Str), lte(expenses.date, sinceStr)))
        .groupBy(expenses.categoryId),
      db.select({ totalIncome: monthlyBudgets.totalIncome, savingsTarget: monthlyBudgets.savingsTarget })
        .from(monthlyBudgets)
        .where(and(eq(monthlyBudgets.userId, userId), eq(monthlyBudgets.month, currentMonth)))
        .limit(1),
    ])

    const prevByCategory: Record<string, number> = {}
    let prevTotal = 0
    for (const row of prevCatTotals) {
      const cat = row.categoryId || '__other__'
      const amount = parseFloat(row.total) || 0
      prevByCategory[cat] = amount
      prevTotal += amount
    }

    return NextResponse.json({
      categories: cats,
      settings: settings[0] || null,
      budgets,
      expenses: exps,
      prevExpenses: [],
      prevTotal,
      prevByCategory,
      receiptsCount: recsCount[0]?.count ?? 0,
      monthIncome: monthBudget[0]?.totalIncome ? parseFloat(monthBudget[0].totalIncome) : null,
      savingsTarget: monthBudget[0]?.savingsTarget ? parseFloat(monthBudget[0].savingsTarget) : null,
    }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    })
  } catch (err) {
    console.error('[dashboard GET]', err)
    return NextResponse.json({ error: 'Failed to fetch dashboard data' }, { status: 500 })
  }
}
