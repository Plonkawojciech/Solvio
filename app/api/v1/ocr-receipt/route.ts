import { NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { requireApiUser } from '@/lib/api-auth'
import { rateLimitPersistent } from '@/lib/rate-limit'
import { db, categories, receipts, userSettings } from '@/lib/db'
import { json, log } from '@/lib/ocr/shared'
import { validateUpload } from '@/lib/ocr/upload'
import { classifyError, processReceiptFile, type ReceiptFileResult } from '@/lib/ocr/pipeline'

/**
 * Skan paragonu. Trasa robi wyłącznie to, co jest trasą HTTP: sprawdza
 * uprawnienia i limit, waliduje pliki i pilnuje pętli. Odczyt, kategoryzacja
 * i zapis siedzą w `lib/ocr/pipeline.ts`.
 *
 * Uwierzytelnienie przez `requireApiUser`, więc działa i sesja (apka), i klucz
 * `slvk_` (integracja — dziś zakładka „Prywatne" w CRM-ie).
 */

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(req: NextRequest) {
  const auth = await requireApiUser(req)
  if (auth instanceof NextResponse) return auth
  const userId = auth.userId

  const limit = await rateLimitPersistent(`ocr:receipt:${userId}`, { maxRequests: 30, windowMs: 60 * 60 * 1000 })
  if (!limit.allowed) {
    return json({ error: 'Limit skanów wyczerpany. Spróbuj później.' }, 429)
  }

  const hasAzureOcr = !!(process.env.AZURE_OCR_ENDPOINT && process.env.AZURE_OCR_KEY)
  const hasAI = !!(
    process.env.OPENAI_API_KEY
    || process.env.GEMINI_API_KEY
    || (process.env.AZURE_OPENAI_ENDPOINT && process.env.AZURE_OPENAI_API_KEY && process.env.AZURE_OPENAI_DEPLOYMENT)
  )
  if (!hasAI && !hasAzureOcr) {
    console.error('[OCR] ❌ brak dostawcy OCR w środowisku')
    return json({ error: 'Usługa nie jest skonfigurowana', success: false }, 500)
  }

  let createdReceiptId: string | null = null
  try {
    const form = await req.formData()
    const requestedReceiptId = (form.get('receiptId') as string | null)?.trim() || null
    const files = form.getAll('files').filter((f): f is File => f instanceof File)

    if (!files.length) {
      return json({ error: 'Brak pliku', missing: ['files'] }, 400)
    }

    const [cats, [settings]] = await Promise.all([
      db.select({ id: categories.id, name: categories.name }).from(categories).where(eq(categories.userId, userId)),
      db.select({ currency: userSettings.currency }).from(userSettings).where(eq(userSettings.userId, userId)).limit(1),
    ])
    const accountCurrency = settings?.currency?.toUpperCase() || 'PLN'
    log(`[OCR] ${files.length} plik(ów), kategorii=${cats.length}, waluta konta=${accountCurrency}`)

    const results: ReceiptFileResult[] = []
    for (const [index, file] of files.entries()) {
      const label = `[Plik ${index + 1}/${files.length}]`
      const check = await validateUpload(file)
      if (!check.ok) {
        console.warn(`${label} odrzucony: ${check.error}`)
        results.push({ file: file.name, success: false, error: check.error, message: check.message })
        continue
      }

      // Pierwszy plik może dostać id z klienta (wiersz założony wcześniej),
      // każdy kolejny dostaje własny paragon.
      let receiptId = index === 0 ? requestedReceiptId : null
      if (!receiptId) {
        const [row] = await db.insert(receipts).values({ userId, status: 'processing' }).returning()
        if (!row) {
          results.push({ file: file.name, success: false, error: 'unknown', message: 'Nie udało się założyć paragonu' })
          continue
        }
        receiptId = row.id
      }
      createdReceiptId = receiptId

      try {
        results.push(await processReceiptFile({
          userId,
          receiptId,
          fileName: file.name,
          buffer: check.buffer,
          mimeType: check.mimeType,
          categories: cats,
          accountCurrency,
          label,
        }))
      } catch (err) {
        console.error(`${label} ❌`, err)
        await db.update(receipts).set({ status: 'failed' }).where(eq(receipts.id, receiptId)).catch(() => {})
        results.push({ file: file.name, success: false, ...classifyError(err) })
      }
    }

    const succeeded = results.filter((r) => r.success).length
    const fatal = succeeded === 0 && results.some((r) =>
      ['empty_file', 'file_too_large', 'invalid_type', 'invalid_format', 'heic_needs_conversion'].includes(r.error ?? ''))

    return json({
      success: succeeded > 0,
      files_processed: results.length,
      files_succeeded: succeeded,
      files_failed: results.length - succeeded,
      results,
      receipt_id: results.find((r) => r.success)?.receipt_id ?? requestedReceiptId,
    }, fatal ? 400 : 200)
  } catch (error) {
    console.error('[OCR] ❌ nieobsłużony błąd:', error)
    if (createdReceiptId) {
      await db.update(receipts).set({ status: 'failed' }).where(eq(receipts.id, createdReceiptId)).catch(() => {})
    }
    return json({ error: 'Nie udało się przetworzyć paragonu. Spróbuj ponownie.', success: false }, 500)
  }
}
