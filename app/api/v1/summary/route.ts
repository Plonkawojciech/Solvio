import { NextResponse } from 'next/server'
import { and, eq, gte, lte, sql } from 'drizzle-orm'
import { requireApiUser } from '@/lib/api-auth'
import { db } from '@/lib/db'
import { categories, categoryBudgets, expenses, monthlyBudgets } from '@/lib/db/schema'

export const dynamic = 'force-dynamic'

/** Ten sam kształt, którym karmi się Panel w apce — po to, żeby zakładka
 *  Finanse w CRM-ie pokazywała dokładnie te liczby, co telefon. */
export async function GET(req: Request) {
  const auth = await requireApiUser(req)
  if (auth instanceof NextResponse) return auth

  const q = new URL(req.url).searchParams
  const now = new Date()
  const year = Number(q.get('year')) || now.getFullYear()
  const monthParam = Number(q.get('month'))
  const month = monthParam >= 1 && monthParam <= 12 ? monthParam : now.getMonth() + 1

  const first = `${year}-${String(month).padStart(2, '0')}-01`
  // Dzień 0 następnego miesiąca = ostatni dzień tego, bez tablicy długości miesięcy.
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const last = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

  const inMonth = and(
    eq(expenses.userId, auth.userId),
    gte(expenses.date, first),
    lte(expenses.date, last),
  )

  const [totals] = await db
    .select({
      total: sql<string>`coalesce(sum(${expenses.amount}), 0)`,
      count: sql<number>`count(*)::int`,
    })
    .from(expenses)
    .where(inMonth)

  const byCategory = await db
    .select({
      categoryId: expenses.categoryId,
      categoryName: categories.name,
      color: categories.color,
      total: sql<string>`coalesce(sum(${expenses.amount}), 0)`,
      count: sql<number>`count(*)::int`,
    })
    .from(expenses)
    .leftJoin(categories, eq(expenses.categoryId, categories.id))
    .where(inMonth)
    .groupBy(expenses.categoryId, categories.name, categories.color)
    .orderBy(sql`sum(${expenses.amount}) desc`)

  // Budżet miesiąca to SUMA limitów kategorii — tak liczy to panel na webie
  // i w apce. `monthly_budgets.total_budget` jest fallbackiem dla kont bez
  // limitów per kategoria. Bez tej zgodności ten sam miesiąc pokazywał
  // 3500 zł na telefonie i 5000 zł w odpowiedzi API.
  const [categorySum] = await db
    .select({ total: sql<string>`coalesce(sum(${categoryBudgets.amount}), 0)` })
    .from(categoryBudgets)
    .where(eq(categoryBudgets.userId, auth.userId))

  const [budget] = await db
    .select()
    .from(monthlyBudgets)
    .where(and(eq(monthlyBudgets.userId, auth.userId), eq(monthlyBudgets.month, `${year}-${String(month).padStart(2, '0')}`)))
    .limit(1)

  const fromCategories = Number(categorySum?.total ?? 0)
  const totalBudget = fromCategories > 0 ? fromCategories.toFixed(2) : (budget?.totalBudget ?? null)

  return NextResponse.json({
    period: { year, month, from: first, to: last },
    total: totals?.total ?? '0',
    count: totals?.count ?? 0,
    budget: totalBudget,
    byCategory: byCategory.map((c) => ({
      categoryId: c.categoryId,
      name: c.categoryName ?? 'Bez kategorii',
      color: c.color,
      total: c.total,
      count: c.count,
    })),
  })
}
