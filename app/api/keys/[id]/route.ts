import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { revokeApiKey } from '@/lib/api-keys'

export const dynamic = 'force-dynamic'

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session?.userId) return NextResponse.json({ error: 'Brak autoryzacji' }, { status: 401 })

  const { id } = await params
  const revoked = await revokeApiKey(session.userId, id)
  if (!revoked) return NextResponse.json({ error: 'Nie znaleziono klucza' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
