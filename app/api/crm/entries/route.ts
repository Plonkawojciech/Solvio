import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/session'
import { createEntry, listEntries, summary } from '@/lib/crm/finance'

export const dynamic = 'force-dynamic'

/**
 * Wpisy Finansów crm.programo.pl widziane przez Solvio.
 *
 * Autoryzacja sesją, nie kluczem API: to człowiek w apce steruje finansami
 * firmy. Klucz CRM-a nigdy nie trafia na telefon — zostaje zaszyfrowany
 * po naszej stronie i doklejamy go tutaj.
 */
async function requireUser() {
  const session = await getSession()
  return session?.userId ?? null
}

export async function GET(req: Request) {
  const userId = await requireUser()
  if (!userId) return NextResponse.json({ error: 'Brak autoryzacji' }, { status: 401 })

  const q = new URL(req.url).searchParams
  const type = q.get('type')

  const [entries, totals] = await Promise.all([
    listEntries(userId, {
      from: q.get('from') ?? undefined,
      to: q.get('to') ?? undefined,
      type: type === 'INCOME' || type === 'EXPENSE' ? type : undefined,
      limit: Number(q.get('limit')) || 100,
    }),
    summary(userId, {
      year: Number(q.get('year')) || undefined,
      month: Number(q.get('month')) || undefined,
    }),
  ])

  if (!entries.ok) {
    return NextResponse.json({ error: entries.error ?? 'CRM niedostępny' }, { status: 502 })
  }
  return NextResponse.json({
    entries: entries.data?.entries ?? [],
    nextCursor: entries.data?.nextCursor ?? null,
    // Podsumowanie jest miękkie: padnięty endpoint sum nie ma prawa zabrać
    // użytkownikowi listy wpisów, którą już mamy.
    summary: totals.ok ? totals.data : null,
  })
}

const createSchema = z.object({
  type: z.enum(['INCOME', 'EXPENSE']).default('EXPENSE'),
  date: z.string().min(1, 'Podaj datę'),
  amount: z.union([z.number(), z.string()]),
  title: z.string().trim().min(1, 'Podaj tytuł').max(200),
  category: z.string().max(100).optional(),
  paid: z.boolean().optional(),
  note: z.string().max(2000).optional(),
  clientId: z.string().nullable().optional(),
})

export async function POST(req: Request) {
  const userId = await requireUser()
  if (!userId) return NextResponse.json({ error: 'Brak autoryzacji' }, { status: 401 })

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Nieprawidłowe żądanie' }, { status: 400 })
  }
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Nieprawidłowe dane' }, { status: 400 })
  }

  const res = await createEntry(userId, parsed.data)
  if (!res.ok) return NextResponse.json({ error: res.error ?? 'CRM odrzucił wpis' }, { status: 502 })
  return NextResponse.json({ entry: res.data?.entry ?? null }, { status: 201 })
}
