import { getAIClient } from '@/lib/ai-client'
import { chatParams, chatWithEffortRetry, readContent } from '@/lib/ai-params'
import { log } from './shared'

/**
 * Odczyt paragonu ze zdjęcia modelem multimodalnym.
 *
 * To jest ścieżka PRODUKCYJNA — Azure Document Intelligence nie jest wpięty
 * (patrz `docs/plans/paragony-od-a-do-z.md`), więc każdy paragon Wojtka
 * przechodzi właśnie tędy.
 *
 * Wynik wraca **w kształcie odpowiedzi Azure**, żeby `extractReceiptData`
 * i cała reszta pipeline'u miały jedno wejście niezależnie od dostawcy.
 * Model wybierany zmienną `OCR_VISION_MODEL` — zmiana modelu nie wymaga
 * deployu kodu, a benchmark (`tests/ocr-bench.test.ts`) porównuje kandydatów
 * na tych samych paragonach.
 */

export interface VisionMeta {
  model: string
  backend: string
  durationMs: number
}

const RECEIPT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['merchant', 'date', 'time', 'total', 'currency', 'items', 'discounts', 'raw_text'],
  properties: {
    merchant: { type: ['string', 'null'], description: 'Nazwa sklepu z nagłówka' },
    date: { type: ['string', 'null'], description: 'Data transakcji, YYYY-MM-DD' },
    time: { type: ['string', 'null'], description: 'Godzina transakcji, HH:MM' },
    total: { type: ['number', 'null'], description: 'Kwota faktycznie zapłacona' },
    currency: { type: 'string', description: 'Kod ISO 4217, np. PLN' },
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'quantity', 'unit_price', 'total_price'],
        properties: {
          name: { type: 'string' },
          quantity: { type: ['number', 'null'] },
          unit_price: { type: ['number', 'null'] },
          total_price: { type: ['number', 'null'] },
        },
      },
    },
    discounts: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['label', 'amount'],
        properties: {
          label: { type: 'string' },
          amount: { type: ['number', 'null'], description: 'Ujemna kwota rabatu' },
        },
      },
    },
    raw_text: { type: 'string', description: 'Cały tekst paragonu, linia po linii' },
  },
} as const

const INSTRUCTIONS = [
  'Odczytaj ten paragon (najczęściej polski wydruk fiskalny) i zwróć dane w podanym schemacie JSON.',
  '',
  'Zasady:',
  '- `merchant`: nazwa sieci albo firmy z nagłówka. Nie adres, nie NIP, nie numer kasy.',
  '- `total`: kwota po rabatach, ta przy „SUMA" / „RAZEM" / „DO ZAPŁATY". Nie suma pozycji, nie reszta, nie kwota podatku.',
  '- `items`: wyłącznie kupione produkty. Pomijaj linie podsumowań, PTU/VAT, form płatności, reszty, kaucji i numerów paragonu.',
  '- Nazwy pozycji przepisz DOKŁADNIE tak, jak są na wydruku — nie rozwijaj skrótów i nie tłumacz.',
  '- `total_price` to cena linii po rabacie. Przy ilości ułamkowej (waga, paliwo) podaj ilość z przecinkiem jako liczbę.',
  '- `discounts`: linie rabatów i promocji z kwotą UJEMNĄ.',
  '- `raw_text`: pełny tekst paragonu, z zachowaniem podziału na linie.',
  '- Niczego nie zgaduj. Pole, którego nie widać, zostaw jako null.',
].join('\n')

/**
 * Model domyślny dla OpenAI wybrany pomiarem, nie na wyczucie
 * (`tests/ocr-bench.test.ts`, 8 paragonów, 2026-08-22):
 *
 *   gpt-4o-mini   sklep 88%  suma 100%  data  88%  pozycje 100%  mediana 6415 ms
 *   gpt-4.1-mini  sklep 88%  suma 100%  data 100%  pozycje 100%  mediana 6335 ms
 *   gpt-4.1       sklep 88%  suma 100%  data 100%  pozycje 100%  mediana 4323 ms
 *   gpt-5.4-mini  sklep 88%  suma 100%  data 100%  pozycje 100%  mediana 3263 ms
 *
 * (Nietrafiony sklep to we wszystkich przypadkach ten sam paragon Orlenu —
 * brakowało wzorca stacji paliw w `lib/stores.ts`, nie było to winą modelu.)
 * gpt-5.4-mini jest najszybszy przy tej samej trafności, więc jest domyślny.
 * Dostawcy innego niż OpenAI nie nadpisujemy — Gemini ma własny model vision.
 */
const OPENAI_VISION_DEFAULT = 'gpt-5.4-mini'

export function visionModel(backend: string, fallback: string): string {
  const override = process.env.OCR_VISION_MODEL?.trim()
  if (override) return override
  return backend === 'openai' ? OPENAI_VISION_DEFAULT : fallback
}

