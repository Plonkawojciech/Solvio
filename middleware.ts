import { NextRequest, NextResponse } from 'next/server'

const PROTECTED = [
  '/dashboard', '/expenses', '/analysis', '/audit', '/reports', '/settings',
  '/groups', '/prices', '/invoices', '/vat', '/team',
  '/approvals', '/bank', '/loyalty', '/promotions', '/onboarding',
  '/goals', '/budget', '/challenges',
]
const SESSION_COOKIE = 'solvio_session'

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  const isProtected = PROTECTED.some(p => pathname === p || pathname.startsWith(p + '/'))
  if (!isProtected) return NextResponse.next()
  const session = req.cookies.get(SESSION_COOKIE)?.value
  if (!session) {
    return NextResponse.redirect(new URL('/login', req.url))
  }
  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api|receipt|settlement|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
