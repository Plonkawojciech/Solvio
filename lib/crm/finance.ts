import { call, withConnection } from './http'

/**
 * Zakładka Finanse w crm.programo.pl widziana z Solvio.
 *
 * Ten plik to wpisy i podsumowania. Klienci, zobowiązania cykliczne i stan
 * konta siedzą w `registry.ts` — razem byłby jeden plik na wszystko.
 *
 * Solvio nie trzyma kopii tych danych: źródłem prawdy zostaje CRM, a apka
 * jest jego pilotem.
 */

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
  recurring?: { id: string; title: string } | null
}

export interface CrmEntryInput {
  type?: 'INCOME' | 'EXPENSE'
  date?: string
  amount?: number | string
  title?: string
  category?: string
  paid?: boolean
  note?: string
  clientId?: string | null
}

// ─── Wpisy ────────────────────────────────────────────────────────────────────

export interface ListEntriesParams {
  from?: string
  to?: string
  type?: 'INCOME' | 'EXPENSE'
  limit?: number
  cursor?: string
}

export function listEntries(userId: string, params: ListEntriesParams = {}) {
  const q = new URLSearchParams()
  if (params.from) q.set('from', params.from)
  if (params.to) q.set('to', params.to)
  if (params.type) q.set('type', params.type)
  if (params.limit) q.set('limit', String(params.limit))
  if (params.cursor) q.set('cursor', params.cursor)
  const suffix = q.toString() ? `?${q}` : ''

  return withConnection<{ entries: CrmFinanceEntry[]; nextCursor: string | null }>(
    userId, (conn) => call(conn, `/api/v1/finance${suffix}`),
  )
}

export function createEntry(userId: string, input: CrmEntryInput) {
  return withConnection<{ entry: CrmFinanceEntry }>(userId, (conn) =>
    call(conn, '/api/v1/finance', {
      method: 'POST',
      body: {
        type: input.type ?? 'EXPENSE',
        date: input.date,
        amount: input.amount,
        title: input.title,
        category: input.category ?? conn.defaultCategory,
        paid: input.paid ?? true,
        note: input.note ?? '',
        clientId: input.clientId ?? null,
      },
    }),
  )
}

export function updateEntry(userId: string, entryId: string, input: CrmEntryInput) {
  // Wysyłamy WYŁĄCZNIE podane pola. `PATCH` w CRM-ie traktuje `undefined`
  // jako „nie ruszaj", ale `null` w `clientId` znaczy „odepnij klienta",
  // więc tego jednego nie wolno odsiać razem z resztą.
  const body: Record<string, unknown> = {}
  for (const key of ['type', 'date', 'amount', 'title', 'category', 'paid', 'note'] as const) {
    if (input[key] !== undefined) body[key] = input[key]
  }
  if (input.clientId !== undefined) body.clientId = input.clientId

  return withConnection<{ entry: CrmFinanceEntry }>(userId, (conn) =>
    call(conn, `/api/v1/finance/${entryId}`, { method: 'PATCH', body }),
  )
}

/** Najczęstsza operacja na ekranie Finansów: „zapłacone / niezapłacone". */
export function setPaid(userId: string, entryId: string, paid: boolean) {
  return updateEntry(userId, entryId, { paid })
}

export function deleteEntry(userId: string, entryId: string) {
  return withConnection<unknown>(userId, (conn) =>
    call(conn, `/api/v1/finance/${entryId}`, { method: 'DELETE' }),
  )
}

// ─── Podsumowania i konteksty ─────────────────────────────────────────────────

/** Kształt z `GET /api/v1/finance/summary` w CRM-ie. Kwoty są liczbami,
 *  nie stringami — inaczej niż w naszych wydatkach, gdzie `numeric` z Postgresa
 *  wychodzi jako string. */
export interface CrmMonthSummary {
  year: number
  month: number
  income: number
  expense: number
  balance: number
}

export interface CrmSummary {
  month: CrmMonthSummary | null
  year: { year: number; months: CrmMonthSummary[]; income: number; expense: number; balance: number } | null
  mrr: { total: number; clientCount: number } | null
  allTime: { income: number; expense: number; balance: number } | null
}

export function summary(userId: string, params: { year?: number; month?: number } = {}) {
  const q = new URLSearchParams()
  if (params.year) q.set('year', String(params.year))
  if (params.month) q.set('month', String(params.month))
  const suffix = q.toString() ? `?${q}` : ''

  return withConnection<CrmSummary>(userId, (conn) => call(conn, `/api/v1/finance/summary${suffix}`))
}
