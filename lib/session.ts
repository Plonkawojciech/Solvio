import { cookies } from 'next/headers'
import crypto from 'crypto'

export const SESSION_COOKIE = 'solvio_session'

export function emailToUserId(email: string): string {
  return 'u_' + crypto.createHash('sha256').update(email.toLowerCase().trim()).digest('hex').slice(0, 32)
}

export async function getSession(): Promise<{ userId: string; email: string } | null> {
  const cookieStore = await cookies()
  const raw = cookieStore.get(SESSION_COOKIE)?.value
  if (!raw) return null
  try {
    const decoded = Buffer.from(raw, 'base64').toString('utf8')
    const { email } = JSON.parse(decoded)
    if (!email) return null
    return { userId: emailToUserId(email), email }
  } catch {
    return null
  }
}
