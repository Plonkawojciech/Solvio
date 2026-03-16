import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth-compat'
import { db } from '@/lib/db'
import { receiptItemAssignments, groups, receiptItems } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; receiptId: string }> }
) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { id: groupId, receiptId } = await params

    // Verify group access
    const [group] = await db
      .select()
      .from(groups)
      .where(and(eq(groups.id, groupId), eq(groups.createdBy, userId)))
    if (!group) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const body = await req.json()
    const { assignments } = body as {
      assignments: Array<{ receiptItemId: string; memberIds: string[] }>
    }

    if (!assignments || !Array.isArray(assignments)) {
      return NextResponse.json({ error: 'assignments array is required' }, { status: 400 })
    }

    // Get all receipt items for this receipt to validate
    const items = await db
      .select()
      .from(receiptItems)
      .where(eq(receiptItems.receiptId, receiptId))
    const validItemIds = new Set(items.map((i) => i.id))

    // Delete existing assignments for all items in this receipt within this group
    for (const item of items) {
      await db
        .delete(receiptItemAssignments)
        .where(
          and(
            eq(receiptItemAssignments.receiptItemId, item.id),
            eq(receiptItemAssignments.groupId, groupId)
          )
        )
    }

    // Insert new assignments
    const toInsert: Array<{
      receiptItemId: string
      groupId: string
      memberId: string
      share: string
    }> = []

    for (const assignment of assignments) {
      if (!validItemIds.has(assignment.receiptItemId)) continue
      if (!assignment.memberIds || assignment.memberIds.length === 0) continue

      const sharePerPerson = (1 / assignment.memberIds.length).toFixed(4)

      for (const memberId of assignment.memberIds) {
        toInsert.push({
          receiptItemId: assignment.receiptItemId,
          groupId,
          memberId,
          share: sharePerPerson,
        })
      }
    }

    if (toInsert.length > 0) {
      await db.insert(receiptItemAssignments).values(toInsert)
    }

    // Return updated assignments
    const updatedAssignments = await db
      .select()
      .from(receiptItemAssignments)
      .where(eq(receiptItemAssignments.groupId, groupId))

    // Filter to this receipt's items only
    const receiptAssignments = updatedAssignments.filter((a) =>
      validItemIds.has(a.receiptItemId)
    )

    return NextResponse.json({
      success: true,
      assignments: receiptAssignments,
      assignedItemCount: new Set(receiptAssignments.map((a) => a.receiptItemId)).size,
      totalItemCount: items.length,
    })
  } catch (err) {
    console.error('[assign PUT]', err)
    return NextResponse.json({ error: 'Failed to save assignments' }, { status: 500 })
  }
}
