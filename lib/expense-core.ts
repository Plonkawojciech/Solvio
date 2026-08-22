import { and, asc, desc, eq, gte, ilike, inArray, lte, or, sql, type SQL } from 'drizzle-orm'
import { db } from './db'
import { categories, expenses, merchantRules } from './db/schema'
import { categorizeOne } from './categorize'
import { getCrmConnection } from './crm/connection'
import { createEntry, deleteEntry, updateEntry } from './crm/finance'

/**
 * Jedno miejsce, w którym powstaje, zmienia się i znika wydatek.
 *
 * Powód istnienia: wydatek dodaje i apka (`/api/data/expenses`, ciasteczko
 * sesji), i integracja (`/api/v1/expenses`, klucz API). Gdyby każda ścieżka
 * miała własny insert, jedna z nich prędzej czy później przestałaby
 * kategoryzować albo wypychać do CRM-a — po cichu.
 */

export interface ExpenseView {
  id: string
  title: string
  amount: string
  currency: string
  date: string
  categoryId: string | null
  categoryName: string | null
  vendor: string | null
  notes: string | null
  receiptId: string | null
  crmEntryId: string | null
  createdAt: string
  updatedAt: string
}

type ExpenseRow = typeof expenses.$inferSelect

export function serializeExpense(row: ExpenseRow, categoryName: string | null = null): ExpenseView {
  return {
    id: row.id,
    title: row.title,
    amount: row.amount,
    currency: row.currency,
    date: row.date,
    categoryId: row.categoryId,
    categoryName,
    vendor: row.vendor,
    notes: row.notes,
    receiptId: row.receiptId,
    crmEntryId: row.crmEntryId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

/**
 * Kategoria dla wydatku, który przyszedł bez niej:
 *   1. Nauczona reguła sprzedawcy (użytkownik potwierdził vendor → kategoria).
 *   2. AI + fallback słowny, na WŁASNYCH kategoriach użytkownika.
 * Krok AI ma budżet czasu, żeby wolny model nigdy nie zablokował dodania —
 * w najgorszym razie wydatek ląduje bez kategorii i da się go poprawić.
 */
export async function resolveCategory(
  userId: string,
  title: string,
  vendor: string | null,
): Promise<string | null> {
  const v = vendor?.trim().toLowerCase()
  if (v) {
    try {
      const [rule] = await db
        .select({ categoryId: merchantRules.categoryId })
        .from(merchantRules)
        .where(and(eq(merchantRules.userId, userId), eq(merchantRules.vendor, v)))
        .limit(1)
      if (rule?.categoryId) return rule.categoryId
    } catch {
      // Reguła to best-effort — spadamy do AI.
    }
  }

  try {
    const cats = await db
      .select({ id: categories.id, name: categories.name })
      .from(categories)
      .where(eq(categories.userId, userId))
    if (cats.length === 0) return null
    const name = vendor?.trim() ? `${title} (${vendor.trim()})` : title
    const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 4000))
    return await Promise.race([categorizeOne(name, cats), timeout])
  } catch {
    return null
  }
}

// ─── Odczyt ───────────────────────────────────────────────────────────────────

export interface ListExpensesParams {
  from?: string
  to?: string
  categoryId?: string
  q?: string
  since?: Date
  limit?: number
  cursor?: string
}

/** Kursor jest nieprzezroczysty dla klienta: `data|id` w base64url. Sortujemy po
 *  (data malejąco, id rosnąco), więc keyset musi znać obie części — sama data
 *  nie rozstrzyga, bo import masowy stempluje całą paczkę jednym dniem. */
function encodeCursor(date: string, id: string): string {
  return Buffer.from(`${date}|${id}`).toString('base64url')
}

function decodeCursor(cursor: string): { date: string; id: string } | null {
  try {
    const [date, id] = Buffer.from(cursor, 'base64url').toString('utf8').split('|')
    if (!date || !id) return null
    return { date, id }
  } catch {
    return null
  }
}

