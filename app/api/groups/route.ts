import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { auth } from '@/lib/auth-compat'
import { db } from '@/lib/db'
import { groups, groupMembers, expenseSplits } from '@/lib/db/schema'
import { eq, inArray, or } from 'drizzle-orm'
import { z } from 'zod'

const GroupMemberInputSchema = z.object({
  displayName: z.string().max(100).optional(),
  name: z.string().max(100).optional(),
  email: z.string().email().optional().nullable(),
  userId: z.string().optional().nullable(),
  color: z.string().max(20).optional(),
})

const CreateGroupSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  description: z.string().max(500).optional().nullable(),
  currency: z.string().length(3).optional().default('PLN'),
  emoji: z.string().max(10).optional().default('👥'),
  mode: z.string().max(50).optional().default('default'),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  members: z.array(GroupMemberInputSchema).optional(),
})

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
    // Get all groupIds where user is a member
    const memberOf = await db.select({ groupId: groupMembers.groupId })
      .from(groupMembers).where(eq(groupMembers.userId, userId))
    const memberGroupIds = memberOf.map(m => m.groupId)

    // Get groups where user is creator OR member
    const userGroups = await db.select().from(groups).where(
      memberGroupIds.length > 0
        ? or(eq(groups.createdBy, userId), inArray(groups.id, memberGroupIds))
        : eq(groups.createdBy, userId)
    )

    if (userGroups.length === 0) return NextResponse.json([])

    const groupIds = userGroups.map((g) => g.id)

    // Round-4 perf: 2 parallel selects → 1 pipelined `db.batch` HTTP RTT
    // (was already 2 queries instead of 2N — now also 1 RTT instead of 2).
    const [allMembers, allSplits] = await db.batch([
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

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

  const parsed = CreateGroupSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten().fieldErrors }, { status: 400 })
  }
  const data = parsed.data

  try {
    // SECURITY (round 3 / A2): defensively ensure the group's creator is
    // ALWAYS in `groupMembers`, even when the client (e.g. a non-iOS
    // client or a future API consumer) doesn't include themselves in the
    // members payload.
    //
    // Previously this handler relied entirely on the iOS client sending
    // `members: [{userId: caller, ...}]` — the moment a different client
    // forgets, you get a group whose creator can't see their own group
    // (since `GET /api/groups` joins via `groupMembers.userId = caller`),
    // and the audit-log breadcrumbs for the implicit "creator joined"
    // event go missing. Defensive merge fixes both at once.
    //
    // Atomicity: the receipts route already uses `db.batch([...])` because
    // Neon-HTTP doesn't support `db.transaction(...)`. We do the same here
    // — group + member-rows commit together or roll back together.
    const clientMembers = data.members ?? []
    const callerHasOwnRow = clientMembers.some((m) => m.userId === userId)

    // Generate the group id client-side so the second insert can reference
    // it inside the same `db.batch([...])` call (the batch runs server-side
    // as one transaction, so neither statement sees a partial result if
    // the other fails).
    const newGroupId = crypto.randomUUID()

    const memberRows: Array<{
      groupId: string
      displayName: string
      email: string | null
      userId: string | null
      color: string
    }> = []

    // Always insert the creator first (defense-in-depth: even if
    // `clientMembers` is empty or omits the caller, the creator row is
    // guaranteed). When the caller IS in the payload we honour their
    // displayName/email/color, otherwise we use safe defaults.
    if (!callerHasOwnRow) {
      memberRows.push({
        groupId: newGroupId,
        displayName: 'You',
        email: null,
        userId,
        color: '#6366f1',
      })
    }

    for (const m of clientMembers) {
      memberRows.push({
        groupId: newGroupId,
        displayName: m.displayName || m.name || '',
        email: m.email ?? null,
        userId: m.userId ?? null,
        color: m.color || '#6366f1',
      })
    }

    // Build the batch. We always include the group insert; the member
    // insert is only added when there's at least one row (no empty
    // INSERTs).
    const groupInsert = db.insert(groups).values({
      id: newGroupId,
      name: data.name,
      description: data.description ?? null,
      currency: data.currency,
      emoji: data.emoji,
      mode: data.mode,
      startDate: data.startDate ?? null,
      endDate: data.endDate ?? null,
      createdBy: userId,
    }).returning()

    if (memberRows.length > 0) {
      // Drizzle/neon-http `db.batch([...])` requires a tuple of statements
      // whose return types it can infer. We discard the inserted-member
      // rows and re-fetch via the SELECT below for the response shape.
      await db.batch([
        groupInsert,
        db.insert(groupMembers).values(memberRows),
      ])
    } else {
      await db.batch([groupInsert])
    }

    // Re-read what we just wrote, scoped by the freshly-minted id.
    const [group] = await db.select().from(groups).where(eq(groups.id, newGroupId))
    if (!group) {
      // Should be unreachable — batch would have thrown — but treat as a
      // 500 rather than crash on the destructure below.
      return NextResponse.json({ error: 'Failed to create group' }, { status: 500 })
    }
    const allMembers = await db.select().from(groupMembers).where(eq(groupMembers.groupId, group.id))
    return NextResponse.json({ ...group, members: allMembers.map(normalizeMember) })
  } catch (err) {
    console.error('[groups POST]', err)
    return NextResponse.json({ error: 'Failed to create group' }, { status: 500 })
  }
}
