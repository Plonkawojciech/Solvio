import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/session'
import { createApiKey, listApiKeys } from '@/lib/api-keys'

export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await getSession()
  if (!session?.userId) return NextResponse.json({ error: 'Brak autoryzacji' }, { status: 401 })
  return NextResponse.json({ keys: await listApiKeys(session.userId) })
}

const createSchema = z.object({
  name: z.string().trim().min(1, 'Podaj nazwę klucza').max(100),
  scope: z.enum(['READ', 'WRITE']).default('READ'),
  expiresAt: z.string().datetime().nullable().optional(),
})

export async function POST(req: Request) {
  const session = await getSession()
  if (!session?.userId) return NextResponse.json({ error: 'Brak autoryzacji' }, { status: 401 })

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Nieprawidłowe żądanie' }, { status: 400 })
  }
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Nieprawidłowe dane' }, { status: 400 })
  }

  // `plaintext` jest w tej odpowiedzi i nigdzie indziej — ani w bazie, ani w logu.
  const key = await createApiKey(session.userId, {
    name: parsed.data.name,
    scope: parsed.data.scope,
    expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null,
  })
  return NextResponse.json({ key }, { status: 201 })
}
