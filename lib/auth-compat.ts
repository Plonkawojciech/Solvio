import { getSession } from '@/lib/session'

export async function auth(): Promise<{ userId: string | null }> {
  const session = await getSession()
  return { userId: session?.userId ?? null }
}
