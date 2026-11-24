import { z } from 'zod'
import { isQueryError, parseSince } from '../api-query'
import { toNumber, toText } from './bank'
import type { CrmConnection } from './connection'
import { call, withConnection, type CrmResult } from './http'

/**
 * Księgowość z crm.programo.pl — TYLKO odczyt: rozliczenia podmiotów,
 * terminy, faktury i koszty, pliki JPK.
 *
 * Odhaczanie podatków, potwierdzanie przelewów i wysyłka zostają na webie
 * w sesji człowieka; apka dostaje `webPath` i odsyła tam.
 *
 * 403 i 404 z CRM-a (klucz bez dostępu albo wersja CRM-a bez
 * `/api/v1/accounting`) wychodzą jako 404 „niedostępne", nigdy jako pusta
 * lista: puste terminy znaczą „nic do zapłaty" i odwołują przypomnienia.
 *
 * Kwoty, których CRM nie oddał, zostają nullem. Zmyślone „0,00 zł do zapłaty"
 * jest gorsze niż puste miejsce.
 */

export const DEFAULT_PAGE_SIZE = 50
export const MAX_ACCOUNTING_PAGE = 100
export const MAX_QUERY_LENGTH = 100

// ── parametry ──────────────────────────────────────────────────────────

const period = z
  .string()
  .regex(/^20\d{2}-(0[1-9]|1[0-2])$/, 'Okres w formacie RRRR-MM')
  .optional()

// Klucze podmiotów (`spolka`, `wojtek`…) żyją w bazie CRM-a, więc pilnujemy
// kształtu, a nie listy — nowy podmiot nie może wymagać wydania Solvio.
const entity = z
  .string()
  .regex(/^[A-Za-z0-9_-]{1,40}$/, 'Nieprawidłowy podmiot')
  .optional()

const LIMIT_ERROR = `Nieprawidłowy limit — podaj liczbę 1-${MAX_ACCOUNTING_PAGE}`
const limit = z
  .string()
  .regex(/^\d{1,3}$/, LIMIT_ERROR)
  .transform(Number)
  .refine((n) => n >= 1 && n <= MAX_ACCOUNTING_PAGE, LIMIT_ERROR)
  .default(DEFAULT_PAGE_SIZE)

const cursor = z
  .string()
  .regex(/^[\x21-\x7e]{1,200}$/, 'Nieprawidłowy parametr cursor')
  .optional()

const since = z
  .string()
  .transform((raw, ctx) => {
    const date = parseSince(raw)
    if (date === null || isQueryError(date)) {
      ctx.addIssue({ code: 'custom', message: date?.error ?? 'Nieprawidłowy parametr since' })
      return z.NEVER
    }
    return date.toISOString()
  })
  .optional()

export const overviewQuery = z.object({ period })

export const obligationsQuery = z.object({
  status: z.enum(['open', 'all'], 'Status: open albo all').optional(),
  entity,
  limit,
  cursor,
})

export const documentsQuery = z.object({
  direction: z.enum(['SALE', 'PURCHASE'], 'Kierunek: SALE albo PURCHASE').optional(),
  entity,
  status: z.enum(['unpaid', 'overdue', 'paid'], 'Status: unpaid, overdue albo paid').optional(),
  period,
  q: z.string().max(MAX_QUERY_LENGTH, `Szukana fraza może mieć do ${MAX_QUERY_LENGTH} znaków`).optional(),
  since,
  limit,
  cursor,
})

export const jpkQuery = z.object({ period })

// ── kształty ───────────────────────────────────────────────────────────

export interface AccountingTotals {
  count: number
  gross: number | null
}

export interface AccountingEntity {
  key: string
  name: string
  taxFormLabel: string
  vatLabel: string
  revenue: number | null
  zus: number | null
  incomeTax: number | null
  incomeTaxLabel: string
  vat: number | null
  totalToPay: number | null
  openObligations: number
  overdue: number
  warnings: string[]
  receivables: AccountingTotals
  payables: AccountingTotals
}

export interface AccountingOverview {
  period: string | null
  periodLabel: string
  entities: AccountingEntity[]
}

export type ObligationStatus = 'PENDING' | 'UNCLEAR' | 'DONE' | 'SKIPPED'

