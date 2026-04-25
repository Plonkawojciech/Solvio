/**
 * Recurring expense / subscription detection API
 * Analyzes last 6 months of expenses to identify recurring payments.
 */
import { auth, getHubAuth } from '@/lib/auth-compat'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { expenses, categories } from '@/lib/db/schema'
import { eq, gte, and } from 'drizzle-orm'

interface RecurringCandidate {
  title: string
  vendor: string | null
  categoryId: string | null
  categoryName: string
  amount: number
  occurrences: { date: string; amount: number }[]
  frequency: 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'annual' | 'irregular'
  avgAmount: number
  nextExpectedDate: string | null
  confidence: number // 0-1
  annualCost: number
}

function detectFrequency(dates: string[]): {
  frequency: RecurringCandidate['frequency']
  avgGapDays: number
} {
  if (dates.length < 2) return { frequency: 'irregular', avgGapDays: 0 }

  const sorted = [...dates].sort()
  const gaps: number[] = []
  for (let i = 1; i < sorted.length; i++) {
    const diff = (new Date(sorted[i]).getTime() - new Date(sorted[i - 1]).getTime()) / (1000 * 60 * 60 * 24)
    gaps.push(diff)
  }

  const avgGap = gaps.reduce((s, g) => s + g, 0) / gaps.length
  const stdDev = Math.sqrt(gaps.reduce((s, g) => s + Math.pow(g - avgGap, 2), 0) / gaps.length)
  const cv = stdDev / avgGap // Coefficient of variation

  // High consistency = low CV
  if (cv > 0.5) return { frequency: 'irregular', avgGapDays: avgGap }
  if (avgGap < 10) return { frequency: 'weekly', avgGapDays: avgGap }
  if (avgGap < 20) return { frequency: 'biweekly', avgGapDays: avgGap }
  if (avgGap < 45) return { frequency: 'monthly', avgGapDays: avgGap }
  if (avgGap < 100) return { frequency: 'quarterly', avgGapDays: avgGap }
  return { frequency: 'annual', avgGapDays: avgGap }
}

function computeAnnualCost(avgAmount: number, frequency: RecurringCandidate['frequency']): number {
  const multipliers: Record<RecurringCandidate['frequency'], number> = {
    weekly: 52,
    biweekly: 26,
    monthly: 12,
    quarterly: 4,
    annual: 1,
    irregular: 6, // assume ~6x per year
  }
  return avgAmount * (multipliers[frequency] || 12)
}

export async function GET(request: Request) {
  let userId = (await auth()).userId
  if (!userId) {
    const hubAuth = getHubAuth(request)
    if (hubAuth) userId = hubAuth.userId
  }
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    // Look back 6 months
    const since = new Date()
    since.setMonth(since.getMonth() - 6)
    const sinceStr = since.toISOString().slice(0, 10)

    const [exps, cats] = await Promise.all([
      db.select({
        id: expenses.id,
        title: expenses.title,
        vendor: expenses.vendor,
        amount: expenses.amount,
        date: expenses.date,
        categoryId: expenses.categoryId,
      }).from(expenses)
        .where(and(eq(expenses.userId, userId), gte(expenses.date, sinceStr))),
      db.select().from(categories).where(eq(categories.userId, userId)),
    ])

    const catById = new Map(cats.map(c => [c.id, c]))

    // Group by normalized title + vendor
    const groups: Record<string, {
      title: string
      vendor: string | null
      categoryId: string | null
      occurrences: { date: string; amount: number }[]
    }> = {}

    for (const exp of exps) {
      const title = (exp.title || '').toLowerCase().trim()
      const vendor = (exp.vendor || '').toLowerCase().trim() || null
      const amount = parseFloat(exp.amount?.toString() || '0')

      if (!title || amount <= 0) continue

      // Normalize key: group very similar titles (normalize spaces, remove trailing numbers)
      const normalizedTitle = title
        .replace(/\s+/g, ' ')
        .replace(/\s*#\d+\s*$/, '') // Remove trailing "#123"
        .trim()

      const key = `${normalizedTitle}|${vendor || ''}`

      if (!groups[key]) {
        groups[key] = { title: exp.title || '', vendor: exp.vendor || null, categoryId: exp.categoryId, occurrences: [] }
      }
      groups[key].occurrences.push({ date: exp.date || '', amount })
    }

    // Filter groups with 2+ occurrences and detect recurrence
    const recurring: RecurringCandidate[] = []

    for (const [, group] of Object.entries(groups)) {
      if (group.occurrences.length < 2) continue

      const dates = group.occurrences.map(o => o.date).filter(Boolean)
      const amounts = group.occurrences.map(o => o.amount)
      const avgAmount = amounts.reduce((s, a) => s + a, 0) / amounts.length

      // Check amount consistency (amounts should be similar within ±20%)
      const maxAmount = Math.max(...amounts)
      const minAmount = Math.min(...amounts)
      const amountVariation = maxAmount > 0 ? (maxAmount - minAmount) / maxAmount : 1
      if (amountVariation > 0.5) continue // Skip if amounts vary too much

      const { frequency, avgGapDays } = detectFrequency(dates)
      if (frequency === 'irregular' && group.occurrences.length < 3) continue

      // Confidence: based on count, amount consistency, and frequency regularity
      const countScore = Math.min(group.occurrences.length / 6, 1) * 0.4
      const amountScore = (1 - amountVariation) * 0.3
      const freqScore = frequency !== 'irregular' ? 0.3 : 0.1
      const confidence = countScore + amountScore + freqScore

      if (confidence < 0.3) continue

      // Predict next date
      let nextExpectedDate: string | null = null
      if (frequency !== 'irregular' && avgGapDays > 0) {
        const lastDate = new Date(Math.max(...dates.map(d => new Date(d).getTime())))
        const nextDate = new Date(lastDate.getTime() + avgGapDays * 24 * 60 * 60 * 1000)
        nextExpectedDate = nextDate.toISOString().slice(0, 10)
      }

      const cat = group.categoryId ? catById.get(group.categoryId) : null
      const annualCost = computeAnnualCost(avgAmount, frequency)

      recurring.push({
        title: group.title,
        vendor: group.vendor,
        categoryId: group.categoryId,
        categoryName: cat?.name || 'Other',
        amount: parseFloat(avgAmount.toFixed(2)),
        occurrences: group.occurrences.sort((a, b) => a.date.localeCompare(b.date)),
        frequency,
        avgAmount: parseFloat(avgAmount.toFixed(2)),
        nextExpectedDate,
        confidence: parseFloat(confidence.toFixed(2)),
        annualCost: parseFloat(annualCost.toFixed(2)),
      })
    }

    // Sort by annual cost descending
    recurring.sort((a, b) => b.annualCost - a.annualCost)

    const totalAnnualCost = recurring.reduce((s, r) => s + r.annualCost, 0)
    const monthlyRecurringCost = totalAnnualCost / 12

    return NextResponse.json({
      subscriptions: recurring,
      summary: {
        count: recurring.length,
        totalAnnualCost: parseFloat(totalAnnualCost.toFixed(2)),
        monthlyRecurringCost: parseFloat(monthlyRecurringCost.toFixed(2)),
        period: '6 months',
      },
    })
  } catch (err) {
    console.error('[subscriptions GET]', err)
    return NextResponse.json({ error: 'Failed to detect subscriptions' }, { status: 500 })
  }
}
