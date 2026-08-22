import { eq } from 'drizzle-orm'
import { db } from './db'
import { crmConnections } from './db/schema'
import { open, seal } from './crypto-box'

/**
 * Klient zakładki Finanse w crm.programo.pl.
 *
 * Podział ról jest świadomy: Solvio jest źródłem prawdy dla wydatków
 * osobistych, CRM dla finansów firmy. Ten plik jest mostem — wypycha wydatek
 * Solvio jako `FinanceEntry` typu EXPENSE i trzyma powiązanie w
 * `expenses.crm_entry_id`, żeby edycja po naszej stronie dociągnęła CRM zamiast
 * robić duplikat.
 *
 * Uwierzytelnienie: klucz API CRM-a (`crmk_...`), wystawiony przez Wojtka w
 * CRM-ie i wklejony w ustawieniach Solvio. Trzymamy go zaszyfrowanego —
 * w odróżnieniu od naszych własnych kluczy musimy go odtworzyć, żeby zawołać.
 */

export interface CrmConnection {
  baseUrl: string
  apiKey: string
  autoPush: boolean
  defaultCategory: string
}

export interface CrmConnectionView {
  connected: boolean
  baseUrl: string
  apiKeyHint: string | null
  autoPush: boolean
  defaultCategory: string
  lastSyncAt: string | null
  lastError: string | null
}

export async function getCrmConnection(userId: string): Promise<CrmConnection | null> {
  const [row] = await db.select().from(crmConnections).where(eq(crmConnections.userId, userId)).limit(1)
  if (!row) return null
  const apiKey = open(row.apiKeyEnc)
  // Null oznacza, że sekret jest nieodczytywalny (rotacja SESSION_SECRET).
  // Lepiej zachować się jak „brak połączenia" niż strzelać do CRM-a śmieciem.
  if (!apiKey) return null
  return {
    baseUrl: row.baseUrl.replace(/\/+$/, ''),
    apiKey,
    autoPush: row.autoPush,
    defaultCategory: row.defaultCategory,
  }
}

export async function getCrmConnectionView(userId: string): Promise<CrmConnectionView> {
  const [row] = await db.select().from(crmConnections).where(eq(crmConnections.userId, userId)).limit(1)
  if (!row) {
    return {
      connected: false,
      baseUrl: 'https://crm.programo.pl',
      apiKeyHint: null,
      autoPush: false,
      defaultCategory: 'solvio',
      lastSyncAt: null,
      lastError: null,
    }
  }
  return {
    connected: true,
    baseUrl: row.baseUrl,
    apiKeyHint: row.apiKeyHint,
    autoPush: row.autoPush,
    defaultCategory: row.defaultCategory,
    lastSyncAt: row.lastSyncAt?.toISOString() ?? null,
    lastError: row.lastError,
  }
}

export async function saveCrmConnection(
  userId: string,
  input: { baseUrl: string; apiKey: string; autoPush: boolean; defaultCategory: string },
): Promise<void> {
  const values = {
    userId,
    baseUrl: input.baseUrl.replace(/\/+$/, ''),
    apiKeyEnc: seal(input.apiKey),
    apiKeyHint: input.apiKey.slice(-4),
    autoPush: input.autoPush,
    defaultCategory: input.defaultCategory,
    lastError: null,
    updatedAt: new Date(),
  }
  await db.insert(crmConnections).values(values).onConflictDoUpdate({
    target: crmConnections.userId,
    set: values,
  })
}

export async function deleteCrmConnection(userId: string): Promise<void> {
  await db.delete(crmConnections).where(eq(crmConnections.userId, userId))
}

async function markSync(userId: string, error: string | null): Promise<void> {
  try {
    await db.update(crmConnections)
      .set({ lastSyncAt: new Date(), lastError: error, updatedAt: new Date() })
      .where(eq(crmConnections.userId, userId))
  } catch {
    // Księgowanie synchronizacji nie może wywrócić samej synchronizacji.
  }
}

export interface CrmResult<T> {
  ok: boolean
  status: number
  data: T | null
  error: string | null
}

/** Jedno wywołanie do CRM-a. Nigdy nie rzuca — most ma degradować się miękko,
 *  bo padnięty CRM nie może blokować dodania wydatku w Solvio. */
