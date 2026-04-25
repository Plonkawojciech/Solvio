import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth-compat'
import { db } from '@/lib/db'
import { expenseSplits, paymentRequests, groupMembers } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ splitId: string }> }) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const { splitId } = await params
    const { memberId } = await req.json()
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

    // SECURITY FIX: Defense-in-depth — add groupId to UPDATE WHERE
    await db.update(expenseSplits).set({ splits: updatedSplits }).where(and(eq(expenseSplits.id, splitId), eq(expenseSplits.groupId, split.groupId)))
    await db.update(paymentRequests)
      .set({ status: 'settled', settledAt: new Date() })
      .where(and(eq(paymentRequests.splitId, splitId), eq(paymentRequests.toMemberId, memberId)))

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[splits/:splitId/settle PATCH]', err)
    return NextResponse.json({ error: 'Failed to settle' }, { status: 500 })
  }
}
