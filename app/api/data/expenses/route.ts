import { auth, getHubAuth } from '@/lib/auth-compat'
import { NextResponse } from 'next/server'
import { db, expenses, categories, userSettings, merchantRules, receipts, receiptItems } from '@/lib/db'
import { eq, desc, and, inArray, sql } from 'drizzle-orm'
import { recordAudit } from '@/lib/audit-log'
import { z } from 'zod'
import { dbBatch } from '@/lib/db/batch'

const CreateExpenseSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200),
  amount: z.union([z.number().positive(), z.string().regex(/^\d+(\.\d+)?$/).transform(Number)]),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  categoryId: z.string().uuid().optional().nullable(),
  vendor: z.string().max(200).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  currency: z.string().length(3).optional().default('PLN'),
  tags: z.array(z.string().max(50)).max(5).optional().nullable(),
  // Optional link to a scanned receipt — iOS sends this when creating
  // an expense from the OCR confirmation flow so the row joins back to
  // the source receipt in the receipt detail view.
  receiptId: z.string().uuid().optional().nullable(),
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
  // Optional receipt re-link. Symmetric to CreateExpenseSchema — the iOS
  // ExpenseUpdate struct can now carry receiptId so an existing manual
  // expense can be linked to a scanned receipt (or unlinked) without going
  // through delete + recreate. Zod default-strip would silently discard
  // any unknown field, so this must be explicitly declared.
  receiptId: z.string().uuid().optional().nullable(),
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
    receiptId: data.receiptId ?? null,
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
    // Round-4 perf: was 3 parallel HTTP round-trips via Promise.all. Each
    // drizzle/neon-http call is its own POST to Neon's HTTP gateway, so
    // "parallel" still means 3× connection setup + 3× server-side parse.
    // db.batch([...]) packs them into ONE pipelined HTTP request inside a
    // single read-only transaction snapshot. Same selects, ~3× fewer
    // round-trips. Result tuple order matches statement order.
    const [exps, cats, settings] = await dbBatch((x) => [
      x.select({
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
      x.select().from(categories).where(eq(categories.userId, userId)),
      x.select().from(userSettings).where(eq(userSettings.userId, userId)).limit(1),
    ], { atomic: false })

    return NextResponse.json(
      { expenses: exps, categories: cats, settings: settings[0] || null },
      {
        headers: {
          // Per-user authenticated payload. Tiny SWR window mirrors
          // the dashboard endpoint so a tab-switch within the same
          // region hits an edge cache instead of round-tripping to DB.
          'Cache-Control': 'private, max-age=5, must-revalidate',
        },
      },
    )
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
    // Only set `receiptId` when the client explicitly sent the field — when
    // omitted (Swift `nil` Encodable skips the key entirely), keep the prior
    // value rather than nulling the link. Sending `receiptId: null` is the
    // explicit unlink contract.
    const updateSet: {
      title: string
      amount: string
      date: string
      categoryId: string | null
      vendor: string | null
      notes: string | null
      tags: string[] | null
      updatedAt: Date
      receiptId?: string | null
    } = {
      title: data.title.trim(),
      amount: String(data.amount),
      date: data.date,
      categoryId: data.categoryId ?? null,
      vendor: data.vendor ?? null,
      notes: data.notes ?? null,
      tags: data.tags ?? null,
      updatedAt: new Date(),
    }
    if (Object.prototype.hasOwnProperty.call(body, 'receiptId')) {
      updateSet.receiptId = data.receiptId ?? null
    }

    await db.update(expenses)
      .set(updateSet)
      .where(and(eq(expenses.id, data.id), eq(expenses.userId, userId)))

    // Learn from manual edits: if the user sets vendor + category on
    // edit, treat that as a stronger signal than the create-time learn
    // (the user is correcting a wrong auto-categorization). Mirror the
    // POST handler's upsert so future expenses with the same vendor get
    // the corrected category automatically.
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
        // Non-critical — don't fail the expense update
        console.error('[expenses PUT] merchant rule upsert failed:', ruleErr)
      }
    }

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

    // SECURITY (round 2 / A2): append-only audit trail. Records the
    // count + ids so an admin can correlate a complaint of "my data
    // disappeared" with a real DELETE attribution.
    void recordAudit({
      userId,
      action: 'expense.delete',
      entityType: 'expense',
      entityId: ids[0] ?? null,
      payload: {
        idsCount: expensesToDelete.length,
        ids: ids.slice(0, 20), // bound payload size
        cascadedReceiptIds: receiptIdsToCheck.slice(0, 20),
      },
    })

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
