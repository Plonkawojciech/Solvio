import { auth } from '@/lib/auth-compat'
import { NextResponse } from 'next/server'
import { db, expenses, savingsGoals, monthlyBudgets, categoryBudgets } from '@/lib/db'
import { eq, and, gte, lte, sql, desc } from 'drizzle-orm'

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const now = new Date()
    const currentMonth = now.toISOString().slice(0, 7)
    const monthStart = `${currentMonth}-01`
    const nextMonth = new Date(`${currentMonth}-01`)
    nextMonth.setMonth(nextMonth.getMonth() + 1)
    const monthEnd = nextMonth.toISOString().slice(0, 10)

    // Get current month's spending
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

    // Get monthly budget
    const [budget] = await db
      .select()
      .from(monthlyBudgets)
      .where(and(eq(monthlyBudgets.userId, userId), eq(monthlyBudgets.month, currentMonth)))

    const income = budget ? parseFloat(budget.totalIncome || '0') : 0
    const savingsTarget = budget ? parseFloat(budget.savingsTarget || '0') : 0

    // Get savings goals progress
    const goals = await db
      .select()
      .from(savingsGoals)
      .where(eq(savingsGoals.userId, userId))

    const activeGoals = goals.filter(g => !g.isCompleted)
    const completedGoals = goals.filter(g => g.isCompleted)
    const totalSaved = goals.reduce((sum, g) => sum + parseFloat(g.currentAmount || '0'), 0)

    // Get category budgets to check overspending
    const catBudgets = await db
      .select()
      .from(categoryBudgets)
      .where(eq(categoryBudgets.userId, userId))

    // Calculate score (0-100)
    let score = 50 // Base score

    // Budget adherence (0-30 points)
    if (income > 0) {
      const spendingRatio = totalSpent / income
      if (spendingRatio <= 0.7) score += 30
      else if (spendingRatio <= 0.85) score += 20
      else if (spendingRatio <= 1.0) score += 10
      else score -= 10
    }

    // Savings goals (0-20 points)
    if (activeGoals.length > 0) {
      score += 5 // Has goals
      const avgProgress = activeGoals.reduce((sum, g) => {
        const target = parseFloat(g.targetAmount || '0')
        const current = parseFloat(g.currentAmount || '0')
        return sum + (target > 0 ? current / target : 0)
      }, 0) / activeGoals.length

      score += Math.round(avgProgress * 15)
    }
    if (completedGoals.length > 0) score += Math.min(completedGoals.length * 2, 10)

    // Has budget set (0-10 points)
    if (budget) score += 5
    if (catBudgets.length > 0) score += 5

    // Savings target met (0-10 points)
    if (savingsTarget > 0 && income > 0) {
      const actualSavings = income - totalSpent
      if (actualSavings >= savingsTarget) score += 10
      else if (actualSavings >= savingsTarget * 0.5) score += 5
    }

    score = Math.max(0, Math.min(100, score))

    // Generate tips based on score components
    const tips: string[] = []
    if (!budget) tips.push(income > 0 ? '' : 'Set a monthly budget to track your spending')
    if (activeGoals.length === 0) tips.push('Create a savings goal to stay motivated')
    if (income > 0 && totalSpent > income * 0.85) tips.push('Your spending is high this month — look for areas to cut')
    if (totalSaved > 0 && activeGoals.length > 0) tips.push(`You've saved ${totalSaved.toFixed(0)} towards your goals — keep going!`)
    if (catBudgets.length === 0) tips.push('Set category budgets to control spending per area')

    const filteredTips = tips.filter(t => t.length > 0).slice(0, 3)

    return NextResponse.json({
      score,
      tips: filteredTips,
    })
  } catch (err) {
    console.error('[financial-health GET]', err)
    return NextResponse.json({ error: 'Failed to calculate health score' }, { status: 500 })
  }
}
