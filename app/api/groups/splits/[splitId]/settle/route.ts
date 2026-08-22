import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth-compat'
import { db } from '@/lib/db'
import { expenseSplits, paymentRequests, groupMembers } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { recordAudit } from '@/lib/audit-log'
import { z } from 'zod'
import { dbBatch } from '@/lib/db/batch'

// SECURITY FIX: Zod schema bounds memberId so an attacker cannot send a
// payload that crashes JSON.parse / consumes excessive memory before we
// reach the membership check.
const SettleSplitSchema = z.object({
  memberId: z.string().min(1).max(128),
})

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ splitId: string }> }) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const { splitId } = await params
    const rawBody = await req.json().catch(() => null)
    if (!rawBody) {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }
    const parsed = SettleSplitSchema.safeParse(rawBody)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      )
    }
    const { memberId } = parsed.data
    const [split] = await db.select().from(expenseSplits).where(eq(expenseSplits.id, splitId))
    if (!split) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // SECURITY FIX: Verify user is a member of the group before allowing settle
    const members = await db.select().from(groupMembers).where(eq(groupMembers.groupId, split.groupId))
    const isMember = members.some((m) => m.userId === userId)
    if (!isMember) {
      return NextResponse.json({ error: 'Forbidden — not a member of this group' }, { status: 403 })
    }

    const updatedSplits = (split.splits as Array<{ memberId: string; amount: number; settled: boolean; settledAt?: string }>).map(s =>
      s.memberId === memberId ? { ...s, settled: true, settledAt: new Date().toISOString() } : s
    )

    // SECURITY FIX: Defense-in-depth — add groupId to UPDATE WHERE.
    // Atomicity: the two UPDATEs are conceptually one mutation (mark the
    // split settled AND flip the matching paymentRequests row). Two
    // sequential awaits left a window where a transient Neon failure
    // between them landed the system in an inconsistent state — split
    // marked settled but the payment request still 'pending'. `db.batch`
    // pipelines them into one HTTP RTT and rolls back together on error.
    await dbBatch((x) => [
      x.update(expenseSplits)
        .set({ splits: updatedSplits })
        .where(and(eq(expenseSplits.id, splitId), eq(expenseSplits.groupId, split.groupId))),
      x.update(paymentRequests)
        .set({ status: 'settled', settledAt: new Date() })
        .where(and(eq(paymentRequests.splitId, splitId), eq(paymentRequests.toMemberId, memberId))),
    ])

    // SECURITY (round 2 / A2): audit settle action.
    void recordAudit({
      userId,
      action: 'split.settle',
      entityType: 'expense_split',
      entityId: splitId,
      payload: { groupId: split.groupId, memberId },
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[splits/:splitId/settle PATCH]', err)
    return NextResponse.json({ error: 'Failed to settle' }, { status: 500 })
  }
}
