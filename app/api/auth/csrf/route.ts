import { NextResponse } from 'next/server'
import { mintCsrfToken, setCsrfCookie } from '@/lib/csrf'

/**
 * `/api/auth/csrf` — mint a CSRF token.
 *
 * GET returns `{ token }` AND sets the same value as a `__Host-csrf`
 * cookie (or `csrf` cookie in dev). Clients (iOS app, browser JS) call
 * this once on app launch / page load and echo the token back via
 * `x-csrf-token` header on subsequent mutating requests.
 *
 * The token is opaque to the client — it's only used as a paired secret
 * for the double-submit verifier in `middleware.ts`. Refetching is
 * always safe (the new token replaces the old one in both places).
 *
 * No auth needed: a CSRF token is meaningless without an authenticated
 * session, and minting one for an unauth'd visitor is harmless.
 *
 * Round 4 / A2 Security.
 */
export async function GET() {
  const token = mintCsrfToken()
  const res = NextResponse.json({ token }, {
    // No-store — clients need a fresh token on every refetch; CDN caching
    // would defeat the per-tab uniqueness guarantee.
    headers: { 'Cache-Control': 'private, no-store' },
  })
  setCsrfCookie(res, token)
  return res
}
