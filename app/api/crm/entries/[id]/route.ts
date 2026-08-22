import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/session'
import { deleteEntry, updateEntry } from '@/lib/crm/finance'

export const dynamic = 'force-dynamic'

async function requireUser() {
  const session = await getSession()
  return session?.userId ?? null
}

const patchSchema = z.object({
  type: z.enum(['INCOME', 'EXPENSE']).optional(),
  date: z.string().min(1).optional(),
  amount: z.union([z.number(), z.string()]).optional(),
  title: z.string().trim().min(1).max(200).optional(),
  category: z.string().max(100).optional(),
  /** Najczęstsza operacja na ekranie Finansów: „zapłacone / niezapłacone". */
  paid: z.boolean().optional(),
  note: z.string().max(2000).optional(),
  clientId: z.string().nullable().optional(),
})

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUser()
  if (!userId) return NextResponse.json({ error: 'Brak autoryzacji' }, { status: 401 })

  const { id } = await params
  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Nieprawidłowe żądanie' }, { status: 400 })
  }
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Nieprawidłowe dane' }, { status: 400 })
  }

  const res = await updateEntry(userId, id, parsed.data)
  if (!res.ok) {
    // 404 z CRM-a przepuszczamy jako 404, resztę jako 502 — inaczej „nie ma
    // takiego wpisu" wyglądałoby w apce jak awaria integracji.
    const status = res.status === 404 ? 404 : 502
    return NextResponse.json({ error: res.error ?? 'CRM odrzucił zmianę' }, { status })
  }
  return NextResponse.json({ entry: res.data?.entry ?? null })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUser()
  if (!userId) return NextResponse.json({ error: 'Brak autoryzacji' }, { status: 401 })

  const { id } = await params
  const res = await deleteEntry(userId, id)
  if (!res.ok) {
    const status = res.status === 404 ? 404 : 502
    return NextResponse.json({ error: res.error ?? 'CRM odrzucił usunięcie' }, { status })
  }
  return NextResponse.json({ ok: true })
}
