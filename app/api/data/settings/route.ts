import { auth } from '@/lib/auth-compat'
import { NextResponse } from 'next/server'
import { db, categories, userSettings, categoryBudgets } from '@/lib/db'
import { eq, and } from 'drizzle-orm'
import { z } from 'zod'

const UserSettingsDataSchema = z.object({
  currency: z.string().length(3).optional(),
  language: z.enum(['pl', 'en']).optional(),
  productType: z.enum(['personal', 'business']).optional(),
  monthlyBudget: z.number().positive().optional().nullable(),
  notificationsEnabled: z.boolean().optional(),
  timezone: z.string().max(50).optional(),
})

const CategoryDataSchema = z.object({
  name: z.string().min(1).max(100),
  icon: z.string().max(10).optional().nullable(),
  color: z.string().max(20).optional().nullable(),
  isDefault: z.boolean().optional(),
})

const BudgetDataSchema = z.object({
  categoryId: z.string().uuid(),
  amount: z.number().positive(),
  period: z.enum(['monthly', 'weekly', 'yearly']).optional().default('monthly'),
})

const SettingsPostSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('settings'), data: UserSettingsDataSchema }),
  z.object({ type: z.literal('category'), data: CategoryDataSchema }),
  z.object({ type: z.literal('budget'), data: BudgetDataSchema }),
])

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

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })

  const parsed = SettingsPostSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten().fieldErrors }, { status: 400 })
  }

  const { type, data } = parsed.data

  try {
    if (type === 'settings') {
      await db.insert(userSettings).values({ userId, ...data })
        .onConflictDoUpdate({ target: userSettings.userId, set: { ...data, updatedAt: new Date() } })

      // Auto-rename default categories when language changes
      if (data.language) {
        const EN_TO_PL: Record<string, string> = {
          'Food': 'Jedzenie', 'Groceries': 'Zakupy spożywcze', 'Health': 'Zdrowie',
          'Transport': 'Transport', 'Shopping': 'Zakupy', 'Electronics': 'Elektronika',
          'Home & Garden': 'Dom i ogród', 'Entertainment': 'Rozrywka',
          'Bills & Utilities': 'Rachunki i media', 'Other': 'Inne',
        }
        const PL_TO_EN: Record<string, string> = Object.fromEntries(
          Object.entries(EN_TO_PL).map(([en, pl]) => [pl, en])
        )
        const map = data.language === 'pl' ? EN_TO_PL : PL_TO_EN
        const userCats = await db.select({ id: categories.id, name: categories.name, isDefault: categories.isDefault })
          .from(categories).where(and(eq(categories.userId, userId), eq(categories.isDefault, true)))
        await Promise.all(
          userCats
            .filter(cat => map[cat.name])
            .map(cat =>
              db.update(categories).set({ name: map[cat.name]! }).where(eq(categories.id, cat.id))
            )
        )
      }
    } else if (type === 'category') {
      await db.insert(categories).values({ userId, ...data })
    } else if (type === 'budget') {
      const { categoryId, amount, period } = data
      await db.insert(categoryBudgets).values({ userId, categoryId, amount: String(amount), period })
        .onConflictDoUpdate({
          target: [categoryBudgets.userId, categoryBudgets.categoryId, categoryBudgets.period],
          set: { amount: String(amount), updatedAt: new Date() }
        })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[settings POST]', err)
    return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 })
  }
}
