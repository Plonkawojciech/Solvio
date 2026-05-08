-- Round 5 / Worker 1 — persistent rate limit buckets.
-- Serverless-safe counter storage for high-risk auth/AI/OCR/bank/report
-- routes. Apply via `npm run db:push` or `psql -f`.

CREATE TABLE IF NOT EXISTS "rate_limit_buckets" (
  "bucket_key" varchar(64) PRIMARY KEY,
  "count" integer NOT NULL DEFAULT 1,
  "reset_at" timestamptz NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_rate_limit_buckets_reset_at"
  ON "rate_limit_buckets" ("reset_at");

CREATE INDEX IF NOT EXISTS "idx_rate_limit_buckets_updated_at"
  ON "rate_limit_buckets" ("updated_at");
