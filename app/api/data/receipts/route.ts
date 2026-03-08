import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { db, receipts } from '@/lib/db'
import { eq, and } from 'drizzle-orm'

export async function GET(request: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  try {
    const [receipt] = await db.select().from(receipts)
      .where(and(eq(receipts.id, id), eq(receipts.userId, userId)))
      .limit(1)

    if (!receipt) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json(receipt)
  } catch (err) {
    console.error('[receipts GET]', err)
    return NextResponse.json({ error: 'Failed to fetch receipt' }, { status: 500 })
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

  const { id, items } = body
  if (!id) {
    return NextResponse.json({ error: 'Missing required field: id' }, { status: 400 })
  }

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
