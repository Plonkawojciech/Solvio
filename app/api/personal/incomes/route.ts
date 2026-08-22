import { auth } from '@/lib/auth-compat'
import { NextResponse } from 'next/server'
import { db, incomes } from '@/lib/db'
import { eq, and, desc } from 'drizzle-orm'
import { z } from 'zod'

// SECURITY (round 2 / A2): bound POST/PUT/DELETE bodies. Caps `name` and
// `amount` to prevent decimal(14,2) overflow + excessive payload sizes.
const MoneyAmount = z.union([
  z.number().positive().max(99_999_999_999.99),
  z.string().regex(/^\d+([.,]\d+)?$/),
])

const PeriodEnum = z.enum(['monthly', 'weekly', 'yearly', 'oneoff'])

const CreateIncomeSchema = z.object({
  name: z.string().min(1).max(120),
  amount: MoneyAmount,
  period: PeriodEnum.optional(),
  emoji: z.string().max(24).optional(),
})

const UpdateIncomeSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(120).optional(),
  amount: MoneyAmount.optional(),
  period: PeriodEnum.optional(),
  emoji: z.string().max(24).optional(),
  isActive: z.boolean().optional(),
})

const DeleteIncomeSchema = z.object({
  id: z.string().uuid(),
})

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

// Round 2 / A2: legacy body interfaces removed — Zod schemas above are the
// single source of truth for request validation.

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

  const rawBody = await request.json().catch(() => null)
  if (!rawBody) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

  const parsed = CreateIncomeSchema.safeParse(rawBody)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid input', details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    )
  }
  const { name, amount: rawAmount, period, emoji } = parsed.data
  const normalized = normalizeAmount(rawAmount)
  if (!normalized) {
    return NextResponse.json({ error: 'amount must be positive' }, { status: 400 })
  }

  const inserted = await db
    .insert(incomes)
    .values({
      userId,
      name: name.trim(),
      amount: normalized,
      period: period ?? 'monthly',
      emoji: emoji ?? 'briefcase',
    })
    .returning()

  return NextResponse.json({ income: inserted[0] }, { status: 201 })
}

export async function PUT(request: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const rawBody = await request.json().catch(() => null)
  if (!rawBody) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

  const parsed = UpdateIncomeSchema.safeParse(rawBody)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid input', details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    )
  }
  const body = parsed.data

  const patch: Record<string, unknown> = { updatedAt: new Date() }
  if (body.name !== undefined) patch.name = body.name.trim()
  if (body.amount !== undefined) {
    const a = normalizeAmount(body.amount)
    if (a) patch.amount = a
  }
  if (body.period !== undefined) patch.period = body.period
  if (body.emoji !== undefined) patch.emoji = body.emoji
  if (body.isActive !== undefined) patch.isActive = body.isActive

  await db
    .update(incomes)
    .set(patch)
    .where(and(eq(incomes.id, body.id), eq(incomes.userId, userId)))

  return NextResponse.json({ ok: true })
}

export async function DELETE(request: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const rawBody = await request.json().catch(() => null)
  if (!rawBody) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

  const parsed = DeleteIncomeSchema.safeParse(rawBody)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid input', details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    )
  }

  await db
    .delete(incomes)
    .where(and(eq(incomes.id, parsed.data.id), eq(incomes.userId, userId)))

  return NextResponse.json({ ok: true })
}
