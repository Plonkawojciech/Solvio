import { auth } from '@/lib/auth-compat'
import { NextResponse } from 'next/server'
import { db, loyaltyCards } from '@/lib/db'
import { eq, and } from 'drizzle-orm'
import { z } from 'zod'

// SECURITY (round 2 / A2): bound POST/DELETE bodies. The previous version
// accepted arbitrary `any` which let unbounded card numbers / store names
// land in DB columns sized for short values.
const ToggleCardSchema = z.object({
  action: z.literal('toggle'),
  id: z.string().uuid(),
  isActive: z.boolean(),
})

const CreateCardSchema = z.object({
  store: z.string().min(1).max(50),
  cardNumber: z.string().max(100).optional().nullable(),
  memberName: z.string().max(255).optional().nullable(),
})

const DeleteCardSchema = z.object({
  id: z.string().uuid(),
})

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

  const rawBody = await request.json().catch(() => null)
  if (!rawBody) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

  try {
    // Toggle action — discriminate by `action` field
    if (typeof rawBody === 'object' && rawBody !== null && 'action' in rawBody) {
      const parsed = ToggleCardSchema.safeParse(rawBody)
      if (!parsed.success) {
        return NextResponse.json(
          { error: 'Invalid input', details: parsed.error.flatten().fieldErrors },
          { status: 400 },
        )
      }
      await db
        .update(loyaltyCards)
        .set({ isActive: parsed.data.isActive })
        .where(and(eq(loyaltyCards.id, parsed.data.id), eq(loyaltyCards.userId, userId)))
      return NextResponse.json({ success: true })
    }

    // Add new card
    const parsed = CreateCardSchema.safeParse(rawBody)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      )
    }
    const { store, cardNumber, memberName } = parsed.data

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

  const rawBody = await request.json().catch(() => null)
  if (!rawBody) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

  const parsed = DeleteCardSchema.safeParse(rawBody)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid input', details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    )
  }

  try {
    await db
      .delete(loyaltyCards)
      .where(and(eq(loyaltyCards.id, parsed.data.id), eq(loyaltyCards.userId, userId)))

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[loyalty DELETE]', err)
    return NextResponse.json({ error: 'Failed to delete loyalty card' }, { status: 500 })
  }
}
