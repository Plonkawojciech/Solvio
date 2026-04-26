import { auth } from '@/lib/auth-compat'
import { NextResponse } from 'next/server'
import { getAIClient } from '@/lib/ai-client'
import { rateLimit } from '@/lib/rate-limit'
import { GROCERY_STORES } from '@/lib/stores'
import { freshOrRefresh } from '@/lib/store-intel'
import crypto from 'crypto'

/// `/api/shopping/optimize` — given a user-typed shopping list and an
/// optional location, returns the single store that would minimise the
/// total bill, plus a per-item price breakdown. Powered by Azure OpenAI
/// / OpenAI with web search for live store prices.
///
/// Caching is now Postgres-backed via `lib/store-intel` (table
/// `store_intel`). This means:
///   - Cold serverless starts no longer flush the cache.
///   - Identical lists across users dedupe (cache key omits `userId`).
///   - Stale-while-revalidate kicks in past the soft revalidate window
///     so users keep seeing instant responses while a refresh runs in
///     the background.
///   - A cron route (`/api/cron/refresh-intel`) GCs expired rows and
///     pre-warms popular leaflet entries.
///
/// Request shape (mirrors iOS `ShoppingOptimizeRequest`):
///   { items: [{ name, quantity }], lang, currency, lat?, lng? }

interface ShoppingItem { name: string; quantity: number }
interface ShoppingRequestBody {
  items?: ShoppingItem[]
  lang?: string
  currency?: string
  lat?: number
  lng?: number
}

interface OptimizeResultPayload {
  bestStore: string
  bestStoreAddress: string | null
  bestTotal: number
  currency: string
  savings: number | null
  summary: string | null
  tip: string | null
  bestStoreItems: Array<{ name: string; qty: number | null; unitPrice: number | null; total: number }>
  alternatives: Array<{ store: string; total: number; address: string | null }>
}

// Cache freshness windows. The optimize result is "live" for 30 minutes,
// then we serve stale + refresh in the background up to 6 hours, then
// hard-evict. These match how often supermarket prices realistically
// change in a day — leaflets refresh weekly, but daily promotions
// shift a few times per day, so 30 min keeps things tight.
const FRESH_SECONDS = 30 * 60          // 30 min — fresh window
const HARD_EXPIRES_SECONDS = 6 * 60 * 60   // 6 h — hard staleness ceiling

function hashKey(items: ShoppingItem[], lang: string, currency: string, lat?: number, lng?: number): string {
  const itemsKey = items
    .map(i => `${i.name.trim().toLowerCase()}|${i.quantity}`)
    .sort()
    .join(';')
  // Round location to 0.05° (~5 km) — same store cluster.
  const round = (n: number) => Math.round(n * 20) / 20
  const loc = (lat != null && lng != null) ? `@${round(lat)},${round(lng)}` : ''
  const raw = `${lang}:${currency}${loc}:${itemsKey}`
  // Hash to fit varchar(256) — long shopping lists otherwise blow past
  // the column limit and the unique index.
  return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 48)
}

