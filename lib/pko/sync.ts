// ══════════════════════════════════════════════════════════════════════════════
// PKO Transaction Sync Engine
// Fetches transactions from PKO AIS, deduplicates, auto-creates expenses.
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
import { getPkoClient, PkoApiError } from './client'
import { decrypt } from './encryption'
import { getCategoryByMcc } from './mcc-categories'
import type { TransactionInfo } from './types'

export interface SyncStats {
  fetched: number
  newTransactions: number
  duplicates: number
  categorized: number
  expensesCreated: number
  errors: string[]
}

/**
 * Synchronize transactions from PKO bank for a given account.
 * - Fetches completed transactions since last sync (or last 90 days)
 * - Deduplicates by externalId (itemId from PKO)
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

  if (!account.accountNumber) {
    throw new Error('Bank account has no account number')
  }

  // 2. Decrypt access token
  let accessToken: string
  try {
    if (!connection.accessToken) {
      throw new Error('No access token stored')
    }
    accessToken = decrypt(connection.accessToken)
  } catch (err) {
    throw new Error(`Failed to decrypt access token: ${err instanceof Error ? err.message : String(err)}`)
  }

  // 3. Determine sync date range
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

  // 4. Fetch transactions from PKO
  const client = getPkoClient()
  const allTransactions: TransactionInfo[] = []
  let pageId: string | undefined

  try {
    do {
      const response = await client.getTransactionsDone(accessToken, {
        accountNumber: account.accountNumber,
        bookingDateFrom: dateFrom,
        bookingDateTo: dateTo,
        perPage: 50,
        pageId,
      })

      if (response.transactions) {
        allTransactions.push(...response.transactions)
      }

      pageId = response.pageInfo?.nextPage ?? undefined
    } while (pageId)
  } catch (err) {
    if (err instanceof PkoApiError) {
      stats.errors.push(`PKO API error: ${err.message} (code: ${err.errorCode}, status: ${err.statusCode})`)

      // If token expired, mark connection as expired
      if (err.statusCode === 401) {
        await db
          .update(bankConnections)
          .set({ status: 'expired', updatedAt: new Date() })
          .where(eq(bankConnections.id, connectionId))
        throw new Error('Access token expired — reconnect required')
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

  // 5. Get existing transaction externalIds for deduplication
  const externalIds = allTransactions.map((t) => t.itemId).filter(Boolean)
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

  // 6. Get user categories for MCC-based categorization
  const userCategories = await db
    .select()
    .from(categories)
    .where(eq(categories.userId, userId))

  const categoryMap = new Map(
    userCategories.map((c) => [c.name.toLowerCase(), c.id]),
  )

  // 7. Process each transaction
  for (const txn of allTransactions) {
    if (existingIds.has(txn.itemId)) {
      stats.duplicates++
      continue
    }

    // Parse transaction data
    const amount = parseFloat(txn.amount)
    const isDebit = txn.transactionCategory === 'DEBIT'
    const transactionDate = txn.bookingDate
      ? txn.bookingDate.slice(0, 10)
      : txn.tradeDate
        ? txn.tradeDate.slice(0, 10)
        : dateTo

    // Extract counterparty info
    const counterpartyName = extractCounterpartyName(txn, isDebit)
    const counterpartyAccount = isDebit
      ? txn.recipient?.accountNumber
      : txn.sender?.accountNumber

    // Categorize by MCC
    let suggestedCategoryId: string | null = null
    const mccCategoryName = getCategoryByMcc(txn.mcc)
    if (mccCategoryName) {
      suggestedCategoryId = categoryMap.get(mccCategoryName.toLowerCase()) ?? null
      if (suggestedCategoryId) {
        stats.categorized++
      }
    }

    // If no MCC match, try AI categorization for debit transactions
    if (!suggestedCategoryId && isDebit && (txn.description || counterpartyName)) {
      suggestedCategoryId = await categorizeWithAI(
        txn.description ?? '',
        counterpartyName ?? '',
        txn.mcc ?? '',
        categoryMap,
      )
      if (suggestedCategoryId) {
        stats.categorized++
      }
    }

    // 8. Insert bank transaction
    const [insertedTxn] = await db
      .insert(bankTransactions)
      .values({
        accountId,
        userId,
        externalId: txn.itemId,
        amount: (isDebit ? -amount : amount).toFixed(2),
        currency: txn.currency ?? account.currency ?? 'PLN',
        date: transactionDate,
        bookingDate: txn.bookingDate ? txn.bookingDate.slice(0, 10) : null,
        description: txn.description,
        counterpartyName,
        counterpartyAccount,
        mccCode: txn.mcc,
        transactionType: txn.transactionType,
        category: isDebit ? 'debit' : 'credit',
        suggestedCategoryId,
        isMatched: false,
        metadata: {
          transactionStatus: txn.transactionStatus,
          postTransactionBalance: txn.postTransactionBalance,
          tradeDate: txn.tradeDate,
        },
      })
      .returning({ id: bankTransactions.id })

    stats.newTransactions++

    // 9. Auto-create expense for debit (outgoing) transactions
    if (isDebit && insertedTxn) {
      try {
        const expenseTitle = txn.description
          ?? counterpartyName
          ?? 'Bank transaction'

        const [createdExpense] = await db
          .insert(expenses)
          .values({
            userId,
            title: expenseTitle.slice(0, 255),
            amount: amount.toFixed(2),
            currency: txn.currency ?? account.currency ?? 'PLN',
            date: transactionDate,
            categoryId: suggestedCategoryId,
            vendor: counterpartyName?.slice(0, 255),
            notes: `Auto-imported from PKO BP`,
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
        stats.errors.push(`Failed to create expense for txn ${txn.itemId}: ${msg}`)
      }
    }
  }

  // 10. Update connection last sync timestamp
  await db
    .update(bankConnections)
    .set({ lastSyncAt: now, updatedAt: now })
    .where(eq(bankConnections.id, connectionId))

  // 11. Update account balance if we can get it
  try {
    const accountInfo = await client.getAccount(accessToken, account.accountNumber)
    if (accountInfo.account) {
      await db
        .update(bankAccounts)
        .set({
          balance: accountInfo.account.availableBalance,
          balanceUpdatedAt: now,
        })
        .where(eq(bankAccounts.id, accountId))
    }
  } catch {
    // Non-critical — balance update failure shouldn't fail the sync
  }

  return stats
}

// ── Helpers ──────────────────────────────────────────────────────────────────────

function extractCounterpartyName(txn: TransactionInfo, isDebit: boolean): string | null {
  const party = isDebit ? txn.recipient : txn.sender
  if (!party) return null

  // Try structured name first
  if (party.nameAddressStructured?.name) {
    return party.nameAddressStructured.name
  }

  // Then try NameAddress (array of lines)
  if (party.nameAddress?.value?.length) {
    return party.nameAddress.value[0] ?? null
  }

  return null
}

/**
 * Use OpenAI to categorize a transaction based on its description
 * and counterparty name. Falls back to null if unavailable.
 */
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
    // AI categorization is non-critical
    return null
  }
}
