-- Round 2 / A2 Security — append-only audit trail for sensitive mutations.
-- Mirrors the Drizzle definition in `lib/db/schema.ts:auditLog`. Apply via
-- `npm run db:push` or `psql -f drizzle/0003_audit_log.sql` against Neon.
--
-- Rationale: tracks the actions an attacker would touch first (session
-- create/destroy, expense delete, group delete, group-member remove,
-- payment-request settle, demo reset). Single-row inserts only; never
-- UPDATEd or DELETEd in code → truly append-only.

CREATE TABLE IF NOT EXISTS "audit_log" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" text,
  "action" varchar(64) NOT NULL,
  "entity_type" varchar(32),
  "entity_id" text,
  "payload" jsonb,
  "ip" text,
  "user_agent" text,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_audit_log_user_id" ON "audit_log" ("user_id");
CREATE INDEX IF NOT EXISTS "idx_audit_log_user_action" ON "audit_log" ("user_id", "action");
CREATE INDEX IF NOT EXISTS "idx_audit_log_created_at" ON "audit_log" ("created_at");
