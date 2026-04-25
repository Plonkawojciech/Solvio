import { db, categories, userSettings } from './index'
import { eq } from 'drizzle-orm'

const DEFAULT_CATEGORIES_PL = [
  { name: 'Jedzenie', icon: '🍕' },
  { name: 'Zakupy spożywcze', icon: '🛒' },
  { name: 'Zdrowie', icon: '💊' },
  { name: 'Transport', icon: '🚗' },
  { name: 'Zakupy', icon: '🛍️' },
  { name: 'Elektronika', icon: '💻' },
  { name: 'Dom i ogród', icon: '🏠' },
  { name: 'Rozrywka', icon: '🎬' },
  { name: 'Rachunki i media', icon: '⚡' },
  { name: 'Inne', icon: '📦' },
]

const DEFAULT_CATEGORIES_EN = [
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

const BUSINESS_CATEGORIES_PL = [
  { name: 'Artykuły biurowe', icon: '🖊️' },
  { name: 'Podróże służbowe', icon: '✈️' },
  { name: 'Oprogramowanie', icon: '💻' },
  { name: 'Spotkania z klientami', icon: '🍽️' },
  { name: 'Usługi profesjonalne', icon: '📋' },
  { name: 'Marketing i reklama', icon: '📢' },
  { name: 'Ubezpieczenia', icon: '🛡️' },
  { name: 'Podatki i opłaty', icon: '🏛️' },
  { name: 'Sprzęt', icon: '🔧' },
  { name: 'Koszty pracownicze', icon: '👥' },
]

const BUSINESS_CATEGORIES_EN = [
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

export async function ensureUserSeeded(userId: string, lang: 'pl' | 'en' = 'pl') {
  // Check if user already has categories
  const existing = await db.select({ id: categories.id })
    .from(categories)
    .where(eq(categories.userId, userId))
    .limit(1)

  if (existing.length > 0) return

  const defaultCats = lang === 'en' ? DEFAULT_CATEGORIES_EN : DEFAULT_CATEGORIES_PL

  // Create settings + default categories in parallel
  await Promise.all([
    db.insert(userSettings).values({ userId, language: lang }).onConflictDoNothing(),
    db.insert(categories).values(
      defaultCats.map(c => ({ ...c, userId, isDefault: true }))
    ),
  ])
}

export async function seedBusinessCategories(userId: string, lang: 'pl' | 'en' = 'pl') {
  const businessCats = lang === 'pl' ? BUSINESS_CATEGORIES_PL : BUSINESS_CATEGORIES_EN

  // Get existing category names to avoid duplicates
  const existingNames = new Set(
    (await db.select({ name: categories.name })
      .from(categories)
      .where(eq(categories.userId, userId))
    ).map(c => c.name)
  )

  // Only insert categories that don't already exist
  const newCategories = businessCats.filter(c => !existingNames.has(c.name))

  if (newCategories.length === 0) return

  await db.insert(categories).values(
    newCategories.map(c => ({ ...c, userId, isDefault: true }))
  )
}
