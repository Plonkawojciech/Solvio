import { and, desc, eq, gte, ilike, lte } from 'drizzle-orm'
import { db, expenses, receipts } from '@/lib/db'
import { createExpense, deleteExpenses, updateExpense } from '@/lib/expense-core'
import { publicImagePath, removeImage } from '@/lib/receipts/storage'

/**
 * Paragony — jedna implementacja dla trasy sesyjnej (`/api/data/receipts`)
 * i kluczowej (`/api/v1/receipts`). Dokładnie ten sam układ, co
 * `lib/expense-core.ts`: dwie kopie prędzej czy później rozjechałyby się
 * na moście do CRM-a albo na sprzątaniu zdjęcia.
 *
 * Paragon i wydatek to para. Paragon niesie pozycje i zdjęcie, wydatek —
 * kwotę w budżecie. Edycja kwoty na paragonie ma ruszyć wydatek (a przez
 * niego CRM), a nie zostawić dwie różne prawdy.
 */

export interface ReceiptItemView {
  name: string
  nameClean: string | null
  quantity: number | null
  price: number | null
  categoryId: string | null
  /** Alias dla wydanej apki iOS, która dekoduje `category_id`. */
  category_id?: string | null
}

export interface ReceiptPromotion {
  label: string
  amount: number | null
}

export interface ReceiptView {
  id: string
  vendor: string | null
  date: string | null
  total: number | null
  currency: string
  status: string
  imageUrl: string | null
  itemCount: number
  items: ReceiptItemView[]
  promotions: ReceiptPromotion[]
  totalSaved: number | null
  detectedLanguage: string | null
  exchangeRate: number | null
  createdAt: string
  expenseId: string | null
  /** Surowy odczyt OCR — tylko w widoku szczegółowym, bywa długi. */
  rawText?: string | null
  ocrModel?: string | null
}

type ReceiptRow = typeof receipts.$inferSelect

const num = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null
  const parsed = typeof value === 'number' ? value : Number(String(value).replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : null
}

/**
 * Pozycje w bazie mają luźny kształt — zapisywały je trzy różne ścieżki
 * (OCR, ręczna edycja z weba, import). Czytamy wszystkie warianty, zapisujemy
 * jeden.
 */
export function normalizeItems(raw: unknown): ReceiptItemView[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((entry): ReceiptItemView[] => {
    if (!entry || typeof entry !== 'object') return []
    const item = entry as Record<string, unknown>
    const name = typeof item.name === 'string' ? item.name.trim() : ''
    if (!name) return []
    const quantity = num(item.quantity)
    const unit = num(item.unitPrice ?? item.unit_price)
    const price = num(item.price ?? item.totalPrice ?? item.total_price)
      ?? (unit !== null && quantity !== null ? Math.round(unit * quantity * 100) / 100 : unit)
    const categoryId = (item.categoryId ?? item.category_id) as string | null ?? null
    return [{
      name,
      nameClean: typeof item.nameClean === 'string' && item.nameClean.trim() ? item.nameClean.trim() : null,
      quantity,
      price,
      categoryId,
      category_id: categoryId,
    }]
  })
}

/** Kształt zapisywany do JSONB. Zgodny z tym, co czyta apka iOS (`category_id`). */
export function serializeItems(items: ReceiptItemView[]): Array<Record<string, unknown>> {
  return items.map((item) => ({
    name: item.name,
    nameClean: item.nameClean,
    quantity: item.quantity,
    price: item.price,
    category_id: item.categoryId,
  }))
}

interface RawOcrBox {
  text?: string | null
  promotions?: ReceiptPromotion[]
  totalSaved?: number | null
  model?: string | null
}

function readRawOcr(raw: unknown): RawOcrBox {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const box = raw as Record<string, unknown>
  return {
    text: typeof box.text === 'string' ? box.text : null,
    promotions: Array.isArray(box.promotions) ? box.promotions as ReceiptPromotion[] : [],
    totalSaved: num(box.totalSaved),
    model: typeof box.model === 'string' ? box.model : null,
  }
}

export function serializeReceipt(row: ReceiptRow, expenseId: string | null, detail = false): ReceiptView {
  const items = normalizeItems(row.items)
  const ocr = readRawOcr(row.rawOcr)
  const view: ReceiptView = {
    id: row.id,
    vendor: row.vendor,
    date: row.date,
    total: num(row.total),
    currency: row.currency,
    status: row.status,
    imageUrl: row.imageUrl ? publicImagePath(row.id) : null,
    itemCount: items.length,
    items: detail ? items : [],
    promotions: ocr.promotions ?? [],
    totalSaved: ocr.totalSaved ?? null,
    detectedLanguage: row.detectedLanguage,
    exchangeRate: num(row.exchangeRate),
    createdAt: row.createdAt.toISOString(),
    expenseId,
  }
  if (detail) {
    view.rawText = ocr.text ?? null
    view.ocrModel = ocr.model ?? null
  }
  return view
}

// ─── Odczyt ───────────────────────────────────────────────────────────────────

export interface ListReceiptsParams {
  limit?: number
  offset?: number
  from?: string
  to?: string
  q?: string
}

export async function listReceipts(userId: string, params: ListReceiptsParams = {}) {
  const limit = Math.min(Math.max(params.limit ?? 50, 1), 200)
  const offset = Math.max(params.offset ?? 0, 0)

  const filters = [eq(receipts.userId, userId)]
  if (params.from) filters.push(gte(receipts.date, params.from))
  if (params.to) filters.push(lte(receipts.date, params.to))
  if (params.q) filters.push(ilike(receipts.vendor, `%${params.q}%`))

  const rows = await db.select({ receipt: receipts, expenseId: expenses.id })
    .from(receipts)
    .leftJoin(expenses, and(eq(expenses.receiptId, receipts.id), eq(expenses.userId, userId)))
    .where(and(...filters))
    .orderBy(desc(receipts.createdAt))
    .limit(limit)
    .offset(offset)

  return {
    receipts: rows.map((r) => serializeReceipt(r.receipt, r.expenseId)),
    limit,
    offset,
    hasMore: rows.length === limit,
  }
}

