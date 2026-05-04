import { auth } from '@/lib/auth-compat'
import { NextResponse } from 'next/server'
import { getAIClient, getAIClientForWebSearch } from '@/lib/ai-client'
import { rateLimit } from '@/lib/rate-limit'
import { db } from '@/lib/db'
import { receipts } from '@/lib/db/schema'
import { and, eq } from 'drizzle-orm'
import { freshOrRefresh } from '@/lib/store-intel'
import crypto from 'crypto'

/// `/api/personal/receipt-analyze` — given a receipt the user already
/// scanned, return a per-item review:
///   - Was the price competitive vs current chain leaflets?
///   - Where would the same item be cheaper THIS WEEK?
///   - Aggregate "you could have saved X PLN" delta.
///
/// This complements `/api/shopping/optimize` (which plans a fresh list).
/// Here we look BACK at a transaction and tell the user how much they
/// over-paid (or that they nailed it). Great for building a habit of
/// checking promos before going to the store.
///
/// Cached in `store_intel` keyed on receipt-content hash so repeat reads
/// of the same receipt are free; 7-day fresh window because leaflet
/// validity is ~7 days.

interface ReceiptAnalyzeBody {
  receiptId?: string
  lang?: string
}

interface AnalyzedItem {
  name: string
  qty: number | null
  paidUnitPrice: number | null
  paidTotal: number | null
  /// Cheapest current price per unit from leaflets (or current shelf price).
  bestUnitPrice: number | null
  bestStore: string | null
  /// Per-line savings vs paid price. Positive = could have saved.
  savings: number
  /// "regular" | "1+1" | "2za1" | "percent" | "buy_x_get_y" | "app_only" | "multipack_price" | null
  promoType: string | null
  promoDescription: string | null
  /// One-line verdict: "fair", "overpaid", "underpaid", "no_data"
  verdict: 'fair' | 'overpaid' | 'underpaid' | 'no_data'
  sourceUrl: string | null
}

interface ReceiptAnalyzeResponse {
  receiptId: string
  vendor: string | null
  date: string | null
  paidTotal: number
  bestPossibleTotal: number
  potentialSavings: number
  currency: string
  items: AnalyzedItem[]
  summary: string | null
  tip: string | null
  dataSource: 'live_web_search' | 'estimate'
  sources: string[]
  fetchedAt?: string
  freshUntil?: string
  cacheState?: string
}

const FRESH_SECONDS = 7 * 24 * 60 * 60        // leaflet cycle
const HARD_EXPIRES_SECONDS = 30 * 24 * 60 * 60 // hard cap

function num(v: unknown, fallback = 0): number {
  if (typeof v === 'number' && isFinite(v)) return v
  if (typeof v === 'string') {
    const n = parseFloat(v.replace(',', '.'))
    return isFinite(n) ? n : fallback
  }
  return fallback
}
function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim().length > 0 ? v : null
}

const VALID_PROMO_TYPES = new Set([
  'regular', '1+1', '2za1', '3za2', 'percent',
  'buy_x_get_y', 'app_only', 'multipack_price',
])
const VALID_VERDICTS = new Set(['fair', 'overpaid', 'underpaid', 'no_data'])

