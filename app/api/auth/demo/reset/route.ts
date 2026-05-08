import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth-compat'
import { db } from '@/lib/db'
import {
  expenses, receipts, receiptItems, categories, categoryBudgets,
  reports, audits, priceComparisons, merchantRules,
  savingsGoals, savingsDeposits, monthlyBudgets, financialChallenges,
  weeklySummaries, loyaltyCards, userSettings,
} from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { ensureUserSeeded } from '@/lib/db/seed-user'
import { emailToUserId } from '@/lib/session'
import { recordAudit } from '@/lib/audit-log'
import { rateLimitPersistent } from '@/lib/rate-limit'

// SECURITY FIX: Only allow demo account to be reset — prevent any user's data from being wiped
const DEMO_USER_ID = emailToUserId('demo@solvio.app')

export async function POST() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const rl = await rateLimitPersistent(`auth:demo-reset:${userId}`, { maxRequests: 5, windowMs: 15 * 60 * 1000 })
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too many reset attempts. Try again later.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
    )
  }

  // SECURITY FIX: Restrict reset to demo account only
  if (userId !== DEMO_USER_ID) {
    return NextResponse.json({ error: 'Only demo account can be reset' }, { status: 403 })
  }

  try {
    // Delete child rows first. `receipt_items` is keyed by `userId`, so
    // deleting it explicitly avoids orphan rows during repeated demo resets.
    await db.delete(receiptItems).where(eq(receiptItems.userId, userId))

    // Delete data tables (no FK dependencies first)
    await Promise.all([
      db.delete(expenses).where(eq(expenses.userId, userId)),
      db.delete(categoryBudgets).where(eq(categoryBudgets.userId, userId)),
      db.delete(reports).where(eq(reports.userId, userId)),
      db.delete(audits).where(eq(audits.userId, userId)),
      db.delete(priceComparisons).where(eq(priceComparisons.userId, userId)),
      db.delete(merchantRules).where(eq(merchantRules.userId, userId)),
      db.delete(savingsDeposits).where(eq(savingsDeposits.userId, userId)),
      db.delete(savingsGoals).where(eq(savingsGoals.userId, userId)),
      db.delete(monthlyBudgets).where(eq(monthlyBudgets.userId, userId)),
      db.delete(financialChallenges).where(eq(financialChallenges.userId, userId)),
      db.delete(weeklySummaries).where(eq(weeklySummaries.userId, userId)),
      db.delete(loyaltyCards).where(eq(loyaltyCards.userId, userId)),
    ])

    // Delete receipts (after expenses which reference them)
    await db.delete(receipts).where(eq(receipts.userId, userId))

    // Delete categories and settings
    await Promise.all([
      db.delete(categories).where(eq(categories.userId, userId)),
      db.delete(userSettings).where(eq(userSettings.userId, userId)),
    ])

    // Re-seed with Polish categories + set product type + onboarding complete
    await ensureUserSeeded(userId, 'pl')
    await db.update(userSettings).set({
      productType: 'personal',
      language: 'pl',
      onboardingComplete: true,
    }).where(eq(userSettings.userId, userId))

    // SECURITY (round 2 / A2): record demo-account wipe so we can spot
    // anyone hammering this endpoint to brute-force the demo experience.
    void recordAudit({
      userId,
      action: 'session.demo_reset',
      entityType: 'session',
      entityId: userId,
    })

    return NextResponse.json({
      success: true,
      message: 'All data cleared and re-seeded with Polish categories',
    })
  } catch (err) {
    console.error('[demo/reset]', err)
    return NextResponse.json({ error: 'Failed to reset' }, { status: 500 })
  }
}
