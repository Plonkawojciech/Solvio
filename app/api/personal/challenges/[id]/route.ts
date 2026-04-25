import { auth } from '@/lib/auth-compat'
import { NextResponse } from 'next/server'
import { db, financialChallenges } from '@/lib/db'
import { eq, and } from 'drizzle-orm'
import { z } from 'zod'

// SECURITY FIX: Zod schema validation for PUT body
const ChallengeUpdateSchema = z.object({
  currentProgress: z.union([z.number().nonnegative(), z.string().regex(/^\d+(\.\d+)?$/)]).optional(),
  isCompleted: z.boolean().optional(),
  isActive: z.boolean().optional(),
  name: z.string().min(1).max(100).optional(),
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

  const parsed = ChallengeUpdateSchema.safeParse(rawBody)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  }
  const body = parsed.data

  try {
    const updateData: Record<string, unknown> = {}
    if (body.currentProgress !== undefined) updateData.currentProgress = String(body.currentProgress)
    if (body.isCompleted !== undefined) updateData.isCompleted = body.isCompleted
    if (body.isActive !== undefined) updateData.isActive = body.isActive
    if (body.name !== undefined) updateData.name = body.name

    const [challenge] = await db
      .update(financialChallenges)
      .set(updateData)
      .where(and(eq(financialChallenges.id, id), eq(financialChallenges.userId, userId)))
      .returning()

    if (!challenge) {
      return NextResponse.json({ error: 'Challenge not found' }, { status: 404 })
    }

    return NextResponse.json({ challenge })
  } catch (err) {
    console.error('[challenges PUT]', err)
    return NextResponse.json({ error: 'Failed to update challenge' }, { status: 500 })
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
      .delete(financialChallenges)
      .where(and(eq(financialChallenges.id, id), eq(financialChallenges.userId, userId)))
      .returning()

    if (!deleted) {
      return NextResponse.json({ error: 'Challenge not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[challenges DELETE]', err)
    return NextResponse.json({ error: 'Failed to delete challenge' }, { status: 500 })
  }
}