export interface AccountingObligation {
  id: string
  entityKey: string
  entityName: string
  kind: string
  kindLabel: string
  period: string
  dueDate: string
  amount: number | null
  paidAmount: number | null
  status: ObligationStatus
  note: string
  daysLeft: number | null
  webPath: string | null
}

export interface AccountingDocument {
  id: string
  entityKey: string
  entityName: string
  direction: 'SALE' | 'PURCHASE'
  docType: string
  number: string
  partyName: string
  partyNip: string
  issueDate: string
  dueDate: string | null
  paid: boolean
  paidAt: string | null
  daysOverdue: number
  net: number | null
  vat: number | null
  gross: number | null
  currency: string
  vatPeriod: string
  ksefNumber: string
  financeEntryId: string | null
  webPath: string | null
}

export interface AccountingJpk {
  id: string
  entityKey: string
  entityName: string
  period: string
  env: 'TEST' | 'PROD'
  status: string
  statusLabel: string
  accepted: boolean
  hasUpo: boolean
  createdAt: string | null
}

// ── mapowanie ──────────────────────────────────────────────────────────

type Raw = Record<string, unknown>

function str(value: unknown): string {
  return toText(value) ?? ''
}

function int(value: unknown): number | null {
  const n = toNumber(value)
  return n === null ? null : Math.trunc(n)
}

function day(value: unknown): string | null {
  return toText(value)?.slice(0, 10) ?? null
}

/** Wiersze bez identyfikatora odpadają — apka i tak nie ma jak ich rozróżnić. */
function rows(value: unknown, idField: 'id' | 'key' = 'id'): Raw[] {
  if (!Array.isArray(value)) return []
  return value.filter(
    (row): row is Raw => typeof row === 'object' && row !== null && toText((row as Raw)[idField]) !== null,
  )
}

/** Klient skleja `webPath` z `https://solvio.programo.pl`, więc przechodzi
 *  tylko ścieżka od korzenia. `//host` czy `.host` zmieniłyby domenę. */
function webPath(value: unknown): string | null {
  const path = toText(value)
  return path !== null && /^\/(?![/\\])[^\\\s]*$/.test(path) ? path : null
}

function toTotals(value: unknown): AccountingTotals {
  const raw = (typeof value === 'object' && value !== null ? value : {}) as Raw
  return { count: int(raw.count) ?? 0, gross: toNumber(raw.gross) }
}

export function toAccountingEntity(raw: Raw): AccountingEntity {
  return {
    key: str(raw.key),
    name: toText(raw.name) ?? str(raw.key),
    taxFormLabel: str(raw.taxFormLabel),
    vatLabel: str(raw.vatLabel),
    revenue: toNumber(raw.revenue),
    zus: toNumber(raw.zus),
    incomeTax: toNumber(raw.incomeTax),
    incomeTaxLabel: str(raw.incomeTaxLabel),
    vat: toNumber(raw.vat),
    totalToPay: toNumber(raw.totalToPay),
    openObligations: int(raw.openObligations) ?? 0,
    overdue: int(raw.overdue) ?? 0,
    warnings: Array.isArray(raw.warnings) ? raw.warnings.filter((w) => toText(w) !== null) : [],
    receivables: toTotals(raw.receivables),
    payables: toTotals(raw.payables),
  }
}

const OBLIGATION_STATUSES: readonly ObligationStatus[] = ['PENDING', 'UNCLEAR', 'DONE', 'SKIPPED']

export function toAccountingObligation(raw: Raw): AccountingObligation {
  return {
    id: str(raw.id),
    entityKey: str(raw.entityKey),
    entityName: str(raw.entityName),
    kind: str(raw.kind),
    kindLabel: toText(raw.kindLabel) ?? str(raw.kind),
    period: str(raw.period),
    dueDate: day(raw.dueDate) ?? '',
    amount: toNumber(raw.amount),
    paidAmount: toNumber(raw.paidAmount),
    // Nieznany status to „do wyjaśnienia", nigdy „załatwione".
    status: OBLIGATION_STATUSES.find((s) => s === raw.status) ?? 'UNCLEAR',
    note: str(raw.note),
    daysLeft: int(raw.daysLeft),
    webPath: webPath(raw.webPath),
  }
}

