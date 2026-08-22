import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireApiUser } from '@/lib/api-auth'
import { deleteExpenses, getExpense, updateExpense } from '@/lib/expense-core'

export const dynamic = 'force-dynamic'

const DATE = /^\d{4}-\d{2}-\d{2}$/

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser(req)
  if (auth instanceof NextResponse) return auth

  const { id } = await params
  const expense = await getExpense(auth.userId, id)
  if (!expense) return NextResponse.json({ error: 'Nie znaleziono wydatku' }, { status: 404 })
  return NextResponse.json({ expense })
}

const patchSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  amount: z.union([z.number(), z.string()]).optional(),
  date: z.string().regex(DATE, 'Data musi być w formacie YYYY-MM-DD').optional(),
  categoryId: z.string().uuid().nullable().optional(),
  vendor: z.string().max(200).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  currency: z.string().length(3).optional(),
  tags: z.array(z.string().max(50)).max(5).nullable().optional(),
  receiptId: z.string().uuid().nullable().optional(),
  pushToCrm: z.boolean().optional(),
})

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser(req)
  if (auth instanceof NextResponse) return auth

  const { id } = await params
  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Nieprawidłowe żądanie' }, { status: 400 })
  }

  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Nieprawidłowe dane' }, { status: 400 })
  }

  let amount: number | undefined
  if (parsed.data.amount !== undefined) {
    const raw = parsed.data.amount
    amount = typeof raw === 'string' ? Number(raw.replace(',', '.')) : raw
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: 'Nieprawidłowa kwota' }, { status: 400 })
    }
  }

  const expense = await updateExpense(auth.userId, id, { ...parsed.data, amount })
  if (!expense) return NextResponse.json({ error: 'Nie znaleziono wydatku' }, { status: 404 })
  return NextResponse.json({ expense })
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser(req)
  if (auth instanceof NextResponse) return auth

  const { id } = await params
  const deleted = await deleteExpenses(auth.userId, [id])
  if (deleted === 0) return NextResponse.json({ error: 'Nie znaleziono wydatku' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
