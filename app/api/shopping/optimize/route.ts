import { auth } from '@/lib/auth-compat'
import { NextResponse } from 'next/server'
import { getAIClient, getAIClientForWebSearch } from '@/lib/ai-client'
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
  bestStoreItems: Array<{
    name: string
    qty: number | null
    unitPrice: number | null
    total: number
    /// "regular" | "1+1" | "2za1" | "percent" | "buy_x_get_y" | "app_only"
    /// Helps iOS render a badge ("PROMOCJA", "1+1", etc).
    promoType: string | null
    /// Human-readable promo description (e.g. "2 za 12 zł", "kup 3, zapłać za 2").
    promoDescription: string | null
  }>
  alternatives: Array<{ store: string; total: number; address: string | null }>
  /// "live_web_search" when the AI actually queried current chain
  /// pages, "estimate" when the response was generated from training
  /// data only. Lets iOS show a "ESTYMATA" badge for transparency.
  dataSource: 'live_web_search' | 'estimate'
  /// Optional citation URLs from the web search (chain leaflet pages,
  /// product pages). iOS shows them as small links under the result.
  sources: string[]
  /// Multi-store optimization. When the user is willing to visit 2-3
  /// stores, AI splits the list into per-store partitions to capture
  /// promotions across chains. `null` when single-store is already
  /// optimal (savings vs single-store < 5%) so the UI doesn't push a
  /// 2-store trip for trivial gains.
  multiStoreStrategy: {
    stores: Array<{
      store: string
      address: string | null
      subtotal: number
      items: Array<{
        name: string
        qty: number | null
        unitPrice: number | null
        total: number
        promoType: string | null
        promoDescription: string | null
      }>
    }>
    grandTotal: number
    /// Savings vs the single-store best total — only populated when > 0.
    savingsVsSingle: number
    /// Plain-language one-liner explaining the multi-store split.
    rationale: string | null
  } | null
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
///
/// Strategy:
///   1. Try OpenAI Responses API with `web_search_preview` — this is
///      the ONLY path that gets actually-live current-week data. Azure
///      does not support Responses API, so any backend that resolves
///      to Azure means the model is guessing from training data.
///   2. If web-search OpenAI is not configured, fall back to whichever
///      backend the default `getAIClient()` returns (Azure or OpenAI
///      chat completions). Mark the response `dataSource: 'estimate'`
///      so iOS can badge it accordingly.
async function fetchFromAI(args: {
  items: ShoppingItem[]
  lang: string
  currency: string
  lat?: number
  lng?: number
  isPolish: boolean
}): Promise<{ data: OptimizeResultPayload; source?: string } | null> {
  const { items, currency, lat, lng, isPolish } = args
  const webSearchAI = getAIClientForWebSearch()
  const fallbackAI = getAIClient()
  if (!webSearchAI && !fallbackAI) return null

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
    ? `Jesteś asystentem zakupowym z dostępem do bieżących polskich gazetek promocyjnych. Dziś jest ${today}.

ZADANIE: Użyj wyszukiwarki internetowej (web_search) żeby SPRAWDZIĆ AKTUALNE ceny i promocje TEGO TYGODNIA w sieciach: Lidl, Biedronka, Kaufland, Auchan, Carrefour, Netto, Dino, Stokrotka, Aldi, Żabka. NASTĘPNIE wykonaj DWIE analizy:
  (A) **Najlepszy JEDEN sklep** — w którym kupię całość najtaniej (jeśli ktoś nie chce robić rundki po 2 sklepach).
  (B) **Optymalna strategia 2-3 sklepów** — gdy promocje na różne produkty są w różnych sieciach, podziel listę żeby zminimalizować łączny koszt. Pomiń tę strategię (multiStoreStrategy = null) gdy oszczędność < 5% vs (A) — nie ma sensu pchać klienta na 2 sklepy dla 3 zł.

LISTA ZAKUPÓW:
${itemsLines}

${locationHint}

PRZYKŁADOWE SIECI: ${storeHints}

JAK SZUKAĆ DANYCH (nie pomijaj tego kroku!):
1. Sprawdź "gazetka [chain] aktualna" + nazwa produktu — np. "gazetka Lidl banany kwiecień 2026".
2. Sprawdź oficjalne strony: lidl.pl/c/gazetka-promocyjna, biedronka.pl/pl/gazetki, kaufland.pl/oferta, auchan.pl/oferta-tygodnia, carrefour.pl/promocje.
3. Promocje wielosztukowe ("2 za 12 zł", "kup 3 zapłać za 2", "1+1 gratis") MUSZĄ być uwzględnione — to często znaczna oszczędność.
4. Promocje "tylko w aplikacji" sieci (Lidl Plus, Biedronka aplikacja, Kaufland Card) — uwzględnij je jeśli widnieją w gazetce/web.
5. Jeśli NIE ZNAJDZIESZ produktu w gazetkach — użyj typowej ceny regularnej z bieżącego cennika sieci.
6. NIGDY nie wymyślaj promocji — jeśli nie ma jej w żadnej znalezionej gazetce, podaj cenę regularną.

POLA promoType (per item):
- "regular": cena regularna, bez promocji
- "1+1": kup 1, drugi gratis
- "2za1": kup 2, zapłać za 1 (lub "3za2" itp.)
- "percent": -X% rabatu
- "buy_x_get_y": np. kup 3 za 12 zł
- "app_only": promocja widoczna tylko po zalogowaniu w app sieci
- "multipack_price": wieloszt. cena pakietu (np. "2× 5,99 zł")

Zwróć **wyłącznie** JSON, bez markdown. Schema:

{
  "bestStore": "nazwa sieci (np. Lidl)",
  "bestStoreAddress": "ulica i miasto albo null gdy nie pewien",
  "bestTotal": 123.45,
  "savings": 12.50,
  "summary": "1-2 zdania dlaczego ten sklep jest najtańszy DZISIAJ — wymień konkretne promocje z gazetki jeśli są",
  "tip": "1 zdanie z konkretną poradą (np. „Lidl Plus daje dodatkowe -2 zł na masło")",
  "bestStoreItems": [
    {
      "name": "mleko 2% Łaciate 1L",
      "qty": 2,
      "unitPrice": 3.49,
      "total": 6.98,
      "promoType": "regular",
      "promoDescription": null
    },
    {
      "name": "masło ekstra 200g",
      "qty": 2,
      "unitPrice": 4.99,
      "total": 9.98,
      "promoType": "2za1",
      "promoDescription": "kup 2 sztuki — drugie 50% taniej"
    }
  ],
  "alternatives": [
    {"store": "Biedronka", "total": 130.00, "address": null},
    {"store": "Kaufland", "total": 135.50, "address": null}
  ],
  "multiStoreStrategy": {
    "stores": [
      {
        "store": "Lidl",
        "address": null,
        "subtotal": 45.50,
        "items": [
          {"name": "masło ekstra 200g", "qty": 2, "unitPrice": 4.99, "total": 9.98, "promoType": "2za1", "promoDescription": "drugie -50%"}
        ]
      },
      {
        "store": "Biedronka",
        "address": null,
        "subtotal": 32.10,
        "items": [
          {"name": "kawa Tchibo Family 250g", "qty": 1, "unitPrice": 14.99, "total": 14.99, "promoType": "percent", "promoDescription": "-30%"}
        ]
      }
    ],
    "grandTotal": 77.60,
    "savingsVsSingle": 8.40,
    "rationale": "Masło 1+1 w Lidlu, ale kawa Tchibo -30% tylko w Biedronce — split daje 8.40 zł oszczędności."
  },
  "sources": [
    "https://www.lidl.pl/c/gazetka-promocyjna/...",
    "https://www.biedronka.pl/pl/gazetki/..."
  ]
}

KRYTYCZNE:
- "sources" MUSI zawierać URL-e stron z których faktycznie wziąłeś ceny. Pusta tablica jeśli nie miałeś dostępu do web_search.
- "multiStoreStrategy" = null gdy single-store jest już optymalny (savings < 5%) lub gdy nie znajdziesz wiarygodnych cross-store deals. NIGDY nie zmyślaj split'u tylko po to, żeby coś było.
- Liczby jako number, nie string. Zawsze valid JSON.`
    : `You are a shopping assistant with access to live Polish supermarket leaflet data. Today is ${today}.

TASK: Use web search to look up CURRENT prices and THIS WEEK'S promotions across: Lidl, Biedronka, Kaufland, Auchan, Carrefour, Netto, Dino, Stokrotka, Aldi, Żabka. Then provide TWO analyses:
  (A) **Best SINGLE store** — where the whole list is cheapest if the user only wants one stop.
  (B) **Optimal 2-3 store strategy** — when promotions for different products are at different chains, split the list to minimize total cost. Skip this (multiStoreStrategy = null) when savings < 5% vs (A) — not worth pushing the user to 2 stores for trivial gains.

SHOPPING LIST:
${itemsLines}

${locationHint}

CHAIN HINTS: ${storeHints}

HOW TO SOURCE DATA (don't skip this step!):
1. Search "gazetka [chain] aktualna" plus product name — e.g. "gazetka Lidl banany april 2026".
2. Check official pages: lidl.pl/c/gazetka-promocyjna, biedronka.pl/pl/gazetki, kaufland.pl/oferta, auchan.pl/oferta-tygodnia, carrefour.pl/promocje.
3. Multipack promotions ("2 for 12 PLN", "buy 3 pay for 2", "1+1 free") MUST be included — often significant savings.
4. App-only promotions (Lidl Plus, Biedronka app, Kaufland Card) — include them if visible in the leaflet/web.
5. If you can't find the product in any leaflet — use the typical current regular price.
6. NEVER fabricate promotions — if there's no actual promo found, return the regular price.

promoType values (per item):
- "regular": no promotion
- "1+1": buy 1 get 1 free
- "2za1": buy 2 pay for 1 (or "3za2" etc.)
- "percent": -X% discount
- "buy_x_get_y": e.g. 3 for 12 PLN
- "app_only": app-exclusive promotion
- "multipack_price": multi-pack price

Return **only** JSON, no markdown. Schema:

{
  "bestStore": "chain name",
  "bestStoreAddress": "street and city or null when unsure",
  "bestTotal": 123.45,
  "savings": 12.50,
  "summary": "1-2 sentences explaining why this store is cheapest TODAY — cite specific leaflet promotions",
  "tip": "1 concrete savings tip",
  "bestStoreItems": [
    {
      "name": "2% milk Łaciate 1L",
      "qty": 2,
      "unitPrice": 3.49,
      "total": 6.98,
      "promoType": "regular",
      "promoDescription": null
    }
  ],
  "alternatives": [
    {"store": "Biedronka", "total": 130.00, "address": null}
  ],
  "multiStoreStrategy": {
    "stores": [
      {
        "store": "Lidl", "address": null, "subtotal": 45.50,
        "items": [{"name": "butter 200g", "qty": 2, "unitPrice": 4.99, "total": 9.98, "promoType": "2za1", "promoDescription": "second 50% off"}]
      },
      {
        "store": "Biedronka", "address": null, "subtotal": 32.10,
        "items": [{"name": "Tchibo Family coffee 250g", "qty": 1, "unitPrice": 14.99, "total": 14.99, "promoType": "percent", "promoDescription": "-30%"}]
      }
    ],
    "grandTotal": 77.60,
    "savingsVsSingle": 8.40,
    "rationale": "Butter 1+1 at Lidl, but Tchibo coffee -30% only at Biedronka — split saves 8.40 PLN."
  },
  "sources": ["https://www.lidl.pl/c/gazetka-promocyjna/..."]
}

CRITICAL:
- "sources" MUST contain URLs you actually pulled prices from. Empty array if web_search wasn't available.
- "multiStoreStrategy" = null when single-store is already optimal (savings < 5%) or when you can't find credible cross-store deals. NEVER fabricate a split just for the sake of it.
- Numbers as numbers, not strings. Always valid JSON.`

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let webData: any = null
  let usedSource: string | undefined
  let usedLiveSearch = false

  // Step 1: Try OpenAI Responses API with web_search_preview — the only
  // path that actually queries the live web. We give it 30s because
  // chain leaflet pages aren't fast.
  if (webSearchAI) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const webSearchCall = (webSearchAI.client as any).responses.create({
        model: webSearchAI.model,
        tools: [{ type: 'web_search_preview' }],
        input: prompt,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)
      const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 30000))
      const response = await Promise.race([webSearchCall, timeout])
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
    } catch {
      // fall through to chat completions
    }
  }

  // Step 2: Fall back to plain chat completions (Azure or OpenAI). The
  // model will hallucinate "current promotions" — we mark the response
  // accordingly so the UI can badge it as estimate.
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
      usedLiveSearch = false
    } catch {
      return null
    }
  }
  if (!webData) return null

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

  // Whitelist of acceptable promoType values — anything outside this set
  // gets dropped to "regular" so the iOS UI doesn't have to handle
  // arbitrary strings. New types can be added here as we add UI for them.
  const VALID_PROMO_TYPES = new Set([
    'regular', '1+1', '2za1', '3za2', 'percent',
    'buy_x_get_y', 'app_only', 'multipack_price',
  ])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawItems: any[] = Array.isArray((webData as any).bestStoreItems) ? (webData as any).bestStoreItems : []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cleanItems = rawItems.map((it: any) => {
    const promoTypeRaw = typeof it?.promoType === 'string' ? it.promoType.trim().toLowerCase() : null
    const promoType = promoTypeRaw && VALID_PROMO_TYPES.has(promoTypeRaw) ? promoTypeRaw : 'regular'
    return {
      name: typeof it?.name === 'string' ? it.name : (typeof it?.product === 'string' ? it.product : 'item'),
      qty: it?.qty != null ? num(it.qty, 1) : (it?.quantity != null ? num(it.quantity, 1) : null),
      unitPrice: it?.unitPrice != null ? num(it.unitPrice) : (it?.price != null ? num(it.price) : null),
      total: num(it?.total ?? (num(it?.unitPrice ?? it?.price ?? 0) * num(it?.qty ?? it?.quantity ?? 1, 1))),
      promoType,
      promoDescription: str(it?.promoDescription),
    }
  })

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

  // Cite-or-degrade: validate sources are real URLs. We don't HEAD-
  // request them (too slow / flaky) but at least drop strings that
  // aren't even http(s). Without web search the array is forcibly
  // empty so the iOS badge can show "ESTYMATA" honestly.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawSources: unknown[] = Array.isArray((webData as any).sources) ? (webData as any).sources : []
  const cleanSources = usedLiveSearch
    ? rawSources
        .filter((s): s is string => typeof s === 'string' && /^https?:\/\//i.test(s))
        .slice(0, 5)
    : []

  // ---- Multi-store strategy parsing -------------------------------------
  // Defensive — accept the field only when it has at least 2 stores AND
  // savings > 0. Otherwise reject (keep multiStoreStrategy null) to avoid
  // pushing the user to a 2-store trip for nothing.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawStrategy = (webData as any).multiStoreStrategy
  let multiStoreStrategy: OptimizeResultPayload['multiStoreStrategy'] = null
  if (rawStrategy && typeof rawStrategy === 'object') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rawStores: any[] = Array.isArray(rawStrategy.stores) ? rawStrategy.stores : []
    const cleanStrategyStores = rawStores
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((s: any) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const sItems: any[] = Array.isArray(s?.items) ? s.items : []
        const items = sItems.map((it) => {
          const promoTypeRaw = typeof it?.promoType === 'string' ? it.promoType.trim().toLowerCase() : null
          const promoType = promoTypeRaw && VALID_PROMO_TYPES.has(promoTypeRaw) ? promoTypeRaw : 'regular'
          return {
            name: typeof it?.name === 'string' ? it.name : 'item',
            qty: it?.qty != null ? num(it.qty, 1) : (it?.quantity != null ? num(it.quantity, 1) : null),
            unitPrice: it?.unitPrice != null ? num(it.unitPrice) : (it?.price != null ? num(it.price) : null),
            total: num(it?.total ?? (num(it?.unitPrice ?? it?.price ?? 0) * num(it?.qty ?? it?.quantity ?? 1, 1))),
            promoType,
            promoDescription: str(it?.promoDescription),
          }
        })
        const computedSubtotal = items.reduce((acc, it) => acc + num(it.total), 0)
        return {
          store: typeof s?.store === 'string' ? s.store : null,
          address: (lat != null && lng != null) ? str(s?.address) : null,
          subtotal: Math.round((num(s?.subtotal, computedSubtotal)) * 100) / 100,
          items,
        }
      })
      .filter((s): s is { store: string; address: string | null; subtotal: number; items: typeof cleanItems } =>
        s.store != null && s.items.length > 0
      )
    const grandTotal = num(rawStrategy.grandTotal,
      cleanStrategyStores.reduce((acc, s) => acc + s.subtotal, 0))
    const savingsVsSingle = num(rawStrategy.savingsVsSingle,
      Math.max(0, Math.round((bestTotal - grandTotal) * 100) / 100))
    // Only surface the strategy when it (a) has 2+ stores, (b) actually
    // beats single-store best by something meaningful (>= 3 PLN absolute
    // OR >= 5% relative). Otherwise drop it.
    const minAbsSavings = 3
    const minRelSavings = bestTotal > 0 ? bestTotal * 0.05 : 0
    if (cleanStrategyStores.length >= 2
        && savingsVsSingle >= Math.min(minAbsSavings, minRelSavings)
        && savingsVsSingle > 0) {
      multiStoreStrategy = {
        stores: cleanStrategyStores,
        grandTotal: Math.round(grandTotal * 100) / 100,
        savingsVsSingle: Math.round(savingsVsSingle * 100) / 100,
        rationale: str(rawStrategy.rationale),
      }
    }
  }

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
    dataSource: usedLiveSearch ? 'live_web_search' : 'estimate',
    sources: cleanSources,
    multiStoreStrategy,
  }

  return { data, source: usedSource }
}
