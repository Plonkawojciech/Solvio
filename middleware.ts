import { NextRequest, NextResponse } from 'next/server'
import {
  CSRF_COOKIE,
  CSRF_HEADER,
  isHubAuthorised,
  isMutatingMethod,
  mintCsrfToken,
  pathRequiresCsrf,
} from '@/lib/csrf'

const PROTECTED = [
  '/dashboard', '/expenses', '/analysis', '/audit', '/reports', '/settings',
  '/groups', '/prices', '/invoices', '/vat', '/team',
  '/approvals', '/bank', '/loyalty', '/promotions', '/onboarding',
  '/budget', '/challenges', '/savings', '/subscriptions',
]
const SESSION_COOKIE = 'solvio_session'

// Pages only for personal users — business users get redirected to /dashboard
const PERSONAL_ONLY = ['/budget', '/challenges', '/loyalty', '/promotions', '/savings', '/subscriptions']
// Pages only for business users — personal users get redirected to /dashboard
const BUSINESS_ONLY = ['/invoices', '/vat', '/team', '/approvals']

// Cached HMAC CryptoKey — persists across requests within the same Edge worker
let _hmacKey: CryptoKey | null = null
let _hmacKeySecret: string | null = null

async function getHmacKey(secret: string): Promise<CryptoKey> {
  if (_hmacKey && _hmacKeySecret === secret) return _hmacKey
  _hmacKey = await globalThis.crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  )
  _hmacKeySecret = secret
  return _hmacKey
}

async function decodeSession(raw: string): Promise<{ email?: string; productType?: string } | null> {
  try {
    const lastDot = raw.lastIndexOf('.')
    if (lastDot === -1) {
      if (process.env.NODE_ENV === 'production') return null
      return JSON.parse(atob(raw))
    }

    const payload = raw.slice(0, lastDot)
    const providedHmacHex = raw.slice(lastDot + 1)

    if (!/^[0-9a-f]{64}$/i.test(providedHmacHex)) return null

    const secret = process.env.SESSION_SECRET || 'solvio-dev-only-secret-do-not-use-in-production'
    const key = await getHmacKey(secret)

    const hmacBytes = new Uint8Array(
      providedHmacHex.match(/../g)!.map(h => parseInt(h, 16)),
    )

    const valid = await globalThis.crypto.subtle.verify(
      'HMAC',
      key,
      hmacBytes,
      new TextEncoder().encode(payload),
    )
    if (!valid) return null

    return JSON.parse(atob(payload))
  } catch {
    return null
  }
}

/**
 * Constant-time string comparison for the Edge runtime, which doesn't
 * expose Node's `crypto.timingSafeEqual`. Compares byte-by-byte to
 * eliminate early-return timing leaks. Length mismatch = false.
 */
function timingSafeEdgeEq(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return diff === 0
}

// Round 4 / A2 Security — body size caps.
// Reject mutating requests whose Content-Length exceeds the per-route cap
// before they reach the handler. Defends against memory-exhaustion DoS
// (e.g. a 100MB JSON blob to /api/data/expenses would otherwise read into
// memory inside `req.json()`). Stricter routes (no Content-Length header)
// fall through and are bounded by the per-route handler-level checks.
//
// Caps (in bytes):
//   - OCR / file-upload routes: 10 MiB (image/PDF uploads)
//   - Default API mutation: 1 MiB (generous for any reasonable JSON body)
const BODY_CAP_DEFAULT = 1 * 1024 * 1024
const BODY_CAP_OCR = 10 * 1024 * 1024
const OCR_PATHS = [
  '/api/v1/ocr-receipt',
  '/api/v1/ocr-invoice',
  '/api/v1/convert-heic',
  '/api/v1/recategorize-receipts',
]

