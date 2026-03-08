import { NextRequest, NextResponse } from 'next/server'
import { SESSION_COOKIE } from '@/lib/session'

const DEMO_EMAIL = 'demo@solvio.app'

// Demo login: sets a session cookie for the demo account directly, no verification needed.
export async function GET(request: NextRequest) {
  const payload = Buffer.from(JSON.stringify({ email: DEMO_EMAIL })).toString('base64')
  const res = NextResponse.redirect(new URL('/dashboard', request.url))
  res.cookies.set(SESSION_COOKIE, payload, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30,
    path: '/',
  })
  return res
}
