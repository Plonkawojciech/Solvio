// Wydzielone z `app/api/v1/ocr-receipt/route.ts` (1598 linii w jednym pliku).
// Trasa jest teraz wyłącznie orkiestracją: uwierzytelnienie, pętla po plikach
// i zapis. Cała robota siedzi w `lib/ocr/*`, gdzie da się ją czytać i testować
// bez podnoszenia handlera HTTP.

/** Mniej gadatliwe logowanie na produkcji: przechodzą tylko wyniki i błędy. */
const isProduction = process.env.NODE_ENV === 'production'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const log = (message: string, ...args: any[]) => {
  if (!isProduction || message.includes('✅') || message.includes('❌') || message.includes('ERROR')) {
    console.log(message, ...args)
  }
}

/** Konfiguracja Azure Document Intelligence. `null` = brak wpiętego Azure,
 *  wtedy trasa spada na ścieżkę Vision (`lib/ocr/providers.ts`). */
export const AZURE_ENDPOINT = process.env.AZURE_OCR_ENDPOINT
export const AZURE_KEY = process.env.AZURE_OCR_KEY

export const OCR_ERROR_CODES = {
  invalidFormat: 'OCR_AZURE_INVALID_FORMAT',
  uploadFailed: 'OCR_AZURE_POST_FAILED',
  pollFailed: 'OCR_AZURE_GET_FAILED',
  failed: 'OCR_AZURE_FAILED',
  timeout: 'OCR_AZURE_TIMEOUT',
  missingOperation: 'OCR_AZURE_NO_OPERATION_LOCATION',
} as const

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

// Parses locale-aware decimal strings (Polish "1.234,56" or English "1,234.56" or "12,50").
// Returns null if input is unparseable.
export function parseLocaleDecimal(raw: string): number | null {
  if (!raw || typeof raw !== 'string') return null;
  const cleaned = raw.replace(/[^\d.,-]/g, '').trim();
  if (!cleaned) return null;
  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');
  let normalized: string;
  if (lastComma === -1 && lastDot === -1) {
    normalized = cleaned;
  } else if (lastComma > lastDot) {
    const afterComma = cleaned.slice(lastComma + 1);
    if (afterComma.length === 3 && lastDot === -1) {
      // "1,200" — comma is thousands separator, not decimal
      normalized = cleaned.replace(/,/g, '');
    } else {
      // "1.234,56" or "12,50" — comma is decimal separator
      normalized = cleaned.replace(/\./g, '').replace(',', '.');
    }
  } else {
    const afterDot = cleaned.slice(lastDot + 1);
    if (afterDot.length === 3 && lastComma === -1) {
      // "1.200" — dot is thousands separator (European)
      normalized = cleaned.replace(/\./g, '');
    } else {
      // "1,234.56" — dot is decimal separator
      normalized = cleaned.replace(/,/g, '');
    }
  }
  const parsed = parseFloat(normalized);
  return isNaN(parsed) ? null : parsed;
}