export async function POST(request: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: ReceiptAnalyzeBody
  try { body = await request.json() } catch { body = {} }

  const lang = body.lang === 'pl' ? 'pl' : 'en'
  const isPolish = lang === 'pl'
  if (!body.receiptId || typeof body.receiptId !== 'string') {
    return NextResponse.json({
      error: 'missing_receipt_id',
      message: isPolish ? 'Brak ID paragonu.' : 'Missing receipt id.',
    }, { status: 400 })
  }

  // Fetch the receipt — must belong to this user.
  const rows = await db.select().from(receipts)
    .where(and(eq(receipts.id, body.receiptId), eq(receipts.userId, userId)))
    .limit(1)
  const receipt = rows[0]
  if (!receipt) {
    return NextResponse.json({
      error: 'not_found',
      message: isPolish ? 'Paragon nie znaleziony.' : 'Receipt not found.',
    }, { status: 404 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const items = (Array.isArray(receipt.items) ? receipt.items : []) as any[]
  if (items.length === 0) {
    return NextResponse.json({
      error: 'no_items',
      message: isPolish ? 'Paragon nie ma pozycji do analizy.' : 'Receipt has no items to analyze.',
    }, { status: 400 })
  }

  const rl = rateLimit(`ai:receipt-analyze:${userId}`, { maxRequests: 20, windowMs: 60 * 60 * 1000 })
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'rate_limited', message: isPolish ? 'Za dużo zapytań. Spróbuj za chwilę.' : 'Too many requests. Try again shortly.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter ?? 60) } },
    )
  }

  // Cache key — receipt id + content hash so re-edited receipts get a
  // fresh analysis. Lang is part of the key because the prompt language
  // is locale-sensitive.
  const contentSig = JSON.stringify({
    items: items.map(i => ({ n: i?.name, q: i?.quantity, p: i?.price ?? i?.totalPrice ?? i?.unitPrice })),
    date: receipt.date,
    vendor: receipt.vendor,
  })
  const key = crypto.createHash('sha256')
    .update(`${body.receiptId}|${lang}|${contentSig}`)
    .digest('hex').slice(0, 48)

  const entry = await freshOrRefresh<ReceiptAnalyzeResponse>(
    'analyze',
    key,
    HARD_EXPIRES_SECONDS,
    () => fetchAnalysis(receipt, items, isPolish),
    { revalidateAfterSeconds: FRESH_SECONDS },
  )

  const payload = {
    ...entry.data,
    fetchedAt: entry.fetchedAt.toISOString(),
    freshUntil: entry.expiresAt.toISOString(),
    cacheState: entry.state,
  }
  return NextResponse.json(payload, {
    headers: {
      'X-Cache': entry.state.toUpperCase(),
      'X-Fetched-At': entry.fetchedAt.toISOString(),
      'Cache-Control': 'private, max-age=120',
    },
  })
}

async function fetchAnalysis(
  receipt: typeof receipts.$inferSelect,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rawItems: any[],
  isPolish: boolean,
): Promise<{ data: ReceiptAnalyzeResponse; source?: string } | null> {
  const webSearchAI = getAIClientForWebSearch()
  const fallbackAI = getAIClient()
  if (!webSearchAI && !fallbackAI) return null

  const today = new Date().toISOString().slice(0, 10)
  const vendor = receipt.vendor ?? 'unknown'
  const itemsLines = rawItems.map((it, idx) => {
    const qty = num(it?.quantity, 1)
    const price = num(it?.price ?? it?.totalPrice ?? it?.unitPrice, 0)
    return `${idx + 1}. ${it?.name ?? 'item'} — ${qty}× — ${price.toFixed(2)} ${receipt.currency ?? 'PLN'}`
  }).join('\n')

  const prompt = isPolish
    ? `Jesteś asystentem zakupowym. Klient kupił poniższe rzeczy w "${vendor}" dnia ${receipt.date ?? today}. Sprawdź AKTUALNE ceny i promocje TEGO TYGODNIA przez web_search w sieciach: Lidl, Biedronka, Kaufland, Auchan, Carrefour, Netto, Dino, Stokrotka. Dla KAŻDEJ pozycji powiedz:
- czy zapłacona cena była konkurencyjna,
- gdzie i za ile można było kupić to taniej (jeśli można było),
- jaka jest oszczędność per linia.

PARAGON:
${itemsLines}

DZIŚ: ${today}

KRYTYCZNE:
- "verdict" per item: "fair" (cena ok, oszczędność <0.50), "overpaid" (znaleziono niższą cenę >0.50 zł), "underpaid" (zapłacił dużo niżej niż obecnie obowiązująca regularna), "no_data" (nie znalazłeś referencji).
- "promoType" per item gdy znalazłeś aktywną promocję na ten sam produkt: "regular", "1+1", "2za1", "percent", "buy_x_get_y", "app_only", "multipack_price".
- "sources" — URL-e gazetek z których wziąłeś ceny.
- NIGDY nie zmyślaj cen. Jeśli nie sprawdziłeś żadnej linii w sieci, "dataSource": "estimate" i "verdict": "no_data" wszędzie.
- "potentialSavings" = sum z dodatnich savings.

Zwróć **tylko JSON**, bez markdown:
{
  "items": [
    {
      "name": "masło 200g Łaciate",
      "qty": 2,
      "paidUnitPrice": 8.99,
      "paidTotal": 17.98,
      "bestUnitPrice": 4.99,
      "bestStore": "Lidl",
      "savings": 8.00,
      "promoType": "2za1",
      "promoDescription": "1+1 gratis w Lidlu",
      "verdict": "overpaid",
      "sourceUrl": "https://www.lidl.pl/c/gazetka-promocyjna/..."
    }
  ],
  "summary": "1 zdanie podsumowania",
  "tip": "1 zdanie z poradą",
  "sources": ["https://www.lidl.pl/...", "https://www.biedronka.pl/..."]
}`
    : `You are a shopping assistant. The customer bought the items below at "${vendor}" on ${receipt.date ?? today}. Use web_search to check CURRENT prices and THIS WEEK'S promotions across: Lidl, Biedronka, Kaufland, Auchan, Carrefour, Netto, Dino, Stokrotka. For EACH item say:
- was the paid price competitive,
- where and at what price it was cheaper (if cheaper),
- the per-line savings.

RECEIPT:
${itemsLines}

TODAY: ${today}

CRITICAL:
- "verdict" per item: "fair" (price ok, savings < 0.50), "overpaid" (lower price found > 0.50 PLN), "underpaid" (paid well below current regular), "no_data" (no reference found).
- "promoType" per item when you find an active matching promotion: "regular", "1+1", "2za1", "percent", "buy_x_get_y", "app_only", "multipack_price".
- "sources" — leaflet URLs you actually pulled from.
- NEVER fabricate prices. If you didn't verify a single line, "dataSource": "estimate" and "verdict": "no_data" everywhere.
- "potentialSavings" = sum of positive savings.

Return **only JSON**, no markdown:
{
  "items": [
    {
      "name": "butter 200g",
      "qty": 2,
      "paidUnitPrice": 8.99,
      "paidTotal": 17.98,
      "bestUnitPrice": 4.99,
      "bestStore": "Lidl",
      "savings": 8.00,
      "promoType": "2za1",
      "promoDescription": "1+1 free at Lidl",
      "verdict": "overpaid",
      "sourceUrl": "https://www.lidl.pl/..."
    }
  ],
  "summary": "1-line summary",
  "tip": "1-line advice",
  "sources": ["https://...", "https://..."]
}`

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let webData: any = null
  let usedSource: string | undefined
  let usedLiveSearch = false

  if (webSearchAI) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const call = (webSearchAI.client as any).responses.create({
        model: webSearchAI.model,
        tools: [{ type: 'web_search_preview' }],
        input: prompt,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)
      const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 30000))
      const response = await Promise.race([call, timeout])
      if (response) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rawText = (response as any).output_text || ''
        const jsonMatch = rawText.match(/\{[\s\S]*\}/)
        if (jsonMatch) {
          webData = JSON.parse(jsonMatch[0])
          usedSource = 'openai:web_search_preview'
          usedLiveSearch = true
        }
      }
    } catch { /* fall through */ }
  }

  if (!webData && fallbackAI) {
    try {
      const completion = await fallbackAI.client.chat.completions.create({
        model: fallbackAI.model,
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        temperature: 0.3,
      })
      webData = JSON.parse(completion.choices[0]?.message?.content || '{}')
      usedSource = fallbackAI.backend === 'azure' ? 'azure:chat' : 'openai:chat'
    } catch { return null }
  }
  if (!webData) return null

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const aiItems: any[] = Array.isArray(webData.items) ? webData.items : []
  const cleanItems: AnalyzedItem[] = aiItems.map((it) => {
    const promoTypeRaw = typeof it?.promoType === 'string' ? it.promoType.trim().toLowerCase() : null
    const promoType = promoTypeRaw && VALID_PROMO_TYPES.has(promoTypeRaw) ? promoTypeRaw : null
    const verdictRaw = typeof it?.verdict === 'string' ? it.verdict.trim().toLowerCase() : 'no_data'
    const verdict = (VALID_VERDICTS.has(verdictRaw) ? verdictRaw : 'no_data') as AnalyzedItem['verdict']
    const sourceRaw = typeof it?.sourceUrl === 'string' && /^https?:\/\//i.test(it.sourceUrl) ? it.sourceUrl : null
    return {
      name: typeof it?.name === 'string' ? it.name : 'item',
      qty: it?.qty != null ? num(it.qty, 1) : (it?.quantity != null ? num(it.quantity, 1) : null),
      paidUnitPrice: it?.paidUnitPrice != null ? num(it.paidUnitPrice) : null,
      paidTotal: it?.paidTotal != null ? num(it.paidTotal) : null,
      bestUnitPrice: it?.bestUnitPrice != null ? num(it.bestUnitPrice) : null,
      bestStore: str(it?.bestStore),
      savings: Math.round(num(it?.savings, 0) * 100) / 100,
      promoType,
      promoDescription: str(it?.promoDescription),
      verdict,
      sourceUrl: usedLiveSearch ? sourceRaw : null,
    }
  })

  const paidTotal = rawItems.reduce((acc, it) =>
    acc + num(it?.price ?? it?.totalPrice ?? num(it?.unitPrice, 0) * num(it?.quantity, 1), 0), 0)
  const aggSavings = cleanItems.reduce((acc, it) => acc + Math.max(0, it.savings), 0)
  const bestPossibleTotal = Math.max(0, paidTotal - aggSavings)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawSources: unknown[] = Array.isArray((webData as any).sources) ? (webData as any).sources : []
  const cleanSources = usedLiveSearch
    ? rawSources.filter((s): s is string => typeof s === 'string' && /^https?:\/\//i.test(s)).slice(0, 6)
    : []

  const data: ReceiptAnalyzeResponse = {
    receiptId: receipt.id,
    vendor: receipt.vendor ?? null,
    date: receipt.date ?? null,
    paidTotal: Math.round(paidTotal * 100) / 100,
    bestPossibleTotal: Math.round(bestPossibleTotal * 100) / 100,
    potentialSavings: Math.round(aggSavings * 100) / 100,
    currency: receipt.currency ?? 'PLN',
    items: cleanItems,
    summary: str(webData.summary),
    tip: str(webData.tip),
    dataSource: usedLiveSearch ? 'live_web_search' : 'estimate',
    sources: cleanSources,
  }

  return { data, source: usedSource }
}
