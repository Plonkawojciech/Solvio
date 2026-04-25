import { NextRequest, NextResponse } from 'next/server'
import { SESSION_COOKIE, buildSignedSession } from '@/lib/session'
import { rateLimit } from '@/lib/rate-limit'
import { z } from 'zod'

const MagicLoginSchema = z.object({
  email: z.string().email('Valid email is required'),
})

// Dev-only magic login: sets a session cookie for any email directly.
// SECURITY FIX: Use server-only env var, not NEXT_PUBLIC_
// Only enabled when DEV_MAGIC_LOGIN=true (server-side only) OR NODE_ENV=development.
export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
             req.headers.get('x-real-ip') ??
             'unknown'
  const rl = rateLimit(`auth:magic:${ip}`, { maxRequests: 5, windowMs: 10 * 60 * 1000 })
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too many requests. Try again later.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
    )
  }

  // SECURITY FIX: Removed NODE_ENV development bypass — only DEV_MAGIC_LOGIN=true enables this
  const isDev = process.env.DEV_MAGIC_LOGIN === 'true'

  if (!isDev) {
    return NextResponse.json({ error: 'Not available' }, { status: 403 })
  }

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

  const parsedBody = MagicLoginSchema.safeParse(body)
  if (!parsedBody.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsedBody.error.flatten().fieldErrors }, { status: 400 })
  }

  // SECURITY FIX: HMAC-signed session cookie
  const payload = buildSignedSession({ email: parsedBody.data.email.trim().toLowerCase() })
  const res = NextResponse.json({ ok: true })
  res.cookies.set(SESSION_COOKIE, payload, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30,
    path: '/',
  })
  return res
}
