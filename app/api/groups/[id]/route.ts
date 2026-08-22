import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth-compat'
import { db } from '@/lib/db'
import { groups, groupMembers, expenseSplits } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { recordAudit } from '@/lib/audit-log'
import { z } from 'zod'
import { dbBatch } from '@/lib/db/batch'

function normalizeMember(m: { id: string; displayName: string; email?: string | null; [key: string]: unknown }) {
  return { ...m, name: m.displayName }
}

/** Compute unsettled net balance across all splits for a group — must
 *  match the identical function in `/api/groups/route.ts` (list endpoint). */
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

const UpdateGroupSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100).optional(),
  description: z.string().max(500).optional().nullable(),
  currency: z.string().length(3).optional(),
  emoji: z.string().max(10).optional(),
  mode: z.string().max(50).optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
})

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const { id } = await params
    const [group] = await db.select().from(groups).where(eq(groups.id, id))
    if (!group) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // Allow access to creator OR group member
    if (group.createdBy !== userId) {
      const [membership] = await db
        .select({ id: groupMembers.id })
        .from(groupMembers)
        .where(and(eq(groupMembers.groupId, id), eq(groupMembers.userId, userId)))
        .limit(1)
      if (!membership) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    // Round-4 perf: 2 parallel selects → 1 pipelined `db.batch` HTTP RTT.
    // Members + splits are independent reads inside one transaction snapshot —
    // halving HTTP overhead on every group detail load.
    const [members, splits] = await dbBatch((x) => [
      x.select().from(groupMembers).where(eq(groupMembers.groupId, id)),
      x.select().from(expenseSplits).where(eq(expenseSplits.groupId, id)),
    ], { atomic: false })
    const memberIds = members.map((m) => m.id)
    const totalBalance = computeTotalBalance(memberIds, splits)
    return NextResponse.json({ ...group, members: members.map(normalizeMember), splits, totalBalance })
  } catch (err) {
    console.error('[groups/:id GET]', err)
    return NextResponse.json({ error: 'Failed to fetch group' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

  const parsed = UpdateGroupSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten().fieldErrors }, { status: 400 })
  }
  const data = parsed.data

  try {
    const { id } = await params
    await db.update(groups)
      .set(data)
      .where(and(eq(groups.id, id), eq(groups.createdBy, userId)))

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[groups/:id PUT]', err)
    return NextResponse.json({ error: 'Failed to update group' }, { status: 500 })
  }
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const { id } = await params
    // Snapshot a few attributes BEFORE delete for the audit trail.
    // After the DELETE the row is gone and we'd lose attribution of
    // who owned the group / what its name was.
    const [snapshot] = await db
      .select({ name: groups.name, createdBy: groups.createdBy, mode: groups.mode })
      .from(groups)
      .where(and(eq(groups.id, id), eq(groups.createdBy, userId)))
      .limit(1)

    const result = await db
      .delete(groups)
      .where(and(eq(groups.id, id), eq(groups.createdBy, userId)))
      .returning({ id: groups.id })

    // SECURITY (round 2 / A2): only audit when the DELETE actually hit.
    // If `result.length === 0` the group either didn't exist or didn't
    // belong to the user — no row was removed, no audit needed.
    if (result.length > 0 && snapshot) {
      void recordAudit({
        userId,
        action: 'group.delete',
        entityType: 'group',
        entityId: id,
        payload: { name: snapshot.name, mode: snapshot.mode },
      })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[groups/:id DELETE]', err)
    return NextResponse.json({ error: 'Failed to delete group' }, { status: 500 })
  }
}
