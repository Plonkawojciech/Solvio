import { call, withConnection, type CrmResult } from './http'

/**
 * Rachunki bankowe i transakcje z crm.programo.pl — TYLKO odczyt.
 *
 * Solvio niczego tu nie zmienia: ani sald, ani dopasowań. Rozliczenie
 * transakcji z wpisem zatwierdza człowiek w CRM-ie, apka tylko pokazuje,
 * jak sprawa stoi.
 *
 * 403 z CRM-a traktujemy jak „brak danych", nie jak awarię: klucz bez
 * dostępu do rachunków (albo prośba o prywatne konta cudzym kluczem)
 * ma dać apkę wyglądającą jak przed integracją banku, a nie czerwony błąd.
 */

export interface CrmBankAccount {
  id: string
  name: string
  providerName: string | null
  iban: string | null
  currency: string
  scope: string
  balance: number | null
  balanceAt: string | null
  lastSyncAt: string | null
  active: boolean
}

export type CrmMatchStatus = 'NONE' | 'SUGGESTED' | 'CONFIRMED' | 'IGNORED'

export interface CrmBankTransaction {
  id: string
  accountId: string
  bookingDate: string
  amount: number
  currency: string
  status: 'BOOK' | 'PDNG'
  counterpartyName: string | null
  description: string | null
  matchStatus: CrmMatchStatus
}

/** Limit jednego miesiąca. Firmowy rachunek nie robi tylu przelewów,
 *  a gdyby zrobił — lepiej uciąć listę niż wisieć na kolejnych stronach. */
export const MAX_TRANSACTIONS = 500
const PAGE_SIZE = 200

type Raw = Record<string, unknown>

/** Kwoty z banku przychodzą jako liczby, ale nie ufamy temu na ślepo —
 *  string z Prismy `Decimal` też ma się dać odczytać. */
function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : null
}

function toText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null
}

export function toBankAccount(raw: Raw): CrmBankAccount {
  return {
    id: String(raw.id),
    name: toText(raw.name) ?? toText(raw.iban) ?? 'Rachunek',
    providerName: toText(raw.providerName),
    iban: toText(raw.iban),
    currency: toText(raw.currency) ?? 'PLN',
    scope: toText(raw.scope) ?? 'FIRMA',
    balance: toNumber(raw.balance),
    balanceAt: toText(raw.balanceAt),
    lastSyncAt: toText(raw.lastSyncAt),
    active: raw.active !== false,
  }
}

const MATCH_STATUSES: readonly CrmMatchStatus[] = ['NONE', 'SUGGESTED', 'CONFIRMED', 'IGNORED']

export function toBankTransaction(raw: Raw): CrmBankTransaction {
  const match = MATCH_STATUSES.find((s) => s === raw.matchStatus) ?? 'NONE'
  return {
    id: String(raw.id),
    accountId: String(raw.accountId),
    bookingDate: String(raw.bookingDate ?? '').slice(0, 10),
    amount: toNumber(raw.amount) ?? 0,
    currency: toText(raw.currency) ?? 'PLN',
    status: raw.status === 'PDNG' ? 'PDNG' : 'BOOK',
    counterpartyName: toText(raw.counterpartyName),
    description: toText(raw.description),
    matchStatus: match,
  }
}

/** 403 = „nie ma tu nic dla tego klucza". Zwracamy pusty wynik jako sukces,
 *  żeby `withConnection` nie zapisał go w ustawieniach jako błędu połączenia. */
function forbiddenAsEmpty<T>(res: CrmResult<T>, empty: T): CrmResult<T> {
  if (res.status === 403) return { ok: true, status: 200, data: empty, error: null }
  return res
}

export function listBankAccounts(userId: string) {
  return withConnection<{ accounts: CrmBankAccount[] }>(userId, async (conn) => {
    const res = forbiddenAsEmpty(
      await call<{ accounts?: Raw[] }>(conn, '/api/v1/bank/accounts?scope=FIRMA'),
      { accounts: [] },
    )
    if (!res.ok) return { ...res, data: null }
    return { ...res, data: { accounts: (res.data?.accounts ?? []).map(toBankAccount) } }
  })
}

export interface ListBankTransactionsParams {
  from?: string
  to?: string
  accountId?: string
}

/**
 * Transakcje z zakresu dat, strona po stronie aż do `MAX_TRANSACTIONS`.
 * `truncated` mówi apce, że lista jest ucięta — wtedy nie udaje pełnego
 * obrazu miesiąca.
 */
export function listBankTransactions(userId: string, params: ListBankTransactionsParams = {}) {
  return withConnection<{ transactions: CrmBankTransaction[]; truncated: boolean }>(userId, async (conn) => {
    const rows: CrmBankTransaction[] = []
    let cursor: string | null = null

    do {
      const q = new URLSearchParams({ scope: 'FIRMA', limit: String(PAGE_SIZE) })
      if (params.from) q.set('from', params.from)
      if (params.to) q.set('to', params.to)
      if (params.accountId) q.set('accountId', params.accountId)
      if (cursor) q.set('cursor', cursor)

      const res = forbiddenAsEmpty(
        await call<{ transactions?: Raw[]; nextCursor?: string | null }>(conn, `/api/v1/bank/transactions?${q}`),
        { transactions: [], nextCursor: null },
      )
      if (!res.ok) return { ...res, data: null }

      rows.push(...(res.data?.transactions ?? []).map(toBankTransaction))
      cursor = res.data?.nextCursor ?? null
    } while (cursor && rows.length < MAX_TRANSACTIONS)

    return {
      ok: true,
      status: 200,
      error: null,
      data: { transactions: rows.slice(0, MAX_TRANSACTIONS), truncated: cursor !== null || rows.length > MAX_TRANSACTIONS },
    }
  })
}
