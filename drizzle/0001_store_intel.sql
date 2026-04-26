-- Migration 0001: store_intel table
--
-- Persistent cache of live shopping intelligence (leaflet URLs, opening
-- hours, AI shopping-optimize results, per-product price snapshots).
-- Replaces the per-route in-memory Maps that vanished on serverless
-- cold-starts.
--
-- This file is a manual fallback — drizzle-kit's `db:push` will produce
-- the same schema from `lib/db/schema.ts:storeIntel`. If you have
-- `DATABASE_URL` set in your env, prefer:
--     npm run db:push
-- which keeps the schema and the live DB in lockstep.
--
-- Manual application (when only Neon admin access is available):
--     psql $DATABASE_URL -f drizzle/0001_store_intel.sql
-- The CREATE statements use `IF NOT EXISTS` so re-running is safe.

CREATE TABLE IF NOT EXISTS "store_intel" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "kind" varchar(32) NOT NULL,
  "key" varchar(256) NOT NULL,
  "data" jsonb NOT NULL,
  "fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "revalidate_after" timestamp with time zone,
  "source" text
);

CREATE UNIQUE INDEX IF NOT EXISTS "store_intel_kind_key"
  ON "store_intel" ("kind", "key");

CREATE INDEX IF NOT EXISTS "idx_store_intel_expires_at"
  ON "store_intel" ("expires_at");
