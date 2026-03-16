import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth-compat'
import { db } from '@/lib/db'
import { groups, groupMembers, paymentRequests } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'

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

    // Verify group access
    const [group] = await db
      .select()
      .from(groups)
      .where(and(eq(groups.id, groupId), eq(groups.createdBy, userId)))
    if (!group) return NextResponse.json({ error: 'Not found' }, { status: 404 })

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
    const body = await req.json()
    const { action, settledBy } = body // action: 'settle' | 'decline'

    // Verify group access
    const [group] = await db
      .select()
      .from(groups)
      .where(and(eq(groups.id, groupId), eq(groups.createdBy, userId)))
    if (!group) return NextResponse.json({ error: 'Not found' }, { status: 404 })

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
    } else if (action === 'decline') {
      await db
        .update(paymentRequests)
        .set({ status: 'declined' })
        .where(eq(paymentRequests.id, requestId))
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[settlements/:requestId PUT]', err)
    return NextResponse.json({ error: 'Failed to update request' }, { status: 500 })
  }
}
