import { auth } from '@/lib/auth-compat'
import { NextResponse } from 'next/server'
import { db, savingsGoals, savingsDeposits } from '@/lib/db'
import { eq, and, sql } from 'drizzle-orm'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { amount: rawAmount, note } = body
  const amount = typeof rawAmount === 'string' ? parseFloat(rawAmount) : Number(rawAmount)
  if (!amount || isNaN(amount) || amount <= 0) {
    return NextResponse.json({ error: 'Amount must be positive' }, { status: 400 })
  }

  try {
    // Verify the goal belongs to the user
    const [goal] = await db
      .select()
      .from(savingsGoals)
      .where(and(eq(savingsGoals.id, id), eq(savingsGoals.userId, userId)))

    if (!goal) {
      return NextResponse.json({ error: 'Goal not found' }, { status: 404 })
    }

    // Create the deposit
    await db.insert(savingsDeposits).values({
      goalId: id,
      userId,
      amount: String(amount),
      note: note || null,
    })

    // Atomic increment — avoids read-modify-write race between concurrent deposits
    const [updated] = await db
      .update(savingsGoals)
      .set({
        currentAmount: sql`(COALESCE(${savingsGoals.currentAmount}, '0')::numeric + ${String(amount)}::numeric)::text`,
      })
      .where(and(eq(savingsGoals.id, id), eq(savingsGoals.userId, userId)))
      .returning({ currentAmount: savingsGoals.currentAmount })

    const newAmount = parseFloat(updated?.currentAmount || '0')
    const targetAmount = parseFloat(goal.targetAmount || '0')
    const completed = newAmount >= targetAmount

    if (completed && !goal.isCompleted) {
      await db
        .update(savingsGoals)
        .set({ isCompleted: true, completedAt: new Date() })
        .where(and(eq(savingsGoals.id, id), eq(savingsGoals.userId, userId)))
    }

    return NextResponse.json({
      success: true,
      newAmount: newAmount.toFixed(2),
      completed,
    })
  } catch (err) {
    console.error('[deposit POST]', err)
    return NextResponse.json({ error: 'Failed to deposit' }, { status: 500 })
  }
}
