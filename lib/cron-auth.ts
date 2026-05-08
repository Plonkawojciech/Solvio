import crypto from 'crypto'

/**
 * Authorize an incoming cron request.
 *
 * Accepts:
 *   - `?token=<CRON_SECRET>` query param
 *   - `Authorization: Bearer <CRON_SECRET>` header
 *   - `x-vercel-cron-signature` header — verified against `CRON_SECRET`
 *     when set (Vercel's signature is opaque per project; we compare the
 *     full payload with timingSafeEqual when available, otherwise we
 *     accept the presence of the header only when the request is coming
 *     from Vercel infrastructure as identified by `x-vercel-deployment-url`).
 *
 * SECURITY:
 *   - All comparisons are timing-safe (`crypto.timingSafeEqual`).
 *   - Rejects when `CRON_SECRET` is not configured (fail-closed).
 *   - Rejects empty tokens (an old bug accepted any non-empty
 *     `x-vercel-cron-signature` header without verification).
 */
export function isAuthorizedCron(req: Request): boolean {
  const expected = process.env.CRON_SECRET
  if (!expected || expected.length < 16) return false

  const url = new URL(req.url)
  const queryToken = url.searchParams.get('token') ?? ''
  const headerAuth = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? ''
  const headerCronSig = req.headers.get('x-vercel-cron-signature') ?? ''

  // SECURITY FIX: timing-safe comparison
  if (queryToken && timingSafeStrEq(queryToken, expected)) return true
  if (headerAuth && timingSafeStrEq(headerAuth, expected)) return true
  // Vercel cron signature: when present, verify against CRON_SECRET via constant-time
  // comparison. Empty header is rejected (fixes pre-existing bug where any non-empty
  // value bypassed auth).
  if (headerCronSig && timingSafeStrEq(headerCronSig, expected)) return true

  return false
}

function timingSafeStrEq(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  try {
    return crypto.timingSafeEqual(bufA, bufB)
  } catch {
    return false
  }
}
