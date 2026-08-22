import { getCrmConnection, markSync, type CrmConnection } from './connection'

/** Jedno wywołanie do CRM-a. Nigdy nie rzuca — most ma degradować się miękko,
 *  bo padnięty CRM nie może zablokować dodania wydatku w Solvio. */

export interface CrmResult<T> {
  ok: boolean
  status: number
  data: T | null
  error: string | null
}

export async function call<T>(
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

/**
 * Wspólny nagłówek każdej operacji na CRM-ie: bez połączenia nie ma o czym
 * rozmawiać, a po każdej próbie odnotowujemy jej wynik na połączeniu, żeby
 * ustawienia pokazywały prawdę o ostatnim kontakcie.
 */
export async function withConnection<T>(
  userId: string,
  work: (conn: CrmConnection) => Promise<CrmResult<T>>,
): Promise<CrmResult<T>> {
  const conn = await getCrmConnection(userId)
  if (!conn) return { ok: false, status: 0, data: null, error: 'Brak połączenia z CRM' }
  const res = await work(conn)
  await markSync(userId, res.error)
  return res
}
