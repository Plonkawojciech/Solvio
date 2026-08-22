import crypto from 'crypto'
import { and, eq } from 'drizzle-orm'
import { db, expenses, receipts } from '@/lib/db'
import { dbBatch } from '@/lib/db/batch'
import { makeKeywordFallback, type CatRef } from '@/lib/categorize'
import { resolveCategory, syncExpenseWithCrm } from '@/lib/expense-core'
import { findStoreInText, normalizeStoreName } from '@/lib/stores'
import { putImage } from '@/lib/receipts/storage'
import { processAzureOCR } from './azure'
import { readReceiptWithVision } from './vision'
import { extractReceiptData } from './extract'
import { categorizeAndTranslateItems, extractMerchantWithAI } from './enrich'
import { getExchangeRate, getExchangeRates } from './fx'
import { AZURE_ENDPOINT, AZURE_KEY, log, OCR_ERROR_CODES } from './shared'

/**
 * Jeden paragon od bajtów do zapisanego wydatku.
 *
 * Trasa `/api/v1/ocr-receipt` jest już tylko pętlą po plikach — cała robota
 * jest tutaj, gdzie da się ją czytać i testować bez podnoszenia HTTP.
 *
 * Kolejność ma znaczenie: **odcisk pliku sprawdzamy PRZED OCR-em**. Ten sam
 * plik wysłany drugi raz kosztowałby drugie wywołanie modelu, a i tak
 * skończyłby jako duplikat.
 */

export interface ReceiptFileResult {
  file: string
  success: boolean
  receipt_id?: string
  expense_id?: string | null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data?: Record<string, any>
  error?: string
  message?: string
}

export interface ProcessParams {
  userId: string
  receiptId: string
  fileName: string
  buffer: Buffer
  mimeType: string
  categories: CatRef[]
  accountCurrency: string
  label: string
}

/** Odcisk pliku — dwa te same bajty to zawsze ten sam paragon. */
export function fileHash(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex')
}

export async function findByHash(userId: string, hash: string) {
  const [row] = await db.select({ id: receipts.id, createdAt: receipts.createdAt })
    .from(receipts)
    .where(and(eq(receipts.userId, userId), eq(receipts.hash, hash), eq(receipts.status, 'processed')))
    .limit(1)
  return row ?? null
}

