import { auth } from '@/lib/auth-compat'
import { NextResponse } from 'next/server'
import { db, merchantRules } from '@/lib/db'
import { eq, desc, and, sql } from 'drizzle-orm'
import { z } from 'zod'

const UpsertRuleSchema = z.object({
  vendor: z.string().min(1).max(255).trim(),
  categoryId: z.string().uuid(),
})

// GET — return all merchant rules for the user (ordered by count desc, top 50)
export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const rules = await db
      .select()
      .from(merchantRules)
      .where(eq(merchantRules.userId, userId))
      .orderBy(desc(merchantRules.count))
      .limit(50)

    return NextResponse.json({ rules })
  } catch (err) {
    console.error('[merchant-rules GET]', err)
    return NextResponse.json({ error: 'Failed to fetch merchant rules' }, { status: 500 })
  }
}

// POST — upsert a rule (insert or increment count + update categoryId)
export async function POST(request: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

  const parsed = UpsertRuleSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten().fieldErrors }, { status: 400 })
  }

  const { vendor, categoryId } = parsed.data
  const vendorNormalized = vendor.trim().toLowerCase()

  try {
    await db
      .insert(merchantRules)
      .values({
        userId,
        vendor: vendorNormalized,
        categoryId,
        count: 1,
      })
      .onConflictDoUpdate({
        target: [merchantRules.userId, merchantRules.vendor],
        set: {
          categoryId,
          count: sql`${merchantRules.count} + 1`,
          updatedAt: new Date(),
        },
      })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[merchant-rules POST]', err)
    return NextResponse.json({ error: 'Failed to upsert merchant rule' }, { status: 500 })
  }
}

// DELETE — remove a specific rule by vendor name
export async function DELETE(request: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null)
  if (!body?.vendor) return NextResponse.json({ error: 'vendor is required' }, { status: 400 })

  try {
    const vendorNormalized = String(body.vendor).trim().toLowerCase()
    await db
      .delete(merchantRules)
      .where(and(eq(merchantRules.userId, userId), eq(merchantRules.vendor, vendorNormalized)))

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[merchant-rules DELETE]', err)
    return NextResponse.json({ error: 'Failed to delete merchant rule' }, { status: 500 })
  }
}
