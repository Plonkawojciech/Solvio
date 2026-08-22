import { call, type CrmResult } from './http'
import { getCrmConnection, markSync } from './connection'

/**
 * Zakładka Finanse w crm.programo.pl widziana z Solvio.
 *
 * Odpowiada 1:1 temu, co pokazuje ekran `/finanse` w CRM-ie: wpisy miesiąca,
 * podsumowanie roku, zobowiązania cykliczne, klienci i stan konta. Dzięki temu
 * apka może sterować firmowymi finansami bez własnej kopii tych danych —
 * źródłem prawdy zostaje CRM.
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

/** Wspólny nagłówek każdej operacji: bez połączenia nie ma o czym rozmawiać. */
async function withConnection<T>(
  userId: string,
  work: (conn: NonNullable<Awaited<ReturnType<typeof getCrmConnection>>>) => Promise<CrmResult<T>>,
): Promise<CrmResult<T>> {
  const conn = await getCrmConnection(userId)
  if (!conn) return { ok: false, status: 0, data: null, error: 'Brak połączenia z CRM' }
  const res = await work(conn)
  await markSync(userId, res.error)
  return res
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

export interface CrmSummary {
  month: { income: string; cost: string; result: string } | null
  year: unknown
  mrr: unknown
  allTime: unknown
}

export function summary(userId: string, params: { year?: number; month?: number } = {}) {
  const q = new URLSearchParams()
  if (params.year) q.set('year', String(params.year))
  if (params.month) q.set('month', String(params.month))
  const suffix = q.toString() ? `?${q}` : ''

  return withConnection<CrmSummary>(userId, (conn) => call(conn, `/api/v1/finance/summary${suffix}`))
}

export interface CrmCommitment {
  id: string
  title: string
  type: 'INCOME' | 'EXPENSE'
  amount: string | number
  category: string
  active: boolean
  intervalMonths: number
  startDate: string
  endDate: string | null
}

/** Zobowiązania cykliczne (abonamenty, ZUS, serwery). CRM materializuje z nich
 *  po jednym wpisie na miesiąc — apka pokazuje je, żeby było wiadomo, skąd
 *  bierze się koszt, którego nikt ręcznie nie dodawał. */
export function listCommitments(userId: string) {
  return withConnection<{ commitments: CrmCommitment[] }>(userId, (conn) =>
    call(conn, '/api/v1/recurring-commitments'),
  )
}

export interface CrmClient {
  id: string
  name: string
}

export function listClients(userId: string) {
  return withConnection<{ clients: CrmClient[] }>(userId, (conn) =>
    call(conn, '/api/v1/clients?limit=200'),
  )
}

export function listBalances(userId: string) {
  return withConnection<unknown>(userId, (conn) => call(conn, '/api/v1/account-balance'))
}
