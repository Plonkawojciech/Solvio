// ══════════════════════════════════════════════════════════════════════════════
// POST /api/bank/disconnect
// Revoke PKO consent and delete the bank connection.
// Body: { connectionId: string }
// ══════════════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth-compat'
import { db } from '@/lib/db'
import { bankConnections, bankAccounts, bankTransactions } from '@/lib/db/schema'
import { eq, and, inArray } from 'drizzle-orm'
import { getPkoClient, PkoApiError } from '@/lib/pko/client'

export async function POST(request: NextRequest) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = (await request.json()) as { connectionId?: string }

    if (!body.connectionId) {
      return NextResponse.json(
        { error: 'Missing required field: connectionId' },
        { status: 400 },
      )
    }

    // Find the connection
    const [connection] = await db
      .select()
      .from(bankConnections)
      .where(and(
        eq(bankConnections.id, body.connectionId),
        eq(bankConnections.userId, userId),
      ))
      .limit(1)

    if (!connection) {
      return NextResponse.json(
        { error: 'Bank connection not found' },
        { status: 404 },
      )
    }

    // Try to revoke the consent at PKO (best-effort)
    if (connection.consentId && connection.status === 'active') {
      try {
        const client = getPkoClient()
        await client.deleteConsent(connection.consentId)
      } catch (err) {
        // Log but don't fail — we still want to clean up our side
        if (err instanceof PkoApiError) {
          console.warn(
            `[bank/disconnect] Failed to revoke PKO consent ${connection.consentId}:`,
            err.message,
          )
        }
      }
    }

    // Get all account IDs for this connection (for cleaning up transactions)
    const accounts = await db
      .select({ id: bankAccounts.id })
      .from(bankAccounts)
      .where(eq(bankAccounts.connectionId, connection.id))

    const accountIds = accounts.map((a) => a.id)

    // Delete bank transactions for these accounts
    // Note: expenses linked via bankTransactionId remain (just unlinked)
    if (accountIds.length > 0) {
      await db
        .delete(bankTransactions)
        .where(inArray(bankTransactions.accountId, accountIds))
    }

    // Delete bank accounts (cascades from connection FK, but explicit for safety)
    await db
      .delete(bankAccounts)
      .where(eq(bankAccounts.connectionId, connection.id))

    // Delete the connection itself
    await db
      .delete(bankConnections)
      .where(eq(bankConnections.id, connection.id))

    return NextResponse.json({
      success: true,
      message: 'Bank connection disconnected successfully',
    })
  } catch (err) {
    console.error('[bank/disconnect POST]', err)
    const message = err instanceof Error ? err.message : 'Failed to disconnect'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