export async function processReceiptFile(params: ProcessParams): Promise<ReceiptFileResult> {
  const { userId, receiptId, fileName, buffer, mimeType, categories, accountCurrency, label } = params

  const hash = fileHash(buffer)
  const alreadyKnown = await findByHash(userId, hash)
  if (alreadyKnown) {
    log(`${label} 🛑 identyczny plik już wgrany (${alreadyKnown.id}) — OCR pominięty`)
    await db.delete(receipts).where(and(eq(receipts.id, receiptId), eq(receipts.userId, userId)))
    return {
      file: fileName,
      success: false,
      error: 'duplicate',
      message: `Ten paragon jest już wgrany (${new Date(alreadyKnown.createdAt).toLocaleDateString('pl-PL')})`,
      receipt_id: alreadyKnown.id,
    }
  }

  const useAzure = !!(AZURE_ENDPOINT && AZURE_KEY)
  const [imageKey, ocr] = await Promise.all([
    putImage({ userId, receiptId, filename: fileName, buffer, contentType: mimeType }),
    useAzure
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ? processAzureOCR(buffer, mimeType).then((azure: any) => ({ azure, model: 'azure-prebuilt-receipt' }))
      : readReceiptWithVision(buffer, mimeType).then((r) => ({ azure: r.azure, model: r.meta.model })),
  ])

  const extracted = await extractReceiptData(ocr.azure)
  const { merchant: preliminaryMerchant, date, time, currency, items, promotions, totalSaved } = extracted
  const rawText: string = ocr.azure?.analyzeResult?.content ?? ''

  // Suma z pozycji ratuje paragony, na których model nie znalazł linii „SUMA".
  // Bez tego wydatek lądował z kwotą 0 i wymagał ręcznej poprawki.
  const itemsSum = Math.round(items.reduce((sum, item) => sum + (item.price ?? 0), 0) * 100) / 100
  const finalTotal = extracted.total ?? (itemsSum > 0 ? itemsSum : 0)
  if (extracted.total === null && itemsSum > 0) {
    log(`${label} ⚠️ brak kwoty na paragonie — użyto sumy pozycji: ${itemsSum}`)
  }
  const finalDate = date || new Date().toISOString().slice(0, 10)

  // Trzeci poziom rozpoznania sklepu (AI) tylko wtedy, gdy dwa pierwsze
  // (pole modelu + skan tekstu po słowniku sieci) nic nie dały.
  const isCanonical = preliminaryMerchant
    && preliminaryMerchant !== 'Unknown Store'
    && findStoreInText(preliminaryMerchant) === preliminaryMerchant

  const [rates, recent, categorization, aiMerchant] = await Promise.all([
    currency !== accountCurrency ? getExchangeRates() : Promise.resolve({}),
    db.select({
      id: receipts.id,
      date: receipts.date,
      total: receipts.total,
      vendor: receipts.vendor,
      createdAt: receipts.createdAt,
    }).from(receipts)
      .where(and(eq(receipts.userId, userId), eq(receipts.status, 'processed')))
      .limit(50),
    withTimeout(categorizeAndTranslateItems(items, categories, rawText, preliminaryMerchant), 12_000, null),
    isCanonical
      ? Promise.resolve(null)
      : withTimeout(extractMerchantWithAI(rawText), 6_000, null),
  ])

  const finalMerchant = normalizeStoreName(aiMerchant || preliminaryMerchant || 'Unknown Store')
  const exchangeRate = getExchangeRate(currency, accountCurrency, rates)

  // Drugie sito na duplikaty: ten sam sklep, dzień i kwota. Łapie paragon
  // sfotografowany dwa razy pod innym kątem, którego odcisk się różni.
  const twin = recent.find((r) =>
    r.vendor === finalMerchant
    && r.date === finalDate
    && Math.abs(Number(r.total ?? 0) - finalTotal) < 0.01)
  if (twin) {
    const [linked] = await db.select({ id: expenses.id }).from(expenses)
      .where(and(eq(expenses.receiptId, twin.id), eq(expenses.userId, userId))).limit(1)
    if (linked) {
      log(`${label} 🛑 duplikat po sklepie/dacie/kwocie (${twin.id})`)
      await db.delete(receipts).where(and(eq(receipts.id, receiptId), eq(receipts.userId, userId)))
      return {
        file: fileName,
        success: false,
        error: 'duplicate',
        message: `Ten paragon jest już wgrany (${new Date(twin.createdAt).toLocaleDateString('pl-PL')})`,
        receipt_id: twin.id,
      }
    }
  }

  const categorized = categorization?.items
    ?? items.map((item) => ({ ...item, nameClean: null, nameTranslated: null, category_id: null }))
  const detectedLanguage = categorization?.detectedLanguage ?? 'pl'

  const keywordFallback = makeKeywordFallback(categories)
  const finalItems = categorized.map((item) => item.category_id
    ? item
    : { ...item, category_id: keywordFallback(item.name) })

  const categoryId = await pickCategory(userId, finalItems, finalMerchant)

  await dbBatch((x) => [
    x.update(receipts).set({
      status: 'processed',
      vendor: finalMerchant,
      date: finalDate,
      total: String(finalTotal),
      currency,
      imageUrl: imageKey,
      hash,
      exchangeRate: exchangeRate ? String(exchangeRate) : null,
      detectedLanguage,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      items: finalItems as any,
      // Surowy odczyt zostaje w bazie: bez niego nie da się ani sprawdzić,
      // czy model źle przeczytał paragon, ani przeliczyć go ponownie bez
      // płacenia za OCR drugi raz.
      rawOcr: {
        text: rawText.slice(0, 8000),
        promotions,
        totalSaved,
        model: ocr.model,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
    }).where(and(eq(receipts.id, receiptId), eq(receipts.userId, userId))),
    x.delete(expenses).where(and(eq(expenses.receiptId, receiptId), eq(expenses.userId, userId))),
    x.insert(expenses).values({
      userId,
      receiptId,
      title: finalMerchant,
      amount: String(finalTotal),
      currency,
      date: finalDate,
      vendor: finalMerchant,
      categoryId,
    }),
  ])

  const [createdExpense] = await db.select({ id: expenses.id }).from(expenses)
    .where(and(eq(expenses.receiptId, receiptId), eq(expenses.userId, userId))).limit(1)

  if (createdExpense?.id) {
    try {
      await syncExpenseWithCrm(userId, createdExpense.id)
    } catch (err) {
      console.error('[OCR] most do CRM-a nie zadziałał (nie blokuje skanu):', err)
    }
  }

  log(`${label} ✅ ${finalMerchant} ${finalTotal} ${currency}, pozycji=${finalItems.length}, kategoria=${categoryId ?? 'brak'}`)

  return {
    file: fileName,
    success: true,
    receipt_id: receiptId,
    expense_id: createdExpense?.id ?? null,
    data: {
      merchant: finalMerchant,
      total: finalTotal,
      currency,
      category_id: categoryId,
      date: finalDate,
      time,
      exchangeRate,
      detectedLanguage,
      items: finalItems,
      items_count: finalItems.length,
      promotions,
      totalSaved,
      hasImage: !!imageKey,
      model: ocr.model,
    },
  }
}

/**
 * Kategoria paragonu = ta, na którą poszło NAJWIĘCEJ pieniędzy, a nie
 * kategoria najdroższej pojedynczej pozycji. Paragon z ośmioma produktami
 * spożywczymi i jedną drogą żarówką lądował wcześniej w „Dom i ogród".
 */
async function pickCategory(
  userId: string,
  items: Array<{ price: number | null; category_id: string | null }>,
  merchant: string,
): Promise<string | null> {
  const spend = new Map<string, number>()
  for (const item of items) {
    if (!item.category_id) continue
    spend.set(item.category_id, (spend.get(item.category_id) ?? 0) + (item.price ?? 0))
  }
  let best: string | null = null
  let bestSpend = -1
  for (const [id, value] of spend) {
    if (value > bestSpend) { bestSpend = value; best = id }
  }
  if (best) return best
  // Żadna pozycja nie dostała kategorii — zostaje nauczona reguła sprzedawcy,
  // ta sama ścieżka co przy ręcznym dodaniu wydatku.
  return merchant ? resolveCategory(userId, merchant, merchant) : null
}

function withTimeout<T>(work: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    work.catch((err) => {
      console.warn('[OCR] etap wzbogacania nie powiódł się:', err)
      return fallback
    }),
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ])
}

