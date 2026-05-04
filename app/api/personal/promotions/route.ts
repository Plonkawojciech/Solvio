import { auth } from '@/lib/auth-compat'
import { NextResponse } from 'next/server'
import { db, receipts, weeklySummaries, expenses } from '@/lib/db'
import { eq, desc } from 'drizzle-orm'
import { getAIClient, getAIClientForWebSearch } from '@/lib/ai-client'
import { rateLimit } from '@/lib/rate-limit'
import { PRICE_COMPARE_STORES } from '@/lib/stores'
import { readAnyIntel, readIntel, writeIntel } from '@/lib/store-intel'
import crypto from 'crypto'

const STORES = PRICE_COMPARE_STORES

// LEAFLET_URLS used to be a hardcoded map of chain → leaflet URL — but
// chain leaflet pages move around (Lidl rotates `s10005637`-style IDs,
// Carrefour reorganises `/promocje` into `/gazetki/...`), so a static
// map goes stale and the AI returned dead links to users.
//
// Now: when web search is available (OpenAI Responses API), the AI
// itself looks up the current leaflet page and cites it under the
// promotion. We don't ship a fallback URL — better to omit a link than
// to surface a stale one. The cron `/api/cron/refresh-intel` still
// pre-warms a static map for the shopping list optimizer's prompt
// hints, but that map is internal-only and not surfaced to the client.

// Persistent cache backed by `store_intel` (kind: 'promotions').
// Survives serverless cold-starts and is shared across the fleet.
// Hard TTL: 24h (leaflets are weekly, but we want a fresh-ish feel);
// revalidate-after: 6h (so a logged-in user once a day sees a quick
// stale-served + bg-refresh experience).
const PROMO_TTL_S = 24 * 60 * 60
const PROMO_REVALIDATE_S = 6 * 60 * 60

