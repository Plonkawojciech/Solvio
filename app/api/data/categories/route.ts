import { auth } from '@/lib/auth-compat'
import { NextResponse } from 'next/server'
import { db, categories } from '@/lib/db'
import { eq, and } from 'drizzle-orm'

export async function POST(request: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { name, icon } = body
  if (!name || typeof name !== 'string' || name.trim() === '') {
    return NextResponse.json({ error: 'name must be a non-empty string' }, { status: 400 })
  }

  try {
    const [cat] = await db.insert(categories).values({ userId, name: name.trim(), icon }).returning()
    return NextResponse.json(cat)
  } catch (err) {
    console.error('[categories POST]', err)
    return NextResponse.json({ error: 'Failed to create category' }, { status: 500 })
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

  const { id, name, icon } = body
  if (!id) {
    return NextResponse.json({ error: 'Missing required field: id' }, { status: 400 })
  }

  try {
    await db.update(categories)
      .set({ name, ...(icon !== undefined ? { icon } : {}) })
      .where(and(eq(categories.id, id), eq(categories.userId, userId)))

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[categories PUT]', err)
    return NextResponse.json({ error: 'Failed to update category' }, { status: 500 })
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

  const { id } = body
  if (!id) {
    return NextResponse.json({ error: 'Missing required field: id' }, { status: 400 })
  }

  try {
    await db.delete(categories).where(and(eq(categories.id, id), eq(categories.userId, userId)))
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[categories DELETE]', err)
    return NextResponse.json({ error: 'Failed to delete category' }, { status: 500 })
  }
}
