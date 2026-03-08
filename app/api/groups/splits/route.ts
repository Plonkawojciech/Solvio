import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth-compat'
import { db } from '@/lib/db'
import { expenseSplits, paymentRequests } from '@/lib/db/schema'

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const body = await req.json()
    const { groupId, paidByMemberId, totalAmount, currency, description, splits, expenseId, receiptId } = body

    const [split] = await db.insert(expenseSplits).values({
      groupId,
      paidByMemberId,
      totalAmount,
      currency: currency || 'PLN',
      description,
      splits,
      expenseId: expenseId || null,
      receiptId: receiptId || null,
    }).returning()

    // Create payment requests for non-payer members
    const requests = (splits as Array<{ memberId: string; amount: number; settled: boolean }>)
      .filter((s) => s.memberId !== paidByMemberId && !s.settled)
      .map((s) => ({
        splitId: split.id,
        fromMemberId: paidByMemberId, // who is owed money
        toMemberId: s.memberId,       // who owes
        amount: s.amount.toString(),
        currency: currency || 'PLN',
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
