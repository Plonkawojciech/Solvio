// Round 2 / A2 Security — append-only audit trail helper.
//
// Wraps `db.insert(auditLog)` so callsites stay one-liners and never throw
// (security tracing must never break a happy-path mutation). Use these
// helpers for: session create/destroy, expense delete, group delete,
// group-member remove, payment-request settle, demo reset.
//
// NEVER pass secrets / full request bodies into `payload`. Keep it small —
// pre-delete row counts, target ids, status changes. Stringified blobs hurt
// future querying and grow the table for no value.

import { db } from '@/lib/db'
import { auditLog } from '@/lib/db/schema'

export type AuditAction =
  | 'session.create'
  | 'session.destroy'
  | 'session.demo_login'
  | 'session.demo_reset'
  | 'expense.delete'
  | 'group.delete'
  | 'group.member.remove'
  | 'payment_request.settle'
  | 'payment_request.decline'
  | 'split.settle'

export interface AuditContext {
  userId?: string | null
  action: AuditAction | string
  entityType?: string | null
  entityId?: string | null
  payload?: Record<string, unknown> | null
  ip?: string | null
  userAgent?: string | null
}

/**
 * Record one audit-log row. Best-effort — never throws, never blocks the
 * caller's happy path. On failure we log to stderr so it surfaces in Vercel
 * logs but the calling mutation still succeeds.
 *
 * Returns void so callers don't accidentally chain .then() on it (it really
 * is fire-and-forget by design).
 */
export async function recordAudit(ctx: AuditContext): Promise<void> {
  try {
    await db.insert(auditLog).values({
      userId: ctx.userId ?? null,
      action: ctx.action,
      entityType: ctx.entityType ?? null,
      entityId: ctx.entityId ?? null,
      payload: ctx.payload ?? null,
      ip: ctx.ip ?? null,
      userAgent: ctx.userAgent ?? null,
    })
  } catch (err) {
    // Tracing must NEVER break the caller. If audit_log doesn't exist
    // yet (migration not applied) we still want the mutation to succeed.
    console.error('[audit-log] write failed:', err instanceof Error ? err.message : String(err))
  }
}

/**
 * Pull IP + user-agent from a Request. Used by session events so we can
 * see "who logged in from where" without storing the whole request.
 *
 * IP comes from x-forwarded-for (first hop) → x-real-ip → 'unknown'.
 * User-agent is capped at 256 chars to bound DB row size.
 */
export function extractRequestMeta(req: Request): { ip: string; userAgent: string } {
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'unknown'
  const ua = req.headers.get('user-agent')?.slice(0, 256) ?? 'unknown'
  return { ip, userAgent: ua }
}
