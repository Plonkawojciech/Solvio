import { NextRequest, NextResponse } from 'next/server'
import { SESSION_COOKIE } from '@/lib/session'

// Dev-only magic login: sets a session cookie for any email directly.
// Only enabled when NEXT_PUBLIC_DEV_MAGIC_LOGIN=true OR NODE_ENV=development.
export async function POST(req: NextRequest) {
  const isDev =
    process.env.NEXT_PUBLIC_DEV_MAGIC_LOGIN === 'true' ||
    process.env.NODE_ENV === 'development'

  if (!isDev) {
    return NextResponse.json({ error: 'Not available' }, { status: 403 })
  }

  const { email } = await req.json()
  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return NextResponse.json({ error: 'Valid email required' }, { status: 400 })
  }

  const payload = Buffer.from(JSON.stringify({ email: email.trim().toLowerCase() })).toString('base64')
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
