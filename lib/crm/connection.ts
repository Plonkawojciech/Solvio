import { eq } from 'drizzle-orm'
import { db } from '../db'
import { crmConnections } from '../db/schema'
import { open, seal } from '../crypto-box'

/**
 * Przechowanie i odczyt połączenia z crm.programo.pl.
 *
 * Klucz CRM-a trzymamy ZASZYFROWANY (AES-256-GCM), bo w odróżnieniu od
 * naszych własnych kluczy musimy go odtworzyć, żeby wykonać żądanie.
 * Na telefon nie trafia nigdy — apka rozmawia wyłącznie z Solvio.
 */

export interface CrmConnection {
  baseUrl: string
  apiKey: string
  autoPush: boolean
  defaultCategory: string
}

export interface CrmConnectionView {
  connected: boolean
  baseUrl: string
  apiKeyHint: string | null
  autoPush: boolean
  defaultCategory: string
  lastSyncAt: string | null
  lastError: string | null
}

export async function getCrmConnection(userId: string): Promise<CrmConnection | null> {
  const [row] = await db.select().from(crmConnections).where(eq(crmConnections.userId, userId)).limit(1)
  if (!row) return null
  const apiKey = open(row.apiKeyEnc)
  // Null oznacza, że sekret jest nieodczytywalny (rotacja SESSION_SECRET).
  // Lepiej zachować się jak „brak połączenia" niż strzelać do CRM-a śmieciem.
  if (!apiKey) return null
  return {
    baseUrl: row.baseUrl.replace(/\/+$/, ''),
    apiKey,
    autoPush: row.autoPush,
    defaultCategory: row.defaultCategory,
  }
}

export async function getCrmConnectionView(userId: string): Promise<CrmConnectionView> {
  const [row] = await db.select().from(crmConnections).where(eq(crmConnections.userId, userId)).limit(1)
  if (!row) {
    return {
      connected: false,
      baseUrl: 'https://crm.programo.pl',
      apiKeyHint: null,
      autoPush: false,
      defaultCategory: 'solvio',
      lastSyncAt: null,
      lastError: null,
    }
  }
  return {
    connected: true,
    baseUrl: row.baseUrl,
    apiKeyHint: row.apiKeyHint,
    autoPush: row.autoPush,
    defaultCategory: row.defaultCategory,
    lastSyncAt: row.lastSyncAt?.toISOString() ?? null,
    lastError: row.lastError,
  }
}

export async function saveCrmConnection(
  userId: string,
  input: { baseUrl: string; apiKey: string; autoPush: boolean; defaultCategory: string },
): Promise<void> {
  const values = {
    userId,
    baseUrl: input.baseUrl.replace(/\/+$/, ''),
    apiKeyEnc: seal(input.apiKey),
    apiKeyHint: input.apiKey.slice(-4),
    autoPush: input.autoPush,
    defaultCategory: input.defaultCategory,
    lastError: null,
    updatedAt: new Date(),
  }
  await db.insert(crmConnections).values(values).onConflictDoUpdate({
    target: crmConnections.userId,
    set: values,
  })
}

export async function deleteCrmConnection(userId: string): Promise<void> {
  await db.delete(crmConnections).where(eq(crmConnections.userId, userId))
}

/** Znacznik ostatniej synchronizacji i ostatni błąd — widoczne w ustawieniach.
 *  Księgowanie nie może wywrócić samej synchronizacji, stąd cichy catch. */
export async function markSync(userId: string, error: string | null): Promise<void> {
  try {
    await db.update(crmConnections)
      .set({ lastSyncAt: new Date(), lastError: error, updatedAt: new Date() })
      .where(eq(crmConnections.userId, userId))
  } catch {
    // celowo cicho
  }
}

/** Sprawdzenie, że wklejony klucz naprawdę działa — wołane PRZED zapisem,
 *  żeby „połączono" nie znaczyło tylko „zapisano tekst". */
export async function testCrmConnection(conn: CrmConnection) {
  const { call } = await import('./http')
  return call(conn, '/api/v1/finance/summary', { method: 'GET' })
}
