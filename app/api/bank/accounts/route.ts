// ══════════════════════════════════════════════════════════════════════════════
// GET /api/bank/accounts
// List user's connected bank accounts with balances and connection status.
// ══════════════════════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth-compat'
import { db } from '@/lib/db'
import { bankAccounts, bankConnections } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

export async function GET() {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Fetch all active connections for this user
    const connections = await db
      .select({
        id: bankConnections.id,
        provider: bankConnections.provider,
        status: bankConnections.status,
        consentExpiresAt: bankConnections.consentExpiresAt,
        lastSyncAt: bankConnections.lastSyncAt,
        createdAt: bankConnections.createdAt,
      })
      .from(bankConnections)
      .where(eq(bankConnections.userId, userId))

    // Fetch all accounts for these connections
    const accounts = await db
      .select({
        id: bankAccounts.id,
        connectionId: bankAccounts.connectionId,
        accountNumber: bankAccounts.accountNumber,
        accountName: bankAccounts.accountName,
        accountType: bankAccounts.accountType,
        currency: bankAccounts.currency,
        balance: bankAccounts.balance,
        balanceUpdatedAt: bankAccounts.balanceUpdatedAt,
        isActive: bankAccounts.isActive,
        createdAt: bankAccounts.createdAt,
      })
      .from(bankAccounts)
      .where(eq(bankAccounts.userId, userId))

    // Mask account numbers for security (show only last 4 digits)
    const maskedAccounts = accounts.map((acc) => ({
      ...acc,
      accountNumberMasked: acc.accountNumber
        ? `****${acc.accountNumber.slice(-4)}`
        : null,
      accountNumber: acc.accountNumber
        ? `${acc.accountNumber.slice(0, 2)}${'*'.repeat(acc.accountNumber.length - 6)}${acc.accountNumber.slice(-4)}`
        : null,
    }))

    // Group accounts by connection
    const result = connections.map((conn) => ({
      connection: {
        ...conn,
        isConsentExpired: conn.consentExpiresAt
          ? new Date(conn.consentExpiresAt) < new Date()
          : false,
      },
      accounts: maskedAccounts.filter((acc) => acc.connectionId === conn.id),
    }))

    return NextResponse.json({ connections: result })
  } catch (err) {
    console.error('[bank/accounts GET]', err)
    return NextResponse.json(
      { error: 'Failed to fetch bank accounts' },
      { status: 500 },
    )
  }
}
