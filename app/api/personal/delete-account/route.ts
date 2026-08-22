import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth-compat'
import { db } from '@/lib/db'
import {
  userSettings, categories, receipts, receiptItems, expenses, categoryBudgets,
  reports, audits, groups, groupMembers, receiptItemAssignments,
  priceComparisons, merchantRules, bankConnections, bankAccounts,
  bankTransactions, savingsGoals, savingsDeposits, monthlyBudgets, incomes,
  financialChallenges, weeklySummaries, loyaltyCards, companies, companyMembers,
  invoices, expenseApprovals, vatEntries, auditLog,
} from '@/lib/db/schema'
import { eq, or, inArray } from 'drizzle-orm'
import { rateLimitPersistent } from '@/lib/rate-limit'
import { recordAudit } from '@/lib/audit-log'
import { SESSION_COOKIE } from '@/lib/session'
import { withApiTiming } from '@/lib/api-timing'

/**
 * POST /api/personal/delete-account
 *
 * Permanently erases the authenticated user's account and ALL associated
 * data. Required by App Store Review Guideline 5.1.1(v): any app offering
 * account creation must let the user initiate deletion from within the app.
 *
 * The work is done as a single `db.batch()` — neon-http runs the whole
 * array as one atomic SQL transaction in a single round-trip, so a partial
 * wipe is impossible. Statements are ordered children → parents so foreign
 * keys never block mid-flight. Tables that already cascade (bank_*,
 * savings_deposits, group children, company members/departments) are still
 * listed explicitly where the user owns rows directly — defensive and
 * makes the intent auditable.
 *
 * Group membership in OTHER people's groups can't be deleted outright:
 * `expense_splits.paid_by_member_id` and `payment_requests.{from,to}` point
 * at those member rows with NO ACTION. We anonymise them instead (strip the
 * userId + email + name) so the other group's balances stay intact while the
 * link to this user is severed — which is exactly what GDPR erasure wants.
 *
 * Idempotent: re-running after a (hypothetical) partial failure is a no-op
 * on already-removed rows.
 */
async function deleteAccount(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Destructive + relatively expensive — a handful of attempts per hour is
  // far more than a real user needs and blunts any abuse of the endpoint.
  const rl = await rateLimitPersistent(`delete-account:${userId}`, { maxRequests: 5, windowMs: 60 * 60 * 1000 })
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too many requests. Try again later.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
    )
  }

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
          ?? req.headers.get('x-real-ip')
          ?? 'unknown'
  const userAgent = req.headers.get('user-agent') ?? undefined

  try {
    await db.batch([
      // 1. Per-item group assignments (no FK cascade) — resolve the
      //    subqueries while receipt_items / groups still exist.
      db.delete(receiptItemAssignments).where(
        or(
          inArray(
            receiptItemAssignments.receiptItemId,
            db.select({ id: receiptItems.id }).from(receiptItems).where(eq(receiptItems.userId, userId)),
          ),
          inArray(
            receiptItemAssignments.groupId,
            db.select({ id: groups.id }).from(groups).where(eq(groups.createdBy, userId)),
          ),
        ),
      ),
      // 2. Business approvals submitted by this user (expense-linked ones
      //    also cascade when the expense is deleted below).
      db.delete(expenseApprovals).where(eq(expenseApprovals.submittedBy, userId)),
      // 3. VAT entries + invoices (vat_entries.invoice_id is SET NULL).
      db.delete(vatEntries).where(eq(vatEntries.userId, userId)),
      db.delete(invoices).where(eq(invoices.userId, userId)),
      // 4. Bank chain (child → parent).
      db.delete(bankTransactions).where(eq(bankTransactions.userId, userId)),
      db.delete(bankAccounts).where(eq(bankAccounts.userId, userId)),
      db.delete(bankConnections).where(eq(bankConnections.userId, userId)),
      // 5. Savings.
      db.delete(savingsDeposits).where(eq(savingsDeposits.userId, userId)),
      db.delete(savingsGoals).where(eq(savingsGoals.userId, userId)),
      // 6. Flat personal tables.
      db.delete(priceComparisons).where(eq(priceComparisons.userId, userId)),
      db.delete(merchantRules).where(eq(merchantRules.userId, userId)),
      db.delete(categoryBudgets).where(eq(categoryBudgets.userId, userId)),
      db.delete(monthlyBudgets).where(eq(monthlyBudgets.userId, userId)),
      db.delete(incomes).where(eq(incomes.userId, userId)),
      db.delete(financialChallenges).where(eq(financialChallenges.userId, userId)),
      db.delete(weeklySummaries).where(eq(weeklySummaries.userId, userId)),
      db.delete(loyaltyCards).where(eq(loyaltyCards.userId, userId)),
      db.delete(reports).where(eq(reports.userId, userId)),
      db.delete(audits).where(eq(audits.userId, userId)),
      // 7. Company membership + owned companies (companies cascade their
      //    members + departments).
      db.delete(companyMembers).where(eq(companyMembers.userId, userId)),
      db.delete(companies).where(eq(companies.ownerId, userId)),
      // 8. Groups created by the user — cascades that group's members,
      //    expense_splits and payment_requests.
      db.delete(groups).where(eq(groups.createdBy, userId)),
      // 9. Anonymise membership in groups owned by OTHER users (see header).
      db.update(groupMembers)
        .set({ userId: null, email: null, displayName: '(usunięty użytkownik)' })
        .where(eq(groupMembers.userId, userId)),
      // 10. Receipts, items, expenses (expense_splits.{expense,receipt}_id
      //     are SET NULL, so any cross-group split references survive).
      db.delete(expenses).where(eq(expenses.userId, userId)),
      db.delete(receiptItems).where(eq(receiptItems.userId, userId)),
      db.delete(receipts).where(eq(receipts.userId, userId)),
      // 11. Categories (referenced only by plain uuid columns, no FK).
      db.delete(categories).where(eq(categories.userId, userId)),
      // 12. This user's audit trail.
      db.delete(auditLog).where(eq(auditLog.userId, userId)),
      // 13. Settings row last.
      db.delete(userSettings).where(eq(userSettings.userId, userId)),
    ])
  } catch (err) {
    console.error('[delete-account] batch failed:', err)
    return NextResponse.json({ error: 'Failed to delete account' }, { status: 500 })
  }

  // Single post-deletion marker. userId is a sha256-derived pseudonym (no
  // raw PII), so a "this account was erased" trail is GDPR-appropriate.
  // Fire-and-forget — never blocks the response.
  void recordAudit({
    userId,
    action: 'account.delete',
    entityType: 'account',
    entityId: userId,
    payload: { channel: 'ios' },
    ip,
    userAgent,
  })

  // Clear the session cookie so the (now data-less) client lands on login.
  const res = NextResponse.json({ ok: true })
  res.cookies.set(SESSION_COOKIE, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 0,
    path: '/',
  })
  return res
}

export const POST = withApiTiming('api.personal.delete-account.POST', deleteAccount)
