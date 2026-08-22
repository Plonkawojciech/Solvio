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
import { rateLimitPersistent } from '@/lib/rate-limit'
import { withApiTiming } from '@/lib/api-timing'
import { z } from 'zod'

// SECURITY (round 2 / A2): bound the body. connectionId is a UUID.
const DisconnectSchema = z.object({
  connectionId: z.string().uuid('connectionId must be a valid UUID'),
}).strict()

async function postBankDisconnect(request: NextRequest) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const rl = await rateLimitPersistent(`bank:disconnect:${userId}`, { maxRequests: 20, windowMs: 60 * 60 * 1000 })
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too many bank disconnect attempts. Try again later.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
    )
  }

  try {
    const rawBody = await request.json().catch(() => null)
    if (!rawBody) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

    const parsed = DisconnectSchema.safeParse(rawBody)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      )
    }
    const body = parsed.data

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

export const POST = withApiTiming('api.bank.disconnect.POST', postBankDisconnect)
