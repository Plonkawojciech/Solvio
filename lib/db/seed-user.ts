import { db, categories, userSettings } from './index'
import { eq } from 'drizzle-orm'

const DEFAULT_CATEGORIES = [
  { name: 'Food', icon: '🍕' },
  { name: 'Groceries', icon: '🛒' },
  { name: 'Health', icon: '💊' },
  { name: 'Transport', icon: '🚗' },
  { name: 'Shopping', icon: '🛍️' },
  { name: 'Electronics', icon: '💻' },
  { name: 'Home & Garden', icon: '🏠' },
  { name: 'Entertainment', icon: '🎬' },
  { name: 'Bills & Utilities', icon: '⚡' },
  { name: 'Other', icon: '📦' },
]

export async function ensureUserSeeded(userId: string) {
  // Check if user already has categories
  const existing = await db.select({ id: categories.id })
    .from(categories)
    .where(eq(categories.userId, userId))
    .limit(1)

  if (existing.length > 0) return

  // Create settings + default categories in parallel
  await Promise.all([
    db.insert(userSettings).values({ userId }).onConflictDoNothing(),
    db.insert(categories).values(
      DEFAULT_CATEGORIES.map(c => ({ ...c, userId, isDefault: true }))
    ),
  ])
}
