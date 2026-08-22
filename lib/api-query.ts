/**
 * Wspólne parsowanie parametrów listowych `/api/v1/*`: `since`, `limit`, `cursor`.
 * Kontrakt celowo taki sam jak w crm.programo.pl (`src/lib/api-query.ts`), żeby
 * klient po stronie CRM-a nie musiał znać dwóch dialektów.
 *
 * Wszystkie są opcjonalne: żądanie bez nich dostaje całą przefiltrowaną listę.
 */

export interface QueryParseError {
  error: string
}

export function isQueryError(v: unknown): v is QueryParseError {
  return typeof v === 'object' && v !== null && 'error' in v
}

/**
 * `?since=ISO8601` — „co się zmieniło po tym momencie", porównywane z
 * `updatedAt`, nie `createdAt`: zedytowany stary wiersz też musi wrócić, inaczej
 * klient przyrostowy po cichu rozjeżdża się ze źródłem.
 *
 * Zła data to 400, nigdy po cichu pominięty filtr — tryb awarii przy pominięciu
 * jest taki, że klient myśli, że poprosił o deltę, a dostaje wszystko.
 */
export function parseSince(raw: string | null): Date | null | QueryParseError {
  if (!raw) return null
  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) {
    return { error: 'Nieprawidłowy parametr since — podaj datę ISO8601' }
  }
  return date
}

export const MAX_PAGE_SIZE = 500

export interface Page {
  /** Brak = bez stronicowania, zwracamy całą listę. */
  limit?: number
  cursor?: string
}

/**
 * `?limit=1..500` plus `?cursor=<id>`. Kursor to id ostatniego wiersza
 * poprzedniej strony, więc każdy stronicowany endpoint MUSI sortować po
 * stabilnym rozstrzygaczu (`id`) — import masowy stempluje całą paczkę jednym
 * znacznikiem czasu i bez rozstrzygacza strony się nakładają.
 */
export function parsePage(q: URLSearchParams): Page | QueryParseError {
  const rawLimit = q.get('limit')
  const cursor = q.get('cursor') ?? undefined

  if (!rawLimit) {
    // Kursor bez limitu to błąd klienta wart zgłoszenia: przeleciałby od kursora
    // do końca tabeli w jednej odpowiedzi.
    if (cursor) return { error: 'Parametr cursor wymaga limit' }
    return {}
  }

  const limit = Number(rawLimit)
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_PAGE_SIZE) {
    return { error: `Nieprawidłowy limit — podaj liczbę 1-${MAX_PAGE_SIZE}` }
  }
  return { limit, cursor }
}

/** Przycina wiersz-zwiadowcę i podaje kursor następnej strony. */
export function splitPage<T extends { id: string }>(
  rows: T[],
  page: Page,
): { rows: T[]; nextCursor: string | null } {
  if (!page.limit || rows.length <= page.limit) {
    return { rows, nextCursor: null }
  }
  const trimmed = rows.slice(0, page.limit)
  return { rows: trimmed, nextCursor: trimmed[trimmed.length - 1]!.id }
}
