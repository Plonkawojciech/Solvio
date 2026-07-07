import { neon, neonConfig } from '@neondatabase/serverless'
import { drizzle as drizzleNeon } from 'drizzle-orm/neon-http'
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from './schema'

// LOCAL DEV ONLY — routes the Neon HTTP driver at a local Postgres proxy
// (github.com/TimoWilhelm/local-neon-http-proxy) instead of Neon's cloud API.
// No-op unless LOCAL_NEON_PROXY_PORT is set in .env.local.
if (process.env.LOCAL_NEON_PROXY_PORT) {
  const port = process.env.LOCAL_NEON_PROXY_PORT
  neonConfig.fetchEndpoint = (host) => `http://${host}:${port}/sql`
  neonConfig.useSecureWebSocket = false
  neonConfig.poolQueryViaFetch = true
}

// Wybór drivera:
//  - Neon (serverless HTTP) — gdy URL wskazuje na *.neon.tech, gdy działa
//    lokalne proxy Neon, albo gdy wymuszono DATABASE_PROVIDER=neon (Vercel).
//  - node-postgres (pg Pool) — każdy zwykły PostgreSQL (Docker/Coolify/VPS).
function shouldUseNeonDriver(url: string): boolean {
  if (process.env.DATABASE_PROVIDER === 'neon') return true
  if (process.env.DATABASE_PROVIDER === 'postgres') return false
  if (process.env.LOCAL_NEON_PROXY_PORT) return true
  return /\.neon\.tech\b/.test(url)
}

function getDb() {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is not set')
  if (shouldUseNeonDriver(url)) {
    const sql = neon(url)
    return drizzleNeon(sql, { schema })
  }
  const pool = new Pool({
    connectionString: url,
    max: 10,
    // Samopodpisane certy na prywatnych VM — sslmode w URL nadal działa
    ssl: /sslmode=require/.test(url) ? { rejectUnauthorized: false } : undefined,
  })
  // Oba drizzle expose identyczne query API; typujemy po stronie Neon,
  // żeby nie zmieniać sygnatur w całej aplikacji.
  return drizzlePg(pool, { schema }) as unknown as ReturnType<typeof drizzleNeon<typeof schema>>
}

// Lazy singleton
let _db: ReturnType<typeof getDb> | null = null
export const db = new Proxy({} as ReturnType<typeof getDb>, {
  get(_target, prop) {
    if (!_db) _db = getDb()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (_db as any)[prop]
  },
})

export * from './schema'
