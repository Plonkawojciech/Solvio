import { auth } from '@/lib/auth-compat'
import { NextResponse } from 'next/server'
import { db, incomes } from '@/lib/db'
import { eq, and, desc } from 'drizzle-orm'

/**
 * `/api/personal/incomes` — multiple income streams per user.
 *
 *   GET    → list all rows for the current user (most recent first)
 *   POST   → create new (body: { name, amount, period?, emoji? })
 *   PUT    → update (body: { id, name?, amount?, period?, emoji?, isActive? })
 *   DELETE → remove (body: { id })
 *
 * `period` is one of `monthly|weekly|yearly|oneoff`. Defaults to
 * `monthly`. The savings hub / dashboard normalise each row into a
 * per-month figure when computing aggregates so a `weekly` 250 PLN
 * shows as ~1083 PLN/month etc.
 */

interface IncomesPostBody { name?: string; amount?: string | number; period?: string; emoji?: string }
interface IncomesPutBody {
  id?: string
  name?: string
  amount?: string | number
  period?: string
  emoji?: string
  isActive?: boolean
}
interface IncomesDeleteBody { id?: string }

const VALID_PERIODS = new Set(['monthly', 'weekly', 'yearly', 'oneoff'])

function normalizeAmount(input: unknown): string | null {
  if (typeof input === 'number' && isFinite(input) && input > 0) return input.toFixed(2)
  if (typeof input === 'string') {
    const n = parseFloat(input.replace(',', '.'))
    if (isFinite(n) && n > 0) return n.toFixed(2)
  }
  return null
}

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const rows = await db
    .select()
    .from(incomes)
    .where(eq(incomes.userId, userId))
    .orderBy(desc(incomes.createdAt))

  return NextResponse.json({ incomes: rows })
}

export async function POST(request: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: IncomesPostBody
  try { body = await request.json() } catch { body = {} }

  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 120) : ''
  const amount = normalizeAmount(body.amount)
  if (!name || !amount) {
    return NextResponse.json({ error: 'name + amount required' }, { status: 400 })
  }
  const period = typeof body.period === 'string' && VALID_PERIODS.has(body.period) ? body.period : 'monthly'
  const emoji = typeof body.emoji === 'string' && body.emoji.length > 0 ? body.emoji.slice(0, 10) : '💼'

  const inserted = await db
    .insert(incomes)
    .values({ userId, name, amount, period, emoji })
    .returning()

  return NextResponse.json({ income: inserted[0] }, { status: 201 })
}

export async function PUT(request: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: IncomesPutBody
  try { body = await request.json() } catch { body = {} }
  if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const patch: Record<string, unknown> = { updatedAt: new Date() }
  if (typeof body.name === 'string') patch.name = body.name.trim().slice(0, 120)
  if (body.amount != null) {
    const a = normalizeAmount(body.amount)
    if (a) patch.amount = a
  }
  if (typeof body.period === 'string' && VALID_PERIODS.has(body.period)) patch.period = body.period
  if (typeof body.emoji === 'string') patch.emoji = body.emoji.slice(0, 10)
  if (typeof body.isActive === 'boolean') patch.isActive = body.isActive

  await db
    .update(incomes)
    .set(patch)
    .where(and(eq(incomes.id, body.id), eq(incomes.userId, userId)))

  return NextResponse.json({ ok: true })
}

export async function DELETE(request: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: IncomesDeleteBody
  try { body = await request.json() } catch { body = {} }
  if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  await db
    .delete(incomes)
    .where(and(eq(incomes.id, body.id), eq(incomes.userId, userId)))

  return NextResponse.json({ ok: true })
}
