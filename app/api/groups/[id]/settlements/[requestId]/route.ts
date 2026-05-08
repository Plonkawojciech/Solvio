import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth-compat'
import { db } from '@/lib/db'
import { groups, groupMembers, paymentRequests } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { recordAudit } from '@/lib/audit-log'
import { z } from 'zod'

// SECURITY (round 2 / A2): bound the PUT body. `action` is an enum, `settledBy`
// is a 1-of-2 string. Without this, an attacker could send arbitrary JSON
// and cause downstream branches to misbehave.
const SettlementActionSchema = z.object({
  action: z.enum(['settle', 'decline']),
  settledBy: z.enum(['creditor', 'debtor']).optional(),
})

const MEMBER_COLORS = [
  '#6366f1', '#ec4899', '#f59e0b', '#10b981',
  '#3b82f6', '#8b5cf6', '#ef4444', '#14b8a6',
]

// ── GET: get single payment request details ─────────────────────────────────
export async function GET(
  _: NextRequest,
  { params }: { params: Promise<{ id: string; requestId: string }> }
) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { id: groupId, requestId } = await params

    // SECURITY (round 2 / A2): allow group MEMBERS access, not just creator.
    // Mirrors the pattern in `/api/groups/[id]` and `/api/groups/[id]/settlements`.
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

    const [request] = await db
      .select()
      .from(paymentRequests)
      .where(and(eq(paymentRequests.id, requestId), eq(paymentRequests.groupId, groupId)))
    if (!request) return NextResponse.json({ error: 'Request not found' }, { status: 404 })

    const members = await db.select().from(groupMembers).where(eq(groupMembers.groupId, groupId))
    const fromMember = members.find((m) => m.id === request.fromMemberId)
    const toMember = members.find((m) => m.id === request.toMemberId)
    const fromIdx = members.findIndex((m) => m.id === request.fromMemberId)
    const toIdx = members.findIndex((m) => m.id === request.toMemberId)

    return NextResponse.json({
      ...request,
      amount: parseFloat(String(request.amount)),
      fromName: fromMember?.displayName ?? 'Unknown',
      fromColor: fromMember?.color || MEMBER_COLORS[fromIdx >= 0 ? fromIdx % MEMBER_COLORS.length : 0],
      toName: toMember?.displayName ?? 'Unknown',
      toColor: toMember?.color || MEMBER_COLORS[toIdx >= 0 ? toIdx % MEMBER_COLORS.length : 0],
      group: {
        id: group.id,
        name: group.name,
        emoji: group.emoji,
        currency: group.currency,
        mode: group.mode,
        startDate: group.startDate,
        endDate: group.endDate,
      },
      settledAt: request.settledAt?.toISOString() ?? null,
      createdAt: request.createdAt.toISOString(),
    })
  } catch (err) {
    console.error('[settlements/:requestId GET]', err)
    return NextResponse.json({ error: 'Failed to fetch request' }, { status: 500 })
  }
}

// ── PUT: update payment request status ──────────────────────────────────────
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; requestId: string }> }
) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { id: groupId, requestId } = await params

    const rawBody = await req.json().catch(() => null)
    if (!rawBody) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

    const parsed = SettlementActionSchema.safeParse(rawBody)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      )
    }
    const { action, settledBy } = parsed.data

    // SECURITY (round 2 / A2): allow group MEMBERS to settle/decline requests,
    // not just the creator. Mirrors the broader members-vs-creator policy.
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

    const [request] = await db
      .select()
      .from(paymentRequests)
      .where(and(eq(paymentRequests.id, requestId), eq(paymentRequests.groupId, groupId)))
    if (!request) return NextResponse.json({ error: 'Request not found' }, { status: 404 })

    if (action === 'settle') {
      await db
        .update(paymentRequests)
        .set({
          status: 'settled',
          settledAt: new Date(),
          settledBy: settledBy || 'creditor',
        })
        .where(eq(paymentRequests.id, requestId))

      void recordAudit({
        userId,
        action: 'payment_request.settle',
        entityType: 'payment_request',
        entityId: requestId,
        payload: { groupId, settledBy: settledBy || 'creditor', channel: 'group_member' },
      })
    } else if (action === 'decline') {
      await db
        .update(paymentRequests)
        .set({ status: 'declined' })
        .where(eq(paymentRequests.id, requestId))

      void recordAudit({
        userId,
        action: 'payment_request.decline',
        entityType: 'payment_request',
        entityId: requestId,
        payload: { groupId },
      })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[settlements/:requestId PUT]', err)
    return NextResponse.json({ error: 'Failed to update request' }, { status: 500 })
  }
}
