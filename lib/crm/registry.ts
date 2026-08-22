import { call, withConnection } from './http'

/**
 * Rejestry Finansów crm.programo.pl: klienci, zobowiązania cykliczne i stan
 * konta. Wpisy miesiąca są w `finance.ts` — tu jest wszystko, co wpisy
 * opisuje albo je generuje.
 *
 * Każda z tych rzeczy ma w CRM-ie pełny CRUD, więc apka też go dostaje.
 * Kwoty przychodzą jako liczby (`Number(...)` w serializerach CRM-a), poza
 * klientem, gdzie `monthlyFee` i `projectValue` są stringami — to nie
 * przypadek i nie wolno tego „poprawiać" po naszej stronie.
 */

// ─── Zobowiązania cykliczne ───────────────────────────────────────────────────

export interface CrmCommitment {
  id: string
  title: string
  type: 'INCOME' | 'EXPENSE'
  amount: string | number
  category: string
  note: string | null
  clientId: string | null
  clientName: string | null
  active: boolean
  intervalMonths: number
  startDate: string
  endDate: string | null
}

export interface CrmCommitmentInput {
  title?: string
  type?: 'INCOME' | 'EXPENSE'
  amount?: number | string
  category?: string
  note?: string
  clientId?: string | null
  startDate?: string
  endDate?: string | null
  active?: boolean
  intervalMonths?: number
}

/** Zobowiązania cykliczne (abonamenty, ZUS, serwery). CRM materializuje z nich
 *  po jednym wpisie na miesiąc — apka pokazuje je, żeby było wiadomo, skąd
 *  bierze się koszt, którego nikt ręcznie nie dodawał. */
export function listCommitments(userId: string) {
  return withConnection<{ commitments: CrmCommitment[] }>(userId, (conn) =>
    call(conn, '/api/v1/recurring-commitments'),
  )
}

export function createCommitment(userId: string, input: CrmCommitmentInput) {
  return withConnection<{ commitment: CrmCommitment | null }>(userId, (conn) =>
    call(conn, '/api/v1/recurring-commitments', {
      method: 'POST',
      body: {
        title: input.title,
        type: input.type ?? 'EXPENSE',
        amount: input.amount,
        category: input.category ?? conn.defaultCategory,
        note: input.note ?? '',
        clientId: input.clientId ?? null,
        startDate: input.startDate,
        endDate: input.endDate ?? null,
        active: input.active ?? true,
        intervalMonths: input.intervalMonths ?? 1,
      },
    }),
  )
}

export function updateCommitment(userId: string, id: string, input: CrmCommitmentInput) {
  return withConnection<{ commitment: CrmCommitment | null }>(userId, (conn) =>
    call(conn, `/api/v1/recurring-commitments/${id}`, {
      method: 'PATCH',
      body: pickDefined(input, [
        'title', 'type', 'amount', 'category', 'note',
        'clientId', 'startDate', 'endDate', 'active', 'intervalMonths',
      ]),
    }),
  )
}

/** Usunięcie serii NIE kasuje wpisów, które już z niej powstały — CRM ma na
 *  `FinanceEntry.recurringId` `onDelete: SetNull`. Warto to wiedzieć przed
 *  pokazaniem ostrzeżenia w apce. */
export function deleteCommitment(userId: string, id: string) {
  return withConnection<unknown>(userId, (conn) =>
    call(conn, `/api/v1/recurring-commitments/${id}`, { method: 'DELETE' }),
  )
}

// ─── Klienci ──────────────────────────────────────────────────────────────────

export interface CrmClient {
  id: string
  name: string
  service: string | null
  status: string
  monthlyFee: string
  projectValue: string
  contactName: string | null
  phone: string | null
  email: string | null
  notes: string | null
}

export interface CrmClientInput {
  name?: string
  service?: string
  status?: 'ACTIVE' | 'IN_TALKS' | 'AGREED' | 'FINISHED'
  monthlyFee?: number | string
  projectValue?: number | string
  contactName?: string
  phone?: string
  email?: string
  notes?: string
}

export function listClients(userId: string) {
  return withConnection<{ clients: CrmClient[] }>(userId, (conn) =>
    call(conn, '/api/v1/clients'),
  )
}

export function createClient(userId: string, input: CrmClientInput) {
  return withConnection<{ client: CrmClient | null }>(userId, (conn) =>
    call(conn, '/api/v1/clients', {
      method: 'POST',
      body: pickDefined(input, [
        'name', 'service', 'status', 'monthlyFee', 'projectValue',
        'contactName', 'phone', 'email', 'notes',
      ]),
    }),
  )
}

export function updateClient(userId: string, id: string, input: CrmClientInput) {
  return withConnection<{ client: CrmClient | null }>(userId, (conn) =>
    call(conn, `/api/v1/clients/${id}`, {
      method: 'PATCH',
      body: pickDefined(input, [
        'name', 'service', 'status', 'monthlyFee', 'projectValue',
        'contactName', 'phone', 'email', 'notes',
      ]),
    }),
  )
}

export function deleteClient(userId: string, id: string) {
  return withConnection<unknown>(userId, (conn) =>
    call(conn, `/api/v1/clients/${id}`, { method: 'DELETE' }),
  )
}

// ─── Stan konta ───────────────────────────────────────────────────────────────

export interface CrmBalance {
  id: string
  at: string
  amount: number
  note: string | null
}

export function listBalances(userId: string, months = 6, forward = 3) {
  return withConnection<{ balances: CrmBalance[]; timeline: unknown }>(userId, (conn) =>
    call(conn, `/api/v1/account-balance?months=${months}&forward=${forward}`),
  )
}

export function createBalance(userId: string, input: { at: string; amount: number | string; note?: string }) {
  return withConnection<{ balance: CrmBalance | null }>(userId, (conn) =>
    call(conn, '/api/v1/account-balance', {
      method: 'POST',
      body: { at: input.at, amount: input.amount, note: input.note ?? '' },
    }),
  )
}

export function deleteBalance(userId: string, id: string) {
  return withConnection<unknown>(userId, (conn) =>
    call(conn, `/api/v1/account-balance/${id}`, { method: 'DELETE' }),
  )
}

// ─── Pomocnicze ───────────────────────────────────────────────────────────────

/**
 * `PATCH` w CRM-ie traktuje brak pola jako „nie ruszaj", więc wysyłamy
 * wyłącznie to, co ktoś naprawdę podał. `null` przechodzi — w `clientId`
 * i `endDate` znaczy „odepnij", a to zupełnie co innego niż „pomiń".
 */
function pickDefined<T extends object, K extends keyof T>(input: T, keys: readonly K[]) {
  const body: Record<string, unknown> = {}
  for (const key of keys) {
    if (input[key] !== undefined) body[key as string] = input[key]
  }
  return body
}
