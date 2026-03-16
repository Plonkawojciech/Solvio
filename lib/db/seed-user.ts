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

const BUSINESS_CATEGORIES = [
  { name: 'Office Supplies', icon: '🖊️' },
  { name: 'Business Travel', icon: '✈️' },
  { name: 'Software & SaaS', icon: '💻' },
  { name: 'Client Entertainment', icon: '🍽️' },
  { name: 'Professional Services', icon: '📋' },
  { name: 'Marketing & Advertising', icon: '📢' },
  { name: 'Insurance', icon: '🛡️' },
  { name: 'Taxes & Fees', icon: '🏛️' },
  { name: 'Equipment', icon: '🔧' },
  { name: 'Employee Costs', icon: '👥' },
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

export async function seedBusinessCategories(userId: string) {
  // Get existing category names to avoid duplicates
  const existingNames = new Set(
    (await db.select({ name: categories.name })
      .from(categories)
      .where(eq(categories.userId, userId))
    ).map(c => c.name)
  )

  // Only insert categories that don't already exist
  const newCategories = BUSINESS_CATEGORIES.filter(c => !existingNames.has(c.name))

  if (newCategories.length === 0) return

  await db.insert(categories).values(
    newCategories.map(c => ({ ...c, userId, isDefault: true }))
  )
}
