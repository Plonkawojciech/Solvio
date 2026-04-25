import { getSession } from '@/lib/session'
import crypto from 'crypto'

const HUB_SECRET = process.env.HUB_INTEGRATION_SECRET

/**
 * Check if the request comes from a trusted Hub instance via shared secret.
 * Returns the userId from the X-Hub-User-Id header if valid.
 */
export function getHubAuth(request: Request): { userId: string } | null {
  if (!HUB_SECRET) return null

  const secret = request.headers.get('x-hub-secret')
  const userId = request.headers.get('x-hub-user-id')

  if (!secret || !userId) return null

  // SECURITY FIX: Use timing-safe comparison to prevent timing attacks on hub secret
  const expected = Buffer.from(HUB_SECRET)
  const provided = Buffer.from(secret)
  if (expected.length !== provided.length || !crypto.timingSafeEqual(expected, provided)) return null

  return { userId }
}

export async function auth(): Promise<{ userId: string | null }> {
  const session = await getSession()
  return { userId: session?.userId ?? null }
}
