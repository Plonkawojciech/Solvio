import { auth } from '@/lib/auth-compat'
import { NextResponse } from 'next/server'
import { getAIClient } from '@/lib/ai-client'
import { rateLimit } from '@/lib/rate-limit'
import { GROCERY_STORES } from '@/lib/stores'

/// `/api/shopping/optimize` — given a user-typed shopping list and an
/// optional location, returns the single store that would minimise the
/// total bill, plus a per-item price breakdown. Powered by Azure OpenAI
/// / OpenAI with web search for live store prices.
///
/// Request shape (mirrors iOS `ShoppingOptimizeRequest`):
///   {
///     items: [{ name: string, quantity: number }],
///     lang: "pl" | "en",
///     currency: "PLN" | "EUR" | "USD",
///     lat?: number,
///     lng?: number
///   }
///
/// Response shape (mirrors iOS `ShoppingOptimizeResult`):
///   {
///     bestStore: string,
///     bestStoreAddress: string | null,
///     bestTotal: number,
///     currency: string,
///     savings: number | null,           // vs. average alternative
///     summary: string | null,           // 1-2 sentence verdict
///     tip: string | null,               // optional savings tip
///     bestStoreItems: [{ name, qty, unitPrice, total }],
///     alternatives: [{ store, total, address }]
///   }

interface ShoppingItem { name: string; quantity: number }
interface ShoppingRequestBody {
  items?: ShoppingItem[]
  lang?: string
  currency?: string
  lat?: number
  lng?: number
}

// Module-level in-memory cache. Same pattern as audit/prices: shopping
// queries change less often than expense data, so caching keyed by the
// request hash gives instant repeat-runs.
//
// We hash on items (names+qty) + currency + lang + rounded location;
// the AI doesn't change its mind between identical inputs within an
// hour and the result feels "live enough" with a 1h TTL.
const optimizeCache = new Map<string, { result: unknown; expiresAt: number }>()
const OPTIMIZE_TTL_MS = 60 * 60 * 1000   // 1 hour

