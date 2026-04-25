// ══════════════════════════════════════════════════════════════════════════════
// POST /api/bank/sync
// Trigger transaction sync for a given bank account via Nordigen.
// Body: { accountId: string }
// Returns sync stats.
// ══════════════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth-compat'
import { db } from '@/lib/db'
import { bankAccounts } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { syncTransactions } from '@/lib/nordigen/sync'

export async function POST(request: NextRequest) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = (await request.json()) as { accountId?: string }

    if (!body.accountId) {
      return NextResponse.json(
        { error: 'Missing required field: accountId' },
        { status: 400 },
      )
    }

    // Verify the account belongs to this user
    const [account] = await db
      .select({
        id: bankAccounts.id,
        connectionId: bankAccounts.connectionId,
        isActive: bankAccounts.isActive,
      })
      .from(bankAccounts)
      .where(and(eq(bankAccounts.id, body.accountId), eq(bankAccounts.userId, userId)))
      .limit(1)

    if (!account) {
      return NextResponse.json(
        { error: 'Bank account not found' },
        { status: 404 },
      )
    }

    if (!account.isActive) {
      return NextResponse.json(
        { error: 'Bank account is inactive' },
        { status: 400 },
      )
    }

    // Run the sync
    const stats = await syncTransactions(userId, account.connectionId, account.id)

    return NextResponse.json({
      success: true,
      stats,
    })
  } catch (err) {
    console.error('[bank/sync POST]', err)
    return NextResponse.json({ error: 'Operation failed' }, { status: 500 })
  }
}