export async function POST(request: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: ShoppingRequestBody
  try { body = await request.json() } catch { body = {} }

  const items = (body.items || []).filter(i => i && typeof i.name === 'string' && i.name.trim().length > 0)
  const lang = body.lang === 'pl' ? 'pl' : 'en'
  const isPolish = lang === 'pl'
  const currency = (body.currency || 'PLN').toUpperCase()
  const lat = typeof body.lat === 'number' ? body.lat : undefined
  const lng = typeof body.lng === 'number' ? body.lng : undefined

  if (items.length === 0) {
    return NextResponse.json({
      error: 'no_items',
      message: isPolish ? 'Lista zakupów jest pusta.' : 'Shopping list is empty.',
    }, { status: 400 })
  }
  if (items.length > 30) {
    return NextResponse.json({
      error: 'too_many_items',
      message: isPolish ? 'Maksymalnie 30 produktów na liście.' : 'Maximum 30 items per list.',
    }, { status: 400 })
  }

  // Per-user rate limit gates AI cost; cache hits are free so we don't
  // count them. We can't easily tell up front whether the call will be
  // a cache hit, so we always count and accept that legitimate users
  // doing 11+ unique lists in an hour will hit the wall.
  const rl = rateLimit(`ai:shopping-optimize:${userId}`, { maxRequests: 10, windowMs: 60 * 60 * 1000 })
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'rate_limited', message: isPolish ? 'Za dużo zapytań. Spróbuj za chwilę.' : 'Too many requests. Try again shortly.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter ?? 60) } },
    )
  }

  const key = hashKey(items, lang, currency, lat, lng)

  const entry = await freshOrRefresh<OptimizeResultPayload>(
    'optimize',
    key,
    HARD_EXPIRES_SECONDS,
    () => fetchFromAI({ items, lang, currency, lat, lng, isPolish }),
    { revalidateAfterSeconds: FRESH_SECONDS },
  )

  // Surface freshness via headers AND inline so iOS can show a
  // "as of HH:MM" label without parsing headers.
  const payloadWithMeta = {
    ...entry.data,
    fetchedAt: entry.fetchedAt.toISOString(),
    freshUntil: entry.expiresAt.toISOString(),
    cacheState: entry.state,
  }

  return NextResponse.json(payloadWithMeta, {
    headers: {
      'X-Cache': entry.state.toUpperCase(),
      'X-Fetched-At': entry.fetchedAt.toISOString(),
      'Cache-Control': 'private, max-age=120',
    },
  })
}