/** Odpowiedź w kształcie Azure prebuilt-receipt — jedno wejście dla pipeline'u. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toAzureShape(parsed: ParsedReceipt): any {
  const currencyCode = (parsed.currency || 'PLN').toUpperCase().slice(0, 3)
  // Linie rabatów dopisujemy do tekstu, bo wykrywanie promocji w
  // `extractReceiptData` skanuje właśnie tekst. Model bywa dokładniejszy
  // w polu `discounts` niż w przepisanym `raw_text`.
  //
  // ALE tylko te, których w tekście jeszcze nie ma — inaczej ten sam rabat
  // liczy się dwa razy i „zaoszczędzono" pokazuje podwójną kwotę (realny błąd
  // złapany na paragonie Rossmanna: −10,00 zamiast −5,00).
  const raw = parsed.raw_text || ''
  const rawLower = raw.toLowerCase()
  const discountLines = (parsed.discounts ?? [])
    .filter((d) => d && d.label && !rawLower.includes(d.label.trim().toLowerCase()))
    .map((d) => `${d.label} ${d.amount != null ? d.amount.toFixed(2).replace('.', ',') : ''}`.trim())
  const content = [raw, ...discountLines].join('\n').trim()

  return {
    analyzeResult: {
      content,
      documents: [{
        fields: {
          MerchantName: parsed.merchant ? { valueString: parsed.merchant } : undefined,
          TransactionDate: parsed.date ? { valueDate: parsed.date } : undefined,
          TransactionTime: parsed.time ? { valueTime: parsed.time } : undefined,
          Total: parsed.total != null
            ? { valueNumber: parsed.total, valueCurrency: { currencyCode } }
            : undefined,
          Items: {
            valueArray: (parsed.items ?? [])
              .filter((it) => it && it.name)
              .map((it) => ({
                valueObject: {
                  Description: { valueString: String(it.name) },
                  Quantity: it.quantity != null ? { valueNumber: it.quantity } : undefined,
                  Price: it.unit_price != null ? { valueNumber: it.unit_price } : undefined,
                  TotalPrice: it.total_price != null ? { valueNumber: it.total_price } : undefined,
                },
              })),
          },
        },
      }],
    },
  }
}

export interface ParsedReceipt {
  merchant?: string | null
  date?: string | null
  time?: string | null
  total?: number | null
  currency?: string | null
  items?: Array<{ name?: string; quantity?: number | null; unit_price?: number | null; total_price?: number | null }>
  discounts?: Array<{ label?: string; amount?: number | null }>
  raw_text?: string
}

/**
 * Zwraca odczyt razem z metadanymi wywołania. `processVisionOCR` poniżej to
 * cienka nakładka dla pipeline'u, który metadanych nie potrzebuje.
 */
export async function readReceiptWithVision(
  buffer: Buffer,
  mimeType: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<{ azure: any; parsed: ParsedReceipt; meta: VisionMeta }> {
  const ai = getAIClient()
  if (!ai) throw new Error('No AI provider configured for vision OCR')
  if (mimeType === 'application/pdf') {
    throw new Error('PDF receipts require Azure Document Intelligence — upload a photo (JPG/PNG) instead')
  }

  const model = visionModel(ai.backend, ai.model)
  const started = Date.now()
  log(`[VisionOCR] ${ai.backend}/${model}, bufor: ${(buffer.length / 1024).toFixed(1)} KB`)

  const completion = await chatWithEffortRetry<{ choices?: Array<{ message?: { content?: string | null }; finish_reason?: string }> }>(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (params) => ai.client.chat.completions.create(params as any),
    {
    ...chatParams({
      model,
      // Paragon z 20 pozycjami plus surowy tekst to ~2500 tokenów odpowiedzi.
      // Zapas jest po to, żeby długi paragon nie urwał się w połowie JSON-a.
      maxTokens: 6000,
      json: { type: 'json_schema', json_schema: { name: 'receipt', strict: true, schema: RECEIPT_SCHEMA } },
    }),
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: INSTRUCTIONS },
        { type: 'image_url', image_url: { url: `data:${mimeType};base64,${buffer.toString('base64')}`, detail: 'high' } },
      ],
    }],
  })

  const { text, truncated } = readContent(completion)
  if (!text) {
    throw new Error(truncated
      ? 'Vision OCR: odpowiedź ucięta na limicie tokenów'
      : 'Vision OCR: pusta odpowiedź modelu')
  }

  const parsed = parseJson(text)
  const meta: VisionMeta = { model, backend: ai.backend, durationMs: Date.now() - started }
  log(`[VisionOCR] ✅ ${meta.durationMs} ms — sklep="${parsed.merchant}", suma=${parsed.total}, pozycji=${parsed.items?.length ?? 0}`)

  return { azure: toAzureShape(parsed), parsed, meta }
}

function parseJson(text: string): ParsedReceipt {
  const cleaned = text.replace(/```json\s*/gi, '').replace(/```/g, '').trim()
  try {
    return JSON.parse(cleaned) as ParsedReceipt
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/)
    if (!match) throw new Error(`Vision OCR zwrócił nieparsowalny wynik: ${cleaned.slice(0, 200)}`)
    return JSON.parse(match[0]) as ParsedReceipt
  }
}

/** Wejście dla pipeline'u — sam kształt Azure, bez metadanych. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function processVisionOCR(buffer: Buffer, mimeType: string): Promise<any> {
  const { azure } = await readReceiptWithVision(buffer, mimeType)
  return azure
}

/** Wystawione wyłącznie dla testów — kształt Azure buduje się bez sieci. */
export const __testables = { toAzureShape }