function cacheKey(userId: string, items: ShoppingItem[], lang: string, currency: string, lat?: number, lng?: number): string {
  const itemsKey = items
    .map(i => `${i.name.trim().toLowerCase()}|${i.quantity}`)
    .sort()
    .join(';')
  // Round location to 0.05° — same store cluster within ~5 km.
  const round = (n: number) => Math.round(n * 20) / 20
  const loc = (lat != null && lng != null) ? `@${round(lat)},${round(lng)}` : ''
  return `${userId}:${lang}:${currency}${loc}:${itemsKey}`
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

  const key = cacheKey(userId, items, lang, currency, lat, lng)
  const cached = optimizeCache.get(key)
  if (cached && cached.expiresAt > Date.now()) {
    return NextResponse.json(cached.result, {
      headers: { 'X-Cache': 'HIT', 'Cache-Control': 'private, max-age=300' },
    })
  }

  // Rate limit only on cache miss — cache hits are essentially free.
  // 10 req/hour/userId — generous so a typical session of a few list
  // edits doesn't get blocked, but stops abuse.
  const rl = rateLimit(`ai:shopping-optimize:${userId}`, { maxRequests: 10, windowMs: 60 * 60 * 1000 })
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'rate_limited', message: isPolish ? 'Za dużo zapytań. Spróbuj za chwilę.' : 'Too many requests. Try again shortly.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter ?? 60) } },
    )
  }

  const ai = getAIClient()
  if (!ai) {
    return NextResponse.json({ error: 'ai_unavailable', message: isPolish ? 'Usługa AI nieosiągalna.' : 'AI service unavailable.' }, { status: 503 })
  }

  // Prompt — instruct the model to return strict JSON. We provide the
  // store list (Polish chains) as a hint so it doesn't hallucinate
  // names like "Tesco" (which doesn't operate in Poland anymore).
  const storeHints = GROCERY_STORES.slice(0, 30).join(', ')
  const itemsLines = items.map((i, idx) => `${idx + 1}. ${i.name} (${i.quantity}×)`).join('\n')

  const locationHint = (lat != null && lng != null)
    ? (isPolish
        ? `Użytkownik jest w pobliżu współrzędnych ${lat.toFixed(3)}, ${lng.toFixed(3)} — preferuj sklepy w pobliżu (Lidl, Biedronka, Dino, Auchan, Carrefour, Kaufland, Stokrotka itp.).`
        : `User is near ${lat.toFixed(3)}, ${lng.toFixed(3)} — prefer nearby stores (Lidl, Biedronka, Dino, Auchan, Carrefour, Kaufland, Stokrotka, etc.).`)
    : (isPolish
        ? 'Brak lokalizacji — użyj typowych polskich sklepów spożywczych.'
        : 'No location — use typical Polish grocery chains.')

  const prompt = isPolish
    ? `Jesteś asystentem zakupowym. Mam listę produktów do kupienia. Powiedz mi w którym JEDNYM sklepie kupię to wszystko najtaniej i podaj cenę każdego produktu w tym sklepie.

LISTA ZAKUPÓW:
${itemsLines}

${locationHint}

PRZYKŁADOWE SIECI: ${storeHints}

Zwróć **wyłącznie** JSON o dokładnie tej strukturze (ceny w ${currency}, suma to suma cen × ilości):

{
  "bestStore": "nazwa sieci",
  "bestStoreAddress": "ulica i miasto albo null",
  "bestTotal": 123.45,
  "savings": 12.50,
  "summary": "1-2 zdania dlaczego ten sklep jest najtańszy",
  "tip": "1 zdanie z poradą oszczędności",
  "bestStoreItems": [
    {"name": "mleko 2%", "qty": 2, "unitPrice": 3.49, "total": 6.98}
  ],
  "alternatives": [
    {"store": "inny sklep", "total": 130.00, "address": null},
    {"store": "kolejny", "total": 135.50, "address": null}
  ]
}

Podaj REALNE ceny w polskich sklepach (kwiecień 2026). Jeśli nie znasz dokładnej ceny — oszacuj rozsądnie. ZAWSZE zwróć valid JSON. Liczby jako number, nie string.`
    : `You are a shopping assistant. I have a shopping list. Tell me which SINGLE store will be cheapest overall and give me the per-item price at that store.

SHOPPING LIST:
${itemsLines}

${locationHint}

CHAIN HINTS: ${storeHints}

Return **only** JSON with this exact structure (prices in ${currency}, total = sum of unit prices × qty):

{
  "bestStore": "chain name",
  "bestStoreAddress": "street and city or null",
  "bestTotal": 123.45,
  "savings": 12.50,
  "summary": "1-2 sentences explaining why this store is cheapest",
  "tip": "1 sentence savings tip",
  "bestStoreItems": [
    {"name": "2% milk", "qty": 2, "unitPrice": 3.49, "total": 6.98}
  ],
  "alternatives": [
    {"store": "other store", "total": 130.00, "address": null},
    {"store": "another", "total": 135.50, "address": null}
  ]
}

Use realistic Polish grocery prices (April 2026). If you don't know the exact price, estimate reasonably. ALWAYS return valid JSON. Numbers as number, not string.`

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let webData: any = null

  // Web search via OpenAI Responses API where available; otherwise plain chat.
  if (ai.backend === 'openai') {
    try {
      const webSearchCall = ai.client.responses.create({
        model: ai.model,
        tools: [{ type: 'web_search_preview' }],
        input: prompt,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)
      const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 12000))
      const response = await Promise.race([webSearchCall, timeout])
      if (response) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rawText = (response as any).output_text || ''
        const jsonMatch = rawText.match(/\{[\s\S]*\}/)
        if (jsonMatch) {
          webData = JSON.parse(jsonMatch[0])
        }
      }
    } catch {
      // Fall through to chat completions.
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
    } catch (err) {
      // Stale fallback — at least show *something* if we have it.
      if (cached) {
        return NextResponse.json(cached.result, {
          headers: { 'X-Cache': 'STALE', 'Cache-Control': 'private, max-age=60' },
        })
      }
      return NextResponse.json({
        error: 'ai_failed',
        message: isPolish ? 'Nie udało się przeanalizować listy. Spróbuj ponownie.' : 'Couldn\'t analyze the list. Please try again.',
      }, { status: 502 })
    }
  }

  // Defensive cleanup — coerce whatever the model returned into a
  // shape iOS can actually decode. iOS uses strict Decodable, so
  // one wonky field would blow up the whole response.
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
  const rawItems = Array.isArray((webData as any).bestStoreItems) ? (webData as any).bestStoreItems : []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cleanItems = rawItems.map((it: any) => ({
    name: typeof it?.name === 'string' ? it.name : (typeof it?.product === 'string' ? it.product : 'item'),
    qty: it?.qty != null ? num(it.qty, 1) : (it?.quantity != null ? num(it.quantity, 1) : null),
    unitPrice: it?.unitPrice != null ? num(it.unitPrice) : (it?.price != null ? num(it.price) : null),
    total: num(it?.total ?? (num(it?.unitPrice ?? it?.price ?? 0) * num(it?.qty ?? it?.quantity ?? 1, 1))),
  }))

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawAlts = Array.isArray((webData as any).alternatives) ? (webData as any).alternatives : []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cleanAlts = rawAlts
    .map((a: any) => ({
      store: typeof a?.store === 'string' ? a.store : null,
      total: num(a?.total),
      address: str(a?.address),
    }))
    .filter((a: { store: string | null }) => a.store != null) as Array<{ store: string; total: number; address: string | null }>

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bestStore = typeof (webData as any).bestStore === 'string' && (webData as any).bestStore.trim().length > 0
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ? (webData as any).bestStore
    : (isPolish ? 'Lidl' : 'Lidl')

  // If the model didn't compute bestTotal, derive it from items so the
  // KPI on iOS shows a real number rather than 0.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const itemsTotal = cleanItems.reduce((s: number, it: any) => s + num(it.total), 0)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bestTotal = num((webData as any).bestTotal, itemsTotal)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const altMin = cleanAlts.length > 0 ? Math.min(...cleanAlts.map((a: any) => num(a.total, bestTotal))) : null
  const savings = altMin != null && altMin > bestTotal ? Math.round((altMin - bestTotal) * 100) / 100 : null

  const result = {
    bestStore,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    bestStoreAddress: str((webData as any).bestStoreAddress),
    bestTotal: Math.round(bestTotal * 100) / 100,
    currency,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    savings: typeof (webData as any).savings === 'number' ? Math.round((webData as any).savings * 100) / 100 : savings,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    summary: str((webData as any).summary),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tip: str((webData as any).tip),
    bestStoreItems: cleanItems,
    alternatives: cleanAlts,
  }

  optimizeCache.set(key, { result, expiresAt: Date.now() + OPTIMIZE_TTL_MS })

  return NextResponse.json(result, {
    headers: { 'X-Cache': 'MISS', 'Cache-Control': 'private, max-age=300' },
  })
}
