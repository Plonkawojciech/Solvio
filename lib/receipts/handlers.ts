import { NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/api-auth'
import {
  createReceipt, deleteReceipt, getReceipt, listReceipts, updateReceipt,
} from '@/lib/receipt-core'
import { createReceiptSchema, firstIssue, toItems, updateReceiptSchema } from './schemas'

/**
 * Handlery paragonów. Trasy (`/api/data/receipts`, `/api/v1/receipts`) tylko
 * je wołają — dzięki temu integracja na kluczu i apka na sesji nigdy nie
 * rozjadą się co do zachowania.
 */

async function body(req: Request): Promise<unknown | null> {
  try { return await req.json() } catch { return null }
}

export async function handleList(req: Request): Promise<Response> {
  const auth = await requireApiUser(req)
  if (auth instanceof NextResponse) return auth

  const q = new URL(req.url).searchParams
  const result = await listReceipts(auth.userId, {
    limit: Number(q.get('limit')) || undefined,
    offset: Number(q.get('offset')) || undefined,
    from: q.get('from') ?? undefined,
    to: q.get('to') ?? undefined,
    q: q.get('q')?.trim() || undefined,
  })
  return NextResponse.json(result, {
    // Lista jest prywatna; mikro-okno tylko po to, żeby dwa wejścia pod rząd
    // nie odpytywały bazy dwa razy.
    headers: { 'Cache-Control': 'private, max-age=5, must-revalidate' },
  })
}

export async function handleGet(req: Request, id: string): Promise<Response> {
  const auth = await requireApiUser(req)
  if (auth instanceof NextResponse) return auth

  const receipt = await getReceipt(auth.userId, id)
  if (!receipt) return NextResponse.json({ error: 'Nie znaleziono paragonu' }, { status: 404 })
  return NextResponse.json(receipt)
}

export async function handleCreate(req: Request): Promise<Response> {
  const auth = await requireApiUser(req)
  if (auth instanceof NextResponse) return auth

  const parsed = createReceiptSchema.safeParse(await body(req))
  if (!parsed.success) return NextResponse.json({ error: firstIssue(parsed.error) }, { status: 400 })

  const receipt = await createReceipt(auth.userId, {
    vendor: parsed.data.vendor ?? null,
    date: parsed.data.date ?? null,
    total: parsed.data.total ?? null,
    currency: parsed.data.currency,
    items: toItems(parsed.data.items) ?? [],
    createExpense: parsed.data.createExpense,
  })
  return NextResponse.json(receipt, { status: 201 })
}

export async function handleUpdate(req: Request, id: string): Promise<Response> {
  const auth = await requireApiUser(req)
  if (auth instanceof NextResponse) return auth

  const parsed = updateReceiptSchema.safeParse(await body(req))
  if (!parsed.success) return NextResponse.json({ error: firstIssue(parsed.error) }, { status: 400 })

  const receipt = await updateReceipt(auth.userId, id, {
    ...(parsed.data.vendor !== undefined ? { vendor: parsed.data.vendor ?? null } : {}),
    ...(parsed.data.date !== undefined ? { date: parsed.data.date ?? null } : {}),
    ...(parsed.data.total !== undefined ? { total: parsed.data.total ?? null } : {}),
    ...(parsed.data.currency !== undefined ? { currency: parsed.data.currency } : {}),
    ...(parsed.data.items !== undefined ? { items: toItems(parsed.data.items) } : {}),
  })
  if (!receipt) return NextResponse.json({ error: 'Nie znaleziono paragonu' }, { status: 404 })
  return NextResponse.json(receipt)
}

export async function handleDelete(req: Request, id: string): Promise<Response> {
  const auth = await requireApiUser(req)
  if (auth instanceof NextResponse) return auth

  // Domyślnie paragon znika razem z wydatkiem — inaczej w budżecie zostaje
  // kwota bez pokrycia. `?keepExpense=1` dla świadomego rozdzielenia.
  const keepExpense = new URL(req.url).searchParams.get('keepExpense') === '1'
  const removed = await deleteReceipt(auth.userId, id, { withExpense: !keepExpense })
  if (!removed) return NextResponse.json({ error: 'Nie znaleziono paragonu' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
