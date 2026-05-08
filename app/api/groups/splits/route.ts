import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth-compat'
import { db } from '@/lib/db'
import { expenseSplits, paymentRequests, groupMembers, expenses, receipts } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { z } from 'zod'

const SplitPortionSchema = z.object({
  memberId: z.string().min(1),
  amount: z.number().nonnegative(),
  settled: z.boolean().optional().default(false),
})

const CreateSplitSchema = z.object({
  groupId: z.string().min(1, 'groupId is required'),
  paidByMemberId: z.string().min(1, 'paidByMemberId is required'),
  totalAmount: z.number().positive('totalAmount must be positive'),
  currency: z.string().length(3).optional().default('PLN'),
  description: z.string().max(500).optional().nullable(),
  splits: z.array(SplitPortionSchema).min(1, 'At least one split portion is required'),
  expenseId: z.string().uuid().optional().nullable(),
  receiptId: z.string().uuid().optional().nullable(),
})

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

  const parsed = CreateSplitSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten().fieldErrors }, { status: 400 })
  }
  const data = parsed.data

  try {
    // SECURITY FIX: Group membership verified before split creation
    // Verify the authenticated user is a member of the target group before inserting.
    const members = await db.select().from(groupMembers).where(eq(groupMembers.groupId, data.groupId))
    const isMember = members.some((m) => m.userId === userId)
    if (!isMember) {
      return NextResponse.json({ error: 'Forbidden — not a member of this group' }, { status: 403 })
    }

    // SECURITY (round 2 / A2): validate every member-id reference belongs
    // to THIS group. Without this, an attacker could insert a split where
    // `paidByMemberId` or any portion `memberId` points at a member of a
    // foreign group — a multi-tenant write that pollutes the cross-group
    // settlement math. This is a strict allow-list check on the group's
    // own member roster.
    const validMemberIds = new Set(members.map((m) => m.id))
    if (!validMemberIds.has(data.paidByMemberId)) {
      return NextResponse.json({ error: 'paidByMemberId not in group' }, { status: 400 })
    }
    for (const portion of data.splits) {
      if (!validMemberIds.has(portion.memberId)) {
        return NextResponse.json({ error: 'split portion memberId not in group' }, { status: 400 })
      }
    }

    // SECURITY (round 2 / A2): if expenseId / receiptId provided, verify
    // they belong to the auth'd user. Otherwise an attacker could attach
    // a foreign expense or receipt to their own group's split (read-back
    // from `/api/groups/[id]/settlements` would then leak foreign data).
    if (data.expenseId) {
      const [exp] = await db
        .select({ id: expenses.id })
        .from(expenses)
        .where(and(eq(expenses.id, data.expenseId), eq(expenses.userId, userId)))
        .limit(1)
      if (!exp) {
        return NextResponse.json({ error: 'expenseId not found' }, { status: 400 })
      }
    }
    if (data.receiptId) {
      const [rec] = await db
        .select({ id: receipts.id })
        .from(receipts)
        .where(and(eq(receipts.id, data.receiptId), eq(receipts.userId, userId)))
        .limit(1)
      if (!rec) {
        return NextResponse.json({ error: 'receiptId not found' }, { status: 400 })
      }
    }

    const [split] = await db.insert(expenseSplits).values({
      groupId: data.groupId,
      paidByMemberId: data.paidByMemberId,
      totalAmount: data.totalAmount.toString(),
      currency: data.currency,
      description: data.description ?? '',
      splits: data.splits,
      expenseId: data.expenseId ?? null,
      receiptId: data.receiptId ?? null,
    }).returning()

    // Create payment requests for non-payer members
    const requests = data.splits
      .filter((s) => s.memberId !== data.paidByMemberId && !s.settled)
      .map((s) => ({
        splitId: split.id,
        fromMemberId: data.paidByMemberId, // who is owed money
        toMemberId: s.memberId,            // who owes
        amount: s.amount.toString(),
        currency: data.currency,
      }))

    if (requests.length > 0) {
      await db.insert(paymentRequests).values(requests)
    }

    return NextResponse.json(split)
  } catch (err) {
    console.error('[splits POST]', err)
    return NextResponse.json({ error: 'Failed to create split' }, { status: 500 })
  }
}
