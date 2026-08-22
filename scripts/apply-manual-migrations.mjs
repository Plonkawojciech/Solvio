// Apply the idempotent SQL migrations kept in drizzle/*.sql.
//
// drizzle-kit push is still the preferred source-of-truth workflow, but it can
// require an interactive TTY when schema-name prompts appear. This script gives
// deploys and local audits a non-interactive fallback for the checked-in manual
// migrations.
//
// Usage:
//   DATABASE_URL=... npm run db:apply-manual
//   DATABASE_URL=... npm run db:apply-manual -- --only 0004
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { neon } from '@neondatabase/serverless'

const DATABASE_URL = process.env.DATABASE_URL

if (!DATABASE_URL) {
  console.error('DATABASE_URL is required')
  process.exit(1)
}

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const migrationsDir = path.join(rootDir, 'drizzle')
const migrations = [
  '0001_store_intel.sql',
  '0002_perf_indexes.sql',
  '0003_audit_log.sql',
  '0004_rate_limit_buckets.sql',
]

const onlyFlagIndex = process.argv.indexOf('--only')
const onlyPrefix = onlyFlagIndex === -1 ? null : process.argv[onlyFlagIndex + 1]
const selectedMigrations = onlyPrefix
  ? migrations.filter((migration) => migration.startsWith(onlyPrefix))
  : migrations

if (selectedMigrations.length === 0) {
  console.error(`No manual migration matches --only ${onlyPrefix}`)
  process.exit(1)
}

const sql = neon(DATABASE_URL)

function splitStatements(source) {
  return source
    .replace(/^\s*--.*$/gm, '')
    .split(';')
    .map((statement) => statement.trim())
    .filter(Boolean)
}

for (const migration of selectedMigrations) {
  const filePath = path.join(migrationsDir, migration)
  const source = await readFile(filePath, 'utf8')
  const statements = splitStatements(source)

  console.log(`Applying ${migration} (${statements.length} statements)`)
  for (const statement of statements) {
    await sql.query(statement)
  }
}

const [{ exists: rateLimitBucketsExists } = {}] = await sql.query(
  "SELECT to_regclass('public.rate_limit_buckets') IS NOT NULL AS exists",
)

console.log(
  `Manual migrations ready; rate_limit_buckets=${rateLimitBucketsExists ? 'present' : 'missing'}`,
)
