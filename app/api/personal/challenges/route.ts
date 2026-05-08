import { auth } from '@/lib/auth-compat'
import { NextResponse } from 'next/server'
import { db, financialChallenges } from '@/lib/db'
import { eq, desc } from 'drizzle-orm'
import { z } from 'zod'

// SECURITY (round 2 / A2): bound POST body. Date regex enforces YYYY-MM-DD
// so the strings can't carry SQL surprises into a date column.
const CreateChallengeSchema = z.object({
  name: z.string().min(1).max(255),
  emoji: z.string().max(10).optional(),
  type: z.string().min(1).max(20),
  targetCategory: z.string().max(100).optional().nullable(),
  targetAmount: z.union([
    z.number().nonnegative().max(9_999_999_999.99),
    z.string().regex(/^\d+(\.\d+)?$/),
  ]).optional().nullable(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const challenges = await db
      .select()
      .from(financialChallenges)
      .where(eq(financialChallenges.userId, userId))
      .orderBy(desc(financialChallenges.createdAt))

    return NextResponse.json({ challenges })
  } catch (err) {
    console.error('[challenges GET]', err)
    return NextResponse.json({ error: 'Failed to fetch challenges' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const rawBody = await request.json().catch(() => null)
  if (!rawBody) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

  const parsed = CreateChallengeSchema.safeParse(rawBody)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid input', details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    )
  }
  const { name, emoji, type, targetCategory, targetAmount, startDate, endDate } = parsed.data

  try {
    const [challenge] = await db
      .insert(financialChallenges)
      .values({
        userId,
        name,
        emoji: emoji || '💪',
        type,
        targetCategory: targetCategory || null,
        targetAmount: targetAmount != null ? String(targetAmount) : null,
        startDate,
        endDate,
      })
      .returning()

    return NextResponse.json({ challenge })
  } catch (err) {
    console.error('[challenges POST]', err)
    return NextResponse.json({ error: 'Failed to create challenge' }, { status: 500 })
  }
}
