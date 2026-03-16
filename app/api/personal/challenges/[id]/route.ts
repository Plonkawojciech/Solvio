import { auth } from '@/lib/auth-compat'
import { NextResponse } from 'next/server'
import { db, financialChallenges } from '@/lib/db'
import { eq, and } from 'drizzle-orm'

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  try {
    const updateData: any = {}
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
