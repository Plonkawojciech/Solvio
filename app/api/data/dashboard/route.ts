import { auth } from '@/lib/auth-compat'
import { NextResponse } from 'next/server'
import { db, expenses, receipts, categories, userSettings, categoryBudgets } from '@/lib/db'
import { eq, gte, and, sql } from 'drizzle-orm'

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const since = new Date()
  since.setDate(since.getDate() - 29)
  const sinceStr = since.toISOString().slice(0, 10)

  try {
    const [cats, settings, budgets, exps, recsCount] = await Promise.all([
      db.select().from(categories).where(eq(categories.userId, userId)),
      db.select().from(userSettings).where(eq(userSettings.userId, userId)).limit(1),
      db.select().from(categoryBudgets).where(eq(categoryBudgets.userId, userId)),
      db.select({
        id: expenses.id,
        title: expenses.title,
        amount: expenses.amount,
        date: expenses.date,
        categoryId: expenses.categoryId,
        receiptId: expenses.receiptId,
        vendor: expenses.vendor,
      }).from(expenses)
        .where(and(eq(expenses.userId, userId), gte(expenses.date, sinceStr))),
      db.select({ count: sql<number>`count(*)::int` }).from(receipts)
        .where(and(eq(receipts.userId, userId), gte(receipts.date, sinceStr))),
    ])

    return NextResponse.json({
      categories: cats,
      settings: settings[0] || null,
      budgets,
      expenses: exps,
      receiptsCount: recsCount[0]?.count ?? 0,
    })
  } catch (err) {
    console.error('[dashboard GET]', err)
    return NextResponse.json({ error: 'Failed to fetch dashboard data' }, { status: 500 })
  }
}
