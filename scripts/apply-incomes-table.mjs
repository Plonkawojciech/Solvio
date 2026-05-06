// One-shot migration: create the `incomes` table on Neon. Run with
//   DATABASE_URL=... node scripts/apply-incomes-table.mjs
// Idempotent — uses CREATE TABLE IF NOT EXISTS.
import { neon } from '@neondatabase/serverless'

const sql = neon(process.env.DATABASE_URL)

await sql`
  CREATE TABLE IF NOT EXISTS incomes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id text NOT NULL,
    name varchar(120) NOT NULL,
    amount decimal(14,2) NOT NULL,
    period varchar(12) NOT NULL DEFAULT 'monthly',
    emoji varchar(10) DEFAULT '💼',
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
  )
`

await sql`CREATE INDEX IF NOT EXISTS idx_incomes_user_id ON incomes(user_id)`

console.log('incomes table ready')
