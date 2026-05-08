// ══════════════════════════════════════════════════════════════════════════════
// GET /api/bank/callback
// Nordigen callback after user authorizes bank access.
// Fetches accounts from Nordigen and stores them in DB.
// Redirects to /bank?connected=true or /bank?error=...
// ══════════════════════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth-compat'
import { db } from '@/lib/db'
import { bankConnections, bankAccounts } from '@/lib/db/schema'
import { eq, and, desc } from 'drizzle-orm'
import { getNordigenClient, NordigenApiError } from '@/lib/nordigen/client'

export async function GET() {
  const { userId } = await auth()
  const appUrl = process.env.NEXT_PUBLIC_APP_URL
    ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')

  if (!userId) {
    return NextResponse.redirect(new URL('/login?error=unauthorized', appUrl))
  }

  try {
    // Find the pending connection for this user
    // Nordigen callback doesn't pass the requisition ID directly,
    // so we match by trying every pending requisition until one resolves
    // to a linked status (LN). Round-4 fix (A4 R3 deferred): the previous
    // `.limit(5)` silently abandoned the 6th+ pending connections — a user
    // who tapped "Connect" several times across providers would have older
    // pending rows orphaned forever. Bumping to 50 is still bounded (the
    // 10/hr per-user rate-limit from R1 caps cold-flow worst case at ~240
    // pending rows/day, and the inner loop early-exits the moment one
    // requisition reports `status === 'LN'`). For users below that bound
    // (the realistic 99.9%), this guarantees the just-finished consent
    // is the one we match against, not whatever happened to land in the
    // last 5 rows. Older rows still need a separate cleanup cron — flagged
    // for a future round.
    const pendingConnections = await db
      .select()
      .from(bankConnections)
      .where(and(
        eq(bankConnections.userId, userId),
        eq(bankConnections.status, 'pending'),
      ))
      .orderBy(desc(bankConnections.createdAt))
      .limit(50)

    if (pendingConnections.length === 0) {
      return NextResponse.redirect(new URL('/bank?error=no_pending_connection', appUrl))
    }

    const client = getNordigenClient()

    // Try each pending connection to find one with linked accounts
    let matchedConnection: typeof pendingConnections[0] | null = null
    let nordigenAccounts: string[] = []

    for (const conn of pendingConnections) {
      if (!conn.requisitionId) continue

      try {
        const requisition = await client.getRequisition(conn.requisitionId)

        // Check if the requisition was successfully linked (has accounts)
        if (requisition.status === 'LN' && requisition.accounts.length > 0) {
          matchedConnection = conn
          nordigenAccounts = requisition.accounts
          break
        }

        // If rejected or errored, mark the connection
        if (requisition.status === 'RJ' || requisition.status === 'ER') {
          await db
            .update(bankConnections)
            .set({ status: 'revoked', updatedAt: new Date() })
            .where(eq(bankConnections.id, conn.id))
        }
      } catch {
        // Skip this connection if we can't fetch its requisition
        continue
      }
    }

    if (!matchedConnection || nordigenAccounts.length === 0) {
      return NextResponse.redirect(new URL('/bank?error=authorization_failed', appUrl))
    }

    // Fetch account details and store them
    const accountIds: string[] = []

    for (const nordigenAccountId of nordigenAccounts) {
      try {
        // Get account metadata
        const metadata = await client.getAccountMetadata(nordigenAccountId)

        // Get account details (IBAN, name, currency)
        let iban = metadata.iban ?? ''
        let currency = 'PLN'
        let accountName = ''

        try {
          const details = await client.getAccountDetails(nordigenAccountId)
          iban = details.account.iban ?? iban
          currency = details.account.currency ?? currency
          accountName = details.account.name ?? details.account.ownerName ?? ''
        } catch {
          // Non-critical — use metadata
        }

        // Get balance
        let balance: string | null = null
        try {
          const balancesResponse = await client.getAccountBalances(nordigenAccountId)
          const bal = balancesResponse.balances?.find(
            (b) => b.balanceType === 'interimAvailable' || b.balanceType === 'closingBooked',
          )
          if (bal) {
            balance = bal.balanceAmount.amount
            currency = bal.balanceAmount.currency ?? currency
          }
        } catch {
          // Non-critical
        }

        const [inserted] = await db
          .insert(bankAccounts)
          .values({
            connectionId: matchedConnection.id,
            userId,
            // Store the Nordigen account ID as accountNumber for sync
            accountNumber: nordigenAccountId,
            accountName: accountName || `${matchedConnection.provider} Account`,
            accountType: 'personal',
            currency,
            balance,
            balanceUpdatedAt: balance ? new Date() : null,
            isActive: true,
          })
          .returning({ id: bankAccounts.id })

        if (inserted) {
          accountIds.push(inserted.id)
        }
      } catch (err) {
        console.error(`[bank/callback] Failed to process account ${nordigenAccountId}:`, err)
      }
    }

    // Update the connection to active
    await db
      .update(bankConnections)
      .set({
        accountIds,
        status: 'active',
        updatedAt: new Date(),
      })
      .where(eq(bankConnections.id, matchedConnection.id))

    // Auto-sync transactions for all newly connected accounts
    if (accountIds.length > 0) {
      const { syncTransactions } = await import('@/lib/nordigen/sync')

      for (const accId of accountIds) {
        try {
          await syncTransactions(userId, matchedConnection.id, accId)
        } catch (syncErr) {
          console.error(`[bank/callback] Auto-sync failed for account ${accId}:`, syncErr)
        }
      }
    }

    return NextResponse.redirect(new URL('/bank?connected=true', appUrl))
  } catch (err) {
    console.error('[bank/callback]', err)
    const errorMsg = err instanceof NordigenApiError
      ? `nordigen_error_${err.statusCode}`
      : 'connection_failed'
    return NextResponse.redirect(new URL(`/bank?error=${errorMsg}`, appUrl))
  }
}
