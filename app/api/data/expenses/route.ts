import { auth, getHubAuth } from '@/lib/auth-compat'
import { NextResponse } from 'next/server'
import { db, expenses, categories, userSettings, merchantRules, receipts, receiptItems } from '@/lib/db'
import { eq, desc, and, inArray, sql } from 'drizzle-orm'
import { z } from 'zod'

const CreateExpenseSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200),
  amount: z.union([z.number().positive(), z.string().regex(/^\d+(\.\d+)?$/).transform(Number)]),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  categoryId: z.string().uuid().optional().nullable(),
  vendor: z.string().max(200).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  currency: z.string().length(3).optional().default('PLN'),
  tags: z.array(z.string().max(50)).max(5).optional().nullable(),
})

const UpdateExpenseSchema = z.object({
  id: z.string().uuid('id must be a valid UUID'),
  title: z.string().min(1, 'Title cannot be empty').max(200),
  amount: z.union([z.number().positive(), z.string().regex(/^\d+(\.\d+)?$/).transform(Number)]),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  categoryId: z.string().uuid().optional().nullable(),
  vendor: z.string().max(200).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  tags: z.array(z.string().max(50)).max(5).optional().nullable(),
})

const DeleteExpensesSchema = z.object({
  ids: z.array(z.string().uuid()).min(1, 'At least one id is required'),
})

export async function POST(request: Request) {
  let userId = (await auth()).userId
  if (!userId) {
    const hubAuth = getHubAuth(request)
    if (hubAuth) userId = hubAuth.userId
  }
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

  const parsed = CreateExpenseSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten().fieldErrors }, { status: 400 })
  }
  const data = parsed.data

  const [exp] = await db.insert(expenses).values({
    userId,
    title: data.title,
    amount: String(data.amount),
    date: data.date,
    categoryId: data.categoryId ?? null,
    vendor: data.vendor ?? null,
    notes: data.notes ?? null,
    currency: data.currency,
    tags: data.tags ?? null,
  }).returning()

  // Learn from this expense: upsert merchant rule if vendor + categoryId are both present
  if (data.vendor && data.categoryId) {
    const vendorNormalized = data.vendor.trim().toLowerCase()
    try {
      await db
        .insert(merchantRules)
        .values({
          userId,
          vendor: vendorNormalized,
          categoryId: data.categoryId,
          count: 1,
        })
        .onConflictDoUpdate({
          target: [merchantRules.userId, merchantRules.vendor],
          set: {
            categoryId: data.categoryId,
            count: sql`${merchantRules.count} + 1`,
            updatedAt: new Date(),
          },
        })
    } catch (ruleErr) {
      // Non-critical — don't fail the expense creation
      console.error('[expenses POST] merchant rule upsert failed:', ruleErr)
    }
  }

  return NextResponse.json({ expense: exp })
}

export async function GET(request: Request) {
  let userId = (await auth()).userId
  if (!userId) {
    const hubAuth = getHubAuth(request)
    if (hubAuth) userId = hubAuth.userId
  }
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const [exps, cats, settings] = await Promise.all([
      db.select({
        id: expenses.id,
        title: expenses.title,
        amount: expenses.amount,
        currency: expenses.currency,
        date: expenses.date,
        vendor: expenses.vendor,
        categoryId: expenses.categoryId,
        receiptId: expenses.receiptId,
        notes: expenses.notes,
        tags: expenses.tags,
        isRecurring: expenses.isRecurring,
      }).from(expenses).where(eq(expenses.userId, userId)).orderBy(desc(expenses.date)).limit(500),
      db.select().from(categories).where(eq(categories.userId, userId)),
      db.select().from(userSettings).where(eq(userSettings.userId, userId)).limit(1),
    ])

    return NextResponse.json({ expenses: exps, categories: cats, settings: settings[0] || null })
  } catch (err) {
    console.error('[expenses GET]', err)
    return NextResponse.json({ error: 'Failed to fetch expenses' }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  let userId = (await auth()).userId
  if (!userId) {
    const hubAuth = getHubAuth(request)
    if (hubAuth) userId = hubAuth.userId
  }
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })

  const parsed = UpdateExpenseSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten().fieldErrors }, { status: 400 })
  }
  const data = parsed.data

  try {
    await db.update(expenses)
      .set({
        title: data.title.trim(),
        amount: String(data.amount),
        date: data.date,
        categoryId: data.categoryId ?? null,
        vendor: data.vendor ?? null,
        notes: data.notes ?? null,
        tags: data.tags ?? null,
        updatedAt: new Date(),
      })
      .where(and(eq(expenses.id, data.id), eq(expenses.userId, userId)))

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[expenses PUT]', err)
    return NextResponse.json({ error: 'Failed to update expense' }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  let userId = (await auth()).userId
  if (!userId) {
    const hubAuth = getHubAuth(request)
    if (hubAuth) userId = hubAuth.userId
  }
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })

  const parsed = DeleteExpensesSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten().fieldErrors }, { status: 400 })
  }
  const { ids } = parsed.data

  try {
    // 1. Fetch expenses to get receiptIds BEFORE deleting them
    const expensesToDelete = await db.select({ id: expenses.id, receiptId: expenses.receiptId })
      .from(expenses)
      .where(and(inArray(expenses.id, ids), eq(expenses.userId, userId)))

    const receiptIdsToCheck = [...new Set(
      expensesToDelete.map(e => e.receiptId).filter(Boolean)
    )] as string[]

    // 2. Delete the expenses
    await db.delete(expenses).where(and(
      inArray(expenses.id, ids),
      eq(expenses.userId, userId)
    ))

    // 3. For each receipt, check if any OTHER expenses still reference it (parallel)
    if (receiptIdsToCheck.length > 0) {
      await Promise.all(receiptIdsToCheck.map(async (receiptId) => {
        const remaining = await db.select({ id: expenses.id })
          .from(expenses)
          .where(and(eq(expenses.receiptId, receiptId), eq(expenses.userId, userId)))
          .limit(1)

        if (remaining.length === 0) {
          // No other expenses reference this receipt — safe to delete
          // Delete receipt items first
          await db.delete(receiptItems).where(eq(receiptItems.receiptId, receiptId)).catch((err) => console.error('Failed to delete receipt items:', err))

          // Get receipt image URL for blob cleanup
          const [receipt] = await db.select({ imageUrl: receipts.imageUrl })
            .from(receipts)
            .where(and(eq(receipts.id, receiptId), eq(receipts.userId, userId)))

          // Delete receipt from DB
          await db.delete(receipts).where(and(eq(receipts.id, receiptId), eq(receipts.userId, userId)))

          // Delete blob image if exists
          if (receipt?.imageUrl) {
            try {
              const { del } = await import('@vercel/blob')
              await del(receipt.imageUrl)
            } catch {
              // Blob deletion is best-effort — don't fail the request
            }
          }
        }
      }))
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[expenses DELETE]', err)
    return NextResponse.json({ error: 'Failed to delete expenses' }, { status: 500 })
  }
}
