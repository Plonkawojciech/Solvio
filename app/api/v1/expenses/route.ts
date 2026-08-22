import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireApiUser } from '@/lib/api-auth'
import { isQueryError, parsePage, parseSince } from '@/lib/api-query'
import { createExpense, deleteExpenses, listExpenses } from '@/lib/expense-core'

export const dynamic = 'force-dynamic'

const DATE = /^\d{4}-\d{2}-\d{2}$/

export async function GET(req: Request) {
  const auth = await requireApiUser(req)
  if (auth instanceof NextResponse) return auth

  const q = new URL(req.url).searchParams

  const since = parseSince(q.get('since'))
  if (isQueryError(since)) return NextResponse.json({ error: since.error }, { status: 400 })

  const page = parsePage(q)
  if (isQueryError(page)) return NextResponse.json({ error: page.error }, { status: 400 })

  const from = q.get('from') ?? undefined
  const to = q.get('to') ?? undefined
  if ((from && !DATE.test(from)) || (to && !DATE.test(to))) {
    return NextResponse.json({ error: 'Parametry from/to muszą być w formacie YYYY-MM-DD' }, { status: 400 })
  }

  const result = await listExpenses(auth.userId, {
    from,
    to,
    categoryId: q.get('categoryId') ?? undefined,
    q: q.get('q')?.trim() || undefined,
    since: since ?? undefined,
    limit: page.limit,
    cursor: page.cursor,
  })
  return NextResponse.json(result)
}

const createSchema = z.object({
  title: z.string().trim().min(1, 'Podaj tytuł').max(200),
  amount: z.union([z.number(), z.string()]),
  date: z.string().regex(DATE, 'Data musi być w formacie YYYY-MM-DD'),
  categoryId: z.string().uuid().nullable().optional(),
  vendor: z.string().max(200).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  currency: z.string().length(3).optional(),
  tags: z.array(z.string().max(50)).max(5).nullable().optional(),
  receiptId: z.string().uuid().nullable().optional(),
  /** Pominięte = zdecyduj wg ustawienia autoPush połączenia z CRM. */
  pushToCrm: z.boolean().optional(),
})

export async function POST(req: Request) {
  const auth = await requireApiUser(req)
  if (auth instanceof NextResponse) return auth

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Nieprawidłowe żądanie' }, { status: 400 })
  }

  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Nieprawidłowe dane' }, { status: 400 })
  }

  const raw = parsed.data.amount
  const amount = typeof raw === 'string' ? Number(raw.replace(',', '.')) : raw
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: 'Nieprawidłowa kwota' }, { status: 400 })
  }

  const expense = await createExpense(auth.userId, { ...parsed.data, amount })
  return NextResponse.json({ expense }, { status: 201 })
}

const deleteSchema = z.object({ ids: z.array(z.string().uuid()).min(1, 'Podaj co najmniej jedno id') })

export async function DELETE(req: Request) {
  const auth = await requireApiUser(req)
  if (auth instanceof NextResponse) return auth

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Nieprawidłowe żądanie' }, { status: 400 })
  }
  const parsed = deleteSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Nieprawidłowe dane' }, { status: 400 })
  }

  const deleted = await deleteExpenses(auth.userId, parsed.data.ids)
  return NextResponse.json({ ok: true, deleted })
}
