import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth-compat'
import { db } from '@/lib/db'
import { receipts, receiptItems, receiptItemAssignments, groups, groupMembers } from '@/lib/db/schema'
import { eq, and, inArray } from 'drizzle-orm'

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { id } = await params

    // Verify group access
    const [group] = await db.select().from(groups).where(and(eq(groups.id, id), eq(groups.createdBy, userId)))
    if (!group) return NextResponse.json({ error: 'Not found' }, { status: 404 })

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

    // Verify group access
    const [group] = await db.select().from(groups).where(and(eq(groups.id, id), eq(groups.createdBy, userId)))
    if (!group) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const body = await req.json()
    const { receiptId, paidByMemberId } = body

    if (!receiptId) {
      return NextResponse.json({ error: 'receiptId is required' }, { status: 400 })
    }

    // Update the receipt to link it to the group
    await db
      .update(receipts)
      .set({
        groupId: id,
        paidByMemberId: paidByMemberId || null,
      })
      .where(and(eq(receipts.id, receiptId), eq(receipts.userId, userId)))

    // Get receipt with items
    const [receipt] = await db.select().from(receipts).where(eq(receipts.id, receiptId))

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
