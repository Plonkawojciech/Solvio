import { auth } from '@/lib/auth-compat'
import { NextResponse } from 'next/server'
import { db, savingsGoals } from '@/lib/db'
import { eq, and } from 'drizzle-orm'
import { z } from 'zod'

// SECURITY FIX: Zod schema validation for PUT body
const GoalUpdateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  emoji: z.string().max(10).optional(),
  targetAmount: z.union([z.number().positive(), z.string().regex(/^\d+(\.\d+)?$/)]).optional(),
  deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  priority: z.enum(['low', 'medium', 'high']).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  category: z.string().max(50).optional(),
}).strict()

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  let rawBody: unknown
  try {
    rawBody = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = GoalUpdateSchema.safeParse(rawBody)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  }
  const body = parsed.data

  try {
    const updateData: Record<string, unknown> = {}
    if (body.name !== undefined) updateData.name = body.name
    if (body.emoji !== undefined) updateData.emoji = body.emoji
    if (body.targetAmount !== undefined) updateData.targetAmount = String(body.targetAmount)
    if (body.deadline !== undefined) updateData.deadline = body.deadline
    if (body.priority !== undefined) updateData.priority = body.priority
    if (body.color !== undefined) updateData.color = body.color
    if (body.category !== undefined) updateData.category = body.category

    const [goal] = await db
      .update(savingsGoals)
      .set(updateData)
      .where(and(eq(savingsGoals.id, id), eq(savingsGoals.userId, userId)))
      .returning()

    if (!goal) {
      return NextResponse.json({ error: 'Goal not found' }, { status: 404 })
    }

    return NextResponse.json({ goal })
  } catch (err) {
    console.error('[goals PUT]', err)
    return NextResponse.json({ error: 'Failed to update goal' }, { status: 500 })
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  try {
    const [deleted] = await db
      .delete(savingsGoals)
      .where(and(eq(savingsGoals.id, id), eq(savingsGoals.userId, userId)))
      .returning()

    if (!deleted) {
      return NextResponse.json({ error: 'Goal not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[goals DELETE]', err)
    return NextResponse.json({ error: 'Failed to delete goal' }, { status: 500 })
  }
}
