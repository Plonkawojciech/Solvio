import { auth } from '@/lib/auth-compat'
import { NextResponse } from 'next/server'
import { db, receipts } from '@/lib/db'
import { eq, and, desc, sql } from 'drizzle-orm'
import { z } from 'zod'

const MoneyField = z.union([
  z.number().nonnegative(),
  z.string().regex(/^-?\d+(\.\d+)?$/).transform(Number),
]).optional().nullable()

const ReceiptItemSchema = z.object({
  name: z.string().max(200).optional(),
  quantity: z.union([z.number(), z.string().transform(Number)]).optional().nullable(),
  unitPrice: MoneyField,
  totalPrice: MoneyField,
  price: MoneyField,
  categoryId: z.string().optional().nullable(),
  category_id: z.string().optional().nullable(),
}).passthrough()

const UpdateReceiptSchema = z.object({
  id: z.string().uuid('id must be a valid UUID'),
  items: z.array(ReceiptItemSchema),
})

const CreateReceiptSchema = z.object({
  vendor: z.string().max(255).optional().nullable(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  total: z.union([z.number().nonnegative(), z.string().regex(/^\d+(\.\d+)?$/).transform(Number)]).optional(),
  currency: z.string().length(3).optional().default('PLN'),
  items: z.array(ReceiptItemSchema).optional().default([]),
  notes: z.string().max(2000).optional().nullable(),
})

export async function GET(request: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')

  // List mode — consumed by native-ios ReceiptsListView.
  if (!id) {
    try {
      const rows = await db.select({
        id: receipts.id,
        vendor: receipts.vendor,
        date: receipts.date,
        total: receipts.total,
        currency: receipts.currency,
        imageUrl: receipts.imageUrl,
        itemCount: sql<number>`COALESCE(jsonb_array_length(${receipts.items}), 0)`,
        status: receipts.status,
        groupId: receipts.groupId,
        paidByMemberId: receipts.paidByMemberId,
        exchangeRate: receipts.exchangeRate,
        detectedLanguage: receipts.detectedLanguage,
        createdAt: receipts.createdAt,
      }).from(receipts)
        .where(eq(receipts.userId, userId))
        .orderBy(desc(receipts.createdAt))
        .limit(200)
      return NextResponse.json({ receipts: rows })
    } catch (err) {
      console.error('[receipts GET list]', err)
      return NextResponse.json({ error: 'Failed to fetch receipts' }, { status: 500 })
    }
  }

  try {
    const [receipt] = await db.select({
      id: receipts.id,
      userId: receipts.userId,
      vendor: receipts.vendor,
      date: receipts.date,
      total: receipts.total,
      currency: receipts.currency,
      imageUrl: receipts.imageUrl,
      items: receipts.items,
      status: receipts.status,
      hash: receipts.hash,
      groupId: receipts.groupId,
      paidByMemberId: receipts.paidByMemberId,
      exchangeRate: receipts.exchangeRate,
      detectedLanguage: receipts.detectedLanguage,
      createdAt: receipts.createdAt,
    }).from(receipts)
      .where(and(eq(receipts.id, id), eq(receipts.userId, userId)))
      .limit(1)

    if (!receipt) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json(receipt)
  } catch (err) {
    console.error('[receipts GET]', err)
    return NextResponse.json({ error: 'Failed to fetch receipt' }, { status: 500 })
  }
}

/// Virtual receipt — manual entry without OCR. Creates a row with
/// `status: 'manual'`, no image, and whatever items the user supplied.
/// Returns the created receipt flat (same shape as GET `?id=`).
export async function POST(request: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })

  const parsed = CreateReceiptSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten().fieldErrors }, { status: 400 })
  }
  const data = parsed.data

  try {
    const [row] = await db.insert(receipts).values({
      userId,
      vendor: data.vendor ?? null,
      date: data.date ?? null,
      total: data.total !== undefined ? String(data.total) : null,
      currency: data.currency,
      imageUrl: null,
      items: data.items ?? [],
      status: 'manual',
    }).returning()

    return NextResponse.json(row)
  } catch (err) {
    console.error('[receipts POST]', err)
    return NextResponse.json({ error: 'Failed to create receipt' }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })

  const parsed = UpdateReceiptSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten().fieldErrors }, { status: 400 })
  }
  const { id, items } = parsed.data

  try {
    await db.update(receipts)
      .set({ items })
      .where(and(eq(receipts.id, id), eq(receipts.userId, userId)))

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[receipts PUT]', err)
    return NextResponse.json({ error: 'Failed to update receipt' }, { status: 500 })
  }
}

/// Delete a receipt by id. Does NOT delete linked expenses — caller
/// must detach them first if needed. Blob image cleanup is best-effort.
export async function DELETE(request: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) {
    const body = await request.json().catch(() => null)
    const bodyId: string | undefined = body?.id
    if (!bodyId) return NextResponse.json({ error: 'id is required' }, { status: 400 })
    return deleteReceipt(userId, bodyId)
  }
  return deleteReceipt(userId, id)
}

async function deleteReceipt(userId: string, id: string) {
  try {
    const [existing] = await db.select({ imageUrl: receipts.imageUrl })
      .from(receipts)
      .where(and(eq(receipts.id, id), eq(receipts.userId, userId)))
      .limit(1)

    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    await db.delete(receipts).where(and(eq(receipts.id, id), eq(receipts.userId, userId)))

    if (existing.imageUrl) {
      try {
        const { del } = await import('@vercel/blob')
        await del(existing.imageUrl)
      } catch {
        // best-effort — ignore blob cleanup failures
      }
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[receipts DELETE]', err)
    return NextResponse.json({ error: 'Failed to delete receipt' }, { status: 500 })
  }
}
