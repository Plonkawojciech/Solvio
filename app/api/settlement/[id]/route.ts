import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth-compat'
import { db } from '@/lib/db'
import { paymentRequests, groupMembers, groups } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import crypto from 'crypto'

// SECURITY FIX: Timing-safe token comparison to prevent timing attacks on share tokens
function timingSafeTokenCompare(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return crypto.timingSafeEqual(bufA, bufB)
}

const MEMBER_COLORS = [
  '#6366f1', '#ec4899', '#f59e0b', '#10b981',
  '#3b82f6', '#8b5cf6', '#ef4444', '#14b8a6',
]

// ── GET: public endpoint for viewing a settlement ───────────────────────────
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const token = req.nextUrl.searchParams.get('token')

    const [request] = await db
      .select()
      .from(paymentRequests)
      .where(eq(paymentRequests.id, id))
    if (!request) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // SECURITY FIX: Require shareToken for public access, or auth+membership when no shareToken
    if (request.shareToken) {
      // SECURITY FIX: Use timing-safe comparison to prevent timing attacks on share token
      if (!timingSafeTokenCompare(token, request.shareToken)) {
        return NextResponse.json({ error: 'Invalid token' }, { status: 403 })
      }
    } else {
      // No shareToken: require authenticated session + group membership
      const { userId } = await auth()
      if (!userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      if (request.groupId) {
        const memberCheck = await db
          .select()
          .from(groupMembers)
          .where(eq(groupMembers.groupId, request.groupId))
        const isMember = memberCheck.some((m) => m.userId === userId)
        if (!isMember) {
          return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }
      } else {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    }

    // Fetch group and member info
    let group = null
    let members: Array<typeof groupMembers.$inferSelect> = []
    if (request.groupId) {
      const [g] = await db.select().from(groups).where(eq(groups.id, request.groupId))
      group = g || null
      members = await db.select().from(groupMembers).where(eq(groupMembers.groupId, request.groupId))
    }

    const fromMember = members.find((m) => m.id === request.fromMemberId)
    const toMember = members.find((m) => m.id === request.toMemberId)
    const fromIdx = members.findIndex((m) => m.id === request.fromMemberId)
    const toIdx = members.findIndex((m) => m.id === request.toMemberId)

    return NextResponse.json({
      id: request.id,
      fromMemberId: request.fromMemberId,
      fromName: fromMember?.displayName ?? 'Unknown',
      fromColor: fromMember?.color || MEMBER_COLORS[fromIdx >= 0 ? fromIdx % MEMBER_COLORS.length : 0],
      toMemberId: request.toMemberId,
      toName: toMember?.displayName ?? 'Unknown',
      toColor: toMember?.color || MEMBER_COLORS[toIdx >= 0 ? toIdx % MEMBER_COLORS.length : 0],
      amount: parseFloat(String(request.amount)),
      currency: request.currency,
      status: request.status,
      note: request.note,
      bankAccount: request.bankAccount,
      itemBreakdown: request.itemBreakdown,
      settledAt: request.settledAt?.toISOString() ?? null,
      settledBy: request.settledBy,
      createdAt: request.createdAt.toISOString(),
      group: group
        ? {
            name: group.name,
            emoji: group.emoji,
            currency: group.currency,
            mode: group.mode,
            startDate: group.startDate,
            endDate: group.endDate,
          }
        : null,
    })
  } catch (err) {
    console.error('[public settlement GET]', err)
    return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 })
  }
}

// ── PUT: settle a payment request ────────────────────────────────────────────
// SECURITY FIX: Require either a valid shareToken OR authenticated group membership.
// Without this check, any request could settle any payment request that has no shareToken.
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await req.json()
    const { token, action } = body

    const [request] = await db
      .select()
      .from(paymentRequests)
      .where(eq(paymentRequests.id, id))
    if (!request) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // SECURITY FIX: No auth check — require shareToken OR authenticated group membership
    if (request.shareToken) {
      // SECURITY FIX: Use timing-safe comparison to prevent timing attacks on share token
      if (!timingSafeTokenCompare(token, request.shareToken)) {
        return NextResponse.json({ error: 'Invalid token' }, { status: 403 })
      }
    } else {
      // No shareToken: require authenticated session + group membership
      const { userId } = await auth()
      if (!userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      if (request.groupId) {
        const members = await db
          .select()
          .from(groupMembers)
          .where(eq(groupMembers.groupId, request.groupId))
        const isMember = members.some((m) => m.userId === userId)
        if (!isMember) {
          return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }
      } else {
        // No group and no shareToken — deny all unauthenticated access
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    }

    if (action === 'settle') {
      if (request.status === 'settled') {
        return NextResponse.json({ ok: true, alreadySettled: true })
      }
      await db
        .update(paymentRequests)
        .set({
          status: 'settled',
          settledAt: new Date(),
          settledBy: 'debtor',
        })
        .where(and(eq(paymentRequests.id, id), eq(paymentRequests.status, 'pending')))
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[public settlement PUT]', err)
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 })
  }
}
