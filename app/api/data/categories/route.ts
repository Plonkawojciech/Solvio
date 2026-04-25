import { auth } from '@/lib/auth-compat'
import { NextResponse } from 'next/server'
import { db, categories } from '@/lib/db'
import { eq, and } from 'drizzle-orm'
import { z } from 'zod'

const CreateCategorySchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  icon: z.string().max(10).optional().nullable(),
})

const UpdateCategorySchema = z.object({
  id: z.string().uuid('id must be a valid UUID'),
  name: z.string().min(1, 'Name cannot be empty').max(100),
  icon: z.string().max(10).optional().nullable(),
})

const DeleteCategorySchema = z.object({
  id: z.string().uuid('id must be a valid UUID'),
})

export async function POST(request: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })

  const parsed = CreateCategorySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten().fieldErrors }, { status: 400 })
  }
  const data = parsed.data

  try {
    const [cat] = await db.insert(categories).values({ userId, name: data.name.trim(), icon: data.icon ?? null }).returning()
    return NextResponse.json(cat)
  } catch (err) {
    console.error('[categories POST]', err)
    return NextResponse.json({ error: 'Failed to create category' }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })

  const parsed = UpdateCategorySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten().fieldErrors }, { status: 400 })
  }
  const data = parsed.data

  try {
    await db.update(categories)
      .set({ name: data.name, ...(data.icon !== undefined ? { icon: data.icon } : {}) })
      .where(and(eq(categories.id, data.id), eq(categories.userId, userId)))

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[categories PUT]', err)
    return NextResponse.json({ error: 'Failed to update category' }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })

  const parsed = DeleteCategorySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten().fieldErrors }, { status: 400 })
  }
  const { id } = parsed.data

  try {
    await db.delete(categories).where(and(eq(categories.id, id), eq(categories.userId, userId)))
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[categories DELETE]', err)
    return NextResponse.json({ error: 'Failed to delete category' }, { status: 500 })
  }
}