/// Single AI call that returns a clean, type-coerced
/// `OptimizeResultPayload`. Returns null on any unrecoverable error
/// so `freshOrRefresh` can surface a stale fallback.
async function fetchFromAI(args: {
  items: ShoppingItem[]
  lang: string
  currency: string
  lat?: number
  lng?: number
  isPolish: boolean
}): Promise<{ data: OptimizeResultPayload; source?: string } | null> {
  const { items, currency, lat, lng, isPolish } = args
  const ai = getAIClient()
  if (!ai) return null

  const storeHints = GROCERY_STORES.slice(0, 30).join(', ')
  const itemsLines = items.map((i, idx) => `${idx + 1}. ${i.name} (${i.quantity}×)`).join('\n')

  const today = new Date().toISOString().slice(0, 10)
  // CRITICAL: when location is missing, the address field MUST be null —
  // otherwise the AI hallucinates plausible-looking but fake street
  // addresses that erode user trust ("ul. Wrocławska 12, Poznań" for
  // a user in Warsaw). The location hint below tells the model exactly
  // when it may and may not include a specific address.
  const locationHint = (lat != null && lng != null)
    ? (isPolish
        ? `Użytkownik jest w pobliżu współrzędnych ${lat.toFixed(3)}, ${lng.toFixed(3)} — preferuj sklepy w pobliżu (Lidl, Biedronka, Dino, Auchan, Carrefour, Kaufland, Stokrotka itp.). Jeśli znasz REALNĄ ulicę i miasto najbliższego sklepu danej sieci do tych współrzędnych, podaj je w "bestStoreAddress". Jeśli nie jesteś PEWIEN konkretnego adresu — bestStoreAddress MUSI być null. NIGDY nie wymyślaj adresu.`
        : `User is near ${lat.toFixed(3)}, ${lng.toFixed(3)} — prefer nearby stores (Lidl, Biedronka, Dino, Auchan, Carrefour, Kaufland, Stokrotka, etc.). If you know the REAL street and city of the nearest branch of that chain to these coordinates, include it in "bestStoreAddress". If you are not CERTAIN of a specific address — bestStoreAddress MUST be null. NEVER fabricate an address.`)
    : (isPolish
        ? 'Brak lokalizacji — użyj typowych polskich sklepów spożywczych. WAŻNE: bestStoreAddress MUSI być null (nie znasz lokalizacji użytkownika, więc adres konkretnego oddziału byłby zmyślony).'
        : 'No location — use typical Polish grocery chains. IMPORTANT: bestStoreAddress MUST be null (you do not know the user\'s location, so any specific branch address would be fabricated).')

  const prompt = isPolish
    ? `Jesteś asystentem zakupowym. Mam listę produktów do kupienia. Dziś jest ${today}.

ZADANIE: Sprawdź AKTUALNE ceny i promocje (gazetki Lidl/Biedronka/Kaufland/Auchan/Carrefour itp.) i wskaż w którym JEDNYM sklepie kupię to wszystko najtaniej DZISIAJ. Podaj realistyczne ceny każdego produktu w tym sklepie.

LISTA ZAKUPÓW:
${itemsLines}

${locationHint}

PRZYKŁADOWE SIECI: ${storeHints}

WAŻNE — ŹRÓDŁA DANYCH:
- Sprawdź gazetki promocyjne sieci na ten tydzień (lidl.pl/c/gazetka, biedronka.pl/pl/gazetka, kaufland.pl/oferta-tygodnia, auchan.pl/aktualnosci-i-promocje, carrefour.pl/gazetki, dino.pl).
- Uwzględnij promocje 1+1, „2 za cenę 1", rabaty z aplikacji.
- Jeśli brak promocji na produkt — użyj ceny regularnej z bieżącego cennika.
- Brak danych = oszacuj rozsądnie z marży branżowej.

Zwróć **wyłącznie** JSON o dokładnie tej strukturze (ceny w ${currency}, suma to suma cen × ilości):

{
  "bestStore": "nazwa sieci",
  "bestStoreAddress": "ulica i miasto albo null",
  "bestTotal": 123.45,
  "savings": 12.50,
  "summary": "1-2 zdania dlaczego ten sklep jest najtańszy DZISIAJ — wymień konkretne promocje jeśli występują",
  "tip": "1 zdanie z poradą oszczędności (np. „w tym tygodniu Lidl ma sery -30%")",
  "bestStoreItems": [
    {"name": "mleko 2%", "qty": 2, "unitPrice": 3.49, "total": 6.98}
  ],
  "alternatives": [
    {"store": "inny sklep", "total": 130.00, "address": null},
    {"store": "kolejny", "total": 135.50, "address": null}
  ]
}

ZAWSZE zwróć valid JSON. Liczby jako number, nie string.`
    : `You are a shopping assistant. I have a shopping list. Today is ${today}.

TASK: Check CURRENT prices and weekly promotions (Lidl/Biedronka/Kaufland/Auchan/Carrefour leaflets) and tell me which SINGLE store will be cheapest TODAY. Provide realistic per-item prices at that store.

SHOPPING LIST:
${itemsLines}

${locationHint}

CHAIN HINTS: ${storeHints}

IMPORTANT — DATA SOURCES:
- Check this week's chain leaflets (lidl.pl/c/gazetka, biedronka.pl/pl/gazetka, kaufland.pl/oferta-tygodnia, auchan.pl/aktualnosci-i-promocje, carrefour.pl/gazetki, dino.pl).
- Include 1+1, "2 for 1", and app-only discounts.
- No promo on an item → use the current regular price.
- No data → estimate sensibly from typical retail margin.

Return **only** JSON with this exact structure (prices in ${currency}, total = sum of unit prices × qty):

{
  "bestStore": "chain name",
  "bestStoreAddress": "street and city or null",
  "bestTotal": 123.45,
  "savings": 12.50,
  "summary": "1-2 sentences explaining why this store is cheapest TODAY — name specific promotions if any",
  "tip": "1 sentence savings tip (e.g. 'Lidl has cheeses at -30% this week')",
  "bestStoreItems": [
    {"name": "2% milk", "qty": 2, "unitPrice": 3.49, "total": 6.98}
  ],
  "alternatives": [
    {"store": "other store", "total": 130.00, "address": null},
    {"store": "another", "total": 135.50, "address": null}
  ]
}

ALWAYS return valid JSON. Numbers as number, not string.`

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let webData: any = null
  let usedSource: string | undefined

  // Web search via OpenAI Responses API where available; otherwise plain chat.
  if (ai.backend === 'openai') {
    try {
      const webSearchCall = ai.client.responses.create({
        model: ai.model,
        tools: [{ type: 'web_search_preview' }],
        input: prompt,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)
      const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 15000))
      const response = await Promise.race([webSearchCall, timeout])
      if (response) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rawText = (response as any).output_text || ''
        const jsonMatch = rawText.match(/\{[\s\S]*\}/)
        if (jsonMatch) {
          webData = JSON.parse(jsonMatch[0])
          usedSource = 'openai:web_search_preview'
        }
      }
    } catch {
      // fall through to plain chat completions
    }
  }

  if (!webData) {
    try {
      const completion = await ai.client.chat.completions.create({
        model: ai.model,
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        temperature: 0.3,
      })
      webData = JSON.parse(completion.choices[0]?.message?.content || '{}')
      usedSource = ai.backend === 'azure' ? 'azure:chat' : 'openai:chat'
    } catch {
      return null
    }
  }

  // Defensive coercion — iOS Decodable will reject `"3.49"` (string)
  // and a missing field. Run every value through a guard.
  const num = (v: unknown, fallback = 0): number => {
    if (typeof v === 'number' && isFinite(v)) return v
    if (typeof v === 'string') {
      const n = parseFloat(v.replace(',', '.'))
      return isFinite(n) ? n : fallback
    }
    return fallback
  }
  const str = (v: unknown): string | null => (typeof v === 'string' && v.trim().length > 0) ? v : null

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawItems: any[] = Array.isArray((webData as any).bestStoreItems) ? (webData as any).bestStoreItems : []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cleanItems = rawItems.map((it: any) => ({
    name: typeof it?.name === 'string' ? it.name : (typeof it?.product === 'string' ? it.product : 'item'),
    qty: it?.qty != null ? num(it.qty, 1) : (it?.quantity != null ? num(it.quantity, 1) : null),
    unitPrice: it?.unitPrice != null ? num(it.unitPrice) : (it?.price != null ? num(it.price) : null),
    total: num(it?.total ?? (num(it?.unitPrice ?? it?.price ?? 0) * num(it?.qty ?? it?.quantity ?? 1, 1))),
  }))

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawAlts: unknown[] = Array.isArray((webData as any).alternatives) ? (webData as any).alternatives : []
  const cleanAlts = rawAlts
    .map((a) => {
      const obj = (a ?? {}) as Record<string, unknown>
      return {
        store: typeof obj.store === 'string' ? obj.store : null,
        total: num(obj.total),
        address: str(obj.address),
      }
    })
    .filter((a): a is { store: string; total: number; address: string | null } => a.store != null)

  const bestStore = typeof webData.bestStore === 'string' && webData.bestStore.trim().length > 0
    ? webData.bestStore
    : (isPolish ? 'Lidl' : 'Lidl')

  const itemsTotal = cleanItems.reduce((s: number, it) => s + num(it.total), 0)
  const bestTotal = num(webData.bestTotal, itemsTotal)
  const altMin = cleanAlts.length > 0 ? Math.min(...cleanAlts.map(a => num(a.total, bestTotal))) : null
  const savings = altMin != null && altMin > bestTotal
    ? Math.round((altMin - bestTotal) * 100) / 100
    : (typeof webData.savings === 'number' ? Math.round(webData.savings * 100) / 100 : null)

  // Belt-and-suspenders on the address: if the caller didn't send
  // coordinates, force the address to null even if the AI returned
  // one. We can't trust any specific branch address without location.
  const safeAddress = (lat != null && lng != null) ? str(webData.bestStoreAddress) : null

  const data: OptimizeResultPayload = {
    bestStore,
    bestStoreAddress: safeAddress,
    bestTotal: Math.round(bestTotal * 100) / 100,
    currency,
    savings,
    summary: str(webData.summary),
    tip: str(webData.tip),
    bestStoreItems: cleanItems,
    alternatives: cleanAlts,
  }

  return { data, source: usedSource }
}
