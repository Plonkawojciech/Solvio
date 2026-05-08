import { auth } from '@/lib/auth-compat'
import { NextResponse } from 'next/server'
import { db, savingsGoals, savingsDeposits } from '@/lib/db'
import { eq, and, sql } from 'drizzle-orm'
import { z } from 'zod'

// SECURITY (round 2 / A2): bound the deposit body. Money max is the
// decimal(14,2) ceiling.
const DepositSchema = z.object({
  amount: z.union([
    z.number().positive().max(99_999_999_999.99),
    z.string().regex(/^\d+(\.\d{1,2})?$/).transform(Number),
  ]),
  note: z.string().max(500).optional().nullable(),
}).strict()

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const rawBody = await request.json().catch(() => null)
  if (!rawBody) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

  const parsed = DepositSchema.safeParse(rawBody)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid input', details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    )
  }
  const { amount, note } = parsed.data

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