export async function listExpenses(
  userId: string,
  params: ListExpensesParams,
): Promise<{ expenses: ExpenseView[]; nextCursor: string | null }> {
  const conds: SQL[] = [eq(expenses.userId, userId)]
  if (params.from) conds.push(gte(expenses.date, params.from))
  if (params.to) conds.push(lte(expenses.date, params.to))
  if (params.categoryId) conds.push(eq(expenses.categoryId, params.categoryId))
  if (params.since) conds.push(gte(expenses.updatedAt, params.since))
  if (params.q) {
    const like = `%${params.q}%`
    const search = or(ilike(expenses.title, like), ilike(expenses.vendor, like))
    if (search) conds.push(search)
  }
  if (params.cursor) {
    const c = decodeCursor(params.cursor)
    if (c) {
      const keyset = or(
        sql`${expenses.date} < ${c.date}`,
        and(eq(expenses.date, c.date), sql`${expenses.id} > ${c.id}`),
      )
      if (keyset) conds.push(keyset)
    }
  }

  const limit = params.limit ?? 500
  const rows = await db
    .select({ e: expenses, categoryName: categories.name })
    .from(expenses)
    .leftJoin(categories, eq(expenses.categoryId, categories.id))
    .where(and(...conds))
    .orderBy(desc(expenses.date), asc(expenses.id))
    // Jeden wiersz ponad limit, żeby wiedzieć o następnej stronie bez COUNT-a.
    .limit(limit + 1)

  const hasMore = rows.length > limit
  const page = hasMore ? rows.slice(0, limit) : rows
  const last = page[page.length - 1]
  return {
    expenses: page.map((r) => serializeExpense(r.e, r.categoryName)),
    nextCursor: hasMore && last ? encodeCursor(last.e.date, last.e.id) : null,
  }
}

export async function getExpense(userId: string, id: string): Promise<ExpenseView | null> {
  const [row] = await db
    .select({ e: expenses, categoryName: categories.name })
    .from(expenses)
    .leftJoin(categories, eq(expenses.categoryId, categories.id))
    .where(and(eq(expenses.id, id), eq(expenses.userId, userId)))
    .limit(1)
  return row ? serializeExpense(row.e, row.categoryName) : null
}

// ─── Zapis ────────────────────────────────────────────────────────────────────

export interface CreateExpenseInput {
  title: string
  amount: number
  date: string
  categoryId?: string | null
  vendor?: string | null
  notes?: string | null
  currency?: string
  tags?: string[] | null
  receiptId?: string | null
  /** `undefined` = zdecyduj wg ustawienia `autoPush` w połączeniu z CRM. */
  pushToCrm?: boolean
}

export async function createExpense(userId: string, input: CreateExpenseInput): Promise<ExpenseView> {
  // Zasada produktu: „po ręcznym dodaniu AI ma kategoryzować". Gdy klient nie
  // wskazał kategorii, rozwiązujemy ją PRZED insertem, żeby wydatek nie wylądował
  // bez kategorii i nie czekał na ręczną poprawkę.
  const categoryId = input.categoryId ?? await resolveCategory(userId, input.title, input.vendor ?? null)

  const [row] = await db.insert(expenses).values({
    userId,
    title: input.title,
    amount: input.amount.toFixed(2),
    date: input.date,
    categoryId,
    vendor: input.vendor ?? null,
    notes: input.notes ?? null,
    currency: input.currency ?? 'PLN',
    tags: input.tags ?? null,
    receiptId: input.receiptId ?? null,
  }).returning()

  const pushed = await maybePushToCrm(userId, row, input.pushToCrm)
  return serializeExpense(pushed, await categoryNameFor(categoryId))
}

export interface UpdateExpenseInput {
  title?: string
  amount?: number
  date?: string
  categoryId?: string | null
  vendor?: string | null
  notes?: string | null
  currency?: string
  tags?: string[] | null
  receiptId?: string | null
  pushToCrm?: boolean
}

export async function updateExpense(
  userId: string,
  id: string,
  input: UpdateExpenseInput,
): Promise<ExpenseView | null> {
  const [existing] = await db.select().from(expenses)
    .where(and(eq(expenses.id, id), eq(expenses.userId, userId))).limit(1)
  if (!existing) return null

  const [row] = await db.update(expenses).set({
    ...(input.title !== undefined ? { title: input.title } : {}),
    ...(input.amount !== undefined ? { amount: input.amount.toFixed(2) } : {}),
    ...(input.date !== undefined ? { date: input.date } : {}),
    ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
    ...(input.vendor !== undefined ? { vendor: input.vendor } : {}),
    ...(input.notes !== undefined ? { notes: input.notes } : {}),
    ...(input.currency !== undefined ? { currency: input.currency } : {}),
    ...(input.tags !== undefined ? { tags: input.tags } : {}),
    ...(input.receiptId !== undefined ? { receiptId: input.receiptId } : {}),
    updatedAt: new Date(),
  }).where(and(eq(expenses.id, id), eq(expenses.userId, userId))).returning()

  // Jeśli wydatek żyje już w CRM-ie, edycja ma go dociągnąć, nie zrobić duplikat.
  let synced = row
  if (row.crmEntryId) {
    const res = await updateEntry(userId, row.crmEntryId, {
      title: row.title, amount: row.amount, date: row.date, note: row.notes ?? '',
    })
    if (res.ok) {
      const [touched] = await db.update(expenses).set({ crmSyncedAt: new Date() })
        .where(eq(expenses.id, row.id)).returning()
      synced = touched
    }
  } else {
    synced = await maybePushToCrm(userId, row, input.pushToCrm)
  }

  return serializeExpense(synced, await categoryNameFor(synced.categoryId))
}

