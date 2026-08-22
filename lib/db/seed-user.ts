import { db, categories, userSettings } from './index'
import { eq } from 'drizzle-orm'
import { dbBatch } from './batch'

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

/**
 * In-process "already seeded" cache.
 *
 * `ensureUserSeeded` is called from `app/(protected)/layout.tsx` on every
 * protected page nav (and from a few other routes). Even though the
 * underlying SELECT is now indexed (`idx_categories_user_id` from round 1),
 * the round-trip to Neon is still ~10–40ms — multiplied by every page
 * load for an active user, that's nontrivial.
 *
 * Once we've verified a user has categories, that fact is permanent
 * (we never delete *all* of a user's categories; even if they did, the
 * cache TTL takes care of it). So we cache the userId → "seeded" bit
 * with a TTL and skip the round-trip on subsequent calls.
 *
 * Notes on serverless lifecycle:
 *  - On Vercel, an instance lives anywhere from seconds to ~15min idle.
 *    Cache resets on cold-start, which is exactly the behaviour we want
 *    (no risk of stale data persisting forever).
 *  - TTL is a belt-and-suspenders: even if an instance lives long, we
 *    re-verify periodically.
 *  - The cache is intentionally *not* shared across instances. A single
 *    DB query on first hit per instance is acceptable.
 *  - We do NOT cache "needs seeding" — only "is seeded". This means a
 *    user who is seeded mid-request (race on first ever login) is the
 *    only case that costs an extra query, which is fine.
 */
const SEEDED_TTL_MS = 60 * 60 * 1000 // 1h
const seededCache = new Map<string, number>() // userId -> expiresAt epoch ms

// Cap the cache size so a long-lived instance with many distinct users
// doesn't grow unbounded. 2k entries × ~40 bytes each ≈ 80 KB. When we
// hit the cap, drop the oldest expired entry; if none expired, drop the
// arbitrary first iteration entry (FIFO-ish).
const SEEDED_CACHE_MAX = 2000

function rememberSeeded(userId: string) {
  if (seededCache.size >= SEEDED_CACHE_MAX) {
    const now = Date.now()
    let droppedExpired = false
    for (const [k, exp] of seededCache) {
      if (exp <= now) {
        seededCache.delete(k)
        droppedExpired = true
        break
      }
    }
    if (!droppedExpired) {
      // No expired entries — drop the oldest insertion (Map preserves
      // insertion order). Acceptable degradation under hot-instance load.
      const firstKey = seededCache.keys().next().value
      if (firstKey) seededCache.delete(firstKey)
    }
  }
  seededCache.set(userId, Date.now() + SEEDED_TTL_MS)
}

function isCachedSeeded(userId: string): boolean {
  const exp = seededCache.get(userId)
  if (!exp) return false
  if (exp <= Date.now()) {
    seededCache.delete(userId)
    return false
  }
  return true
}

/**
 * Test-only: reset the cache. Not exported in the public surface, but
 * available for vitest if it ever needs to exercise the cold path.
 */
export function __resetSeededCache() {
  seededCache.clear()
}

export async function ensureUserSeeded(userId: string, lang: 'pl' | 'en' = 'pl') {
  // Hot path: skip the round-trip if we've verified this user recently.
  if (isCachedSeeded(userId)) return

  // Check if user already has categories
  const existing = await db.select({ id: categories.id })
    .from(categories)
    .where(eq(categories.userId, userId))
    .limit(1)

  if (existing.length > 0) {
    rememberSeeded(userId)
    return
  }

  const defaultCats = lang === 'en' ? DEFAULT_CATEGORIES_EN : DEFAULT_CATEGORIES_PL

  // Atomicity: the two inserts are conceptually one bootstrap operation.
  // `Promise.all([...])` issues them in parallel but returns "all-or-some"
  // — if `categories` insert fails after `userSettings` succeeds, the user
  // ends up half-seeded (settings exist, categories missing) and the next
  // call's `existing.length > 0` check would lie because a parallel race
  // could read settings as "exists". `db.batch([...])` runs both statements
  // inside one HTTP RTT to the Neon HTTP driver and rolls them back together
  // on any failure — same atomicity guarantee A4 R2 added in the OCR flow.
  await dbBatch((x) => [
    x.insert(userSettings).values({ userId, language: lang }).onConflictDoNothing(),
    x.insert(categories).values(
      defaultCats.map(c => ({ ...c, userId, isDefault: true }))
    ),
  ])

  rememberSeeded(userId)
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

  // The user definitely has categories now — cache that.
  rememberSeeded(userId)
}
