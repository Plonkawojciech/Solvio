import { auth, getHubAuth } from '@/lib/auth-compat'
import { NextResponse, NextRequest } from 'next/server'
import { db, monthlyBudgets, expenses, categories, categoryBudgets } from '@/lib/db'
import { eq, and, gte, lte, sql } from 'drizzle-orm'

export async function GET(request: NextRequest) {
  let userId = (await auth()).userId
  if (!userId) {
    const hubAuth = getHubAuth(request)
    if (hubAuth) userId = hubAuth.userId
  }
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const month = request.nextUrl.searchParams.get('month') || new Date().toISOString().slice(0, 7)

  try {
    // First 3 queries are independent — run in parallel
    const [budgetResult, catBudgets, userCategories] = await Promise.all([
      db.select()
        .from(monthlyBudgets)
        .where(and(eq(monthlyBudgets.userId, userId), eq(monthlyBudgets.month, month))),
      db.select()
        .from(categoryBudgets)
        .where(eq(categoryBudgets.userId, userId)),
      db.select()
        .from(categories)
        .where(eq(categories.userId, userId)),
    ])
    const budget = budgetResult[0]

    // Get expenses for this month grouped by category (single query)
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

    // Calculate total spent from grouped results — no duplicate query needed
    const totalSpentValue = monthExpenses.reduce((sum, e) => sum + parseFloat(e.total || '0'), 0)
    const totalSpent = [{ total: totalSpentValue.toFixed(2) }]

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

    // Compute budget alerts (>80% = warning, >100% = critical)
    const now = new Date()
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
    const dayOfMonth = now.getDate()
    const monthProgress = dayOfMonth / daysInMonth // 0–1

    const alerts: { type: 'critical' | 'warning'; category: string; spent: number; budgeted: number; pct: number }[] = []

    for (const cat of categoryBreakdown) {
      if (cat.budgeted <= 0) continue
      const pct = cat.spent / cat.budgeted
      if (pct >= 1.0) {
        alerts.push({ type: 'critical', category: cat.name, spent: cat.spent, budgeted: cat.budgeted, pct: parseFloat(pct.toFixed(2)) })
      } else if (pct >= 0.8) {
        alerts.push({ type: 'warning', category: cat.name, spent: cat.spent, budgeted: cat.budgeted, pct: parseFloat(pct.toFixed(2)) })
      }
    }

    const totalBudgetAmt = budget ? parseFloat(budget.totalBudget || '0') : 0
    const spent = parseFloat(totalSpent[0]?.total || '0')
    const totalPct = totalBudgetAmt > 0 ? spent / totalBudgetAmt : 0
    if (totalBudgetAmt > 0 && totalPct >= 1.0) {
      alerts.unshift({ type: 'critical', category: '__total__', spent, budgeted: totalBudgetAmt, pct: parseFloat(totalPct.toFixed(2)) })
    } else if (totalBudgetAmt > 0 && totalPct >= 0.8) {
      alerts.unshift({ type: 'warning', category: '__total__', spent, budgeted: totalBudgetAmt, pct: parseFloat(totalPct.toFixed(2)) })
    }

    return NextResponse.json({
      budget: budget || null,
      totalSpent: spent,
      categoryBreakdown,
      alerts,
      monthProgress: parseFloat(monthProgress.toFixed(2)),
      month,
    })
  } catch (err) {
    console.error('[budget GET]', err)
    return NextResponse.json({ error: 'Failed to fetch budget' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  let userId = (await auth()).userId
  if (!userId) {
    const hubAuth = getHubAuth(request)
    if (hubAuth) userId = hubAuth.userId
  }
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
