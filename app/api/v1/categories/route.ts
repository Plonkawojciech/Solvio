import { NextResponse } from 'next/server'
import { asc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { requireApiUser } from '@/lib/api-auth'
import { db } from '@/lib/db'
import { categories } from '@/lib/db/schema'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const auth = await requireApiUser(req)
  if (auth instanceof NextResponse) return auth

  const rows = await db.select().from(categories)
    .where(eq(categories.userId, auth.userId))
    .orderBy(asc(categories.name))

  return NextResponse.json({
    categories: rows.map((c) => ({
      id: c.id,
      name: c.name,
      // `icon` trzyma nazwę ikony lucide (np. "shopping-cart"), nie emoji —
      // klient natywny musi to zmapować na własny zestaw, inaczej pokaże słowo.
      icon: c.icon,
      color: c.color,
      isDefault: c.isDefault,
    })),
  })
}

const createSchema = z.object({
  name: z.string().trim().min(1, 'Podaj nazwę').max(100),
  icon: z.string().max(50).nullable().optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Kolor musi być w formacie #rrggbb').nullable().optional(),
})

export async function POST(req: Request) {
  const auth = await requireApiUser(req)
  if (auth instanceof NextResponse) return auth

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Nieprawidłowe żądanie' }, { status: 400 })
  }
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Nieprawidłowe dane' }, { status: 400 })
  }

  const [row] = await db.insert(categories).values({
    userId: auth.userId,
    name: parsed.data.name,
    icon: parsed.data.icon ?? null,
    color: parsed.data.color ?? null,
  }).returning()

  return NextResponse.json({
    category: { id: row.id, name: row.name, icon: row.icon, color: row.color, isDefault: row.isDefault },
  }, { status: 201 })
}
