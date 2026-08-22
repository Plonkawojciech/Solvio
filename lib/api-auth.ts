import { NextResponse } from 'next/server'
import { API_KEY_PREFIX, resolveApiKey, scopeAllowsMethod, type ApiKeyScope } from './api-keys'
import { getSession } from './session'

/** Jak wywołujący udowodnił, kim jest. Klucz niesie scope; sesja nigdy —
 *  nasza własna apka działa jako pełnoprawny użytkownik. */
export interface RequestAuth {
  userId: string
  email: string | null
  via: 'session' | 'apiKey'
  scope: ApiKeyScope | null
  apiKeyId: string | null
}

/** Klucz przedstawiony przez integrację. `X-Api-Key` istnieje dlatego, że
 *  sporo klientów HTTP rezerwuje `Authorization` na własne potrzeby. */
function presentedApiKey(req: Request): string | null {
  const direct = req.headers.get('x-api-key')
  if (direct?.startsWith(API_KEY_PREFIX)) return direct.trim()

  const auth = req.headers.get('authorization')
  if (auth && auth.toLowerCase().startsWith('bearer ')) {
    const token = auth.slice(7).trim()
    if (token.startsWith(API_KEY_PREFIX)) return token
  }
  return null
}

export async function getRequestAuth(req: Request): Promise<RequestAuth | null> {
  const presented = presentedApiKey(req)
  if (presented) {
    const key = await resolveApiKey(presented)
    if (!key) return null
    return { userId: key.userId, email: null, via: 'apiKey', scope: key.scope, apiKeyId: key.id }
  }

  const session = await getSession()
  if (!session) return null
  return { userId: session.userId, email: session.email, via: 'session', scope: null, apiKeyId: null }
}

/**
 * Bramka dla handlerów `/api/v1/*`. Zwraca uwierzytelnionego wywołującego albo
 * gotową odpowiedź do zwrócenia wprost:
 *
 *   const auth = await requireApiUser(req)
 *   if (auth instanceof NextResponse) return auth
 *
 * To jedyne miejsce, w którym egzekwujemy scope: klucz READ dostaje 403 na
 * każdej metodzie zapisującej.
 */
export async function requireApiUser(req: Request): Promise<RequestAuth | NextResponse> {
  const auth = await getRequestAuth(req)
  if (!auth) {
    return NextResponse.json({ error: 'Brak autoryzacji' }, { status: 401 })
  }
  if (auth.scope && !scopeAllowsMethod(auth.scope, req.method)) {
    return NextResponse.json(
      { error: 'Klucz tylko do odczytu — ta operacja wymaga zakresu WRITE' },
      { status: 403 },
    )
  }
  return auth
}
