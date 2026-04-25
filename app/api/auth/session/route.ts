import { NextRequest, NextResponse } from 'next/server'
import { emailToUserId, SESSION_COOKIE, buildSignedSession } from '@/lib/session'
import { db } from '@/lib/db'
import { userSettings } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { rateLimit } from '@/lib/rate-limit'
import { ensureUserSeeded } from '@/lib/db/seed-user'
import { z } from 'zod'

const SessionLoginSchema = z.object({
  email: z.string().email('Valid email is required'),
  lang: z.enum(['pl', 'en']).optional(),
})

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
             req.headers.get('x-real-ip') ??
             'unknown'
  const rl = rateLimit(`auth:login:${ip}`, { maxRequests: 10, windowMs: 15 * 60 * 1000 })
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too many login attempts. Try again later.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
    )
  }

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

  const parsed = SessionLoginSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten().fieldErrors }, { status: 400 })
  }

  try {
    const normalizedEmail = parsed.data.email.trim().toLowerCase()
    const userId = emailToUserId(normalizedEmail)

    // Fetch productType from user_settings (defaults to 'personal' if not found)
    let productType = 'personal'
    try {
      const [settings] = await db
        .select({ productType: userSettings.productType })
        .from(userSettings)
        .where(eq(userSettings.userId, userId))
        .limit(1)
      if (settings?.productType) {
        productType = settings.productType
      }
    } catch {
      // Fall back to 'personal' if DB lookup fails
    }

    // SECURITY FIX: HMAC-signed session cookie
    const payload = buildSignedSession({ email: normalizedEmail, productType })
    const res = NextResponse.json({ ok: true, userId })
    res.cookies.set(SESSION_COOKIE, payload, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30, // 30 days
      path: '/',
    })

    // Auto-seed default categories on first login.
    // Web users get this via app/(protected)/layout.tsx, but iOS clients
    // bypass that layout and only hit API routes — without this seed,
    // iOS accounts have 0 categories and AI categorization has nothing
    // to assign (every receipt item ends up uncategorized).
    // ensureUserSeeded is idempotent: it no-ops if the user already has
    // any category. We fire-and-forget so login latency isn't impacted.
    const lang = parsed.data.lang ?? 'pl'
    void ensureUserSeeded(userId, lang).catch(err => {
      console.error('[session POST] ensureUserSeeded failed:', err)
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
