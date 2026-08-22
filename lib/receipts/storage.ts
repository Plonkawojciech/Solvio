import fs from 'fs/promises'
import path from 'path'

/**
 * Gdzie leży zdjęcie paragonu.
 *
 * Historia: pierwotnie Vercel Blob. Solvio stoi na Coolify, gdzie tokenu
 * Blob nie ma i nie będzie, więc `put()` nigdy się nie wykonywało i każdy
 * paragon zapisywał się BEZ zdjęcia. Domyślnym magazynem jest teraz dysk
 * kontenera pod `RECEIPTS_DIR` (wolumen trwały w Coolify) — patrz
 * `docs/plans/paragony-od-a-do-z.md`.
 *
 * W `receipts.image_url` trzymamy albo klucz `local:<user>/<receipt>/<plik>`,
 * albo historyczny absolutny URL Blob. Klient nigdy nie dostaje tej wartości
 * wprost — API oddaje ścieżkę `/api/data/receipts/<id>/image`, żeby zmiana
 * magazynu nie wymagała zmiany w apkach.
 */

const PREFIX = 'local:'

export const receiptsRoot = () =>
  process.env.RECEIPTS_DIR?.trim() || path.join(process.cwd(), '.receipts')

const TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.heic': 'image/heic',
  '.pdf': 'application/pdf',
}

export function contentTypeFor(name: string): string {
  return TYPES[path.extname(name).toLowerCase()] ?? 'application/octet-stream'
}

/** Nazwa pliku bez niespodzianek: bez separatorów, bez `..`, z rozszerzeniem. */
export function safeFileName(name: string, contentType: string): string {
  const base = path.basename(name || 'paragon').replace(/[^a-zA-Z0-9._-]/g, '-').slice(-80)
  const cleaned = base.replace(/^[.-]+/, '') || 'paragon'
  if (path.extname(cleaned)) return cleaned
  const ext = Object.entries(TYPES).find(([, type]) => type === contentType)?.[0] ?? '.jpg'
  return cleaned + ext
}

export function isLocalKey(stored: string | null | undefined): stored is string {
  return typeof stored === 'string' && stored.startsWith(PREFIX)
}

/** Bezwzględna ścieżka pliku dla klucza. `null`, gdy klucz próbuje wyjść z katalogu. */
function resolveLocal(stored: string): string | null {
  const root = path.resolve(receiptsRoot())
  const full = path.resolve(root, stored.slice(PREFIX.length))
  return full === root || full.startsWith(root + path.sep) ? full : null
}

export async function putImage(input: {
  userId: string
  receiptId: string
  filename: string
  buffer: Buffer
  contentType: string
}): Promise<string | null> {
  const name = safeFileName(input.filename, input.contentType)
  const key = `${PREFIX}${input.userId}/${input.receiptId}/${name}`
  const full = resolveLocal(key)
  if (!full) return null
  try {
    await fs.mkdir(path.dirname(full), { recursive: true })
    await fs.writeFile(full, input.buffer)
    return key
  } catch (err) {
    // Brak zdjęcia nie może wywrócić skanu — paragon bez obrazka nadal
    // niesie kwotę, pozycje i kategorię.
    console.warn('[receipts/storage] zapis zdjęcia nieudany:', err)
    return null
  }
}

export interface StoredImage {
  buffer: Buffer
  contentType: string
}

/** `redirect` dla historycznych URL-i Blob — bajtów nie mamy u siebie. */
export type ImageRead =
  | { kind: 'bytes'; image: StoredImage }
  | { kind: 'redirect'; url: string }
  | null

export async function readImage(stored: string | null | undefined): Promise<ImageRead> {
  if (!stored) return null
  if (!isLocalKey(stored)) {
    return /^https?:\/\//.test(stored) ? { kind: 'redirect', url: stored } : null
  }
  const full = resolveLocal(stored)
  if (!full) return null
  try {
    const buffer = await fs.readFile(full)
    return { kind: 'bytes', image: { buffer, contentType: contentTypeFor(full) } }
  } catch {
    return null
  }
}

export async function removeImage(stored: string | null | undefined): Promise<void> {
  if (!stored) return
  if (isLocalKey(stored)) {
    const full = resolveLocal(stored)
    if (!full) return
    await fs.rm(full, { force: true }).catch(() => {})
    // Katalog paragonu zostaje pusty — sprzątamy, żeby wolumen nie zbierał
    // tysięcy pustych folderów. Niepusty katalog `rmdir` po prostu odrzuci.
    await fs.rmdir(path.dirname(full)).catch(() => {})
    return
  }
  if (process.env.BLOB_READ_WRITE_TOKEN && /^https?:\/\//.test(stored)) {
    try {
      const { del } = await import('@vercel/blob')
      await del(stored)
    } catch {
      // sprzątanie po staruszku — brak reakcji jest w porządku
    }
  }
}

/** Ścieżka, którą dostają klienci. Jedna dla każdego magazynu. */
export function publicImagePath(receiptId: string): string {
  return `/api/data/receipts/${receiptId}/image`
}
