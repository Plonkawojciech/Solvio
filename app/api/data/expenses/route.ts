import { auth, getHubAuth } from '@/lib/auth-compat'
import { NextResponse } from 'next/server'
import { db, expenses, categories, userSettings, merchantRules, receipts, receiptItems } from '@/lib/db'
import { eq, desc, asc, and, inArray, sql, ilike, or, type SQL } from 'drizzle-orm'
import { recordAudit } from '@/lib/audit-log'
import { z } from 'zod'
import { withApiTiming } from '@/lib/api-timing'
import { categorizeOne } from '@/lib/categorize'

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

const ExpensesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(1000).default(20),
  q: z.string().trim().max(120).optional().default(''),
  categoryId: z.string().optional().default('all'),
  tag: z.string().trim().max(50).optional().default('all'),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('')),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('')),
  amountFrom: z.coerce.number().nonnegative().optional(),
  amountTo: z.coerce.number().nonnegative().optional(),
  sortPreset: z.enum(['newest', 'oldest', 'highest', 'lowest', 'custom']).default('newest'),
  sortField: z.enum(['title', 'vendor', 'amount', 'date']).default('date'),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
})

/**
 * Resolve a category for a manually-added expense that arrived without one.
 *   1. Learned merchant rule (user-confirmed vendor → category) — instant, free.
 *   2. AI + keyword fallback against the user's OWN categories (incl. custom).
 * The AI step is time-boxed so a slow model never stalls the add — worst case
 * the expense lands uncategorized and the user can edit it (or recategorize
 * backfills later). We deliberately do NOT promote an AI guess to a merchant
 * rule: only an explicit user pick (below) is authoritative enough to learn.
 */
