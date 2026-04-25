import { NextRequest, NextResponse } from 'next/server'
import { SESSION_COOKIE, buildSignedSession } from '@/lib/session'
import { rateLimit } from '@/lib/rate-limit'

const DEMO_EMAIL = 'demo@solvio.app'

// SECURITY FIX: Changed from GET to POST to prevent login CSRF via <img src="..."> attacks
export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
             request.headers.get('x-real-ip') ??
             'unknown'
  const rl = rateLimit(`auth:demo:${ip}`, { maxRequests: 20, windowMs: 60 * 60 * 1000 })
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too many requests. Try again later.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
    )
  }

  // SECURITY FIX: HMAC-signed session cookie
  const payload = buildSignedSession({ email: DEMO_EMAIL })
  const res = NextResponse.json({ success: true, redirect: '/dashboard' })
  res.cookies.set(SESSION_COOKIE, payload, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30,
    path: '/',
  })
  return res
}
