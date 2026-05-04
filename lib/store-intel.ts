import { db, storeIntel } from '@/lib/db'
import { eq, and, lt, sql } from 'drizzle-orm'

/**
 * Live shopping-intel cache (Drizzle-backed).
 *
 * Replaces the per-route in-memory `Map`s in routes like
 * `/api/shopping/optimize` and `/api/personal/promotions`. Those caches
 * vanished on every serverless cold-start, so users hit the AI on every
 * fresh function instance. With Postgres backing, every node in the
 * fleet sees the same cached row and a `cron` route keeps the high-value
 * entries warm.
 *
 * Three-state lifecycle:
 *   ┌──────── fetched_at
 *   │ FRESH (cached row served as-is)
 *   │
 *   ├──────── revalidate_after  ← soft hint: serve + refresh in background
 *   │ STALE (still served, but a refresh task fires)
 *   │
 *   ├──────── expires_at        ← hard boundary
 *   │ MISS (we ignore the row, refetch synchronously)
 *
 * For the user this means:
 *   - Identical request within `revalidateAfter`  → instant, fresh.
 *   - Identical request between revalidate and expires → instant + bg refresh.
 *   - Identical request past `expiresAt` → AI roundtrip (latency).
 */

export type IntelKind = 'leaflet' | 'hours' | 'optimize' | 'prices' | 'promotions' | 'audit' | 'analyze'

export interface CachedEntry<T> {
  data: T
  fetchedAt: Date
  expiresAt: Date
  revalidateAfter: Date | null
  source: string | null
  /// `fresh` = inside revalidate window, `stale` = past revalidate but
  /// before expires, `miss` = no row or past expires (in which case the
  /// helper refetched). Useful for setting `X-Cache` headers.
  state: 'fresh' | 'stale' | 'miss'
}

/// Background refresh tasks keyed by `kind:key` so we never spawn two
/// parallel fetches for the same entry. Lives in module scope so it
/// works across requests on the same node — and the DB unique key on
/// `(kind, key)` keeps the data side correct even when two nodes race.
const inFlight = new Map<string, Promise<unknown>>()

function inFlightKey(kind: string, key: string): string {
  return `${kind}:${key}`
}

/**
 * Read a cached entry. Returns null if the row doesn't exist or is past
 * its hard `expiresAt` boundary. Caller decides whether to refetch on
 * `null`.
 */
export async function readIntel<T>(kind: IntelKind, key: string): Promise<CachedEntry<T> | null> {
  const rows = await db.select().from(storeIntel).where(
    and(eq(storeIntel.kind, kind), eq(storeIntel.key, key))
  ).limit(1)
  const row = rows[0]
  if (!row) return null
  const now = Date.now()
  if (row.expiresAt.getTime() < now) return null
  const revalidate = row.revalidateAfter ?? null
  const state: CachedEntry<T>['state'] = (revalidate && revalidate.getTime() < now) ? 'stale' : 'fresh'
  return {
    data: row.data as T,
    fetchedAt: row.fetchedAt,
    expiresAt: row.expiresAt,
    revalidateAfter: revalidate,
    source: row.source,
    state,
  }
}

/**
 * Upsert a cached entry. `ttlSeconds` becomes the hard staleness
 * ceiling. Optional `revalidateAfterSeconds` enables stale-while-
 * revalidate behaviour — pick something < `ttlSeconds` (e.g. half) so
 * background refresh fires before users see "miss" latency.
 */
export async function writeIntel<T>(
  kind: IntelKind,
  key: string,
  data: T,
  ttlSeconds: number,
  opts: { revalidateAfterSeconds?: number; source?: string } = {},
): Promise<void> {
  const now = new Date()
  const expiresAt = new Date(now.getTime() + ttlSeconds * 1000)
  const revalidateAfter = opts.revalidateAfterSeconds != null
    ? new Date(now.getTime() + opts.revalidateAfterSeconds * 1000)
    : null
  await db.insert(storeIntel).values({
    kind,
    key,
    data: data as unknown,
    fetchedAt: now,
    expiresAt,
    revalidateAfter,
    source: opts.source ?? null,
  }).onConflictDoUpdate({
    target: [storeIntel.kind, storeIntel.key],
    set: {
      data: data as unknown,
      fetchedAt: now,
      expiresAt,
      revalidateAfter,
      source: opts.source ?? null,
    },
  })
}

/**
 * SWR-style read-through cache.
 *
 * 1. If a fresh row exists → return it (state: `fresh`).
 * 2. If a stale row exists (past revalidate, before expires) → return
 *    it AND start a background refresh task (state: `stale`). The user
 *    sees no latency; their next visit will see fresh data.
 * 3. If no row or hard-expired → call `fetcher` synchronously, persist
 *    the result, return it (state: `miss`).
 *
 * `fetcher` should resolve fast and never throw — wrap your AI/HTTP
 * calls in a try/catch and return null when you couldn't get fresh
 * data. This helper turns null into a stale-fallback (returns the
 * existing row even if past expires, marked as `stale`) — better than
 * a UI error when the model is briefly down.
 */
