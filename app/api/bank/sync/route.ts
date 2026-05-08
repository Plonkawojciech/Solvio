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
import { rateLimitPersistent } from '@/lib/rate-limit'
import { z } from 'zod'

// SECURITY (round 2 / A2): bound the bank-sync body. accountId is a UUID
// (DB primary key) — anything else is a guaranteed-no-match.
const BankSyncSchema = z.object({
  accountId: z.string().uuid('accountId must be a valid UUID'),
}).strict()

export async function POST(request: NextRequest) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const rl = await rateLimitPersistent(`bank:sync:${userId}`, { maxRequests: 30, windowMs: 60 * 60 * 1000 })
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too many bank sync attempts. Try again later.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
    )
  }

  try {
    const rawBody = await request.json().catch(() => null)
    if (!rawBody) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

    const parsed = BankSyncSchema.safeParse(rawBody)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      )
    }
    const body = parsed.data

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
