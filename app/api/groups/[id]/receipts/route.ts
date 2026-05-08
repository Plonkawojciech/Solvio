import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth-compat'
import { db } from '@/lib/db'
import { receipts, receiptItems, receiptItemAssignments, groups, groupMembers } from '@/lib/db/schema'
import { eq, and, inArray } from 'drizzle-orm'
import { z } from 'zod'

// SECURITY (round 2 / A2): Zod-validate the receipt-link body. Previously we
// accepted arbitrary `paidByMemberId` strings and read `receiptId` straight
// into a DB UPDATE without any bounds. An attacker could swap `receiptId`
// to a foreign user's UUID and have us read it back in the response (the
// multi-tenant leak is fixed below by re-fetching with userId scope).
const LinkReceiptSchema = z.object({
  receiptId: z.string().uuid('receiptId must be a valid UUID'),
  paidByMemberId: z.string().min(1).max(128).optional().nullable(),
})

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { id } = await params

    // SECURITY (round 2 / A2): allow group MEMBERS access, not just creator.
    // Mirrors the access pattern in `/api/groups/[id]` GET. Trip-mode groups
    // need every member to see the receipts the group has accumulated.
    const [group] = await db.select().from(groups).where(eq(groups.id, id))
    if (!group) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    if (group.createdBy !== userId) {
      const [membership] = await db
        .select({ id: groupMembers.id })
        .from(groupMembers)
        .where(and(eq(groupMembers.groupId, id), eq(groupMembers.userId, userId)))
        .limit(1)
      if (!membership) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    // Get all receipts for this group
    const groupReceipts = await db
      .select()
      .from(receipts)
      .where(and(eq(receipts.groupId, id), eq(receipts.status, 'processed')))

    // Batch-fetch all items and assignments to avoid N+1 queries
    const members = await db.select().from(groupMembers).where(eq(groupMembers.groupId, id))

    const allReceiptIds = groupReceipts.map(r => r.id)

    // Single query for all receipt items across all receipts
    const allItems = allReceiptIds.length > 0
      ? await db.select().from(receiptItems).where(inArray(receiptItems.receiptId, allReceiptIds))
      : []

    // Single query for all assignments for this group (groupId is constant)
    const allAssignments = await db
      .select()
      .from(receiptItemAssignments)
      .where(eq(receiptItemAssignments.groupId, id))

    // Build Maps for O(1) lookups
    const itemsByReceiptId = new Map<string, typeof allItems>()
    for (const item of allItems) {
      const list = itemsByReceiptId.get(item.receiptId) ?? []
      list.push(item)
      itemsByReceiptId.set(item.receiptId, list)
    }

    const assignmentsByItemId = new Map<string, typeof allAssignments>()
    for (const assignment of allAssignments) {
      const list = assignmentsByItemId.get(assignment.receiptItemId) ?? []
      list.push(assignment)
      assignmentsByItemId.set(assignment.receiptItemId, list)
    }

    const membersById = new Map(members.map(m => [m.id, m]))

    // Build result in JS without further DB queries
    const result = groupReceipts.map((receipt) => {
      const items = itemsByReceiptId.get(receipt.id) ?? []
      const itemIds = new Set(items.map(i => i.id))
      const receiptAssignments = allAssignments.filter(a => itemIds.has(a.receiptItemId))

      const paidByMember = receipt.paidByMemberId
        ? membersById.get(receipt.paidByMemberId) ?? null
        : null

      return {
        ...receipt,
        receiptItems: items,
        assignments: receiptAssignments,
        paidByMember: paidByMember
          ? { id: paidByMember.id, name: paidByMember.displayName }
          : null,
        assignedItemCount: new Set(receiptAssignments.map((a) => a.receiptItemId)).size,
        totalItemCount: items.length,
      }
    })

    return NextResponse.json({
      receipts: result,
      members: members.map((m) => ({
        id: m.id,
        name: m.displayName,
        email: m.email,
        color: m.color,
      })),
    })
  } catch (err) {
    console.error('[group receipts GET]', err)
    return NextResponse.json({ error: 'Failed to fetch receipts' }, { status: 500 })
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { id } = await params

    // SECURITY (round 2 / A2): allow group MEMBERS too, not just creator.
    // Trip groups need every member to attach their own receipts.
    const [group] = await db.select().from(groups).where(eq(groups.id, id))
    if (!group) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    if (group.createdBy !== userId) {
      const [membership] = await db
        .select({ id: groupMembers.id })
        .from(groupMembers)
        .where(and(eq(groupMembers.groupId, id), eq(groupMembers.userId, userId)))
        .limit(1)
      if (!membership) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const rawBody = await req.json().catch(() => null)
    if (!rawBody) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

    const parsed = LinkReceiptSchema.safeParse(rawBody)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      )
    }
    const { receiptId, paidByMemberId } = parsed.data

    // SECURITY (round 2 / A2): verify the receipt belongs to the auth'd
    // user BEFORE writing/reading it. The original code did a userId-
    // scoped UPDATE (which would silently no-op on foreign IDs) but then
    // an UNSCOPED `db.select(...)` and returned the response — leaking
    // foreign receipt data. Now we ownership-check upfront.
    const [ownedReceipt] = await db
      .select({ id: receipts.id })
      .from(receipts)
      .where(and(eq(receipts.id, receiptId), eq(receipts.userId, userId)))
      .limit(1)
    if (!ownedReceipt) {
      return NextResponse.json({ error: 'Receipt not found' }, { status: 404 })
    }

    // SECURITY (round 2 / A2): if paidByMemberId provided, verify the
    // member belongs to THIS group. Otherwise an attacker could attribute
    // the spend to a member of a foreign group as a kind of cross-tenant
    // graffiti attack.
    if (paidByMemberId) {
      const [member] = await db
        .select({ id: groupMembers.id })
        .from(groupMembers)
        .where(and(eq(groupMembers.id, paidByMemberId), eq(groupMembers.groupId, id)))
        .limit(1)
      if (!member) {
        return NextResponse.json({ error: 'paidByMemberId not in group' }, { status: 400 })
      }
    }

    // Update the receipt to link it to the group
    await db
      .update(receipts)
      .set({
        groupId: id,
        paidByMemberId: paidByMemberId || null,
      })
      .where(and(eq(receipts.id, receiptId), eq(receipts.userId, userId)))

    // Re-read with userId scope so we never leak foreign receipts even if
    // a future code change drops the upstream check.
    const [receipt] = await db
      .select()
      .from(receipts)
      .where(and(eq(receipts.id, receiptId), eq(receipts.userId, userId)))
      .limit(1)

    // Create receipt_items from the jsonb items if they don't already exist
    const existingItems = await db
      .select()
      .from(receiptItems)
      .where(eq(receiptItems.receiptId, receiptId))

    if (existingItems.length === 0 && receipt?.items && Array.isArray(receipt.items)) {
      const itemsToInsert = (receipt.items as Array<{ name: string; quantity?: number; price?: number }>).map((item) => ({
        receiptId,
        userId,
        name: item.name || 'Unknown item',
        quantity: String(item.quantity ?? 1),
        unitPrice: item.price ? String((item.price / (item.quantity || 1)).toFixed(2)) : null,
        totalPrice: item.price ? String(item.price) : null,
      }))

      if (itemsToInsert.length > 0) {
        await db.insert(receiptItems).values(itemsToInsert)
      }
    }

    const items = await db
      .select()
      .from(receiptItems)
      .where(eq(receiptItems.receiptId, receiptId))

    return NextResponse.json({
      ...receipt,
      receiptItems: items,
      assignedItemCount: 0,
      totalItemCount: items.length,
    })
  } catch (err) {
    console.error('[group receipts POST]', err)
    return NextResponse.json({ error: 'Failed to add receipt to group' }, { status: 500 })
  }
}
