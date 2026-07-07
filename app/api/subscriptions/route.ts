/**
 * Zarządzane subskrypcje — CRUD + historia cen + pauza.
 *
 * PUT rozróżnia dwa tryby zmiany kwoty:
 *  - amountChange: 'price_change'  → nowy wpis w historii (podwyżka/obniżka)
 *  - amountChange: 'correction'    → nadpisanie ostatniego wpisu (pomyłka we wpisie)
 */
import { auth } from '@/lib/auth-compat'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { subscriptions, subscriptionPriceHistory } from '@/lib/db/schema'
import { and, eq, desc, inArray } from 'drizzle-orm'
import { z } from 'zod'

const INTERVALS = ['weekly', 'monthly', 'quarterly', 'yearly'] as const

// Mnożnik do przeliczenia kwoty interwału na miesiąc
const MONTHLY_FACTOR: Record<(typeof INTERVALS)[number], number> = {
  weekly: 52 / 12,
  monthly: 1,
  quarterly: 1 / 3,
  yearly: 1 / 12,
}

const CreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  vendor: z.string().trim().max(120).optional().nullable(),
  amount: z.coerce.number().positive().max(1_000_000),
  currency: z.string().length(3).default('PLN'),
  interval: z.enum(INTERVALS).default('monthly'),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  nextDueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
  emoji: z.string().max(10).optional().nullable(),
})

const UpdateSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(120).optional(),
  vendor: z.string().trim().max(120).optional().nullable(),
  amount: z.coerce.number().positive().max(1_000_000).optional(),
  amountChange: z.enum(['price_change', 'correction']).optional(),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  currency: z.string().length(3).optional(),
  interval: z.enum(INTERVALS).optional(),
  status: z.enum(['active', 'paused']).optional(),
  nextDueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
  emoji: z.string().max(10).optional().nullable(),
})

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const subs = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId))
    .orderBy(desc(subscriptions.createdAt))

  const ids = subs.map((s) => s.id)
  const history = ids.length
    ? await db
        .select()
        .from(subscriptionPriceHistory)
        .where(inArray(subscriptionPriceHistory.subscriptionId, ids))
        .orderBy(desc(subscriptionPriceHistory.effectiveFrom), desc(subscriptionPriceHistory.createdAt))
    : []

  const bySub: Record<string, typeof history> = {}
  for (const h of history) {
    ;(bySub[h.subscriptionId] ||= []).push(h)
  }

  let monthlyTotal = 0
  for (const s of subs) {
    if (s.status !== 'active') continue
    monthlyTotal += parseFloat(s.amount) * (MONTHLY_FACTOR[s.interval as (typeof INTERVALS)[number]] ?? 1)
  }

  return NextResponse.json({
    subscriptions: subs.map((s) => ({ ...s, priceHistory: bySub[s.id] || [] })),
    monthlyTotal: Math.round(monthlyTotal * 100) / 100,
    yearlyTotal: Math.round(monthlyTotal * 12 * 100) / 100,
  })
}

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const parsed = CreateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten().fieldErrors }, { status: 400 })
  }
  const d = parsed.data

  const [sub] = await db
    .insert(subscriptions)
    .values({
      userId,
      name: d.name,
      vendor: d.vendor || null,
      amount: String(d.amount),
      currency: d.currency.toUpperCase(),
      interval: d.interval,
      startDate: d.startDate || today(),
      nextDueDate: d.nextDueDate || null,
      notes: d.notes || null,
      emoji: d.emoji || 'repeat',
    })
    .returning()

  // Pierwszy wpis historii = cena startowa
  await db.insert(subscriptionPriceHistory).values({
    subscriptionId: sub.id,
    amount: String(d.amount),
    effectiveFrom: d.startDate || today(),
  })

  return NextResponse.json({ subscription: sub })
}

export async function PUT(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const parsed = UpdateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten().fieldErrors }, { status: 400 })
  }
  const d = parsed.data

  const [existing] = await db
    .select()
    .from(subscriptions)
    .where(and(eq(subscriptions.id, d.id), eq(subscriptions.userId, userId)))
    .limit(1)
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const patch: Partial<typeof subscriptions.$inferInsert> = { updatedAt: new Date() }
  if (d.name !== undefined) patch.name = d.name
  if (d.vendor !== undefined) patch.vendor = d.vendor
  if (d.currency !== undefined) patch.currency = d.currency.toUpperCase()
  if (d.interval !== undefined) patch.interval = d.interval
  if (d.status !== undefined) patch.status = d.status
  if (d.nextDueDate !== undefined) patch.nextDueDate = d.nextDueDate
  if (d.notes !== undefined) patch.notes = d.notes
  if (d.emoji !== undefined) patch.emoji = d.emoji

  const amountChanged = d.amount !== undefined && Math.abs(d.amount - parseFloat(existing.amount)) > 0.004
  if (amountChanged) {
    patch.amount = String(d.amount)
    if (d.amountChange === 'correction') {
      // Pomyłka we wpisie — nadpisz ostatni wpis historii, bez nowego śladu
      const [latest] = await db
        .select()
        .from(subscriptionPriceHistory)
        .where(eq(subscriptionPriceHistory.subscriptionId, existing.id))
        .orderBy(desc(subscriptionPriceHistory.effectiveFrom), desc(subscriptionPriceHistory.createdAt))
        .limit(1)
      if (latest) {
        await db
          .update(subscriptionPriceHistory)
          .set({ amount: String(d.amount) })
          .where(eq(subscriptionPriceHistory.id, latest.id))
      } else {
        await db.insert(subscriptionPriceHistory).values({
          subscriptionId: existing.id,
          amount: String(d.amount!),
          effectiveFrom: today(),
        })
      }
    } else {
      // Realna zmiana ceny — nowy wpis historii
      await db.insert(subscriptionPriceHistory).values({
        subscriptionId: existing.id,
        amount: String(d.amount!),
        effectiveFrom: d.effectiveFrom || today(),
      })
    }
  }

  const [updated] = await db
    .update(subscriptions)
    .set(patch)
    .where(and(eq(subscriptions.id, d.id), eq(subscriptions.userId, userId)))
    .returning()

  return NextResponse.json({ subscription: updated })
}

export async function DELETE(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const id = typeof body?.id === 'string' ? body.id : null
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  await db.delete(subscriptions).where(and(eq(subscriptions.id, id), eq(subscriptions.userId, userId)))
  return NextResponse.json({ ok: true })
}
