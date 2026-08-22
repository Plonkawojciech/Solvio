/**
 * Sprawdzenie pliku, zanim zapłacimy za OCR.
 *
 * Odrzucamy tu wszystko, co i tak nie ma szans: pustki, pliki ponad limit,
 * HEIC (wymaga wcześniejszej konwersji `/api/v1/convert-heic`) i pliki,
 * których nagłówek nie zgadza się z deklarowanym typem — czyli zwykle
 * przemianowane śmieci albo uszkodzony upload.
 */

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024

export type UploadCheck =
  | { ok: true; buffer: Buffer; mimeType: string }
  | { ok: false; error: string; message: string }

const SUPPORTED = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']

function mimeFromName(name: string): string | null {
  const lower = name.toLowerCase()
  if (/\.(jpg|jpeg)$/.test(lower)) return 'image/jpeg'
  if (/\.png$/.test(lower)) return 'image/png'
  if (/\.webp$/.test(lower)) return 'image/webp'
  if (/\.pdf$/.test(lower)) return 'application/pdf'
  if (/\.hei[cf]$/.test(lower)) return 'image/heic'
  return null
}

function headerMatches(buffer: Buffer, mimeType: string): boolean {
  const h = buffer.subarray(0, 12)
  if (mimeType === 'application/pdf') {
    return h[0] === 0x25 && h[1] === 0x50 && h[2] === 0x44 && h[3] === 0x46
  }
  const jpeg = h[0] === 0xff && h[1] === 0xd8
  const png = h[0] === 0x89 && h[1] === 0x50 && h[2] === 0x4e && h[3] === 0x47
  const webp = h[0] === 0x52 && h[1] === 0x49 && h[2] === 0x46 && h[3] === 0x46
    && h[8] === 0x57 && h[9] === 0x45 && h[10] === 0x42 && h[11] === 0x50
  return jpeg || png || webp
}

export async function validateUpload(file: File): Promise<UploadCheck> {
  if (file.size === 0) {
    return { ok: false, error: 'empty_file', message: 'Plik jest pusty' }
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return {
      ok: false,
      error: 'file_too_large',
      message: `Plik ma ${(file.size / 1024 / 1024).toFixed(1)} MB, limit to ${MAX_UPLOAD_BYTES / 1024 / 1024} MB`,
    }
  }

  const declared = file.type && file.type !== 'application/octet-stream' ? file.type : null
  const mimeType = declared ?? mimeFromName(file.name) ?? 'image/jpeg'

  if (mimeType === 'image/heic' || mimeType === 'image/heif') {
    return {
      ok: false,
      error: 'heic_needs_conversion',
      message: 'Pliki HEIC trzeba najpierw przekonwertować przez /api/v1/convert-heic',
    }
  }
  if (!SUPPORTED.includes(mimeType)) {
    return { ok: false, error: 'invalid_type', message: `Nieobsługiwany typ pliku: ${mimeType}` }
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  if (buffer.length === 0) {
    return { ok: false, error: 'empty_file', message: 'Plik jest pusty' }
  }
  if (!headerMatches(buffer, mimeType)) {
    return {
      ok: false,
      error: 'invalid_format',
      message: 'Zawartość pliku nie zgadza się z jego typem',
    }
  }

  return { ok: true, buffer, mimeType }
}
