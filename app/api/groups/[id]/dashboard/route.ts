import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth-compat'
import { db } from '@/lib/db'
import {
  groups,
  groupMembers,
  receipts,
  expenseSplits,
} from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { id } = await params

    // Verify group access: creator OR member
    const [group] = await db
      .select()
      .from(groups)
      .where(eq(groups.id, id))
    if (!group) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    if (group.createdBy !== userId) {
      const [membership] = await db
        .select({ id: groupMembers.id })
        .from(groupMembers)
        .where(and(eq(groupMembers.groupId, id), eq(groupMembers.userId, userId)))
        .limit(1)
      if (!membership) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const members = await db.select().from(groupMembers).where(eq(groupMembers.groupId, id))

    // Get all receipts for this group (exclude rawOcr — not needed for dashboard)
    const groupReceipts = await db
      .select({
        id: receipts.id,
        vendor: receipts.vendor,
        date: receipts.date,
        total: receipts.total,
        imageUrl: receipts.imageUrl,
        items: receipts.items,
        paidByMemberId: receipts.paidByMemberId,
        createdAt: receipts.createdAt,
      })
      .from(receipts)
      .where(and(eq(receipts.groupId, id), eq(receipts.status, 'processed')))

    // Get all expense splits
    const splits = await db
      .select()
      .from(expenseSplits)
      .where(eq(expenseSplits.groupId, id))

    // Compute total group spend from receipts
    let totalGroupSpend = 0
    const dailySpending: Record<string, number> = {}
    const perMemberSpend: Record<string, number> = {} // memberId -> amount paid

    members.forEach((m) => {
      perMemberSpend[m.id] = 0
    })

    for (const receipt of groupReceipts) {
      const amount = parseFloat(receipt.total || '0')
      totalGroupSpend += amount

      // Daily breakdown
      const dateKey = receipt.date || 'unknown'
      dailySpending[dateKey] = (dailySpending[dateKey] || 0) + amount

      // Per member who paid
      if (receipt.paidByMemberId && perMemberSpend[receipt.paidByMemberId] !== undefined) {
        perMemberSpend[receipt.paidByMemberId] += amount
      }
    }

    // Also add from expense splits
    for (const split of splits) {
      const splitAmount = parseFloat(String(split.totalAmount) || '0')
      if (split.paidByMemberId && perMemberSpend[split.paidByMemberId] !== undefined) {
        perMemberSpend[split.paidByMemberId] += splitAmount
      }
      // Only add to totalGroupSpend if not already from a receipt
      if (!split.receiptId) {
        totalGroupSpend += splitAmount
      }
    }

    // Category breakdown from receipt items
    const categoryBreakdown: Record<string, number> = {}
    for (const receipt of groupReceipts) {
      if (receipt.items && Array.isArray(receipt.items)) {
        for (const item of receipt.items as Array<{ name: string; price?: number; category_id?: string }>) {
          const cat = item.category_id || 'other'
          categoryBreakdown[cat] = (categoryBreakdown[cat] || 0) + (item.price || 0)
        }
      }
    }

    // Compute balances (who owes whom)
    const balances = new Map<string, number>()
    members.forEach((m) => balances.set(m.id, 0))

    for (const split of splits) {
      const portions = Array.isArray(split.splits) ? split.splits : []
      for (const portion of portions as Array<{ memberId: string; amount: number; settled: boolean }>) {
        if (portion.memberId === split.paidByMemberId) continue
        if (!portion.settled) {
          balances.set(
            split.paidByMemberId,
            (balances.get(split.paidByMemberId) ?? 0) + portion.amount
          )
          balances.set(
            portion.memberId,
            (balances.get(portion.memberId) ?? 0) - portion.amount
          )
        }
      }
    }

    // Simplify debts
    const owes: Array<{ fromId: string; fromName: string; toId: string; toName: string; amount: number }> = []
    const debtors = members
      .map((m) => ({ id: m.id, name: m.displayName, balance: balances.get(m.id) ?? 0 }))
      .filter((m) => Math.abs(m.balance) > 0.01)

    const neg = debtors.filter((d) => d.balance < 0).sort((a, b) => a.balance - b.balance)
    const pos = debtors.filter((d) => d.balance > 0).sort((a, b) => b.balance - a.balance)

    let i = 0
    let j = 0
    while (i < neg.length && j < pos.length) {
      const amount = Math.min(Math.abs(neg[i].balance), pos[j].balance)
      if (amount > 0.01) {
        owes.push({
          fromId: neg[i].id,
          fromName: neg[i].name,
          toId: pos[j].id,
          toName: pos[j].name,
          amount: parseFloat(amount.toFixed(2)),
        })
      }
      neg[i].balance += amount
      pos[j].balance -= amount
      if (Math.abs(neg[i].balance) < 0.01) i++
      if (pos[j].balance < 0.01) j++
    }

    // Days of trip
    let daysOfTrip = 0
    if (group.mode === 'trip' && group.startDate && group.endDate) {
      const start = new Date(group.startDate)
      const end = new Date(group.endDate)
      daysOfTrip = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1)
    }

    // Daily spending sorted
    const dailySpendingArray = Object.entries(dailySpending)
      .map(([date, amount]) => ({ date, amount: parseFloat(amount.toFixed(2)) }))
      .sort((a, b) => a.date.localeCompare(b.date))

    // Per member spending
    const perMemberSpendArray = members.map((m) => ({
      memberId: m.id,
      memberName: m.displayName,
      color: m.color || '#6366f1',
      amount: parseFloat((perMemberSpend[m.id] || 0).toFixed(2)),
    }))

    // Recent receipts (last 5)
    const recentReceipts = groupReceipts
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 5)
      .map((r) => ({
        id: r.id,
        vendor: r.vendor,
        date: r.date,
        total: r.total,
        imageUrl: r.imageUrl,
        paidByMemberId: r.paidByMemberId,
      }))

    return NextResponse.json({
      group: {
        id: group.id,
        name: group.name,
        emoji: group.emoji,
        mode: group.mode,
        currency: group.currency,
        startDate: group.startDate,
        endDate: group.endDate,
      },
      members: members.map((m) => ({
        id: m.id,
        name: m.displayName,
        email: m.email,
        color: m.color,
      })),
      kpis: {
        totalGroupSpend: parseFloat(totalGroupSpend.toFixed(2)),
        perPersonAvg: members.length > 0 ? parseFloat((totalGroupSpend / members.length).toFixed(2)) : 0,
        daysOfTrip,
        receiptsScanned: groupReceipts.length,
      },
      perMemberSpend: perMemberSpendArray,
      dailySpending: dailySpendingArray,
      categoryBreakdown,
      balanceSummary: owes,
      recentReceipts,
    })
  } catch (err) {
    console.error('[group dashboard GET]', err)
    return NextResponse.json({ error: 'Failed to fetch dashboard' }, { status: 500 })
  }
}
