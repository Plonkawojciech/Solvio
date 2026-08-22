import { NextResponse } from 'next/server'
import type { z } from 'zod'
import { getSession } from '@/lib/session'
import type { CrmResult } from './http'

/**
 * Powtarzalny szkielet tras `/api/crm/*`. Bez tego każda z nich niosłaby
 * te same trzydzieści linii sprawdzania sesji, parsowania ciała i tłumaczenia
 * błędów CRM-a na nasze statusy.
 *
 * Autoryzacja jest SESJĄ, nie kluczem API: to człowiek w apce steruje
 * finansami firmy. Klucz CRM-a nigdy nie trafia na telefon.
 */

export async function requireUser(): Promise<string | NextResponse> {
  const session = await getSession()
  if (!session?.userId) return NextResponse.json({ error: 'Brak autoryzacji' }, { status: 401 })
  return session.userId
}

/** Czyta i waliduje ciało żądania. Zwraca gotową odpowiedź błędu albo dane. */
export async function readBody<S extends z.ZodTypeAny>(
  req: Request,
  schema: S,
): Promise<z.infer<S> | NextResponse> {
  let raw: unknown
  try { raw = await req.json() } catch {
    return NextResponse.json({ error: 'Nieprawidłowe żądanie' }, { status: 400 })
  }
  const parsed = schema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Nieprawidłowe dane' },
      { status: 400 },
    )
  }
  return parsed.data
}

/**
 * Tłumaczy wynik z mostu na odpowiedź HTTP. 404 z CRM-a przepuszczamy jako
 * 404 — inaczej „nie ma takiego wpisu" wyglądałoby w apce jak awaria
 * integracji, a to dwie różne rzeczy dla kogoś, kto patrzy na ekran.
 */
export function fromCrm<T>(res: CrmResult<T>, fallback: string, status = 200): NextResponse {
  if (res.ok) return NextResponse.json(res.data ?? {}, { status })
  return NextResponse.json(
    { error: res.error ?? fallback },
    { status: res.status === 404 ? 404 : 502 },
  )
}
