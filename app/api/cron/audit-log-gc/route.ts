import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { auditLog } from '@/lib/db/schema'
import { lt } from 'drizzle-orm'
import { isAuthorizedCron } from '@/lib/cron-auth'

/**
 * `/api/cron/audit-log-gc` — append-only audit-log retention GC.
 *
 * Deletes `audit_log` rows whose `created_at` is older than 90 days. The
 * audit table grows unbounded otherwise (every login, every expense
 * delete, every settlement settle/decline writes a row), so we trim it
 * on a daily cron to keep storage and index size sane while still
 * preserving a 3-month forensic window — long enough to investigate
 * real incidents, short enough that we're not hoarding stale IP/UA data.
 *
 * Idempotent: re-running on the same day is a no-op (the `lt(createdAt, cutoff)`
 * predicate moves with each call, so once a row falls outside the window
 * it's deleted on the first call and the second call no-ops on it).
 *
 * Auth: shared with the other cron routes via `lib/cron-auth.ts` —
 * Vercel cron header, `?token=`, or `Authorization: Bearer` against
 * `CRON_SECRET`. Fails closed when `CRON_SECRET` isn't configured.
 *
 * Wire into `vercel.json`:
 *   { "path": "/api/cron/audit-log-gc", "schedule": "0 3 * * *" }
 *
 * Round 3 / A2 Security.
 */
export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const RETENTION_DAYS = 90
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000)

  try {
    // Drizzle's neon-http delete returns the number of affected rows on
    // most drivers but we don't depend on it for correctness — a partial
    // delete still trims, and we'd just delete more on the next run.
    const result = await db.delete(auditLog).where(lt(auditLog.createdAt, cutoff))

    // The Neon HTTP driver surfaces affected rows as `result.rowCount`
    // (when present) — different driver versions expose it slightly
    // differently, so we coerce defensively rather than crash if the
    // shape changes.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rowCount: number | null = (result as any)?.rowCount ?? null

    return NextResponse.json({
      ok: true,
      cutoff: cutoff.toISOString(),
      retentionDays: RETENTION_DAYS,
      rowsDeleted: rowCount,
    })
  } catch (err) {
    // Don't leak internals; cron logs go to Vercel.
    console.error('[cron/audit-log-gc] delete failed:', err instanceof Error ? err.message : String(err))
    return NextResponse.json({ error: 'GC failed' }, { status: 500 })
  }
}

// Some external cron services prefer POST. We accept both so the same
// route works behind any scheduler — the auth check is identical.
export const POST = GET
