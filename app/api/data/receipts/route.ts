import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireApiUser } from '@/lib/api-auth'
import { updateReceipt } from '@/lib/receipt-core'
import { handleCreate, handleDelete, handleGet, handleList } from '@/lib/receipts/handlers'
import { firstIssue, receiptItemSchema, toItems } from '@/lib/receipts/schemas'

/**
 * Powierzchnia sesyjna paragonów — to, z czym gada apka iOS i web.
 * Logika siedzi w `lib/receipts/handlers.ts`, wspólna z `/api/v1/receipts`.
 *
 * Kształt adresów jest historyczny (`?id=` zamiast `/[id]`), bo tak woła go
 * wydana apka. Nowe integracje mają iść na `/api/v1/receipts`.
 */

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get('id')
  return id ? handleGet(req, id) : handleList(req)
}

export const POST = handleCreate

const legacyUpdateSchema = z.object({
  id: z.string().uuid('id musi być poprawnym UUID'),
  items: z.array(receiptItemSchema).max(200),
})

/** Historyczna edycja pozycji: `{ id, items }` w ciele żądania. */
export async function PUT(req: Request) {
  const auth = await requireApiUser(req)
  if (auth instanceof NextResponse) return auth

  const raw = await req.json().catch(() => null)
  const parsed = legacyUpdateSchema.safeParse(raw)
  if (!parsed.success) return NextResponse.json({ error: firstIssue(parsed.error) }, { status: 400 })

  const receipt = await updateReceipt(auth.userId, parsed.data.id, { items: toItems(parsed.data.items) })
  if (!receipt) return NextResponse.json({ error: 'Nie znaleziono paragonu' }, { status: 404 })
  return NextResponse.json({ success: true, receipt })
}

export async function DELETE(req: Request) {
  const fromQuery = new URL(req.url).searchParams.get('id')
  if (fromQuery) return handleDelete(req, fromQuery)

  const body = await req.json().catch(() => null)
  const id = typeof body?.id === 'string' ? body.id : null
  if (!id) return NextResponse.json({ error: 'Podaj id paragonu' }, { status: 400 })
  return handleDelete(req, id)
}
