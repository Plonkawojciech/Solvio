import { auth } from '@/lib/auth-compat'
import { NextResponse } from 'next/server'
import { db, expenses, categories, userSettings } from '@/lib/db'
import { eq, desc, and, inArray } from 'drizzle-orm'

export async function POST(request: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const [exp] = await db.insert(expenses).values({
    userId,
    title: body.title,
    amount: String(body.amount),
    date: body.date,
    categoryId: body.categoryId || null,
    vendor: body.vendor || null,
    notes: body.notes || null,
    currency: body.currency || 'PLN',
  }).returning()

  return NextResponse.json({ expense: exp })
}

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const [exps, cats, settings] = await Promise.all([
      db.select().from(expenses).where(eq(expenses.userId, userId)).orderBy(desc(expenses.date)).limit(500),
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
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { id, title, amount, date, categoryId, vendor, notes } = body

  if (!id) {
    return NextResponse.json({ error: 'Missing required field: id' }, { status: 400 })
  }
  if (!title || typeof title !== 'string' || title.trim() === '') {
    return NextResponse.json({ error: 'title must be a non-empty string' }, { status: 400 })
  }
  const parsedAmount = parseFloat(amount)
  if (isNaN(parsedAmount) || parsedAmount <= 0) {
    return NextResponse.json({ error: 'amount must be a positive number' }, { status: 400 })
  }

  try {
    await db.update(expenses)
      .set({ title: title.trim(), amount: String(parsedAmount), date, categoryId, vendor, notes, updatedAt: new Date() })
      .where(and(eq(expenses.id, id), eq(expenses.userId, userId)))

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[expenses PUT]', err)
    return NextResponse.json({ error: 'Failed to update expense' }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { ids } = body
  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: 'ids must be a non-empty array' }, { status: 400 })
  }

  try {
    await db.delete(expenses).where(and(
      inArray(expenses.id, ids),
      eq(expenses.userId, userId)
    ))

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[expenses DELETE]', err)
    return NextResponse.json({ error: 'Failed to delete expenses' }, { status: 500 })
  }
}
