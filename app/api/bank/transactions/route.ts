// ══════════════════════════════════════════════════════════════════════════════
// GET /api/bank/transactions
// List bank transactions with optional filters and pagination.
// Query params: accountId, dateFrom, dateTo, minAmount, maxAmount, page, perPage
// ══════════════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth-compat'
import { db } from '@/lib/db'
import { bankTransactions, bankAccounts } from '@/lib/db/schema'
import { eq, and, gte, lte, sql, desc } from 'drizzle-orm'

export async function GET(request: NextRequest) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { searchParams } = request.nextUrl
    const accountId = searchParams.get('accountId')
    const dateFrom = searchParams.get('dateFrom')
    const dateTo = searchParams.get('dateTo')
    const minAmount = searchParams.get('minAmount')
    const maxAmount = searchParams.get('maxAmount')
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
    const perPage = Math.min(100, Math.max(1, parseInt(searchParams.get('perPage') ?? '50', 10)))

    // Build filter conditions
    const conditions = [eq(bankTransactions.userId, userId)]

    if (accountId) {
      // Verify account belongs to user
      const [account] = await db
        .select({ id: bankAccounts.id })
        .from(bankAccounts)
        .where(and(eq(bankAccounts.id, accountId), eq(bankAccounts.userId, userId)))
        .limit(1)

      if (!account) {
        return NextResponse.json({ error: 'Bank account not found' }, { status: 404 })
      }

      conditions.push(eq(bankTransactions.accountId, accountId))
    }

    if (dateFrom) {
      conditions.push(gte(bankTransactions.date, dateFrom))
    }

    if (dateTo) {
      conditions.push(lte(bankTransactions.date, dateTo))
    }

    if (minAmount) {
      conditions.push(
        sql`CAST(${bankTransactions.amount} AS NUMERIC) >= ${parseFloat(minAmount)}`,
      )
    }

    if (maxAmount) {
      conditions.push(
        sql`CAST(${bankTransactions.amount} AS NUMERIC) <= ${parseFloat(maxAmount)}`,
      )
    }

    const whereClause = and(...conditions)

    // Get total count
    const [countResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(bankTransactions)
      .where(whereClause)

    const total = countResult?.count ?? 0
    const totalPages = Math.ceil(total / perPage)
    const offset = (page - 1) * perPage

    // Fetch transactions with pagination
    const transactions = await db
      .select({
        id: bankTransactions.id,
        accountId: bankTransactions.accountId,
        externalId: bankTransactions.externalId,
        amount: bankTransactions.amount,
        currency: bankTransactions.currency,
        date: bankTransactions.date,
        bookingDate: bankTransactions.bookingDate,
        description: bankTransactions.description,
        counterpartyName: bankTransactions.counterpartyName,
        counterpartyAccount: bankTransactions.counterpartyAccount,
        mccCode: bankTransactions.mccCode,
        transactionType: bankTransactions.transactionType,
        category: bankTransactions.category,
        expenseId: bankTransactions.expenseId,
        suggestedCategoryId: bankTransactions.suggestedCategoryId,
        isMatched: bankTransactions.isMatched,
        createdAt: bankTransactions.createdAt,
      })
      .from(bankTransactions)
      .where(whereClause)
      .orderBy(desc(bankTransactions.date), desc(bankTransactions.createdAt))
      .limit(perPage)
      .offset(offset)

    // Mask counterparty account numbers
    const maskedTransactions = transactions.map((txn) => ({
      ...txn,
      counterpartyAccount: txn.counterpartyAccount
        ? `****${txn.counterpartyAccount.slice(-4)}`
        : null,
    }))

    return NextResponse.json({
      transactions: maskedTransactions,
      pagination: {
        page,
        perPage,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    })
  } catch (err) {
    console.error('[bank/transactions GET]', err)
    return NextResponse.json(
      { error: 'Failed to fetch transactions' },
      { status: 500 },
    )
  }
}
