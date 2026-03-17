// ══════════════════════════════════════════════════════════════════════════════
// GET /api/bank/data
// Aggregated bank data for the bank dashboard page.
// Returns { accounts, transactions, stats }.
// ══════════════════════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth-compat'
import { db } from '@/lib/db'
import { bankAccounts, bankConnections, bankTransactions, categories } from '@/lib/db/schema'
import { eq, and, desc, sql } from 'drizzle-orm'

export async function GET() {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Fetch accounts with their connection status
    const accounts = await db
      .select({
        id: bankAccounts.id,
        connectionId: bankAccounts.connectionId,
        accountNumber: bankAccounts.accountNumber,
        accountName: bankAccounts.accountName,
        currency: bankAccounts.currency,
        balance: bankAccounts.balance,
        balanceUpdatedAt: bankAccounts.balanceUpdatedAt,
        isActive: bankAccounts.isActive,
      })
      .from(bankAccounts)
      .where(eq(bankAccounts.userId, userId))

    // Get connection info for status/sync timestamps
    const connections = await db
      .select({
        id: bankConnections.id,
        provider: bankConnections.provider,
        status: bankConnections.status,
        lastSyncAt: bankConnections.lastSyncAt,
      })
      .from(bankConnections)
      .where(eq(bankConnections.userId, userId))

    // Build accounts list with connection metadata
    const enrichedAccounts = accounts.map((acc) => {
      const conn = connections.find((c) => c.id === acc.connectionId)
      return {
        ...acc,
        accountNumber: acc.accountNumber
          ? `${acc.accountNumber.slice(0, 2)}${'*'.repeat(Math.max(0, acc.accountNumber.length - 6))}${acc.accountNumber.slice(-4)}`
          : null,
        connectionStatus: conn?.status ?? 'unknown',
        lastSyncAt: conn?.lastSyncAt?.toISOString() ?? null,
        provider: conn?.provider ?? 'pko',
      }
    })

    // Fetch recent transactions (last 100)
    const transactions = await db
      .select({
        id: bankTransactions.id,
        date: bankTransactions.date,
        description: bankTransactions.description,
        counterpartyName: bankTransactions.counterpartyName,
        amount: bankTransactions.amount,
        currency: bankTransactions.currency,
        category: bankTransactions.category,
        isMatched: bankTransactions.isMatched,
        expenseId: bankTransactions.expenseId,
        suggestedCategoryId: bankTransactions.suggestedCategoryId,
      })
      .from(bankTransactions)
      .where(eq(bankTransactions.userId, userId))
      .orderBy(desc(bankTransactions.date), desc(bankTransactions.createdAt))
      .limit(100)

    // Enrich transactions with suggested category names
    const categoryIds = [...new Set(
      transactions
        .filter((tx) => tx.suggestedCategoryId)
        .map((tx) => tx.suggestedCategoryId!)
    )]

    let categoryMap: Record<string, string> = {}
    if (categoryIds.length > 0) {
      const cats = await db
        .select({ id: categories.id, name: categories.name })
        .from(categories)
        .where(
          and(
            eq(categories.userId, userId),
            sql`${categories.id} = ANY(${categoryIds}::uuid[])`
          )
        )
      categoryMap = Object.fromEntries(cats.map((c) => [c.id, c.name]))
    }

    const enrichedTransactions = transactions.map((tx) => ({
      ...tx,
      suggestedCategoryName: tx.suggestedCategoryId
        ? categoryMap[tx.suggestedCategoryId] ?? null
        : null,
    }))

    // Compute stats
    const totalSynced = transactions.length
    const matchedCount = transactions.filter((tx) => tx.isMatched).length
    const autoCategorizedPercent = totalSynced > 0
      ? Math.round((matchedCount / totalSynced) * 100)
      : 0

    // Find latest sync time across connections
    const lastSyncTimes = connections
      .map((c) => c.lastSyncAt)
      .filter(Boolean)
      .sort((a, b) => new Date(b!).getTime() - new Date(a!).getTime())
    const lastSyncTime = lastSyncTimes[0]?.toISOString() ?? null

    return NextResponse.json({
      accounts: enrichedAccounts,
      transactions: enrichedTransactions,
      stats: {
        totalSynced,
        autoCategorizedPercent,
        lastSyncTime,
      },
    })
  } catch (err) {
    console.error('[bank/data GET]', err)
    return NextResponse.json(
      { error: 'Failed to fetch bank data' },
      { status: 500 },
    )
  }
}