export async function freshOrRefresh<T>(
  kind: IntelKind,
  key: string,
  ttlSeconds: number,
  fetcher: () => Promise<{ data: T; source?: string } | null>,
  opts: { revalidateAfterSeconds?: number } = {},
): Promise<CachedEntry<T>> {
  const cached = await readIntel<T>(kind, key)

  // FRESH — serve directly, no work needed.
  if (cached && cached.state === 'fresh') {
    return cached
  }

  // STALE — serve cached, kick off background refresh.
  if (cached && cached.state === 'stale') {
    refreshInBackground(kind, key, ttlSeconds, fetcher, opts)
    return cached
  }

  // MISS — fetch synchronously.
  return await fetchAndPersist(kind, key, ttlSeconds, fetcher, opts)
}

async function fetchAndPersist<T>(
  kind: IntelKind,
  key: string,
  ttlSeconds: number,
  fetcher: () => Promise<{ data: T; source?: string } | null>,
  opts: { revalidateAfterSeconds?: number } = {},
): Promise<CachedEntry<T>> {
  const inflightKey = inFlightKey(kind, key)
  // De-dupe concurrent misses on the same key.
  if (inFlight.has(inflightKey)) {
    await inFlight.get(inflightKey)!.catch(() => {})
    const after = await readIntel<T>(kind, key)
    if (after) return after
  }

  const task = (async () => {
    const fetched = await fetcher().catch(() => null)
    if (fetched != null) {
      await writeIntel(kind, key, fetched.data, ttlSeconds, {
        revalidateAfterSeconds: opts.revalidateAfterSeconds,
        source: fetched.source,
      })
    }
  })()
  inFlight.set(inflightKey, task)
  try {
    await task
  } finally {
    inFlight.delete(inflightKey)
  }

  const after = await readIntel<T>(kind, key)
  if (after) return after

  // Last-resort stale fallback — return whatever's in the row even
  // if expired so the caller has *something*. Avoid throwing here;
  // surface a soft state and let the caller decide.
  const rows = await db.select().from(storeIntel).where(
    and(eq(storeIntel.kind, kind), eq(storeIntel.key, key))
  ).limit(1)
  const row = rows[0]
  if (row) {
    return {
      data: row.data as T,
      fetchedAt: row.fetchedAt,
      expiresAt: row.expiresAt,
      revalidateAfter: row.revalidateAfter ?? null,
      source: row.source,
      state: 'stale',
    }
  }
  throw new Error(`store-intel: failed to fetch ${kind}:${key} and no fallback row exists`)
}

/// Fire-and-forget refresh. Errors are swallowed — the user already
/// has fresh-enough data; failures here just mean the next request
/// will see another `stale`.
function refreshInBackground<T>(
  kind: IntelKind,
  key: string,
  ttlSeconds: number,
  fetcher: () => Promise<{ data: T; source?: string } | null>,
  opts: { revalidateAfterSeconds?: number } = {},
): void {
  const inflightKey = inFlightKey(kind, key)
  if (inFlight.has(inflightKey)) return
  const task = (async () => {
    try {
      const fetched = await fetcher().catch(() => null)
      if (fetched != null) {
        await writeIntel(kind, key, fetched.data, ttlSeconds, {
          revalidateAfterSeconds: opts.revalidateAfterSeconds,
          source: fetched.source,
        })
      }
    } catch {
      // intentional — see comment above.
    }
  })()
  inFlight.set(inflightKey, task)
  task.finally(() => inFlight.delete(inflightKey))
}

/**
 * Read any cached row regardless of expiry. Returns null only when no
 * row exists at all. Useful as a "we lost the AI, show *something*"
 * fallback when an upstream call fails — better stale than blank.
 */
export async function readAnyIntel<T>(kind: IntelKind, key: string): Promise<{ data: T; fetchedAt: Date; expiresAt: Date } | null> {
  const rows = await db.select().from(storeIntel).where(
    and(eq(storeIntel.kind, kind), eq(storeIntel.key, key))
  ).limit(1)
  const row = rows[0]
  if (!row) return null
  return { data: row.data as T, fetchedAt: row.fetchedAt, expiresAt: row.expiresAt }
}

/**
 * Garbage-collect rows past their `expiresAt` ceiling. Run from a
 * scheduled (cron) endpoint; safe to call any time. Returns the
 * number of rows deleted.
 */
export async function gcStaleIntel(): Promise<number> {
  const result = await db.delete(storeIntel)
    .where(lt(storeIntel.expiresAt, new Date()))
    .returning({ id: storeIntel.id })
  return result.length
}

/**
 * Stats helper for the cron endpoint — useful response to verify the
 * job actually did something.
 */
export async function intelStats(): Promise<{ total: number; expired: number; freshByKind: Record<string, number> }> {
  const rows: Array<{ kind: string; total: number; expired: number }> = await db.execute(sql`
    SELECT kind,
           COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE expires_at < NOW())::int AS expired
    FROM store_intel
    GROUP BY kind
  `).then((r: unknown) => {
    // drizzle's execute returns { rows: [...] } on Neon; on raw it's an array
    const anyR = r as { rows?: unknown[] } | unknown[]
    return Array.isArray(anyR) ? (anyR as Array<{ kind: string; total: number; expired: number }>) : ((anyR.rows ?? []) as Array<{ kind: string; total: number; expired: number }>)
  })

  const freshByKind: Record<string, number> = {}
  let total = 0
  let expired = 0
  for (const r of rows) {
    freshByKind[r.kind] = r.total - r.expired
    total += r.total
    expired += r.expired
  }
  return { total, expired, freshByKind }
}
