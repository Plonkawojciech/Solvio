import { auth, getHubAuth } from '@/lib/auth-compat'
import { NextResponse } from 'next/server'
import { db, expenses, receipts, categories, userSettings, categoryBudgets, monthlyBudgets } from '@/lib/db'
import { eq, gte, lte, and, sql } from 'drizzle-orm'
import { withApiTiming } from '@/lib/api-timing'

/**
 * Per-instance dashboard memoization.
 *
 * The dashboard fires 7 parallel SELECTs against Neon on every load.
 * The `Cache-Control: private, max-age=5` header (added in round 1)
 * keeps browsers from re-fetching, but iOS makes a fresh HTTP call on
 * every dashboard refresh and most cross-region/CDN flows can't cache
 * private auth'd JSON anyway.
 *
 * Round-2 fix: a tiny in-process Map keyed by `userId|since` with a 5s
 * TTL. Under bursty navigation (user opens Dashboard, then quickly
 * presses pull-to-refresh, or ping-pongs Dashboard ↔ Expenses) we
 * serve the second hit from memory and skip 7 round-trips.
 *
 * Trade-offs / safety:
 * - 5s TTL matches the existing `Cache-Control: max-age=5` so the user
 *   can never see staler data from us than they would from their own
 *   browser cache.
 * - Cache is per Vercel instance, so two regions could hold different
 *   snapshots. Acceptable — neither will be more than 5s old.
 * - Hard size cap at 1000 entries protects long-running instances from
 *   unbounded growth across many distinct users.
 */
const DASHBOARD_TTL_MS = 5_000
const DASHBOARD_CACHE_MAX = 1_000
type DashboardSnapshot = {
  body: unknown
  expiresAt: number
}
const dashboardCache = new Map<string, DashboardSnapshot>()

function readDashboardCache(key: string): unknown | null {
  const hit = dashboardCache.get(key)
  if (!hit) return null
  if (hit.expiresAt <= Date.now()) {
    dashboardCache.delete(key)
    return null
  }
  return hit.body
}

function writeDashboardCache(key: string, body: unknown) {
  if (dashboardCache.size >= DASHBOARD_CACHE_MAX) {
    // Drop the oldest expired entry, or fall back to FIFO eviction.
    const now = Date.now()
    let evicted = false
    for (const [k, v] of dashboardCache) {
      if (v.expiresAt <= now) {
        dashboardCache.delete(k)
        evicted = true
        break
      }
    }
    if (!evicted) {
      const firstKey = dashboardCache.keys().next().value
      if (firstKey) dashboardCache.delete(firstKey)
    }
  }
  dashboardCache.set(key, { body, expiresAt: Date.now() + DASHBOARD_TTL_MS })
}

