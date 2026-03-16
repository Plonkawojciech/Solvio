import { auth } from '@/lib/auth-compat'
import { NextResponse, NextRequest } from 'next/server'
import { db, monthlyBudgets, expenses, categories, categoryBudgets } from '@/lib/db'
import { eq, and, gte, lte, desc, sql } from 'drizzle-orm'

export async function GET(request: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const month = request.nextUrl.searchParams.get('month') || new Date().toISOString().slice(0, 7)

  try {
    // Get the monthly budget
    const [budget] = await db
      .select()
      .from(monthlyBudgets)
      .where(and(eq(monthlyBudgets.userId, userId), eq(monthlyBudgets.month, month)))

    // Get category budgets
    const catBudgets = await db
      .select()
      .from(categoryBudgets)
      .where(eq(categoryBudgets.userId, userId))

    // Get user categories
    const userCategories = await db
      .select()
      .from(categories)
      .where(eq(categories.userId, userId))

    // Get expenses for this month
    const monthStart = `${month}-01`
    const nextMonth = new Date(`${month}-01`)
    nextMonth.setMonth(nextMonth.getMonth() + 1)
    const monthEnd = nextMonth.toISOString().slice(0, 10)

    const monthExpenses = await db
      .select({
        categoryId: expenses.categoryId,
        total: sql<string>`COALESCE(SUM(CAST(amount AS DECIMAL)), 0)`,
      })
      .from(expenses)
      .where(
        and(
          eq(expenses.userId, userId),
          gte(expenses.date, monthStart),
          lte(expenses.date, monthEnd)
        )
      )
      .groupBy(expenses.categoryId)

    const totalSpent = await db
      .select({ total: sql<string>`COALESCE(SUM(CAST(amount AS DECIMAL)), 0)` })
      .from(expenses)
      .where(
        and(
          eq(expenses.userId, userId),
          gte(expenses.date, monthStart),
          lte(expenses.date, monthEnd)
        )
      )

    // Build category spending map
    const spendingByCategory = new Map<string, number>()
    for (const e of monthExpenses) {
      if (e.categoryId) {
        spendingByCategory.set(e.categoryId, parseFloat(e.total || '0'))
      }
    }

    // Build category budget breakdown
    const categoryBreakdown = userCategories.map(cat => {
      const catBudget = catBudgets.find(b => b.categoryId === cat.id)
      return {
        id: cat.id,
        name: cat.name,
        icon: cat.icon,
        color: cat.color,
        budgeted: catBudget ? parseFloat(catBudget.amount) : 0,
        spent: spendingByCategory.get(cat.id) || 0,
      }
    })

    return NextResponse.json({
      budget: budget || null,
      totalSpent: parseFloat(totalSpent[0]?.total || '0'),
      categoryBreakdown,
      month,
    })
  } catch (err) {
    console.error('[budget GET]', err)
    return NextResponse.json({ error: 'Failed to fetch budget' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { month, totalIncome, totalBudget, savingsTarget } = body

  if (!month) {
    return NextResponse.json({ error: 'Month is required' }, { status: 400 })
  }

  try {
    // Upsert the monthly budget
    const existing = await db
      .select()
      .from(monthlyBudgets)
      .where(and(eq(monthlyBudgets.userId, userId), eq(monthlyBudgets.month, month)))

    let budget
    if (existing.length > 0) {
      [budget] = await db
        .update(monthlyBudgets)
        .set({
          totalIncome: totalIncome != null ? String(totalIncome) : existing[0].totalIncome,
          totalBudget: totalBudget != null ? String(totalBudget) : existing[0].totalBudget,
          savingsTarget: savingsTarget != null ? String(savingsTarget) : existing[0].savingsTarget,
        })
        .where(eq(monthlyBudgets.id, existing[0].id))
        .returning()
    } else {
      [budget] = await db
        .insert(monthlyBudgets)
        .values({
          userId,
          month,
          totalIncome: totalIncome != null ? String(totalIncome) : null,
          totalBudget: totalBudget != null ? String(totalBudget) : null,
          savingsTarget: savingsTarget != null ? String(savingsTarget) : null,
        })
        .returning()
    }

    return NextResponse.json({ budget })
  } catch (err) {
    console.error('[budget POST]', err)
    return NextResponse.json({ error: 'Failed to save budget' }, { status: 500 })
  }
}
