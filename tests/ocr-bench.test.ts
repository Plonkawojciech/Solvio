import { describe, it } from 'vitest'
import fs from 'fs'
import path from 'path'
import { readReceiptWithVision } from '@/lib/ocr/vision'
import { extractReceiptData } from '@/lib/ocr/extract'

/**
 * Benchmark odczytu paragonów — porównuje modele vision na tym samym
 * zestawie wygenerowanych paragonów (`scripts/receipt-fixtures/gen.py`).
 *
 * Nie chodzi w nim o „przechodzi / nie przechodzi", tylko o liczby, na
 * podstawie których wybieramy `OCR_VISION_MODEL`. Kosztuje pieniądze
 * i wymaga sieci, więc jest wyłączony domyślnie:
 *
 *     OCR_BENCH=1 OCR_BENCH_MODELS=gpt-4o-mini,gpt-4.1-mini \
 *       npx vitest run tests/ocr-bench.test.ts
 */

const FIXTURES = path.join(process.cwd(), 'tests', 'fixtures', 'receipts')

interface Truth {
  merchant: string
  date: string
  currency: string
  total: number
  itemCount: number
  items: Array<{ name: string; quantity: number; unitPrice: number; totalPrice: number }>
  discountCount: number
  note: string
}

interface Score {
  slug: string
  model: string
  merchantOk: boolean
  totalOk: boolean
  dateOk: boolean
  currencyOk: boolean
  itemCountDelta: number
  itemRecall: number
  priceSumDelta: number
  promotionsFound: number
  durationMs: number
  error?: string
}

const fold = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\u0142/g, 'l').replace(/[^a-z0-9]/g, '')

/** Ile słów z nazwy wzorcowej pojawia się w odczytanej — nazwy bywają czyszczone. */
function nameMatches(truth: string, read: string): boolean {
  const a = fold(truth)
  const b = fold(read)
  if (!a || !b) return false
  if (a.includes(b) || b.includes(a)) return true
  const words = truth.toLowerCase().split(/\s+/).filter(w => w.length >= 4).map(fold)
  if (!words.length) return false
  return words.filter(w => b.includes(w)).length / words.length >= 0.5
}

function score(slug: string, model: string, truth: Truth, read: {
  merchant: string | null
  total: number | null
  date: string | null
  currency: string
  items: Array<{ name: string; price: number | null }>
  promotions: unknown[]
}, durationMs: number): Score {
  const matched = truth.items.filter(t => read.items.some(r => nameMatches(t.name, r.name))).length
  const priceSum = read.items.reduce((s, i) => s + (i.price ?? 0), 0)
  const truthSum = truth.items.reduce((s, i) => s + i.totalPrice, 0)
  return {
    slug,
    model,
    merchantOk: !!read.merchant && fold(read.merchant) === fold(truth.merchant),
    totalOk: read.total != null && Math.abs(read.total - truth.total) < 0.01,
    dateOk: read.date === truth.date,
    currencyOk: read.currency === truth.currency,
    itemCountDelta: read.items.length - truth.itemCount,
    itemRecall: truth.itemCount ? matched / truth.itemCount : 1,
    priceSumDelta: Math.round((priceSum - truthSum) * 100) / 100,
    promotionsFound: read.promotions.length,
    durationMs,
  }
}

function table(rows: Score[]): string {
  const head = ['paragon', 'model', 'sklep', 'suma', 'data', 'wal.', 'poz.', 'trafność', 'Δcen', 'promo', 'ms']
  const body = rows.map(r => r.error
    ? [r.slug, r.model, 'BŁĄD: ' + r.error.slice(0, 60), '', '', '', '', '', '', '', String(r.durationMs)]
    : [
      r.slug, r.model,
      r.merchantOk ? 'ok' : 'NIE', r.totalOk ? 'ok' : 'NIE', r.dateOk ? 'ok' : 'NIE', r.currencyOk ? 'ok' : 'NIE',
      r.itemCountDelta === 0 ? 'ok' : (r.itemCountDelta > 0 ? `+${r.itemCountDelta}` : String(r.itemCountDelta)),
      `${Math.round(r.itemRecall * 100)}%`,
      r.priceSumDelta.toFixed(2),
      String(r.promotionsFound),
      String(r.durationMs),
    ])
  const all = [head, ...body]
  const widths = head.map((_, i) => Math.max(...all.map(r => (r[i] ?? '').length)))
  return all.map(r => r.map((c, i) => (c ?? '').padEnd(widths[i])).join('  ')).join('\n')
}

describe.skipIf(!process.env.OCR_BENCH)('benchmark odczytu paragonów', () => {
  const models = (process.env.OCR_BENCH_MODELS || 'gpt-4o-mini').split(',').map(m => m.trim()).filter(Boolean)
  const slugs = fs.readdirSync(FIXTURES).filter(f => f.endsWith('.json') && f !== 'index.json').map(f => f.replace(/\.json$/, ''))

  it('porównuje modele na wygenerowanych paragonach', { timeout: 20 * 60 * 1000 }, async () => {
    const rows: Score[] = []
    for (const model of models) {
      process.env.OCR_VISION_MODEL = model
      for (const slug of slugs) {
        const truth: Truth = JSON.parse(fs.readFileSync(path.join(FIXTURES, `${slug}.json`), 'utf8'))
        const buffer = fs.readFileSync(path.join(FIXTURES, `${slug}.jpg`))
        const started = Date.now()
        try {
          const { azure, meta } = await readReceiptWithVision(buffer, 'image/jpeg')
          const data = await extractReceiptData(azure)
          rows.push(score(slug, model, truth, {
            merchant: data.merchant,
            total: data.total,
            date: data.date,
            currency: data.currency,
            items: data.items,
            promotions: data.promotions,
          }, meta.durationMs))
        } catch (err) {
          rows.push({
            slug, model, merchantOk: false, totalOk: false, dateOk: false, currencyOk: false,
            itemCountDelta: 0, itemRecall: 0, priceSumDelta: 0, promotionsFound: 0,
            durationMs: Date.now() - started,
            error: err instanceof Error ? err.message : String(err),
          })
        }
      }
    }

    const report = [table(rows), '', ...summaries(rows, models)].join('\n')
    console.log('\n' + report + '\n')
    if (process.env.OCR_BENCH_OUT) fs.writeFileSync(process.env.OCR_BENCH_OUT, report + '\n')
  })
})

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)] ?? 0
}

function summaries(rows: Score[], models: string[]): string[] {
  return models.map((model) => {
    const mine = rows.filter(r => r.model === model && !r.error)
    if (!mine.length) return `${model}: wszystkie próby zakończone błędem`
    const pct = (n: number) => `${Math.round((n / mine.length) * 100)}%`
    return [
      `${model}:`,
      `sklep ${pct(mine.filter(r => r.merchantOk).length)}`,
      `suma ${pct(mine.filter(r => r.totalOk).length)}`,
      `data ${pct(mine.filter(r => r.dateOk).length)}`,
      `pozycje ${Math.round((mine.reduce((s, r) => s + r.itemRecall, 0) / mine.length) * 100)}%`,
      `mediana ${median(mine.map(r => r.durationMs))} ms`,
      `bledy ${rows.filter(r => r.model === model && r.error).length}`,
    ].join('  ')
  })
}