function getBodyCap(pathname: string): number {
  for (const p of OCR_PATHS) {
    if (pathname.startsWith(p)) return BODY_CAP_OCR
  }
  return BODY_CAP_DEFAULT
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // ───── Body size cap (mutating API routes only) ─────
  // Round 4 / A2 Security. Cheap O(1) header check before we hand the body
  // to the route handler. Skips GET/HEAD/OPTIONS (no body). The Content-
  // Length header is advisory but Vercel's edge fronts every request with
  // a real one, so this is reliable in production.
  if (isMutatingMethod(req.method) && pathname.startsWith('/api/')) {
    const lengthHeader = req.headers.get('content-length')
    if (lengthHeader) {
      const length = Number(lengthHeader)
      const cap = getBodyCap(pathname)
      if (Number.isFinite(length) && length > cap) {
        return NextResponse.json(
          { error: 'Payload too large', limitBytes: cap },
          { status: 413 },
        )
      }
    }
  }

  // ───── CSRF: verify on mutating API routes ─────
  // Round 4 / A2 Security. Double-submit cookie pattern:
  //   1. Client reads `__Host-csrf` cookie (set by us elsewhere).
  //   2. Client echoes the value in `x-csrf-token` header on POST/PUT/PATCH/DELETE.
  //   3. We compare cookie to header in constant time.
  // Bypassed for: /api/auth/{session,demo,magic-login,csrf} (login flows),
  // /api/cron/* (shared-secret), /api/settlement/* + /api/receipt/* (token-gated public),
  // and any request bearing `x-hub-secret` (server-to-server hub).
  //
  // **Phased rollout**: CSRF_ENFORCE=1 turns this from a header-only warning
  // into a 403. Default is "warn" mode so existing iOS clients don't break
  // before shipping a CSRF-aware app build. Set CSRF_ENFORCE=1 on Vercel
  // once the iOS app round-trips a token from `/api/auth/csrf`.
  if (isMutatingMethod(req.method) && pathRequiresCsrf(pathname) && !isHubAuthorised(req)) {
    const cookieToken = req.cookies.get(CSRF_COOKIE)?.value
                       ?? req.cookies.get('csrf')?.value // dev fallback
                       ?? ''
    const headerToken = req.headers.get(CSRF_HEADER) ?? ''
    const enforce = process.env.CSRF_ENFORCE === '1'

    if (!cookieToken || !headerToken) {
      if (enforce) {
        return NextResponse.json(
          { error: 'CSRF token missing' },
          { status: 403, headers: { 'X-CSRF-Reason': 'missing' } },
        )
      }
      // Warn mode — let request through but mark response so dashboards spot it.
      const res = NextResponse.next()
      res.headers.set('X-CSRF-Warn', 'missing')
      return res
    }
    if (!timingSafeEdgeEq(cookieToken, headerToken)) {
      if (enforce) {
        return NextResponse.json(
          { error: 'CSRF token mismatch' },
          { status: 403, headers: { 'X-CSRF-Reason': 'mismatch' } },
        )
      }
      const res = NextResponse.next()
      res.headers.set('X-CSRF-Warn', 'mismatch')
      return res
    }
  }

  // ───── Protected route gate ─────
  const isProtected = PROTECTED.some(p => pathname === p || pathname.startsWith(p + '/'))
  if (!isProtected) {
    // For non-protected paths (landing, login page), still ensure a CSRF cookie
    // is set so the iOS app and browser JS have a token to echo on subsequent
    // mutating requests. Mints one if absent. iOS hits /api/auth/csrf directly
    // for an explicit fetch; this catches browser-initial-page-load.
    const hasToken = req.cookies.get(CSRF_COOKIE)?.value || req.cookies.get('csrf')?.value
    if (!hasToken && (pathname === '/' || pathname.startsWith('/login'))) {
      const res = NextResponse.next()
      const isProd = process.env.NODE_ENV === 'production'
      const name = isProd ? CSRF_COOKIE : 'csrf'
      res.cookies.set(name, mintCsrfToken(), {
        httpOnly: false,
        secure: isProd,
        sameSite: 'lax',
        path: '/',
      })
      return res
    }
    return NextResponse.next()
  }

  const raw = req.cookies.get(SESSION_COOKIE)?.value
  if (!raw) {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  // Product-type gating
  const session = await decodeSession(raw)
  if (session?.productType) {
    const isPersonalOnly = PERSONAL_ONLY.some(p => pathname === p || pathname.startsWith(p + '/'))
    const isBusinessOnly = BUSINESS_ONLY.some(p => pathname === p || pathname.startsWith(p + '/'))

    if (isPersonalOnly && session.productType === 'business') {
      return NextResponse.redirect(new URL('/dashboard', req.url))
    }
    if (isBusinessOnly && session.productType === 'personal') {
      return NextResponse.redirect(new URL('/dashboard', req.url))
    }
  }

  // Mint a CSRF cookie when the user lands on a protected page without one
  // (e.g., direct URL hit, or after legacy session pre-CSRF deploy).
  const hasToken = req.cookies.get(CSRF_COOKIE)?.value || req.cookies.get('csrf')?.value
  if (!hasToken) {
    const res = NextResponse.next()
    const isProd = process.env.NODE_ENV === 'production'
    const name = isProd ? CSRF_COOKIE : 'csrf'
    res.cookies.set(name, mintCsrfToken(), {
      httpOnly: false,
      secure: isProd,
      sameSite: 'lax',
      path: '/',
    })
    return res
  }

  return NextResponse.next()
}

export const config = {
  // Round 4 / A2 Security: CSRF check needs to see /api/* requests (which
  // were excluded by the original matcher), so we add /api/* back in but
  // skip auth login routes inside the middleware via pathRequiresCsrf().
  // Also keep the existing protected-page redirects + product-type gates.
  matcher: [
    // Protected pages (original matcher logic)
    '/((?!_next/static|_next/image|favicon.ico|receipt|settlement|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
