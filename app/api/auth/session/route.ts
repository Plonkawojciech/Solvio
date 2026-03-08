import { NextRequest, NextResponse } from 'next/server'
import { emailToUserId, SESSION_COOKIE } from '@/lib/session'

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json()
    if (!email || !email.includes('@')) {
      return NextResponse.json({ error: 'Valid email required' }, { status: 400 })
    }
    const payload = Buffer.from(JSON.stringify({ email: email.trim().toLowerCase() })).toString('base64')
    const res = NextResponse.json({ ok: true, userId: emailToUserId(email) })
    res.cookies.set(SESSION_COOKIE, payload, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30, // 30 days
      path: '/',
    })
    return res
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true })
  res.cookies.set(SESSION_COOKIE, '', { maxAge: 0, path: '/' })
  return res
}
