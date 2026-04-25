// ══════════════════════════════════════════════════════════════════════════════
// Nordigen Transaction Sync Engine
// Fetches transactions from GoCardless, deduplicates, auto-creates expenses.
// ══════════════════════════════════════════════════════════════════════════════

import { db } from '@/lib/db'
import {
  bankConnections,
  bankAccounts,
  bankTransactions,
  expenses,
  categories,
} from '@/lib/db/schema'
import { eq, and, inArray } from 'drizzle-orm'
import { getNordigenClient, NordigenApiError } from './client'
import type { NordigenTransaction } from './client'
import { getCategoryByMcc } from '@/lib/pko/mcc-categories'

export interface SyncStats {
  fetched: number
  newTransactions: number
  duplicates: number
  categorized: number
  expensesCreated: number
  errors: string[]
}

/**
 * Synchronize transactions from Nordigen for a given bank account.
 * - Fetches booked transactions since last sync (or last 90 days)
 * - Deduplicates by externalId (transactionId from Nordigen)
 * - For DEBIT transactions, auto-creates expenses
 * - Uses MCC codes + OpenAI for categorization
 */
export async function syncTransactions(
  userId: string,
  connectionId: string,
  accountId: string,
): Promise<SyncStats> {
  const stats: SyncStats = {
    fetched: 0,
    newTransactions: 0,
    duplicates: 0,
    categorized: 0,
    expensesCreated: 0,
    errors: [],
  }

  // 1. Get the bank connection and account
  const [connection] = await db
    .select()
    .from(bankConnections)
    .where(and(eq(bankConnections.id, connectionId), eq(bankConnections.userId, userId)))
    .limit(1)

  if (!connection) {
    throw new Error('Bank connection not found')
  }

  if (connection.status !== 'active') {
    throw new Error(`Bank connection is not active (status: ${connection.status})`)
  }

  const [account] = await db
    .select()
    .from(bankAccounts)
    .where(and(eq(bankAccounts.id, accountId), eq(bankAccounts.userId, userId)))
    .limit(1)

  if (!account) {
    throw new Error('Bank account not found')
  }

  // The account.accountNumber stores the Nordigen account ID (UUID)
  const nordigenAccountId = account.accountNumber
  if (!nordigenAccountId) {
    throw new Error('Bank account has no Nordigen account ID')
  }

  // 2. Determine sync date range
  const now = new Date()
  let dateFrom: string

  if (connection.lastSyncAt) {
    // Sync since last successful sync, with 1-day overlap for safety
    const lastSync = new Date(connection.lastSyncAt)
    lastSync.setDate(lastSync.getDate() - 1)
    dateFrom = lastSync.toISOString().slice(0, 10)
  } else {
    // First sync: fetch last 90 days
    const ninetyDaysAgo = new Date(now)
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)
    dateFrom = ninetyDaysAgo.toISOString().slice(0, 10)
  }

  const dateTo = now.toISOString().slice(0, 10)

  // 3. Fetch transactions from Nordigen
  const client = getNordigenClient()
  let allTransactions: NordigenTransaction[] = []

  try {
    const response = await client.getAccountTransactions(nordigenAccountId, dateFrom, dateTo)
    allTransactions = response.transactions.booked ?? []
  } catch (err) {
    if (err instanceof NordigenApiError) {
      stats.errors.push(`Nordigen API error: ${err.message} (status: ${err.statusCode})`)

      // If account expired or access denied, mark connection accordingly
      if (err.statusCode === 401 || err.statusCode === 403 || err.statusCode === 409) {
        await db
          .update(bankConnections)
          .set({ status: 'expired', updatedAt: new Date() })
          .where(eq(bankConnections.id, connectionId))
        throw new Error('Bank access expired — reconnect required')
      }
    }
    throw err
  }

  stats.fetched = allTransactions.length

  if (allTransactions.length === 0) {
    // Update last sync time even if no new transactions
    await db
      .update(bankConnections)
      .set({ lastSyncAt: now, updatedAt: now })
      .where(eq(bankConnections.id, connectionId))
    return stats
  }

  // 4. Get existing transaction externalIds for deduplication
  const externalIds = allTransactions
    .map((t) => t.transactionId || t.internalTransactionId)
    .filter(Boolean) as string[]

  const existingTransactions = externalIds.length > 0
    ? await db
        .select({ externalId: bankTransactions.externalId })
        .from(bankTransactions)
        .where(
          and(
            eq(bankTransactions.accountId, accountId),
            inArray(bankTransactions.externalId, externalIds),
          ),
        )
    : []

  const existingIds = new Set(existingTransactions.map((t) => t.externalId))

  // 5. Get user categories for MCC-based categorization
  const userCategories = await db
    .select()
    .from(categories)
    .where(eq(categories.userId, userId))

  const categoryMap = new Map(
    userCategories.map((c) => [c.name.toLowerCase(), c.id]),
  )

  // 6. Process each transaction
  for (const txn of allTransactions) {
    const txnId = txn.transactionId || txn.internalTransactionId
    if (!txnId) continue

    if (existingIds.has(txnId)) {
      stats.duplicates++
      continue
    }

    // Parse transaction data
    const amount = parseFloat(txn.transactionAmount.amount)
    const isDebit = amount < 0 // Nordigen uses negative amounts for debits
    const transactionDate = txn.bookingDate ?? txn.valueDate ?? dateTo

    // Extract description
    const description = txn.remittanceInformationUnstructured
      ?? txn.remittanceInformationUnstructuredArray?.join(' ')
      ?? txn.additionalInformation
      ?? null

    // Extract counterparty info
    const counterpartyName = isDebit ? txn.creditorName : txn.debtorName
    const counterpartyAccount = isDebit
      ? txn.creditorAccount?.iban
      : txn.debtorAccount?.iban

    // Categorize by MCC
    let suggestedCategoryId: string | null = null
    const mccCategoryName = getCategoryByMcc(txn.merchantCategoryCode)
    if (mccCategoryName) {
      suggestedCategoryId = categoryMap.get(mccCategoryName.toLowerCase()) ?? null
      if (suggestedCategoryId) {
        stats.categorized++
      }
    }

    // If no MCC match, try AI categorization for debit transactions
    if (!suggestedCategoryId && isDebit && (description || counterpartyName)) {
      suggestedCategoryId = await categorizeWithAI(
        description ?? '',
        counterpartyName ?? '',
        txn.merchantCategoryCode ?? '',
        categoryMap,
      )
      if (suggestedCategoryId) {
        stats.categorized++
      }
    }

    // 7. Insert bank transaction
    const [insertedTxn] = await db
      .insert(bankTransactions)
      .values({
        accountId,
        userId,
        externalId: txnId,
        amount: amount.toFixed(2),
        currency: txn.transactionAmount.currency ?? account.currency ?? 'PLN',
        date: transactionDate,
        bookingDate: txn.bookingDate ?? null,
        description,
        counterpartyName: counterpartyName ?? null,
        counterpartyAccount: counterpartyAccount ?? null,
        mccCode: txn.merchantCategoryCode ?? null,
        transactionType: txn.proprietaryBankTransactionCode ?? txn.bankTransactionCode ?? null,
        category: isDebit ? 'debit' : 'credit',
        suggestedCategoryId,
        isMatched: false,
        metadata: {
          valueDate: txn.valueDate,
          bankTransactionCode: txn.bankTransactionCode,
          internalTransactionId: txn.internalTransactionId,
        },
      })
      .returning({ id: bankTransactions.id })

    stats.newTransactions++

    // 8. Auto-create expense for debit (outgoing) transactions
    if (isDebit && insertedTxn) {
      try {
        const expenseTitle = description
          ?? counterpartyName
          ?? 'Bank transaction'

        const [createdExpense] = await db
          .insert(expenses)
          .values({
            userId,
            title: expenseTitle.slice(0, 255),
            amount: Math.abs(amount).toFixed(2),
            currency: txn.transactionAmount.currency ?? account.currency ?? 'PLN',
            date: transactionDate,
            categoryId: suggestedCategoryId,
            vendor: counterpartyName?.slice(0, 255),
            notes: `Auto-imported from bank`,
            bankTransactionId: insertedTxn.id,
          })
          .returning({ id: expenses.id })

        if (createdExpense) {
          // Link the bank transaction back to the expense
          await db
            .update(bankTransactions)
            .set({
              expenseId: createdExpense.id,
              isMatched: true,
            })
            .where(eq(bankTransactions.id, insertedTxn.id))

          stats.expensesCreated++
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        stats.errors.push(`Failed to create expense for txn ${txnId}: ${msg}`)
      }
    }
  }

  // 9. Update connection last sync timestamp
  await db
    .update(bankConnections)
    .set({ lastSyncAt: now, updatedAt: now })
    .where(eq(bankConnections.id, connectionId))

  // 10. Update account balance
  try {
    const balancesResponse = await client.getAccountBalances(nordigenAccountId)
    const balance = balancesResponse.balances?.find(
      (b) => b.balanceType === 'interimAvailable' || b.balanceType === 'closingBooked',
    )
    if (balance) {
      await db
        .update(bankAccounts)
        .set({
          balance: balance.balanceAmount.amount,
          balanceUpdatedAt: now,
        })
        .where(eq(bankAccounts.id, accountId))
    }
  } catch {
    // Non-critical — balance update failure shouldn't fail the sync
  }

  return stats
}

// ── AI Categorization ────────────────────────────────────────────────────────

async function categorizeWithAI(
  description: string,
  counterpartyName: string,
  mccCode: string,
  categoryMap: Map<string, string>,
): Promise<string | null> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return null

  const categoryNames = Array.from(categoryMap.keys())
  if (categoryNames.length === 0) return null

  try {
    const prompt = `Categorize this bank transaction into one of these categories: ${categoryNames.join(', ')}.

Transaction details:
- Description: ${description || 'N/A'}
- Counterparty: ${counterpartyName || 'N/A'}
- MCC code: ${mccCode || 'N/A'}

Respond with ONLY the category name, nothing else. If you cannot determine the category, respond with "Other".`

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 20,
        temperature: 0,
      }),
    })

    if (!response.ok) return null

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>
    }

    const categoryName = data.choices?.[0]?.message?.content?.trim().toLowerCase()
    if (!categoryName) return null

    return categoryMap.get(categoryName) ?? null
  } catch {
    return null
  }
}
