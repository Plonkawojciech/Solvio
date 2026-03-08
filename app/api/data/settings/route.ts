import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { db, categories, userSettings, categoryBudgets } from '@/lib/db'
import { eq } from 'drizzle-orm'

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const [cats, settings, budgets] = await Promise.all([
      db.select().from(categories).where(eq(categories.userId, userId)),
      db.select().from(userSettings).where(eq(userSettings.userId, userId)).limit(1),
      db.select().from(categoryBudgets).where(eq(categoryBudgets.userId, userId)),
    ])

    return NextResponse.json({ categories: cats, settings: settings[0] || null, budgets })
  } catch (err) {
    console.error('[settings GET]', err)
    return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { type, data } = body

  try {
    if (type === 'settings') {
      await db.insert(userSettings).values({ userId, ...data })
        .onConflictDoUpdate({ target: userSettings.userId, set: { ...data, updatedAt: new Date() } })
    } else if (type === 'category') {
      await db.insert(categories).values({ userId, ...data })
    } else if (type === 'budget') {
      const { categoryId, amount, period = 'monthly' } = data
      await db.insert(categoryBudgets).values({ userId, categoryId, amount: String(amount), period })
        .onConflictDoUpdate({
          target: [categoryBudgets.userId, categoryBudgets.categoryId, categoryBudgets.period],
          set: { amount: String(amount), updatedAt: new Date() }
        })
    } else {
      return NextResponse.json({ error: `Unknown settings type: ${type}` }, { status: 400 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[settings POST]', err)
    return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 })
  }
}
