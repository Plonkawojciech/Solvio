import { auth } from '@/lib/auth-compat'
import { NextResponse } from 'next/server'
import { db, financialChallenges } from '@/lib/db'
import { eq, desc } from 'drizzle-orm'

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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { name, emoji, type, targetCategory, targetAmount, startDate, endDate } = body

  if (!name || !type || !startDate || !endDate) {
    return NextResponse.json({ error: 'Name, type, start date and end date are required' }, { status: 400 })
  }

  try {
    const [challenge] = await db
      .insert(financialChallenges)
      .values({
        userId,
        name,
        emoji: emoji || '💪',
        type,
        targetCategory: targetCategory || null,
        targetAmount: targetAmount ? String(targetAmount) : null,
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
