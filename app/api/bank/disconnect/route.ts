// ══════════════════════════════════════════════════════════════════════════════
// POST /api/bank/disconnect
// Delete Nordigen requisition and remove the bank connection.
// Body: { connectionId: string }
// ══════════════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth-compat'
import { db } from '@/lib/db'
import { bankConnections, bankAccounts, bankTransactions } from '@/lib/db/schema'
import { eq, and, inArray } from 'drizzle-orm'
import { getNordigenClient } from '@/lib/nordigen/client'

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

    // Try to delete the Nordigen requisition (best-effort)
    if (connection.requisitionId) {
      try {
        const client = getNordigenClient()
        await client.deleteRequisition(connection.requisitionId)
      } catch (err) {
        console.warn(
          `[bank/disconnect] Failed to delete Nordigen requisition ${connection.requisitionId}:`,
          err instanceof Error ? err.message : String(err),
        )
      }
    }

    // Get all account IDs for this connection (for cleaning up transactions)
    const accounts = await db
      .select({ id: bankAccounts.id })
      .from(bankAccounts)
      .where(eq(bankAccounts.connectionId, connection.id))

    const accountIds = accounts.map((a) => a.id)

    // Delete bank transactions for these accounts
    if (accountIds.length > 0) {
      await db
        .delete(bankTransactions)
        .where(inArray(bankTransactions.accountId, accountIds))
    }

    // Delete bank accounts
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
    return NextResponse.json({ error: 'Operation failed' }, { status: 500 })
  }
}
