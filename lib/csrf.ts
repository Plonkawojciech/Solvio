/**
 * Round 4 / A2 Security — CSRF token layer.
 *
 * Strategy: double-submit cookie pattern.
 *   1. On any GET (or explicit `/api/auth/csrf`), the server mints a 32-byte
 *      random token and sets it in a `__Host-csrf` cookie that is readable
 *      by the SAME origin (httpOnly:false so iOS app + web JS can read it,
 *      but `__Host-` prefix locks the cookie to (a) HTTPS only and (b) no
 *      Domain attribute → only the issuing origin sees it).
 *   2. Mutating requests (POST/PUT/PATCH/DELETE) must echo the token back
 *      via the `x-csrf-token` header. The verifier compares header to
 *      cookie with a constant-time byte comparison. If either is missing or they
 *      don't match → 403 with a short error.
 *
 * Why double-submit (not synchronizer):
 *   - Stateless. No server-side store of pending tokens. Works on Vercel
 *     serverless without sticky sessions.
 *   - Same-Origin Policy keeps the cookie unreadable to a cross-site
 *     attacker, so they can't echo it back even if they trigger a
 *     cross-site POST. Combined with `SameSite=Lax` on the session
 *     cookie this is defence-in-depth.
 *
 * iOS contract:
 *   - On launch, the iOS app calls `GET /api/auth/csrf` once and stashes
 *     the token. Any subsequent POST/PUT/PATCH/DELETE includes
 *     `x-csrf-token: <token>` AND sends the cookie back (URLSession does
 *     this automatically when Cookie storage is enabled).
 *   - If the server returns 403 with `csrf=expired`, the client refetches
 *     the token and retries once.
 *
 * Allowlist:
 *   - Auth endpoints that mint a session (`/api/auth/session` POST,
 *     `/api/auth/demo` POST, `/api/auth/magic-login` POST) are excepted
 *     because the user has no session/cookie at first call. SameSite=Lax
 *     + the per-IP+per-email rate limit cover those.
 *   - Public read-only routes are GET-only and skip CSRF entirely.
 *   - Server-to-server hub routes (with x-hub-secret) skip CSRF — the
 *     shared secret + IP allowlist already gates them.
 *   - Cron routes use `lib/cron-auth.ts` shared-secret already.
 */
import { NextResponse, type NextRequest } from 'next/server'

export const CSRF_COOKIE = '__Host-csrf'
export const CSRF_HEADER = 'x-csrf-token'

const TOKEN_BYTES = 32
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])
const textEncoder = new TextEncoder()

/** Generate a cryptographically random hex token. */
export function mintCsrfToken(): string {
  const bytes = new Uint8Array(TOKEN_BYTES)
  globalThis.crypto.getRandomValues(bytes)
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

/**
 * Constant-time string comparison. Returns false on length mismatch (no
 * leak via early-return because length is implicit information that an
 * attacker already knows from observing cookie/header sizes).
 */
function timingSafeStrEq(a: string, b: string): boolean {
  const bufA = textEncoder.encode(a)
  const bufB = textEncoder.encode(b)
  if (bufA.length !== bufB.length) return false
  let diff = 0
  for (let i = 0; i < bufA.length; i += 1) {
    diff |= bufA[i] ^ bufB[i]
  }
  return diff === 0
}

/**
 * Verify a CSRF token on a mutating request. Returns:
 *   - { ok: true } when the cookie + header match,
 *   - { ok: false, reason: 'missing' | 'mismatch' } otherwise.
 *
 * Does NOT validate session — call `auth()` separately. Does NOT assume
 * routes are mutating — caller decides whether to invoke based on method.
 */
export function verifyCsrfToken(req: NextRequest): { ok: true } | { ok: false; reason: 'missing' | 'mismatch' } {
  const cookie = req.cookies.get(CSRF_COOKIE)?.value ?? ''
  const header = req.headers.get(CSRF_HEADER) ?? ''
  if (!cookie || !header) return { ok: false, reason: 'missing' }
  if (!timingSafeStrEq(cookie, header)) return { ok: false, reason: 'mismatch' }
  return { ok: true }
}

/**
 * True for methods that require CSRF verification.
 * GET/HEAD/OPTIONS are safe per RFC 9110 — they don't change state.
 */
export function isMutatingMethod(method: string): boolean {
  return !SAFE_METHODS.has(method.toUpperCase())
}

/**
 * Set the CSRF cookie on a response. Use `__Host-` prefix attributes:
 *   - Secure required (production)
 *   - Path=/ required by spec
 *   - No Domain attribute (omitted, so cookie sticks to the issuing origin)
 *   - httpOnly: false so iOS / browser JS can read it to echo back
 *   - SameSite=Lax matches the session cookie behaviour
 *
 * Note: `__Host-` cookies REQUIRE Secure. In dev (NODE_ENV !== 'production')
 * we omit the prefix and the Secure flag, falling back to a plain `csrf`
 * cookie name so HMR + http://localhost works. The header name + verify
 * logic stays identical — only the cookie name differs.
 */
export function setCsrfCookie(res: NextResponse, token: string): void {
  const isProd = process.env.NODE_ENV === 'production'
  const name = isProd ? CSRF_COOKIE : 'csrf'
  res.cookies.set(name, token, {
    httpOnly: false,
    secure: isProd,
    sameSite: 'lax',
    path: '/',
    // No Max-Age → session cookie. Token is per-tab, regenerated on demand
    // via /api/auth/csrf. iOS persists it in URLSession until app relaunch.
  })
}

/**
 * Path matcher: routes that bypass CSRF check. Keep this list short and
 * audited.
 */
const CSRF_BYPASS_PREFIXES = [
  // Auth login routes — called when user has no session yet, can't have a token.
  '/api/auth/session',     // POST = login, DELETE = logout (logout is read-only intent)
  '/api/auth/demo',        // POST = demo login
  '/api/auth/magic-login', // POST = magic-link login
  '/api/auth/csrf',        // GET = mint token (must be reachable without one)
  // Cron endpoints — shared-secret authorised via lib/cron-auth.ts
  '/api/cron/',
  // Public share-token settlement endpoint — uses opaque share tokens, no session
  '/api/settlement/',
  // Receipt public view (token-gated)
  '/api/receipt/',
]

/**
 * Should this path require a CSRF check on mutating methods?
 * Safe methods (GET/HEAD/OPTIONS) don't need CSRF anyway.
 *
 * Note: hub-secret server-to-server routes are checked at handler level
 * (they don't share the user's cookie jar so verifyCsrfToken would fail
 * against an empty cookie and reject legit hub traffic).
 */
export function pathRequiresCsrf(pathname: string): boolean {
  if (!pathname.startsWith('/api/')) return false
  for (const prefix of CSRF_BYPASS_PREFIXES) {
    if (pathname.startsWith(prefix)) return false
  }
  return true
}

/**
 * Allow hub-secret authorised requests to skip CSRF.
 * Hub callers are server-to-server, never participate in a user's session
 * cookie jar, and are gated by `lib/auth-compat.ts:getHubAuth` already.
 */
export function isHubAuthorised(req: NextRequest): boolean {
  return Boolean(req.headers.get('x-hub-secret'))
}
