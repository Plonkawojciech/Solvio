import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth-compat'
import { db } from '@/lib/db'
import {
  groups,
  groupMembers,
  expenseSplits,
  paymentRequests,
  receipts,
  receiptItems,
  receiptItemAssignments,
} from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import crypto from 'crypto'

// ── GET: calculate full settlement for group ────────────────────────────────
export async function GET(
  _: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { id: groupId } = await params

    // Verify group access
    const [group] = await db
      .select()
      .from(groups)
      .where(and(eq(groups.id, groupId), eq(groups.createdBy, userId)))
    if (!group) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // Fetch members and splits
    const members = await db.select().from(groupMembers).where(eq(groupMembers.groupId, groupId))
    const splits = await db.select().from(expenseSplits).where(eq(expenseSplits.groupId, groupId))

    // Fetch existing payment requests
    const existingRequests = await db
      .select()
      .from(paymentRequests)
      .where(eq(paymentRequests.groupId, groupId))

    // Fetch receipts for this group
    const groupReceipts = await db
      .select()
      .from(receipts)
      .where(eq(receipts.groupId, groupId))

    // ── Calculate per-person breakdown ─────────────────────────────────
    const memberMap = new Map(members.map((m) => [m.id, m]))
    const totalPaidMap = new Map<string, number>()
    const totalConsumedMap = new Map<string, number>()

    members.forEach((m) => {
      totalPaidMap.set(m.id, 0)
      totalConsumedMap.set(m.id, 0)
    })

    // From expense splits
    for (const split of splits) {
      const paidAmount = parseFloat(String(split.totalAmount))
      totalPaidMap.set(split.paidByMemberId, (totalPaidMap.get(split.paidByMemberId) ?? 0) + paidAmount)

      const splitPortions = split.splits as Array<{ memberId: string; amount: number; settled: boolean }>
      for (const portion of splitPortions) {
        totalConsumedMap.set(portion.memberId, (totalConsumedMap.get(portion.memberId) ?? 0) + portion.amount)
      }
    }

    // Also calculate from receipt item assignments if no splits cover them
    // This is for receipts that have item-level assignments but not expense splits
    for (const receipt of groupReceipts) {
      if (receipt.paidByMemberId) {
        const receiptTotal = parseFloat(String(receipt.total || '0'))
        // Check if this receipt already has a corresponding split
        const hasSplit = splits.some((s) => s.receiptId === receipt.id)
        if (!hasSplit && receiptTotal > 0) {
          totalPaidMap.set(
            receipt.paidByMemberId,
            (totalPaidMap.get(receipt.paidByMemberId) ?? 0) + receiptTotal
          )

          // Fetch receipt item assignments
          const items = await db
            .select()
            .from(receiptItems)
            .where(eq(receiptItems.receiptId, receipt.id))
          const assignments = await db
            .select()
            .from(receiptItemAssignments)
            .where(eq(receiptItemAssignments.groupId, groupId))

          const receiptItemIds = new Set(items.map((i) => i.id))
          const relevantAssignments = assignments.filter((a) => receiptItemIds.has(a.receiptItemId))

          if (relevantAssignments.length > 0) {
            // Calculate per-item shares
            const itemPriceMap = new Map(items.map((i) => [i.id, parseFloat(String(i.totalPrice || '0'))]))
            for (const a of relevantAssignments) {
              const itemPrice = itemPriceMap.get(a.receiptItemId) ?? 0
              const share = parseFloat(String(a.share || '1'))
              // Count how many members share this item
              const sameItemAssignments = relevantAssignments.filter(
                (ra) => ra.receiptItemId === a.receiptItemId
              )
              const totalShares = sameItemAssignments.reduce(
                (sum, ra) => sum + parseFloat(String(ra.share || '1')),
                0
              )
              const memberShare = (itemPrice * share) / totalShares
              totalConsumedMap.set(a.memberId, (totalConsumedMap.get(a.memberId) ?? 0) + memberShare)
            }
          } else {
            // No assignments — split evenly
            const perPerson = receiptTotal / members.length
            members.forEach((m) => {
              totalConsumedMap.set(m.id, (totalConsumedMap.get(m.id) ?? 0) + perPerson)
            })
          }
        }
      }
    }

    const MEMBER_COLORS = [
      '#6366f1', '#ec4899', '#f59e0b', '#10b981',
      '#3b82f6', '#8b5cf6', '#ef4444', '#14b8a6',
    ]

    const perPersonBreakdown = members.map((m, idx) => {
      const totalPaid = totalPaidMap.get(m.id) ?? 0
      const totalConsumed = totalConsumedMap.get(m.id) ?? 0
      return {
        memberId: m.id,
        name: m.displayName,
        color: m.color || MEMBER_COLORS[idx % MEMBER_COLORS.length],
        totalPaid: Math.round(totalPaid * 100) / 100,
        totalConsumed: Math.round(totalConsumed * 100) / 100,
        netBalance: Math.round((totalPaid - totalConsumed) * 100) / 100,
      }
    })

    // ── Simplified debt resolution ─────────────────────────────────────
    // Minimize number of transfers using greedy algorithm
    const creditors: Array<{ memberId: string; name: string; amount: number }> = []
    const debtors: Array<{ memberId: string; name: string; amount: number }> = []

    for (const person of perPersonBreakdown) {
      if (person.netBalance > 0.01) {
        creditors.push({ memberId: person.memberId, name: person.name, amount: person.netBalance })
      } else if (person.netBalance < -0.01) {
        debtors.push({ memberId: person.memberId, name: person.name, amount: Math.abs(person.netBalance) })
      }
    }

    // Sort descending by amount
    creditors.sort((a, b) => b.amount - a.amount)
    debtors.sort((a, b) => b.amount - a.amount)

    const debts: Array<{
      fromId: string
      fromName: string
      fromColor: string
      toId: string
      toName: string
      toColor: string
      amount: number
    }> = []

    let ci = 0
    let di = 0
    while (ci < creditors.length && di < debtors.length) {
      const settleAmount = Math.min(creditors[ci].amount, debtors[di].amount)
      if (settleAmount > 0.01) {
        const fromMember = perPersonBreakdown.find((p) => p.memberId === debtors[di].memberId)
        const toMember = perPersonBreakdown.find((p) => p.memberId === creditors[ci].memberId)
        debts.push({
          fromId: debtors[di].memberId,
          fromName: debtors[di].name,
          fromColor: fromMember?.color || '#6366f1',
          toId: creditors[ci].memberId,
          toName: creditors[ci].name,
          toColor: toMember?.color || '#10b981',
          amount: Math.round(settleAmount * 100) / 100,
        })
      }
      creditors[ci].amount -= settleAmount
      debtors[di].amount -= settleAmount
      if (creditors[ci].amount < 0.01) ci++
      if (debtors[di].amount < 0.01) di++
    }

    // Total group spend
    const totalGroupSpend = perPersonBreakdown.reduce((sum, p) => sum + p.totalPaid, 0)

    // Check if all payment requests are settled
    const pendingRequests = existingRequests.filter((r) => r.status === 'pending')
    const settledRequests = existingRequests.filter((r) => r.status === 'settled')
    const allSettled = debts.length === 0

    // Format payment requests for response
    const formattedRequests = existingRequests.map((r) => {
      const fromMember = memberMap.get(r.fromMemberId)
      const toMember = memberMap.get(r.toMemberId)
      const fromIdx = members.findIndex((m) => m.id === r.fromMemberId)
      const toIdx = members.findIndex((m) => m.id === r.toMemberId)
      return {
        id: r.id,
        fromMemberId: r.fromMemberId,
        fromName: fromMember?.displayName ?? 'Unknown',
        fromColor: fromMember?.color || MEMBER_COLORS[fromIdx >= 0 ? fromIdx % MEMBER_COLORS.length : 0],
        toMemberId: r.toMemberId,
        toName: toMember?.displayName ?? 'Unknown',
        toColor: toMember?.color || MEMBER_COLORS[toIdx >= 0 ? toIdx % MEMBER_COLORS.length : 0],
        amount: parseFloat(String(r.amount)),
        currency: r.currency,
        status: r.status,
        note: r.note,
        shareToken: r.shareToken,
        bankAccount: r.bankAccount,
        itemBreakdown: r.itemBreakdown,
        settledAt: r.settledAt?.toISOString() ?? null,
        settledBy: r.settledBy,
        createdAt: r.createdAt.toISOString(),
      }
    })

    return NextResponse.json({
      group: {
        id: group.id,
        name: group.name,
        emoji: group.emoji,
        currency: group.currency,
        mode: group.mode,
        startDate: group.startDate,
        endDate: group.endDate,
      },
      perPersonBreakdown,
      debts,
      paymentRequests: formattedRequests,
      stats: {
        totalGroupSpend: Math.round(totalGroupSpend * 100) / 100,
        receiptsCount: groupReceipts.length,
        membersCount: members.length,
        allSettled,
        pendingCount: pendingRequests.length,
        settledCount: settledRequests.length,
        totalPendingAmount: pendingRequests.reduce((sum, r) => sum + parseFloat(String(r.amount)), 0),
        totalSettledAmount: settledRequests.reduce((sum, r) => sum + parseFloat(String(r.amount)), 0),
      },
    })
  } catch (err) {
    console.error('[settlements GET]', err)
    return NextResponse.json({ error: 'Failed to calculate settlements' }, { status: 500 })
  }
}

