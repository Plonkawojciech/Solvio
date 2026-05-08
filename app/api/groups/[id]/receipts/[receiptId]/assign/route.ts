import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth-compat'
import { db } from '@/lib/db'
import { receiptItemAssignments, groups, groupMembers, receiptItems, receipts } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { z } from 'zod'

// SECURITY (round 2 / A2): bound the assignments payload. Without this,
// an attacker could send arbitrary memberIds (potentially from foreign
// groups) or huge arrays that exhaust memory.
const AssignSchema = z.object({
  assignments: z
    .array(
      z.object({
        receiptItemId: z.string().uuid(),
        memberIds: z.array(z.string().min(1).max(128)).max(50),
      }),
    )
    .max(200),
})

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; receiptId: string }> }
) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { id: groupId, receiptId } = await params

    // SECURITY (round 2 / A2): allow group MEMBERS too, not just creator.
    const [group] = await db
      .select()
      .from(groups)
      .where(eq(groups.id, groupId))
    if (!group) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    if (group.createdBy !== userId) {
      const [membership] = await db
        .select({ id: groupMembers.id })
        .from(groupMembers)
        .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId)))
        .limit(1)
      if (!membership) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    // SECURITY (round 2 / A2): verify this receipt belongs to the auth'd
    // user. Without this an attacker who's a member of THEIR group could
    // pass a foreign user's `receiptId` and the downstream item-write
    // would write per-item assignment rows referencing items that aren't
    // theirs (a cross-tenant write).
    const [ownedReceipt] = await db
      .select({ id: receipts.id })
      .from(receipts)
      .where(and(eq(receipts.id, receiptId), eq(receipts.userId, userId)))
      .limit(1)
    if (!ownedReceipt) {
      return NextResponse.json({ error: 'Receipt not found' }, { status: 404 })
    }

    const rawBody = await req.json().catch(() => null)
    if (!rawBody) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

    const parsed = AssignSchema.safeParse(rawBody)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      )
    }
    const { assignments } = parsed.data

    // SECURITY (round 2 / A2): check every memberId in assignments belongs
    // to THIS group. An attacker shouldn't be able to assign items to
    // foreign group members.
    const validMembers = await db
      .select({ id: groupMembers.id })
      .from(groupMembers)
      .where(eq(groupMembers.groupId, groupId))
    const validMemberIds = new Set(validMembers.map((m) => m.id))
    for (const a of assignments) {
      for (const mid of a.memberIds) {
        if (!validMemberIds.has(mid)) {
          return NextResponse.json({ error: 'memberId not in group' }, { status: 400 })
        }
      }
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
