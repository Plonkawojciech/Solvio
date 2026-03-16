import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth-compat'
import { db } from '@/lib/db'
import { groups, groupMembers, expenseSplits } from '@/lib/db/schema'
import { eq, inArray } from 'drizzle-orm'

function normalizeMember(m: { id: string; displayName: string; email?: string | null; [key: string]: unknown }) {
  return { ...m, name: m.displayName }
}

/** Compute unsettled net balance across all splits for a group */
function computeTotalBalance(
  memberIds: string[],
  splits: Array<{
    paidByMemberId: string
    splits: Array<{ memberId: string; amount: number; settled: boolean }> | unknown
  }>
): number {
  let total = 0
  for (const split of splits) {
    const portions = Array.isArray(split.splits) ? split.splits : []
    for (const portion of portions as Array<{ memberId: string; amount: number; settled: boolean }>) {
      if (portion.memberId === split.paidByMemberId) continue
      if (!portion.settled) {
        if (memberIds.includes(split.paidByMemberId)) total += portion.amount
        if (memberIds.includes(portion.memberId)) total -= portion.amount
      }
    }
  }
  return total
}

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    // Get groups where user is creator OR member
    const userGroups = await db.select().from(groups).where(eq(groups.createdBy, userId))

    if (userGroups.length === 0) return NextResponse.json([])

    const groupIds = userGroups.map((g) => g.id)

    // Batch-fetch all members and splits in 2 queries instead of 2N
    const [allMembers, allSplits] = await Promise.all([
      db.select().from(groupMembers).where(inArray(groupMembers.groupId, groupIds)),
      db.select().from(expenseSplits).where(inArray(expenseSplits.groupId, groupIds)),
    ])

    // Index by groupId for O(1) lookup
    const membersByGroup = new Map<string, typeof allMembers>()
    for (const m of allMembers) {
      const arr = membersByGroup.get(m.groupId) || []
      arr.push(m)
      membersByGroup.set(m.groupId, arr)
    }
    const splitsByGroup = new Map<string, typeof allSplits>()
    for (const s of allSplits) {
      const arr = splitsByGroup.get(s.groupId) || []
      arr.push(s)
      splitsByGroup.set(s.groupId, arr)
    }

    const result = userGroups.map((group) => {
      const members = membersByGroup.get(group.id) || []
      const rawSplits = splitsByGroup.get(group.id) || []
      const memberIds = members.map((m) => m.id)
      const totalBalance = computeTotalBalance(memberIds, rawSplits)
      return { ...group, members: members.map(normalizeMember), totalBalance }
    })

    return NextResponse.json(result)
  } catch (err) {
    console.error('[groups GET]', err)
    return NextResponse.json({ error: 'Failed to fetch groups' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await req.json()
    const { name, description, currency, emoji, members, mode, startDate, endDate } = body

    const [group] = await db.insert(groups).values({
      name,
      description,
      currency: currency || 'PLN',
      emoji: emoji || '👥',
      mode: mode || 'default',
      startDate: startDate || null,
      endDate: endDate || null,
      createdBy: userId,
    }).returning()

    // Add creator as first member
    if (members?.length) {
      await db.insert(groupMembers).values(
        members.map((m: { name?: string; displayName?: string; email?: string; userId?: string; color?: string }) => ({
          groupId: group.id,
          displayName: m.displayName || m.name || '',
          email: m.email || null,
          userId: m.userId || null,
          color: m.color || '#6366f1',
        }))
      )
    }

    const allMembers = await db.select().from(groupMembers).where(eq(groupMembers.groupId, group.id))
    return NextResponse.json({ ...group, members: allMembers.map(normalizeMember) })
  } catch (err) {
    console.error('[groups POST]', err)
    return NextResponse.json({ error: 'Failed to create group' }, { status: 500 })
  }
}