async function call<T>(
  conn: CrmConnection,
  path: string,
  init: { method: string; body?: unknown } = { method: 'GET' },
): Promise<CrmResult<T>> {
  const url = `${conn.baseUrl}${path}`
  try {
    const res = await fetch(url, {
      method: init.method,
      headers: {
        'x-api-key': conn.apiKey,
        ...(init.body !== undefined ? { 'content-type': 'application/json' } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      // CRM stoi na tej samej VM-ce, więc 10 s to bardzo dużo. Limit jest po to,
      // żeby zawieszony CRM nie trzymał naszego handlera w nieskończoność.
      signal: AbortSignal.timeout(10_000),
      cache: 'no-store',
    })
    const text = await res.text()
    let parsed: unknown = null
    try { parsed = text ? JSON.parse(text) : null } catch { /* CRM oddał nie-JSON */ }

    if (!res.ok) {
      const message = (parsed as { error?: string } | null)?.error
        ?? `CRM odpowiedział ${res.status}`
      console.error(`[crm] ${init.method} ${path} -> ${res.status}: ${message}`)
      return { ok: false, status: res.status, data: null, error: message }
    }
    return { ok: true, status: res.status, data: parsed as T, error: null }
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Nieznany błąd połączenia z CRM'
    console.error(`[crm] ${init.method} ${path} -> ${message}`)
    return { ok: false, status: 0, data: null, error: message }
  }
}

export interface CrmFinanceEntry {
  id: string
  type: 'INCOME' | 'EXPENSE'
  date: string
  amount: string | number
  title: string
  category: string
  paid: boolean
  note: string
  client: { id: string; name: string } | null
}

export interface CrmExpenseInput {
  title: string
  amount: number | string
  date: string
  category?: string
  note?: string
  paid?: boolean
  type?: 'INCOME' | 'EXPENSE'
}

/** Sprawdzenie, że wklejony klucz naprawdę działa — wołane przy zapisie
 *  połączenia, żeby błąd wyszedł od razu, a nie przy pierwszym wydatku. */
export async function testCrmConnection(conn: CrmConnection): Promise<CrmResult<unknown>> {
  return call(conn, '/api/v1/finance/summary', { method: 'GET' })
}

export async function listCrmEntries(
  userId: string,
  params: { from?: string; to?: string; type?: 'INCOME' | 'EXPENSE'; limit?: number } = {},
): Promise<CrmResult<{ entries: CrmFinanceEntry[]; nextCursor: string | null }>> {
  const conn = await getCrmConnection(userId)
  if (!conn) return { ok: false, status: 0, data: null, error: 'Brak połączenia z CRM' }

  const q = new URLSearchParams()
  if (params.from) q.set('from', params.from)
  if (params.to) q.set('to', params.to)
  if (params.type) q.set('type', params.type)
  if (params.limit) q.set('limit', String(params.limit))
  const suffix = q.toString() ? `?${q}` : ''

  const res = await call<{ entries: CrmFinanceEntry[]; nextCursor: string | null }>(
    conn, `/api/v1/finance${suffix}`,
  )
  await markSync(userId, res.error)
  return res
}

export async function createCrmEntry(
  userId: string,
  input: CrmExpenseInput,
): Promise<CrmResult<{ entry: CrmFinanceEntry }>> {
  const conn = await getCrmConnection(userId)
  if (!conn) return { ok: false, status: 0, data: null, error: 'Brak połączenia z CRM' }

  const res = await call<{ entry: CrmFinanceEntry }>(conn, '/api/v1/finance', {
    method: 'POST',
    body: {
      type: input.type ?? 'EXPENSE',
      date: input.date,
      amount: input.amount,
      title: input.title,
      category: input.category ?? conn.defaultCategory,
      paid: input.paid ?? true,
      note: input.note ?? '',
    },
  })
  await markSync(userId, res.error)
  return res
}

export async function updateCrmEntry(
  userId: string,
  entryId: string,
  input: Partial<CrmExpenseInput>,
): Promise<CrmResult<{ entry: CrmFinanceEntry }>> {
  const conn = await getCrmConnection(userId)
  if (!conn) return { ok: false, status: 0, data: null, error: 'Brak połączenia z CRM' }

  const res = await call<{ entry: CrmFinanceEntry }>(conn, `/api/v1/finance/${entryId}`, {
    method: 'PATCH',
    body: {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.amount !== undefined ? { amount: input.amount } : {}),
      ...(input.date !== undefined ? { date: input.date } : {}),
      ...(input.category !== undefined ? { category: input.category } : {}),
      ...(input.note !== undefined ? { note: input.note } : {}),
      ...(input.paid !== undefined ? { paid: input.paid } : {}),
    },
  })
  await markSync(userId, res.error)
  return res
}

export async function deleteCrmEntry(userId: string, entryId: string): Promise<CrmResult<unknown>> {
  const conn = await getCrmConnection(userId)
  if (!conn) return { ok: false, status: 0, data: null, error: 'Brak połączenia z CRM' }

  const res = await call(conn, `/api/v1/finance/${entryId}`, { method: 'DELETE' })
  await markSync(userId, res.error)
  return res
}

export async function crmSummary(
  userId: string,
  params: { year?: number; month?: number } = {},
): Promise<CrmResult<unknown>> {
  const conn = await getCrmConnection(userId)
  if (!conn) return { ok: false, status: 0, data: null, error: 'Brak połączenia z CRM' }

  const q = new URLSearchParams()
  if (params.year) q.set('year', String(params.year))
  if (params.month) q.set('month', String(params.month))
  const suffix = q.toString() ? `?${q}` : ''

  const res = await call(conn, `/api/v1/finance/summary${suffix}`)
  await markSync(userId, res.error)
  return res
}