async function resolveCategory(userId: string, title: string, vendor: string | null): Promise<string | null> {
  const v = vendor?.trim().toLowerCase()
  if (v) {
    try {
      const [rule] = await db
        .select({ categoryId: merchantRules.categoryId })
        .from(merchantRules)
        .where(and(eq(merchantRules.userId, userId), eq(merchantRules.vendor, v)))
        .limit(1)
      if (rule?.categoryId) return rule.categoryId
    } catch {
      // Rule lookup is best-effort — fall through to AI.
    }
  }

  try {
    const cats = await db
      .select({ id: categories.id, name: categories.name })
      .from(categories)
      .where(eq(categories.userId, userId))
    if (cats.length === 0) return null
    const name = vendor?.trim() ? `${title} (${vendor.trim()})` : title
    const timeout = new Promise<null>(resolve => setTimeout(() => resolve(null), 4000))
    return await Promise.race([categorizeOne(name, cats), timeout])
  } catch {
    return null
  }
}

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

  // Product rule: "after a manual add, AI must categorize." When the client
  // didn't pick a category, resolve one (merchant rule → AI → keyword) before
  // insert so the expense isn't dumped uncategorized.
  let resolvedCategoryId = data.categoryId ?? null
  if (!resolvedCategoryId) {
    resolvedCategoryId = await resolveCategory(userId, data.title, data.vendor ?? null)
  }

  const [exp] = await db.insert(expenses).values({
    userId,
    title: data.title,
    amount: String(data.amount),
    date: data.date,
    categoryId: resolvedCategoryId,
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

async function getExpenses(request: Request) {
  let userId = (await auth()).userId
  if (!userId) {
    const hubAuth = getHubAuth(request)
    if (hubAuth) userId = hubAuth.userId
  }
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const url = new URL(request.url)
    const parsedQuery = ExpensesQuerySchema.safeParse({
      page: url.searchParams.get('page') ?? undefined,
      pageSize: url.searchParams.get('pageSize') ?? undefined,
      q: url.searchParams.get('q') ?? undefined,
      categoryId: url.searchParams.get('categoryId') ?? undefined,
      tag: url.searchParams.get('tag') ?? undefined,
      dateFrom: url.searchParams.get('dateFrom') ?? undefined,
      dateTo: url.searchParams.get('dateTo') ?? undefined,
      amountFrom: url.searchParams.get('amountFrom') || undefined,
      amountTo: url.searchParams.get('amountTo') || undefined,
      sortPreset: url.searchParams.get('sortPreset') ?? undefined,
      sortField: url.searchParams.get('sortField') ?? undefined,
      sortDir: url.searchParams.get('sortDir') ?? undefined,
    })

    if (!parsedQuery.success) {
      return NextResponse.json(
        { error: 'Invalid query', details: parsedQuery.error.flatten().fieldErrors },
        { status: 400 },
      )
    }

    const query = parsedQuery.data
    const conditions: SQL[] = [eq(expenses.userId, userId)]

    if (query.q) {
      const like = `%${query.q}%`
      conditions.push(or(ilike(expenses.title, like), ilike(expenses.vendor, like))!)
    }
    if (query.categoryId !== 'all') {
      const categoryId = z.string().uuid().safeParse(query.categoryId)
      if (!categoryId.success) {
        return NextResponse.json({ error: 'Invalid categoryId' }, { status: 400 })
      }
      conditions.push(eq(expenses.categoryId, categoryId.data))
    }
    if (query.tag !== 'all') {
      conditions.push(sql`${expenses.tags} @> ARRAY[${query.tag}]::text[]`)
    }
    if (query.dateFrom) conditions.push(sql`${expenses.date} >= ${query.dateFrom}`)
    if (query.dateTo) conditions.push(sql`${expenses.date} <= ${query.dateTo}`)
    if (query.amountFrom !== undefined) conditions.push(sql`${expenses.amount}::numeric >= ${query.amountFrom}`)
    if (query.amountTo !== undefined) conditions.push(sql`${expenses.amount}::numeric <= ${query.amountTo}`)

    const whereClause = and(...conditions)
    const offset = (query.page - 1) * query.pageSize
    const orderBy =
      query.sortPreset === 'oldest' ? [asc(expenses.date), asc(expenses.createdAt)] :
      query.sortPreset === 'highest' ? [desc(sql`${expenses.amount}::numeric`), desc(expenses.date)] :
      query.sortPreset === 'lowest' ? [asc(sql`${expenses.amount}::numeric`), desc(expenses.date)] :
      query.sortPreset === 'custom' && query.sortField === 'title' ? [query.sortDir === 'asc' ? asc(expenses.title) : desc(expenses.title), desc(expenses.date)] :
      query.sortPreset === 'custom' && query.sortField === 'vendor' ? [query.sortDir === 'asc' ? asc(expenses.vendor) : desc(expenses.vendor), desc(expenses.date)] :
      query.sortPreset === 'custom' && query.sortField === 'amount' ? [query.sortDir === 'asc' ? asc(sql`${expenses.amount}::numeric`) : desc(sql`${expenses.amount}::numeric`), desc(expenses.date)] :
      query.sortPreset === 'custom' && query.sortField === 'date' ? [query.sortDir === 'asc' ? asc(expenses.date) : desc(expenses.date), desc(expenses.createdAt)] :
      [desc(expenses.date), desc(expenses.createdAt)]

    // Round-4 perf: was 3 parallel HTTP round-trips via Promise.all. Each
    // drizzle/neon-http call is its own POST to Neon's HTTP gateway, so
    // "parallel" still means 3× connection setup + 3× server-side parse.
    // db.batch([...]) packs them into ONE pipelined HTTP request inside a
    // single read-only transaction snapshot. Same selects, ~3× fewer
    // round-trips. Result tuple order matches statement order.
    const [exps, cats, settings, countRows, tagRows] = await db.batch([
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
      }).from(expenses).where(whereClause).orderBy(...orderBy).limit(query.pageSize).offset(offset),
      db.select().from(categories).where(eq(categories.userId, userId)),
      db.select().from(userSettings).where(eq(userSettings.userId, userId)).limit(1),
      db.select({ count: sql<number>`count(*)::int` }).from(expenses).where(whereClause),
      db.select({ tags: expenses.tags }).from(expenses).where(eq(expenses.userId, userId)).limit(1000),
    ])

    const total = countRows[0]?.count ?? 0
    const totalPages = Math.max(1, Math.ceil(total / query.pageSize))
    const availableTags = Array.from(new Set(
      tagRows.flatMap((row) => Array.isArray(row.tags) ? row.tags : []),
    )).sort()

    return NextResponse.json(
      {
        expenses: exps,
        categories: cats,
        settings: settings[0] || null,
        availableTags,
        pagination: {
          page: query.page,
          pageSize: query.pageSize,
          total,
          totalPages,
          hasNext: query.page < totalPages,
          hasPrev: query.page > 1,
        },
      },
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

export const GET = withApiTiming('api.data.expenses.GET', getExpenses)

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