export async function getReceipt(userId: string, id: string): Promise<ReceiptView | null> {
  const [row] = await db.select({ receipt: receipts, expenseId: expenses.id })
    .from(receipts)
    .leftJoin(expenses, and(eq(expenses.receiptId, receipts.id), eq(expenses.userId, userId)))
    .where(and(eq(receipts.id, id), eq(receipts.userId, userId)))
    .limit(1)
  return row ? serializeReceipt(row.receipt, row.expenseId, true) : null
}

/** Klucz magazynu — do trasy oddającej zdjęcie. Nigdy nie wychodzi na zewnątrz. */
export async function receiptImageKey(userId: string, id: string): Promise<string | null> {
  const [row] = await db.select({ imageUrl: receipts.imageUrl })
    .from(receipts)
    .where(and(eq(receipts.id, id), eq(receipts.userId, userId)))
    .limit(1)
  return row?.imageUrl ?? null
}

// ─── Zapis ────────────────────────────────────────────────────────────────────

export interface CreateReceiptInput {
  vendor?: string | null
  date?: string | null
  total?: number | null
  currency?: string
  items?: ReceiptItemView[]
  /** Domyślnie `true` — paragon bez wydatku nie trafia do budżetu. */
  createExpense?: boolean
}

export async function createReceipt(userId: string, input: CreateReceiptInput): Promise<ReceiptView> {
  const items = input.items ?? []
  const total = input.total ?? sumItems(items)
  const [row] = await db.insert(receipts).values({
    userId,
    vendor: input.vendor ?? null,
    date: input.date ?? null,
    total: total !== null ? total.toFixed(2) : null,
    currency: input.currency ?? 'PLN',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    items: serializeItems(items) as any,
    status: 'manual',
  }).returning()

  let expenseId: string | null = null
  if (input.createExpense !== false && total !== null && total > 0) {
    const expense = await createExpense(userId, {
      title: input.vendor?.trim() || 'Paragon',
      amount: total,
      date: input.date ?? new Date().toISOString().slice(0, 10),
      vendor: input.vendor ?? null,
      currency: row.currency,
      receiptId: row.id,
    })
    expenseId = expense.id
  }
  return serializeReceipt(row, expenseId, true)
}

export interface UpdateReceiptInput {
  vendor?: string | null
  date?: string | null
  total?: number | null
  currency?: string
  items?: ReceiptItemView[]
}

export async function updateReceipt(
  userId: string,
  id: string,
  input: UpdateReceiptInput,
): Promise<ReceiptView | null> {
  const [existing] = await db.select().from(receipts)
    .where(and(eq(receipts.id, id), eq(receipts.userId, userId))).limit(1)
  if (!existing) return null

  const [row] = await db.update(receipts).set({
    ...(input.vendor !== undefined ? { vendor: input.vendor } : {}),
    ...(input.date !== undefined ? { date: input.date } : {}),
    ...(input.total !== undefined ? { total: input.total !== null ? input.total.toFixed(2) : null } : {}),
    ...(input.currency !== undefined ? { currency: input.currency } : {}),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...(input.items !== undefined ? { items: serializeItems(input.items) as any } : {}),
  }).where(and(eq(receipts.id, id), eq(receipts.userId, userId))).returning()

  // Wydatek idzie za paragonem. Przez `updateExpense`, nie prosto do bazy —
  // tamta ścieżka dociąga wpis w CRM-ie, gdy paragon był tam wypchnięty.
  const [linked] = await db.select({ id: expenses.id }).from(expenses)
    .where(and(eq(expenses.receiptId, id), eq(expenses.userId, userId))).limit(1)
  if (linked) {
    const total = num(row.total)
    await updateExpense(userId, linked.id, {
      ...(input.vendor !== undefined ? { title: row.vendor ?? 'Paragon', vendor: row.vendor } : {}),
      ...(input.date !== undefined && row.date ? { date: row.date } : {}),
      ...(input.total !== undefined && total !== null && total > 0 ? { amount: total } : {}),
      ...(input.currency !== undefined ? { currency: row.currency } : {}),
    })
  }

  return serializeReceipt(row, linked?.id ?? null, true)
}

/** Usuwa paragon razem ze zdjęciem i (domyślnie) powiązanym wydatkiem. */
export async function deleteReceipt(
  userId: string,
  id: string,
  options: { withExpense?: boolean } = {},
): Promise<boolean> {
  const [existing] = await db.select({ imageUrl: receipts.imageUrl }).from(receipts)
    .where(and(eq(receipts.id, id), eq(receipts.userId, userId))).limit(1)
  if (!existing) return false

  if (options.withExpense !== false) {
    const linked = await db.select({ id: expenses.id }).from(expenses)
      .where(and(eq(expenses.receiptId, id), eq(expenses.userId, userId)))
    if (linked.length) await deleteExpenses(userId, linked.map((e) => e.id))
  }

  await db.delete(receipts).where(and(eq(receipts.id, id), eq(receipts.userId, userId)))
  await removeImage(existing.imageUrl)
  return true
}

export function sumItems(items: ReceiptItemView[]): number | null {
  if (!items.length) return null
  return Math.round(items.reduce((sum, item) => sum + (item.price ?? 0), 0) * 100) / 100
}
