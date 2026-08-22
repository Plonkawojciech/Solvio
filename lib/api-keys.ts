import crypto from 'crypto'
import { and, desc, eq } from 'drizzle-orm'
import { db } from './db'
import { apiKeys } from './db/schema'

/**
 * Klucze API dla integracji. Ciasteczko sesji uwierzytelnia człowieka w apce;
 * wszystko, co apką nie jest — skrypt, CRM, agent — dostaje taki klucz i
 * domyślnie może wyłącznie czytać.
 *
 * Konwencja jest celowo identyczna z crm.programo.pl (`src/lib/api-keys-core.ts`),
 * żeby kod integracji po stronie CRM-a wyglądał tak samo w obie strony.
 */

export type ApiKeyScope = 'READ' | 'WRITE'

export function isApiKeyScope(v: unknown): v is ApiKeyScope {
  return v === 'READ' || v === 'WRITE'
}

/** Po tym przedrostku warstwa auth poznaje klucz API wśród innych tokenów. */
export const API_KEY_PREFIX = 'slvk_'

function hashKey(plaintext: string): string {
  return crypto.createHash('sha256').update(plaintext).digest('hex')
}

export interface IssuedApiKey {
  id: string
  name: string
  prefix: string
  scope: ApiKeyScope
  createdAt: string
  /** Pokazany raz, potem nie do odzyskania. */
  plaintext: string
}

export async function createApiKey(
  userId: string,
  input: { name: string; scope: ApiKeyScope; expiresAt?: Date | null },
): Promise<IssuedApiKey> {
  const prefix = crypto.randomBytes(4).toString('hex')
  const secret = crypto.randomBytes(32).toString('base64url')
  const plaintext = `${API_KEY_PREFIX}${prefix}_${secret}`

  const [row] = await db.insert(apiKeys).values({
    userId,
    name: input.name,
    hash: hashKey(plaintext),
    prefix,
    scope: input.scope,
    expiresAt: input.expiresAt ?? null,
  }).returning()

  return {
    id: row.id,
    name: row.name,
    prefix: row.prefix,
    scope: input.scope,
    createdAt: row.createdAt.toISOString(),
    plaintext,
  }
}

export interface ApiKeyView {
  id: string
  name: string
  prefix: string
  scope: ApiKeyScope
  lastUsedAt: string | null
  expiresAt: string | null
  revokedAt: string | null
  createdAt: string
}

export async function listApiKeys(userId: string): Promise<ApiKeyView[]> {
  const rows = await db.select().from(apiKeys)
    .where(eq(apiKeys.userId, userId))
    .orderBy(desc(apiKeys.createdAt))
  // Czego tu nie ma: `hash`. Żaden endpoint nie potrafi oddać sekretu po
  // utworzeniu — z konstrukcji, nie z przeoczenia.
  return rows.map((k) => ({
    id: k.id,
    name: k.name,
    prefix: k.prefix,
    scope: isApiKeyScope(k.scope) ? k.scope : 'READ',
    lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
    expiresAt: k.expiresAt?.toISOString() ?? null,
    revokedAt: k.revokedAt?.toISOString() ?? null,
    createdAt: k.createdAt.toISOString(),
  }))
}

/** Unieważnienie zostawia wiersz — to ślad audytowy, nie śmieć. */
export async function revokeApiKey(userId: string, id: string): Promise<boolean> {
  const updated = await db.update(apiKeys)
    .set({ revokedAt: new Date() })
    .where(and(eq(apiKeys.id, id), eq(apiKeys.userId, userId)))
    .returning({ id: apiKeys.id })
  return updated.length > 0
}

export interface ResolvedApiKey {
  id: string
  scope: ApiKeyScope
  userId: string
}

/**
 * Rozwiązuje przedstawiony klucz. Zwraca null dla wszystkiego, co niezdatne —
 * nieznane, unieważnione, wygasłe — żeby wywołujący nie mógł przez pomyłkę
 * potraktować „wygasłego" jako „zalogowanego z mniejszymi prawami".
 */
export async function resolveApiKey(plaintext: string): Promise<ResolvedApiKey | null> {
  if (!plaintext.startsWith(API_KEY_PREFIX)) return null

  const hash = hashKey(plaintext)
  const [key] = await db.select().from(apiKeys).where(eq(apiKeys.hash, hash)).limit(1)
  if (!key) return null

  // Wyżej jest trafienie w indeks po haszu, więc czas nie zależy od sekretu,
  // ale porównanie robimy jawnie, zamiast ufać, że ORM dopasował to, co myślimy.
  const presented = Buffer.from(hash, 'hex')
  const stored = Buffer.from(key.hash, 'hex')
  if (presented.length !== stored.length || !crypto.timingSafeEqual(presented, stored)) return null

  if (key.revokedAt) return null
  if (key.expiresAt && key.expiresAt.getTime() <= Date.now()) return null

  void touchLastUsed(key.id, key.lastUsedAt)

  return { id: key.id, scope: isApiKeyScope(key.scope) ? key.scope : 'READ', userId: key.userId }
}

/** Najwyżej jeden UPDATE na klucz na minutę: „ostatnio użyty" służy do
 *  wykrycia martwej integracji, nie do liczenia żądań. */
const TOUCH_INTERVAL_MS = 60_000

async function touchLastUsed(id: string, lastUsedAt: Date | null): Promise<void> {
  const now = Date.now()
  if (lastUsedAt && now - lastUsedAt.getTime() < TOUCH_INTERVAL_MS) return
  try {
    await db.update(apiKeys).set({ lastUsedAt: new Date(now) }).where(eq(apiKeys.id, id))
  } catch {
    // Księgowanie nie może wywrócić żądania, które skądinąd jest autoryzowane.
  }
}

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

export function scopeAllowsMethod(scope: ApiKeyScope, method: string): boolean {
  return scope === 'WRITE' || READ_METHODS.has(method.toUpperCase())
}
