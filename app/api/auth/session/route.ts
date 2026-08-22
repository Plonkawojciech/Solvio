import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import crypto from 'crypto'
import { emailToUserId, getSession, SESSION_COOKIE, buildSignedSession } from '@/lib/session'
import { db } from '@/lib/db'
import { userSettings, userCredentials } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { rateLimitPersistent } from '@/lib/rate-limit'
import { ensureUserSeeded } from '@/lib/db/seed-user'
import { recordAudit, extractRequestMeta } from '@/lib/audit-log'
import { hashPassword, verifyPassword } from '@/lib/password'
import { z } from 'zod'

// Konto demo — jedyne logowanie bez hasła (publiczna piaskownica)
const DEMO_EMAIL = 'demo@solvio.app'

const SessionLoginSchema = z.object({
  email: z.string().email('Valid email is required'),
  password: z.string().min(8, 'Password must be at least 8 characters').max(200).optional(),
  lang: z.enum(['pl', 'en']).optional(),
})

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
             req.headers.get('x-real-ip') ??
             'unknown'
  // Per-IP throttle — prevents one bad host hammering the endpoint.
  const rl = await rateLimitPersistent(`auth:login:${ip}`, { maxRequests: 10, windowMs: 15 * 60 * 1000 })
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

  // Round 4 / A2 Security: per-email throttle on top of per-IP. This
  // blocks credential-spray + email-enumeration: a botnet rotating
  // through residential IPs can still target one inbox at most 5
  // times per minute. We hash the email so the rate-limiter key
  // doesn't leak PII into logs / dashboards if the Map ever surfaces.
  const emailKey = parsed.data.email.trim().toLowerCase()
  const emailHash = crypto.createHash('sha256').update(emailKey).digest('hex').slice(0, 16)
  const emailRl = await rateLimitPersistent(`auth:login:email:${emailHash}`, { maxRequests: 5, windowMs: 60 * 1000 })
  if (!emailRl.allowed) {
    return NextResponse.json(
      { error: 'Too many login attempts. Try again later.' },
      { status: 429, headers: { 'Retry-After': String(emailRl.retryAfter) } },
    )
  }

  try {
    const normalizedEmail = parsed.data.email.trim().toLowerCase()
    const userId = emailToUserId(normalizedEmail)

    // ── Hasła ──
    // Demo loguje się bez hasła; każde inne konto wymaga hasła:
    //  - email ma już poświadczenia → weryfikacja hasła,
    //  - email bez poświadczeń → pierwsze logowanie USTAWIA hasło (zajęcie konta).
    if (normalizedEmail !== DEMO_EMAIL) {
      const password = parsed.data.password
      if (!password) {
        return NextResponse.json({ error: 'Password required', code: 'password_required' }, { status: 401 })
      }
      const [cred] = await db
        .select({ passwordHash: userCredentials.passwordHash })
        .from(userCredentials)
        .where(eq(userCredentials.userId, userId))
        .limit(1)
      if (cred) {
        const ok = await verifyPassword(password, cred.passwordHash)
        if (!ok) {
          return NextResponse.json({ error: 'Invalid email or password', code: 'invalid_credentials' }, { status: 401 })
        }
      } else {
        const passwordHash = await hashPassword(password)
        await db
          .insert(userCredentials)
          .values({ userId, email: normalizedEmail, passwordHash })
          .onConflictDoNothing()
      }
    }

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

    // SECURITY (round 2 / A2): append-only audit trail for session create.
    // Records userId + IP + UA so we can spot brute-forced sessions or
    // sudden geo-shifts after the fact. Fire-and-forget — never blocks login.
    const { ip, userAgent } = extractRequestMeta(req)
    void recordAudit({
      userId,
      action: 'session.create',
      entityType: 'session',
      entityId: userId,
      payload: { productType, channel: 'email' },
      ip,
      userAgent,
    })

    return res
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
}

export async function DELETE() {
  // SECURITY (round 2 / A2): record session.destroy BEFORE clearing the
  // cookie, so we can attribute the logout to the user that owned the
  // session. After the cookie is cleared `getSession()` would return null.
  let userId: string | null = null
  try {
    const session = await getSession()
    userId = session?.userId ?? null
  } catch {
    // ignore — invalid cookies shouldn't block logout
  }

  // SECURITY (round 3 / A2): clear with the SAME attribute set used at
  // login (httpOnly + secure + sameSite=lax) so the deletion cookie
  // matches the original cookie's attributes. A few user-agents reject
  // a Set-Cookie with `Max-Age=0` if the attributes don't match the
  // original (treating it as a different cookie altogether). Mirroring
  // attributes guarantees the original cookie is overwritten.
  const cookieStore = await cookies()
  cookieStore.set(SESSION_COOKIE, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 0,
    path: '/',
  })

  if (userId) {
    void recordAudit({
      userId,
      action: 'session.destroy',
      entityType: 'session',
      entityId: userId,
    })
  }

  return NextResponse.json({ ok: true })
}