// ── POST: create a payment request ──────────────────────────────────────────
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { id: groupId } = await params
    const body = await req.json()
    const { fromMemberId, toMemberId, amount, note, bankAccount } = body

    if (!fromMemberId || !toMemberId || !amount) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Verify group access
    const [group] = await db
      .select()
      .from(groups)
      .where(and(eq(groups.id, groupId), eq(groups.createdBy, userId)))
    if (!group) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // Generate share token
    const shareToken = crypto.randomBytes(32).toString('hex')

    // Build item breakdown from receipt assignments
    const members = await db.select().from(groupMembers).where(eq(groupMembers.groupId, groupId))
    const groupReceipts = await db.select().from(receipts).where(eq(receipts.groupId, groupId))
    const allAssignments = await db
      .select()
      .from(receiptItemAssignments)
      .where(eq(receiptItemAssignments.groupId, groupId))

    const breakdown: Array<{
      itemName: string
      store: string
      date: string
      amount: number
      share: number
    }> = []

    for (const receipt of groupReceipts) {
      const items = await db
        .select()
        .from(receiptItems)
        .where(eq(receiptItems.receiptId, receipt.id))

      for (const item of items) {
        const itemAssignments = allAssignments.filter(
          (a) => a.receiptItemId === item.id && a.memberId === fromMemberId
        )
        if (itemAssignments.length > 0) {
          const totalShares = allAssignments
            .filter((a) => a.receiptItemId === item.id)
            .reduce((sum, a) => sum + parseFloat(String(a.share || '1')), 0)
          const memberShare = parseFloat(String(itemAssignments[0].share || '1'))
          const itemPrice = parseFloat(String(item.totalPrice || '0'))
          const shareAmount = (itemPrice * memberShare) / totalShares

          breakdown.push({
            itemName: item.name,
            store: receipt.vendor || '',
            date: receipt.date || '',
            amount: itemPrice,
            share: Math.round(shareAmount * 100) / 100,
          })
        }
      }
    }

    // Create payment request
    const [created] = await db
      .insert(paymentRequests)
      .values({
        groupId,
        fromMemberId,
        toMemberId,
        amount: String(amount),
        currency: group.currency,
        note: note || null,
        bankAccount: bankAccount || null,
        shareToken,
        itemBreakdown: breakdown.length > 0 ? breakdown : null,
        status: 'pending',
      })
      .returning()

    const shareUrl = `${process.env.NEXT_PUBLIC_APP_URL || `https://${process.env.VERCEL_URL}` || 'https://solvio-lac.vercel.app'}/settlement/${created.id}?token=${shareToken}`

    return NextResponse.json({
      paymentRequestId: created.id,
      shareUrl,
      shareToken,
    })
  } catch (err) {
    console.error('[settlements POST]', err)
    return NextResponse.json({ error: 'Failed to create payment request' }, { status: 500 })
  }
}
