// Simple in-memory rate limiter — kept as a fast fallback when the
// persistent limiter can't reach the DB or its migration hasn't been applied.

import { createHash } from 'crypto'
import { sql } from 'drizzle-orm'
import { db } from '@/lib/db'

const store = new Map<string, { count: number; resetAt: number }>()
const PERSISTENT_GC_INTERVAL_MS = 15 * 60 * 1000

let hasWarnedPersistentFallback = false
let lastPersistentGcAt = Date.now()

interface RateLimitOptions {
  maxRequests: number
  windowMs: number // time window in milliseconds
}

interface RateLimitResult {
  allowed: boolean
  retryAfter?: number
  source?: 'memory' | 'database'
}

interface RateLimitPersistentDeps {
  now?: number
  execute?: (query: unknown) => Promise<unknown>
  disableGc?: boolean
}

export function rateLimit(key: string, options: RateLimitOptions): RateLimitResult {
  const now = Date.now()
  const entry = store.get(key)

  if (!entry || now > entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + options.windowMs })
    return { allowed: true, source: 'memory' }
  }

  if (entry.count >= options.maxRequests) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000)
    return { allowed: false, retryAfter, source: 'memory' }
  }

  entry.count++
  return { allowed: true, source: 'memory' }
}

function hashBucketKey(key: string): string {
  return createHash('sha256').update(key).digest('hex')
}

function rowsFromExecute<T>(result: unknown): T[] {
  const anyResult = result as { rows?: unknown[] } | unknown[]
  return Array.isArray(anyResult) ? (anyResult as T[]) : ((anyResult.rows ?? []) as T[])
}

function warnPersistentFallback(err: unknown) {
  if (hasWarnedPersistentFallback) return
  hasWarnedPersistentFallback = true
  console.warn(
    '[rate-limit] persistent limiter fallback:',
    err instanceof Error ? err.message : String(err),
  )
}

function maybeGcPersistentBuckets(now: number, execute: (query: unknown) => Promise<unknown>) {
  if (now - lastPersistentGcAt < PERSISTENT_GC_INTERVAL_MS) return
  lastPersistentGcAt = now
  void execute(sql`
    DELETE FROM rate_limit_buckets
    WHERE "reset_at" < NOW()
  `).catch(() => {
    // Best-effort only. Rate limiting must not fail closed on GC noise.
  })
}

/**
 * Serverless-safe limiter backed by Postgres.
 *
 * Best-effort by design: if the DB table is unavailable (migration not
 * applied yet, transient Neon issue), we degrade to the in-memory limiter
 * rather than failing the request open or breaking a core flow.
 */
export async function rateLimitPersistent(
  key: string,
  options: RateLimitOptions,
  deps: RateLimitPersistentDeps = {},
): Promise<RateLimitResult> {
  const now = deps.now ?? Date.now()
  if (!process.env.DATABASE_URL) {
    return { ...rateLimit(key, options), source: 'memory' }
  }

  const bucketKey = hashBucketKey(`${key}:${options.windowMs}`)
  const resetAt = new Date(now + options.windowMs)
  const execute = deps.execute ?? ((query: unknown) => db.execute(query as never))

  try {
    const result = await execute(sql`
      INSERT INTO rate_limit_buckets ("bucket_key", "count", "reset_at", "created_at", "updated_at")
      VALUES (${bucketKey}, 1, ${resetAt}, NOW(), NOW())
      ON CONFLICT ("bucket_key")
      DO UPDATE SET
        "count" = CASE
          WHEN rate_limit_buckets."reset_at" <= NOW() THEN 1
          ELSE rate_limit_buckets."count" + 1
        END,
        "reset_at" = CASE
          WHEN rate_limit_buckets."reset_at" <= NOW() THEN ${resetAt}
          ELSE rate_limit_buckets."reset_at"
        END,
        "updated_at" = NOW()
      RETURNING
        "count"::int AS count,
        FLOOR(EXTRACT(EPOCH FROM "reset_at"))::int AS reset_at_epoch
    `)

    const rows = rowsFromExecute<{ count: number | string; reset_at_epoch: number | string }>(result)
    const row = rows[0]
    if (!row) {
      return { ...rateLimit(key, options), source: 'memory' }
    }

    if (!deps.disableGc) {
      maybeGcPersistentBuckets(now, execute)
    }

    const count = Number(row.count)
    const resetAtEpoch = Number(row.reset_at_epoch)
    if (count > options.maxRequests) {
      return {
        allowed: false,
        retryAfter: Math.max(1, resetAtEpoch - Math.floor(now / 1000)),
        source: 'database',
      }
    }

    return { allowed: true, source: 'database' }
  } catch (err) {
    warnPersistentFallback(err)
    return { ...rateLimit(key, options), source: 'memory' }
  }
}

// Clean up expired entries every 5 minutes
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now()
    for (const [key, entry] of store.entries()) {
      if (now > entry.resetAt) store.delete(key)
    }
  }, 5 * 60 * 1000)
}
