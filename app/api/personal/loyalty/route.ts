import { auth } from '@/lib/auth-compat'
import { NextResponse } from 'next/server'
import { db, loyaltyCards } from '@/lib/db'
import { eq, and } from 'drizzle-orm'

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const cards = await db
      .select()
      .from(loyaltyCards)
      .where(eq(loyaltyCards.userId, userId))

    return NextResponse.json({ cards })
  } catch (err) {
    console.error('[loyalty GET]', err)
    return NextResponse.json({ error: 'Failed to fetch loyalty cards' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  try {
    // Toggle action
    if (body.action === 'toggle' && body.id) {
      await db
        .update(loyaltyCards)
        .set({ isActive: body.isActive })
        .where(and(eq(loyaltyCards.id, body.id), eq(loyaltyCards.userId, userId)))
      return NextResponse.json({ success: true })
    }

    // Add new card
    const { store, cardNumber, memberName } = body
    if (!store) {
      return NextResponse.json({ error: 'Store is required' }, { status: 400 })
    }

    const [card] = await db
      .insert(loyaltyCards)
      .values({
        userId,
        store,
        cardNumber: cardNumber || null,
        memberName: memberName || null,
        isActive: true,
      })
      .returning()

    return NextResponse.json({ card })
  } catch (err) {
    console.error('[loyalty POST]', err)
    return NextResponse.json({ error: 'Failed to save loyalty card' }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { id } = body
  if (!id) return NextResponse.json({ error: 'Card ID required' }, { status: 400 })

  try {
    await db
      .delete(loyaltyCards)
      .where(and(eq(loyaltyCards.id, id), eq(loyaltyCards.userId, userId)))

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[loyalty DELETE]', err)
    return NextResponse.json({ error: 'Failed to delete loyalty card' }, { status: 500 })
  }
}
