import { NextRequest, NextResponse } from 'next/server'

const PROTECTED = [
  '/dashboard', '/expenses', '/analysis', '/audit', '/reports', '/settings',
  '/groups', '/prices', '/invoices', '/vat', '/team',
  '/approvals', '/bank', '/loyalty', '/promotions', '/onboarding',
  '/goals', '/budget', '/challenges', '/savings',
]
const SESSION_COOKIE = 'solvio_session'

// Pages only for personal users — business users get redirected to /dashboard
const PERSONAL_ONLY = ['/goals', '/budget', '/challenges', '/loyalty', '/promotions', '/savings']
// Pages only for business users — personal users get redirected to /dashboard
const BUSINESS_ONLY = ['/invoices', '/vat', '/team', '/approvals']

function decodeSession(raw: string): { email?: string; productType?: string } | null {
  try {
    return JSON.parse(Buffer.from(raw, 'base64').toString('utf8'))
  } catch {
    return null
  }
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  const isProtected = PROTECTED.some(p => pathname === p || pathname.startsWith(p + '/'))
  if (!isProtected) return NextResponse.next()

  const raw = req.cookies.get(SESSION_COOKIE)?.value
  if (!raw) {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  // Product-type gating
  const session = decodeSession(raw)
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
