import { NextRequest, NextResponse } from 'next/server'

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

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  const isProtected = PROTECTED.some(p => pathname === p || pathname.startsWith(p + '/'))
  if (!isProtected) return NextResponse.next()

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

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api|receipt|settlement|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