export async function deleteExpenses(userId: string, ids: string[]): Promise<number> {
  const rows = await db.select({ id: expenses.id, crmEntryId: expenses.crmEntryId })
    .from(expenses)
    .where(and(eq(expenses.userId, userId), inArray(expenses.id, ids)))
  if (rows.length === 0) return 0

  const deleted = await db.delete(expenses)
    .where(and(eq(expenses.userId, userId), inArray(expenses.id, rows.map((r) => r.id))))
    .returning({ id: expenses.id })

  // Sprzątanie w CRM-ie po skasowaniu u nas. Świadomie po fakcie i best-effort:
  // padnięty CRM nie może zablokować usunięcia wydatku we własnej bazie.
  for (const row of rows) {
    if (row.crmEntryId) await deleteEntry(userId, row.crmEntryId)
  }
  return deleted.length
}

// ─── Most do CRM-a ────────────────────────────────────────────────────────────

/** Wypycha wydatek do Finansów CRM-a, jeśli klient o to poprosił jawnie albo
 *  jeśli połączenie ma włączone `autoPush`. Błąd CRM-a nigdy nie unieważnia
 *  wydatku — zapisujemy go w `crm_connections.last_error` i idziemy dalej. */
export async function maybePushToCrm(
  userId: string,
  row: ExpenseRow,
  explicit: boolean | undefined,
): Promise<ExpenseRow> {
  if (explicit === false) return row
  const conn = await getCrmConnection(userId)
  if (!conn) return row
  if (explicit !== true && !conn.autoPush) return row

  const res = await createEntry(userId, {
    title: row.title,
    amount: row.amount,
    date: row.date,
    category: conn.defaultCategory,
    note: row.vendor ? `Solvio · ${row.vendor}` : 'Solvio',
    paid: true,
  })
  const entryId = res.data?.entry?.id
  if (!res.ok || !entryId) return row

  const [updated] = await db.update(expenses)
    .set({ crmEntryId: entryId, crmSyncedAt: new Date() })
    .where(eq(expenses.id, row.id))
    .returning()
  return updated
}

async function categoryNameFor(categoryId: string | null): Promise<string | null> {
  if (!categoryId) return null
  const [cat] = await db.select({ name: categories.name }).from(categories)
    .where(eq(categories.id, categoryId)).limit(1)
  return cat?.name ?? null
}

/** Hak dla starszych tras (`/api/data/*`), które trzymają własny insert.
 *  Dzięki temu most do CRM-a ma jedną implementację, a nie dwie rozjeżdżające
 *  się kopie — wydatek dodany w apce i przez API zachowuje się tak samo. */
export async function syncExpenseWithCrm(userId: string, expenseId: string): Promise<void> {
  const [row] = await db.select().from(expenses)
    .where(and(eq(expenses.id, expenseId), eq(expenses.userId, userId))).limit(1)
  if (!row) return

  if (row.crmEntryId) {
    const res = await updateEntry(userId, row.crmEntryId, {
      title: row.title, amount: row.amount, date: row.date, note: row.notes ?? '',
    })
    if (res.ok) {
      await db.update(expenses).set({ crmSyncedAt: new Date() }).where(eq(expenses.id, row.id))
    }
    return
  }
  await maybePushToCrm(userId, row, undefined)
}

/** Usuwa odpowiedniki wskazanych wydatków w Finansach CRM-a. Wołane PRZED
 *  skasowaniem wierszy u nas — po skasowaniu nie ma już skąd wziąć `crmEntryId`. */
export async function unlinkExpensesFromCrm(userId: string, ids: string[]): Promise<void> {
  if (ids.length === 0) return
  const rows = await db.select({ crmEntryId: expenses.crmEntryId })
    .from(expenses)
    .where(and(eq(expenses.userId, userId), inArray(expenses.id, ids)))
  for (const row of rows) {
    if (row.crmEntryId) await deleteEntry(userId, row.crmEntryId)
  }
}
