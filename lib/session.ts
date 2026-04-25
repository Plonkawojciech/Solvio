import { cookies } from 'next/headers'
import crypto from 'crypto'

export const SESSION_COOKIE = 'solvio_session'

// SECURITY FIX: HMAC-signed session cookie
// SESSION_SECRET must be set in production; falls back to a dev-only constant with a warning.
const SESSION_SECRET: string = (() => {
  const secret = process.env.SESSION_SECRET
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      console.error('[session] CRITICAL: SESSION_SECRET env var is not set in production! Using fallback — set SESSION_SECRET immediately.')
    } else {
      console.warn('[session] SESSION_SECRET not set — using dev fallback. Set SESSION_SECRET in .env.local for production.')
    }
    return 'solvio-dev-only-secret-do-not-use-in-production'
  }
  return secret
})()

/** Sign a base64 payload with HMAC-SHA256, return `payload.hmac` */
function signPayload(payload: string): string {
  const hmac = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('hex')
  return `${payload}.${hmac}`
}

/**
 * Verify and decode a signed cookie value.
 * Returns the decoded object if the HMAC is valid; throws if tampered.
 */
function verifyAndDecode(raw: string): Record<string, unknown> {
  const lastDot = raw.lastIndexOf('.')
  if (lastDot === -1) throw new Error('Missing HMAC')
  const payload = raw.slice(0, lastDot)
  const providedHmac = raw.slice(lastDot + 1)
  const expectedHmac = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('hex')
  // Length check: sha256 hex is always 64 chars; reject early to avoid timingSafeEqual throw
  if (providedHmac.length !== expectedHmac.length || !/^[0-9a-f]+$/i.test(providedHmac)) {
    throw new Error('Invalid HMAC format')
  }
  // Constant-time comparison to prevent timing attacks
  if (!crypto.timingSafeEqual(Buffer.from(providedHmac, 'hex'), Buffer.from(expectedHmac, 'hex'))) {
    throw new Error('Invalid HMAC — session tampered')
  }
  const decoded = Buffer.from(payload, 'base64').toString('utf8')
  return JSON.parse(decoded)
}

export function emailToUserId(email: string): string {
  return 'u_' + crypto.createHash('sha256').update(email.toLowerCase().trim()).digest('hex').slice(0, 32)
}

/**
 * Build a signed session cookie value from a data object.
 * Use this whenever writing the session cookie.
 */
export function buildSignedSession(data: Record<string, unknown>): string {
  const payload = Buffer.from(JSON.stringify(data)).toString('base64')
  return signPayload(payload)
}

export async function getSession(): Promise<{ userId: string; email: string; productType?: string } | null> {
  const cookieStore = await cookies()
  const raw = cookieStore.get(SESSION_COOKIE)?.value
  if (!raw) return null
  try {
    // SECURITY FIX: HMAC-signed session cookie — verify before trusting
    // Support legacy unsigned cookies (base64-only, no dot-separated HMAC) during migration
    // by attempting verification first; fall back to plain decode only in development.
    let parsed: Record<string, unknown>
    if (raw.includes('.')) {
      // New format: base64payload.hmac
      parsed = verifyAndDecode(raw)
    } else {
      // Legacy unsigned cookie — only trust in development
      if (process.env.NODE_ENV === 'production') {
        console.warn('[session] Rejected legacy unsigned session cookie in production')
        return null
      }
      const decoded = Buffer.from(raw, 'base64').toString('utf8')
      parsed = JSON.parse(decoded)
    }
    const email = parsed.email as string | undefined
    if (!email) return null
    return {
      userId: emailToUserId(email),
      email,
      productType: parsed.productType as string | undefined,
    }
  } catch {
    // Invalid or tampered cookie — treat as unauthenticated
    return null
  }
}
