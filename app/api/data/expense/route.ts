import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { db, expenses } from '@/lib/db'

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
