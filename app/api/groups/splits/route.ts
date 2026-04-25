import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth-compat'
import { db } from '@/lib/db'
import { expenseSplits, paymentRequests, groupMembers } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
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