async function getDashboard(request: Request) {
  let userId = (await auth()).userId
  if (!userId) {
    const hubAuth = getHubAuth(request)
    if (hubAuth) userId = hubAuth.userId
  }
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Allow `?since=all` to fetch all expenses (iOS uses this by default)
  const url = new URL(request.url)
  const showAll = url.searchParams.get('since') === 'all'

  // Cache key segregates `since=all` from the default-30d view, and is
  // namespaced by userId for hard isolation. Don't cache when forced
  // (no force flag exists today, but leaving the door open is cheap).
  const cacheKey = `${userId}|${showAll ? 'all' : '30d'}`
  const cached = readDashboardCache(cacheKey)
  if (cached) {
    return NextResponse.json(cached, {
      headers: {
        'Cache-Control': 'private, max-age=5, must-revalidate',
        'X-Cache': 'HIT',
      },
    })
  }

  const since = new Date()
  since.setDate(since.getDate() - 29)
  const sinceStr = since.toISOString().slice(0, 10)

  const prev30 = new Date()
  prev30.setDate(prev30.getDate() - 59)
  const prev30Str = prev30.toISOString().slice(0, 10)

  try {
    const currentMonth = new Date().toISOString().slice(0, 7)
    const expenseFilter = showAll
      ? eq(expenses.userId, userId)
      : and(eq(expenses.userId, userId), gte(expenses.date, sinceStr))
    const receiptFilter = showAll
      ? eq(receipts.userId, userId)
      : and(eq(receipts.userId, userId), gte(receipts.date, sinceStr))

    // Round-3 perf: was 7 parallel HTTP round-trips via Promise.all (each
    // drizzle/neon-http call is its own POST to Neon's HTTP gateway, so
    // "parallel" still means 7× connection setup + 7× server-side parse).
    // db.batch([...]) packs them into ONE pipelined HTTP request inside a
    // single read-only transaction snapshot. Same SELECTs, ~6× fewer
    // round-trips. Order of the result tuple matches the order of the
    // statements in the array.
    const [cats, settings, budgets, exps, recsCount, prevCatTotals, monthBudget] = await db.batch([
      db.select().from(categories).where(eq(categories.userId, userId)),
      db.select().from(userSettings).where(eq(userSettings.userId, userId)).limit(1),
      db.select().from(categoryBudgets).where(eq(categoryBudgets.userId, userId)),
      db.select({
        id: expenses.id,
        title: expenses.title,
        amount: expenses.amount,
        currency: expenses.currency,
        date: expenses.date,
        categoryId: expenses.categoryId,
        receiptId: expenses.receiptId,
        vendor: expenses.vendor,
        isRecurring: expenses.isRecurring,
        exchangeRate: receipts.exchangeRate,
      }).from(expenses)
        .leftJoin(receipts, eq(expenses.receiptId, receipts.id))
        .where(expenseFilter),
      db.select({ count: sql<number>`count(*)::int` }).from(receipts)
        .where(receiptFilter),
      // Server-side aggregation: per-category totals with exchange rate conversion
      db.select({
        categoryId: expenses.categoryId,
        total: sql<string>`COALESCE(SUM(
          CASE WHEN ${receipts.exchangeRate} IS NOT NULL
            THEN ${expenses.amount}::numeric * ${receipts.exchangeRate}::numeric
            ELSE ${expenses.amount}::numeric
          END
        ), 0)`,
      }).from(expenses)
        .leftJoin(receipts, eq(expenses.receiptId, receipts.id))
        .where(and(eq(expenses.userId, userId), gte(expenses.date, prev30Str), lte(expenses.date, sinceStr)))
        .groupBy(expenses.categoryId),
      db.select({ totalIncome: monthlyBudgets.totalIncome, savingsTarget: monthlyBudgets.savingsTarget })
        .from(monthlyBudgets)
        .where(and(eq(monthlyBudgets.userId, userId), eq(monthlyBudgets.month, currentMonth)))
        .limit(1),
    ])

    const prevByCategory: Record<string, number> = {}
    let prevTotal = 0
    for (const row of prevCatTotals) {
      const cat = row.categoryId || '__other__'
      const amount = parseFloat(row.total) || 0
      prevByCategory[cat] = amount
      prevTotal += amount
    }

    // `prevExpenses` used to be a flat list; clients now read `prevTotal` +
    // `prevByCategory` (server-side aggregated above), so we omit the array
    // entirely. iOS treats it as optional and falls through gracefully.
    const body = {
      categories: cats,
      settings: settings[0] || null,
      budgets,
      expenses: exps,
      prevTotal,
      prevByCategory,
      receiptsCount: recsCount[0]?.count ?? 0,
      monthIncome: monthBudget[0]?.totalIncome ? parseFloat(monthBudget[0].totalIncome) : null,
      savingsTarget: monthBudget[0]?.savingsTarget ? parseFloat(monthBudget[0].savingsTarget) : null,
    }

    // Write through to in-process cache so the next request within 5s
    // skips all 7 SELECTs.
    writeDashboardCache(cacheKey, body)

    return NextResponse.json(body, {
      headers: {
        // Per-user, authenticated. We use a tiny shared-cache window so
        // back-to-back navigations within the same Vercel region can hit
        // the edge cache; iOS still controls invalidation via AppDataStore.
        'Cache-Control': 'private, max-age=5, must-revalidate',
        'X-Cache': 'MISS',
      },
    })
  } catch (err) {
    console.error('[dashboard GET]', err)
    return NextResponse.json({ error: 'Failed to fetch dashboard data' }, { status: 500 })
  }
}

export const GET = withApiTiming('api.data.dashboard.GET', getDashboard)