/** Kod błędu dla klienta — apka tłumaczy go na zdanie po polsku. */
export function classifyError(error: unknown): { error: string; message: string } {
  const message = error instanceof Error ? error.message : String(error)
  if (message === OCR_ERROR_CODES.invalidFormat) {
    return { error: 'invalid_format', message: 'Nie udało się odczytać pliku — może być uszkodzony' }
  }
  if ([OCR_ERROR_CODES.uploadFailed, OCR_ERROR_CODES.pollFailed, OCR_ERROR_CODES.failed].includes(message as never)) {
    return { error: 'ocr_failed', message: 'Odczyt paragonu się nie udał. Spróbuj wyraźniejszego zdjęcia' }
  }
  if ([OCR_ERROR_CODES.timeout, OCR_ERROR_CODES.missingOperation].includes(message as never)) {
    return { error: 'ocr_timeout', message: 'Odczyt paragonu przekroczył czas. Spróbuj za chwilę' }
  }
  if (/PDF receipts require/i.test(message)) {
    return { error: 'invalid_type', message: 'PDF wymaga Azure Document Intelligence — wgraj zdjęcie' }
  }
  if (/pusta odpowiedź|ucięta|nieparsowalny/i.test(message)) {
    return { error: 'ocr_failed', message: 'Model nie odczytał paragonu. Spróbuj wyraźniejszego zdjęcia' }
  }
  return { error: 'unknown', message: 'Nie udało się przetworzyć paragonu' }
}
