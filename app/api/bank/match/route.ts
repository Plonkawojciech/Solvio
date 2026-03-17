// ══════════════════════════════════════════════════════════════════════════════
// POST /api/bank/match
// Auto-match a bank transaction to an expense (or create one).
// Body: { transactionId: string }
// Marks the transaction as matched and optionally links it to an expense.
// ══════════════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth-compat'
import { db } from '@/lib/db'
import { bankTransactions, expenses } from '@/lib/db/schema'
import { eq, and, sql } from 'drizzle-orm'

export async function POST(request: NextRequest) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = (await request.json()) as { transactionId?: string }

    if (!body.transactionId) {
      return NextResponse.json(
        { error: 'Missing required field: transactionId' },
        { status: 400 },
      )
    }

    // Verify the transaction belongs to this user
    const [transaction] = await db
      .select({
        id: bankTransactions.id,
        amount: bankTransactions.amount,
        date: bankTransactions.date,
        description: bankTransactions.description,
        counterpartyName: bankTransactions.counterpartyName,
        currency: bankTransactions.currency,
        category: bankTransactions.category,
        isMatched: bankTransactions.isMatched,
        expenseId: bankTransactions.expenseId,
        suggestedCategoryId: bankTransactions.suggestedCategoryId,
      })
      .from(bankTransactions)
      .where(
        and(
          eq(bankTransactions.id, body.transactionId),
          eq(bankTransactions.userId, userId),
        ),
      )
      .limit(1)

    if (!transaction) {
      return NextResponse.json(
        { error: 'Transaction not found' },
        { status: 404 },
      )
    }

    if (transaction.isMatched) {
      return NextResponse.json({
        success: true,
        alreadyMatched: true,
        expenseId: transaction.expenseId,
      })
    }

    // Try to find a matching expense by amount + date proximity
    const txAmount = Math.abs(parseFloat(transaction.amount))
    const txDate = transaction.date

    const matchCandidates = await db
      .select({ id: expenses.id, amount: expenses.amount, date: expenses.date, title: expenses.title })
      .from(expenses)
      .where(
        and(
          eq(expenses.userId, userId),
          sql`ABS(CAST(${expenses.amount} AS NUMERIC) - ${txAmount}) < 0.02`,
          sql`ABS(${expenses.date}::date - ${txDate}::date) <= 3`,
          sql`${expenses.bankTransactionId} IS NULL`,
        ),
      )
      .limit(1)

    let expenseId: string | null = null

    if (matchCandidates.length > 0) {
      // Link existing expense to this transaction
      expenseId = matchCandidates[0].id
      await db
        .update(expenses)
        .set({ bankTransactionId: transaction.id })
        .where(eq(expenses.id, expenseId))
    } else {
      // Create a new expense from the transaction
      const title = transaction.counterpartyName || transaction.description || 'Bank transaction'
      const [newExpense] = await db
        .insert(expenses)
        .values({
          userId,
          title,
          amount: txAmount.toFixed(2),
          currency: transaction.currency ?? 'PLN',
          date: txDate,
          vendor: transaction.counterpartyName ?? undefined,
          categoryId: transaction.suggestedCategoryId ?? undefined,
          bankTransactionId: transaction.id,
          notes: transaction.description ?? undefined,
        })
        .returning({ id: expenses.id })

      expenseId = newExpense?.id ?? null
    }

    // Mark the transaction as matched
    await db
      .update(bankTransactions)
      .set({
        isMatched: true,
        expenseId,
      })
      .where(eq(bankTransactions.id, transaction.id))

    return NextResponse.json({
      success: true,
      expenseId,
      created: matchCandidates.length === 0,
    })
  } catch (err) {
    console.error('[bank/match POST]', err)
    const message = err instanceof Error ? err.message : 'Match failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