export function toAccountingDocument(raw: Raw): AccountingDocument {
  return {
    id: str(raw.id),
    entityKey: str(raw.entityKey),
    entityName: str(raw.entityName),
    direction: raw.direction === 'SALE' ? 'SALE' : 'PURCHASE',
    docType: str(raw.docType),
    number: str(raw.number),
    partyName: str(raw.partyName),
    partyNip: str(raw.partyNip),
    issueDate: day(raw.issueDate) ?? '',
    dueDate: day(raw.dueDate),
    paid: raw.paid === true,
    paidAt: day(raw.paidAt),
    daysOverdue: int(raw.daysOverdue) ?? 0,
    net: toNumber(raw.net),
    vat: toNumber(raw.vat),
    gross: toNumber(raw.gross),
    currency: toText(raw.currency) ?? 'PLN',
    vatPeriod: str(raw.vatPeriod),
    ksefNumber: str(raw.ksefNumber),
    financeEntryId: toText(raw.financeEntryId),
    webPath: webPath(raw.webPath),
  }
}

export function toAccountingJpk(raw: Raw): AccountingJpk {
  return {
    id: str(raw.id),
    entityKey: str(raw.entityKey),
    entityName: str(raw.entityName),
    period: str(raw.period),
    env: raw.env === 'PROD' ? 'PROD' : 'TEST',
    status: str(raw.status),
    statusLabel: toText(raw.statusLabel) ?? str(raw.status),
    accepted: raw.accepted === true,
    hasUpo: raw.hasUpo === true,
    createdAt: toText(raw.createdAt),
  }
}

// ── odczyty ────────────────────────────────────────────────────────────

/** Jeden GET do CRM-a. Niedostępnej księgowości (404) nie odnotowujemy na
 *  połączeniu: to ani jego błąd, ani dowód, że działa. Odpowiedź 200 bez listy
 *  `listField` (strona logowania, komunikat błędu) to awaria, nie pusty wynik. */
function read<T>(
  userId: string,
  resource: string,
  listField: string,
  params: Record<string, string | number | undefined>,
  map: (raw: Raw) => T,
): Promise<CrmResult<T>> {
  const work = async (conn: CrmConnection): Promise<CrmResult<T>> => {
    const q = new URLSearchParams()
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) q.set(key, String(value))
    }
    const query = q.toString()
    const res = await call<Raw>(conn, `/api/v1/accounting/${resource}${query ? `?${query}` : ''}`)
    if (res.status === 403 || res.status === 404) {
      return { ok: false, status: 404, data: null, error: 'Księgowość niedostępna' }
    }
    if (!res.ok) return { ...res, data: null }
    if (!Array.isArray(res.data?.[listField])) {
      return { ok: false, status: 502, data: null, error: 'CRM oddał nieoczekiwaną odpowiedź' }
    }
    return { ok: true, status: 200, data: map(res.data), error: null }
  }
  return withConnection<T>(userId, work, (res) => res.status !== 404)
}

export function accountingOverview(userId: string, params: z.infer<typeof overviewQuery>) {
  return read<AccountingOverview>(userId, 'overview', 'entities', params, (raw) => ({
    period: toText(raw.period) ?? params.period ?? null,
    periodLabel: str(raw.periodLabel),
    entities: rows(raw.entities, 'key').map(toAccountingEntity),
  }))
}

export function listObligations(userId: string, params: z.infer<typeof obligationsQuery>) {
  return read(userId, 'obligations', 'obligations', params, (raw) => ({
    obligations: rows(raw.obligations).map(toAccountingObligation),
    nextCursor: toText(raw.nextCursor),
  }))
}

export function listDocuments(userId: string, params: z.infer<typeof documentsQuery>) {
  return read(userId, 'documents', 'documents', params, (raw) => ({
    documents: rows(raw.documents).map(toAccountingDocument),
    nextCursor: toText(raw.nextCursor),
  }))
}

export function listJpk(userId: string, params: z.infer<typeof jpkQuery>) {
  return read(userId, 'jpk', 'submissions', params, (raw) => ({
    submissions: rows(raw.submissions).map(toAccountingJpk),
  }))
}
