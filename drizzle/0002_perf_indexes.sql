-- Migration 0002: performance indexes
--
-- Round 1 / A1 Performance audit (2026-05-07).
--
-- Adds indexes for queries that previously did sequential scans. All
-- statements use IF NOT EXISTS so this file is safe to re-run.
--
-- Apply via:
--     npm run db:push                  -- preferred, mirrors schema.ts
--     psql $DATABASE_URL -f drizzle/0002_perf_indexes.sql   -- manual fallback
--
-- Why each index:
--   * expense_splits.expense_id / receipt_id  → cascade-delete fan-out
--     when removing expenses or receipts; without these, every delete
--     walks the whole table.
--   * expense_splits.paid_by_member_id  → settlement sheet "who paid"
--     filter.
--   * payment_requests.from_member_id / to_member_id  → per-member
--     "what I owe / what's owed to me" lists.
--   * payment_requests.share_token  → public settlement link lookup
--     (currently seq-scans every row with a share token).
--   * expenses.bank_transaction_id  → bank/match query filters
--     `bank_transaction_id IS NULL` to find expenses available for
--     auto-link; un-indexed it walks the entire user's expense table.
--   * invoices.user_id+status / user_id+created_at  → /api/business/invoices
--     filters by status and orders by createdAt desc; both supported
--     by these covering indexes.
--   * vat_entries.company_id+period  → KPiR / JPK exports filter the
--     full ledger by (companyId, period); composite avoids both seq
--     scans and an inner sort.

CREATE INDEX IF NOT EXISTS "idx_expense_splits_expense_id"
  ON "expense_splits" ("expense_id");

CREATE INDEX IF NOT EXISTS "idx_expense_splits_receipt_id"
  ON "expense_splits" ("receipt_id");

CREATE INDEX IF NOT EXISTS "idx_expense_splits_paid_by"
  ON "expense_splits" ("paid_by_member_id");

CREATE INDEX IF NOT EXISTS "idx_payment_requests_from_member"
  ON "payment_requests" ("from_member_id");

CREATE INDEX IF NOT EXISTS "idx_payment_requests_to_member"
  ON "payment_requests" ("to_member_id");

CREATE INDEX IF NOT EXISTS "idx_payment_requests_share_token"
  ON "payment_requests" ("share_token");

CREATE INDEX IF NOT EXISTS "idx_expenses_bank_txn_id"
  ON "expenses" ("bank_transaction_id");

CREATE INDEX IF NOT EXISTS "idx_invoices_user_status"
  ON "invoices" ("user_id", "status");

CREATE INDEX IF NOT EXISTS "idx_invoices_user_created"
  ON "invoices" ("user_id", "created_at");

CREATE INDEX IF NOT EXISTS "idx_vat_entries_company_period"
  ON "vat_entries" ("company_id", "period");