export async function POST(request: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const ai = getAIClient()
  if (!ai) {
    return NextResponse.json({ error: 'AI service not configured' }, { status: 503 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { lang = 'pl', currency = 'PLN', force = false } = body
  const isPolish = lang === 'pl'

  // Cache key includes userId because the personalised section
  // depends on the user's purchase history. Generic promotions could
  // dedupe across users, but splitting that out is a follow-up — for
  // now we accept some redundancy in exchange for a single response.
  //
  // PROMPT_VERSION bumps invalidate every cached row across the fleet.
  // Bump when the AI contract changes (new fields, looser/stricter
  // rules) so users don't see stale empty arrays from old prompts.
  const PROMPT_VERSION = 'v2'
  const intelKey = crypto.createHash('sha256')
    .update(`${PROMPT_VERSION}:${userId}:${lang}:${currency}`)
    .digest('hex')
    .slice(0, 48)

  // Force refresh: skip the SWR helper and write a fresh row directly.
  // Otherwise: return cached if fresh, return cached + bg-refresh if
  // stale, fetch synchronously on miss.
  if (force) {
    // Drop the row so the next read is a hard miss.
    // (writeIntel below will replace it with a fresh result.)
  } else {
    const cached = await readIntel<unknown>('promotions', intelKey).catch(() => null)
    if (cached) {
      return NextResponse.json({
        ...(cached.data as object),
        fetchedAt: cached.fetchedAt.toISOString(),
        freshUntil: cached.expiresAt.toISOString(),
        cacheState: cached.state,
      }, {
        headers: {
          'X-Cache': cached.state.toUpperCase(),
          'X-Fetched-At': cached.fetchedAt.toISOString(),
          'Cache-Control': 'private, max-age=300',
        },
      })
    }
  }

  // Cache miss (or force) — rate-limit before the AI call. Cached hits
  // never reach this gate so they don't burn the user's quota.
  const rl = rateLimit(`ai:promotions:${userId}`, { maxRequests: 10, windowMs: 60 * 60 * 1000 })
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Try again later.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
    )
  }

  try {
    // Get user's recent purchases (last 30 days) for personalization
    // Use receipts.items JSONB (populated by OCR) instead of receipt_items table (never populated by OCR)
    const [recentReceipts, recentExpenses] = await Promise.all([
      db
        .select({ items: receipts.items, vendor: receipts.vendor })
        .from(receipts)
        .where(eq(receipts.userId, userId))
        .orderBy(desc(receipts.createdAt))
        .limit(20),
      db
        .select({ title: expenses.title, amount: expenses.amount, vendor: expenses.vendor })
        .from(expenses)
        .where(eq(expenses.userId, userId))
        .orderBy(desc(expenses.date))
        .limit(30),
    ])

    // Extract item names from JSONB receipts.items. Prefer AI-cleaned
    // names (`nameClean`) over the raw POS-truncated form so the AI is
    // matching promotions against real product names like "Chleb żytnio-
    // orkiszowy" rather than "ChlezytnOrkisz".
    const purchaseHistory = recentReceipts.flatMap(r => {
      const items = Array.isArray(r.items) ? r.items as Array<{ name?: string; nameClean?: string; nameTranslated?: string }> : []
      return items.map(i => i.nameClean || i.nameTranslated || i.name).filter(Boolean)
    }).slice(0, 25) as string[]
    const vendorHistory = recentExpenses.map(e => e.vendor).filter(Boolean)
    const uniqueVendors = [...new Set(vendorHistory)]

    // Date hints for the AI — without these, it sometimes returns
    // 2024 dates from training data, which look stale to the user.
    const today = new Date()
    const todayStr = today.toISOString().slice(0, 10)
    const weekAhead = new Date(today)
    weekAhead.setDate(today.getDate() + 7)
    const weekAheadStr = weekAhead.toISOString().slice(0, 10)

    // Prompt instructs the AI to use web_search_preview and cite live
    // chain leaflet pages. When web search is unavailable (Azure-only
    // backend), the AI is told NOT to fabricate promotions — return
    // an empty list instead. iOS surfaces this as the empty state.
    const prompt = isPolish
      ? `Jesteś asystentem zakupowym z dostępem do wyszukiwarki internetowej. Dziś jest ${todayStr}.

ZADANIE: Użyj web_search żeby znaleźć AKTUALNE promocje TEGO TYGODNIA w polskich sieciach: ${STORES.join(', ')}.

JAK:
1. Wyszukaj "gazetka [chain] aktualna ${todayStr.slice(0,7)}" lub "promocje [chain] tydzień".
2. Otwórz oficjalne strony: lidl.pl/c/gazetka, biedronka.pl/pl/gazetki, kaufland.pl/oferta, auchan.pl/oferta-tygodnia, carrefour.pl/promocje, dino.pl, stokrotka.pl, netto.pl/gazetka, aldi.pl/gazetka.
3. Cytuj URL-e z których wziąłeś promocje (pole "sourceUrl" per promocja MUSI być prawdziwym URL z gazetki).
4. Promocje wielosztukowe (1+1, 2za1, "kup 3 zapłać za 2", "2 za 12 zł") MUSZĄ być oznaczone — to często znacząca oszczędność.
5. Promocje z aplikacji sieci (Lidl Plus, Biedronka aplikacja, Kaufland Card) — uwzględnij gdy widnieją w gazetce.

Historia zakupów użytkownika: ${purchaseHistory.length > 0 ? purchaseHistory.join(', ') : '(brak — pokaż popularne promocje)'}
Sklepy: ${uniqueVendors.length > 0 ? uniqueVendors.join(', ') : '(dowolne)'}

Zwróć WYŁĄCZNIE JSON, bez markdown:

{
  "promotions": [
    {
      "id": "promo-1",
      "store": "Lidl",
      "productName": "Pełna nazwa produktu (np. Mleko Łaciate 2% 1L)",
      "regularPrice": 5.99,
      "promoPrice": 3.49,
      "discount": "-42%",
      "currency": "${currency}",
      "validFrom": "${todayStr}",
      "validUntil": "${weekAheadStr}",
      "category": "Nabiał",
      "matchesPurchases": false,
      "leafletUrl": "https://www.lidl.pl/c/gazetka-promocyjna/...",
      "dealUrl": null,
      "promoType": "regular",
      "promoDescription": null,
      "sourceUrl": "https://www.lidl.pl/c/gazetka-promocyjna/..."
    }
  ],
  "personalizedDeals": [...te same pola, tylko produkty pasujące do historii zakupów...],
  "totalPotentialSavings": 45.50,
  "sources": [
    "https://www.lidl.pl/c/gazetka-promocyjna/...",
    "https://www.biedronka.pl/pl/gazetki/..."
  ]
}

KRYTYCZNE — JAK WYPEŁNIAĆ POLA:
- "sourceUrl" → URL gazetki / strony, na której WIDZIAŁEŚ ten produkt. JEŚLI weszłaś na np. Biedronka gazetkę i widzisz w niej promocje — użyj URL-a gazetki dla KAŻDEJ promocji z tej gazetki. To jest WERYFIKOWALNE; nie pomijaj promocji tylko dlatego, że nie ma osobnego deep-linka. URL gazetki = wystarczające źródło.
- "leafletUrl" → ten sam URL gazetki sieci, do którego user może kliknąć po więcej.
- "dealUrl" → bezpośredni link do produktu jeśli istnieje, inaczej null.
- "validFrom"/"validUntil" → daty gazetki widoczne na stronie (np. "od 5 maja do 11 maja"). Format YYYY-MM-DD.
- "promoType": "regular" | "1+1" | "2za1" | "3za2" | "percent" | "buy_x_get_y" | "app_only" | "multipack_price"
- "promoDescription" → human-readable opis dla wielosztukowych (np. "kup 2, zapłać za 1") lub null dla regular.

OCZEKIWANY WYNIK: Pełna lista 8-12 promocji z różnych sieci. Jeśli znajdziesz gazetki Lidl/Biedronka/Kaufland/itp — wymień NAJLEPSZE oferty z każdej (po 2-3 najmocniejsze deals per sieć). Nie zwracaj emptów gdy gazetki są dostępne — opisz to co widzisz.

JEDYNY POWÓD na empty array: web_search całkowicie zawiódł i nie masz żadnej gazetki. W praktyce zwracaj minimum 6 promocji.`
      : `You are a shopping assistant with access to web search. Today is ${todayStr}.

TASK: Use web_search to find CURRENT promotions THIS WEEK at Polish chains: ${STORES.join(', ')}.

HOW:
1. Search "gazetka [chain] aktualna ${todayStr.slice(0,7)}" or "promocje [chain] week".
2. Open official pages: lidl.pl/c/gazetka, biedronka.pl/pl/gazetki, kaufland.pl/oferta, auchan.pl/oferta-tygodnia, carrefour.pl/promocje, dino.pl, stokrotka.pl, netto.pl/gazetka, aldi.pl/gazetka.
3. Cite URLs you pulled promotions from (per-promotion "sourceUrl" MUST be a real leaflet URL).
4. Multipack promotions (1+1, 2-for-1, "buy 3 pay for 2", "2 for 12 PLN") MUST be flagged.
5. App-exclusive promotions (Lidl Plus, Biedronka app, Kaufland Card) — include if visible in the leaflet.

User's purchase history: ${purchaseHistory.length > 0 ? purchaseHistory.join(', ') : '(empty — show popular)'}
Stores: ${uniqueVendors.length > 0 ? uniqueVendors.join(', ') : '(any)'}

Return ONLY JSON, no markdown:

{
  "promotions": [
    {
      "id": "promo-1",
      "store": "Lidl",
      "productName": "Full product name (e.g. Łaciate 2% Milk 1L)",
      "regularPrice": 5.99,
      "promoPrice": 3.49,
      "discount": "-42%",
      "currency": "${currency}",
      "validFrom": "${todayStr}",
      "validUntil": "${weekAheadStr}",
      "category": "Dairy",
      "matchesPurchases": false,
      "leafletUrl": "https://www.lidl.pl/c/gazetka-promocyjna/...",
      "dealUrl": null,
      "promoType": "regular",
      "promoDescription": null,
      "sourceUrl": "https://www.lidl.pl/c/gazetka-promocyjna/..."
    }
  ],
  "personalizedDeals": [...same fields, products matching purchase history...],
  "totalPotentialSavings": 45.50,
  "sources": ["https://www.lidl.pl/c/gazetka-promocyjna/..."]
}

CRITICAL — HOW TO FILL FIELDS:
- "sourceUrl" → URL of the leaflet/page WHERE YOU SAW the product. If you opened, say, the Biedronka leaflet and saw promos — use the leaflet URL for EVERY promo from that leaflet. That URL is verifiable; don't skip promos just because there's no per-product deep-link.
- "leafletUrl" → same leaflet URL the user can click for more.
- "dealUrl" → direct product URL if available, else null.
- "validFrom"/"validUntil" → leaflet dates as YYYY-MM-DD.
- "promoType": "regular" | "1+1" | "2za1" | "3za2" | "percent" | "buy_x_get_y" | "app_only" | "multipack_price"
- "promoDescription" → human-readable for multi-buys (e.g. "buy 2, pay for 1") or null for regular.

EXPECTED OUTPUT: Full list of 8–12 promotions across chains. If you find leaflets from Lidl/Biedronka/Kaufland — list 2–3 strongest deals per chain. DON'T return empty when leaflets ARE available — describe what you see.

ONLY reason for empty array: web_search completely failed and you have no leaflet at all. In practice return ≥ 6 promotions.`

    // Prefer OpenAI Responses API (web_search_preview). If not available,
    // fall back to whichever client is configured but tell the user the
    // result is an estimate (no live data).
    let result: { promotions?: unknown[]; personalizedDeals?: unknown[]; totalPotentialSavings?: number; sources?: unknown[] } = {}
    let dataSource: 'live_web_search' | 'estimate' = 'estimate'
    const webSearchAI = getAIClientForWebSearch()
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
            result = JSON.parse(jsonMatch[0])
            dataSource = 'live_web_search'
          }
        }
      } catch {
        // fall through
      }
    }
    if (!result || !Array.isArray(result.promotions)) {
      // Web search unavailable — try plain chat. The prompt tells the
      // model to return empty arrays when it can't verify, so this
      // path mostly produces an empty list (which iOS shows as "no
      // current promos found" rather than fake offers).
      const completion = await ai.client.chat.completions.create({
        model: ai.model,
        messages: [
          { role: 'system', content: 'You are a helpful assistant that returns only valid JSON. NEVER fabricate promotion data.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.3,
        max_tokens: 2200,
        response_format: { type: 'json_object' },
      })
      const content = completion.choices[0]?.message?.content || '{}'
      try {
        result = JSON.parse(content)
      } catch {
        result = { promotions: [], personalizedDeals: [], totalPotentialSavings: 0 }
      }
      dataSource = 'estimate'
    }

    // Backfill sourceUrl from leafletUrl, dealUrl, OR the global
    // `sources` array — many AI responses include the per-store
    // leaflet URL only at the aggregate level rather than repeating
    // it on every promotion. Drop only when NO URL at all is
    // available (zero-credibility entries), so we surface real deals
    // even when the AI is terse with per-row attribution.
    type RawPromo = Record<string, unknown>
    const isHttpUrl = (v: unknown): v is string => typeof v === 'string' && /^https?:\/\//i.test(v)
    const declaredSourcesPre: string[] = Array.isArray(result.sources)
      ? (result.sources as unknown[]).filter(isHttpUrl)
      : []
    const fallbackSource = declaredSourcesPre[0] ?? null

    const withIds = (arr: unknown[]) =>
      (arr || [])
        .filter((p): p is RawPromo => typeof p === 'object' && p !== null)
        .map((p, i) => {
          const sourceUrlRaw = p.sourceUrl
          const leafletUrlRaw = p.leafletUrl
          const dealUrlRaw = p.dealUrl
          const sourceUrl: string | null =
            (isHttpUrl(sourceUrlRaw) ? sourceUrlRaw : null) ??
            (isHttpUrl(leafletUrlRaw) ? leafletUrlRaw : null) ??
            (isHttpUrl(dealUrlRaw) ? dealUrlRaw : null) ??
            fallbackSource
          // Skip only if NOTHING points anywhere — that's a fabricated
          // entry with no possible verification path.
          if (!sourceUrl) return null
          const leafletUrl = isHttpUrl(leafletUrlRaw) ? leafletUrlRaw : sourceUrl
          const dealUrl = isHttpUrl(dealUrlRaw) ? dealUrlRaw : null
          return {
            ...p,
            id: typeof p.id === 'string' ? p.id : `promo-${Date.now()}-${i}`,
            currency: typeof p.currency === 'string' ? p.currency : currency,
            sourceUrl,
            leafletUrl,
            dealUrl,
            promoType: typeof p.promoType === 'string' ? p.promoType : 'regular',
            promoDescription: typeof p.promoDescription === 'string' ? p.promoDescription : null,
          }
        })
        .filter((p): p is NonNullable<typeof p> => p !== null)

    // Try to get latest weekly summary
    let weeklySummary = null
    try {
      const summaries = await db
        .select()
        .from(weeklySummaries)
        .where(eq(weeklySummaries.userId, userId))
        .orderBy(desc(weeklySummaries.createdAt))
        .limit(1)
      weeklySummary = summaries[0] || null
    } catch {
      // Table might not exist yet
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cleanPromos = withIds((result.promotions as unknown[]) ?? [])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cleanPersonal = withIds((result.personalizedDeals as unknown[]) ?? [])

    // Aggregate sources from per-promotion sourceUrl (deduped).
    const promoUrls = [...cleanPromos, ...cleanPersonal].map(p => p.sourceUrl)
    const declaredSources = Array.isArray(result.sources)
      ? (result.sources as unknown[]).filter((s): s is string => typeof s === 'string' && /^https?:\/\//i.test(s))
      : []
    const sources = Array.from(new Set([...declaredSources, ...promoUrls])).slice(0, 8)

    const payload = {
      promotions: cleanPromos,
      personalizedDeals: cleanPersonal,
      totalPotentialSavings: result.totalPotentialSavings || 0,
      weeklySummary,
      // Tells iOS whether this run actually used live web data or fell
      // back to a model estimate. Drives the "ŻYWE DANE / ESTYMATA"
      // badge on the iOS Okazje hub trending cards.
      dataSource,
      sources: dataSource === 'live_web_search' ? sources : [],
    }

    // Persist into store_intel so subsequent requests across the
    // fleet (not just this Vercel instance) get instant hits.
    await writeIntel('promotions', intelKey, payload, PROMO_TTL_S, {
      revalidateAfterSeconds: PROMO_REVALIDATE_S,
    }).catch((e) => console.error('[promotions cache write]', e))

    const now = new Date()
    return NextResponse.json({
      ...payload,
      fetchedAt: now.toISOString(),
      freshUntil: new Date(now.getTime() + PROMO_TTL_S * 1000).toISOString(),
      cacheState: 'miss',
    }, {
      headers: { 'X-Cache': 'MISS', 'Cache-Control': 'private, max-age=300' },
    })
  } catch (err) {
    console.error('[promotions POST]', err)
    // If the AI call failed but we have an *expired* cached payload,
    // surface it as a stale fallback. Better old data than a blocked
    // screen. `readAnyIntel` ignores expiry, so even rows past
    // `expires_at` are returned here.
    const expired = await readAnyIntel<unknown>('promotions', intelKey).catch(() => null)
    if (expired) {
      return NextResponse.json({
        ...(expired.data as object),
        fetchedAt: expired.fetchedAt.toISOString(),
        cacheState: 'stale',
      }, {
        headers: { 'X-Cache': 'STALE', 'Cache-Control': 'private, max-age=60' },
      })
    }
    return NextResponse.json({ error: 'Failed to fetch promotions' }, { status: 500 })
  }
}
