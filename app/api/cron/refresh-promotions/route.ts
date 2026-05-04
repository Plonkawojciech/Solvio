import { NextResponse } from 'next/server'
import { getAIClient, getAIClientForWebSearch } from '@/lib/ai-client'
import { writeIntel } from '@/lib/store-intel'
import { PRICE_COMPARE_STORES } from '@/lib/stores'
import crypto from 'crypto'

/**
 * `/api/cron/refresh-promotions` — pre-warms the GLOBAL promotions
 * cache so cold-start users see deals instantly (≤500ms) instead of
 * blocking 30s on a fresh AI web_search run.
 *
 * Wired into `vercel.json` to fire every 6h. The handler builds the
 * same prompt the user-facing route uses, calls `web_search_preview`,
 * and writes the result to the per-(lang, currency) GLOBAL key. The
 * personalised endpoint reads this key as a fallback when no
 * user-keyed cache exists.
 *
 * Auth: Vercel Cron sets `x-vercel-cron-signature`; bearer token
 * (`CRON_SECRET`) also accepted for ad-hoc external triggers.
 */

const STORES = PRICE_COMPARE_STORES
const PROMPT_VERSION = 'v2'
const PROMO_TTL_S = 24 * 60 * 60        // 24h fresh
const PROMO_REVALIDATE_S = 6 * 60 * 60  // 6h soft

function authorized(req: Request): boolean {
  const url = new URL(req.url)
  const queryToken = url.searchParams.get('token')
  const headerSig = req.headers.get('x-vercel-cron-signature')
  const headerAuth = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  const expected = process.env.CRON_SECRET
  if (!expected) return false
  return queryToken === expected || headerAuth === expected || (headerSig != null && headerSig.length > 0)
}

interface RawPromo {
  id?: string; store?: string; productName?: string;
  regularPrice?: number; promoPrice?: number; discount?: string;
  currency?: string; validFrom?: string; validUntil?: string;
  category?: string; matchesPurchases?: boolean;
  leafletUrl?: string; dealUrl?: string;
  promoType?: string; promoDescription?: string;
  sourceUrl?: string;
}

const isHttpUrl = (v: unknown): v is string =>
  typeof v === 'string' && /^https?:\/\//i.test(v)

async function buildPromotions(lang: 'pl' | 'en', currency: string) {
  const ai = getAIClient()
  if (!ai) return null

  const isPolish = lang === 'pl'
  const today = new Date()
  const todayStr = today.toISOString().slice(0, 10)
  const weekAhead = new Date(today)
  weekAhead.setDate(today.getDate() + 7)
  const weekAheadStr = weekAhead.toISOString().slice(0, 10)

  const prompt = isPolish
    ? `Jesteś asystentem zakupowym z dostępem do wyszukiwarki internetowej. Dziś jest ${todayStr}.

ZADANIE: Użyj web_search żeby znaleźć AKTUALNE promocje TEGO TYGODNIA w polskich sieciach: ${STORES.join(', ')}.

JAK:
1. Wyszukaj "gazetka [chain] aktualna ${todayStr.slice(0,7)}".
2. Otwórz oficjalne strony: lidl.pl/c/gazetka, biedronka.pl/pl/gazetki, kaufland.pl/oferta, auchan.pl/oferta-tygodnia, carrefour.pl/promocje.
3. JEŚLI weszłaś na np. Biedronka gazetkę i widzisz w niej promocje — użyj URL-a gazetki dla KAŻDEJ promocji z tej gazetki. URL gazetki = wystarczające źródło.

Zwróć WYŁĄCZNIE JSON (bez markdown), 8-12 promocji z różnych sieci, top 2-3 najmocniejsze deals per sieć:

{
  "promotions": [
    {
      "id": "promo-1",
      "store": "Lidl",
      "productName": "Mleko Łaciate 2% 1L",
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
  "totalPotentialSavings": 45.50,
  "sources": ["https://www.lidl.pl/c/gazetka-promocyjna/..."]
}

KRYTYCZNE: minimum 8 promocji jeśli web_search zwraca jakąkolwiek gazetkę. Pusty array TYLKO gdy web_search całkowicie zawodzi.`
    : `You are a shopping assistant with access to web search. Today is ${todayStr}.

TASK: Use web_search to find CURRENT promotions THIS WEEK at Polish chains: ${STORES.join(', ')}.

HOW:
1. Search "gazetka [chain] aktualna ${todayStr.slice(0,7)}".
2. Open official pages: lidl.pl/c/gazetka, biedronka.pl/pl/gazetki, kaufland.pl/oferta, auchan.pl/oferta-tygodnia, carrefour.pl/promocje.
3. If you opened a leaflet and saw promos — use the leaflet URL as sourceUrl for every promo from that leaflet. That's verifiable enough.

Return ONLY JSON (no markdown), 8-12 promotions across chains, top 2-3 strongest deals per chain:

{
  "promotions": [
    {
      "id": "promo-1",
      "store": "Lidl",
      "productName": "Łaciate 2% Milk 1L",
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
  "totalPotentialSavings": 45.50,
  "sources": ["https://www.lidl.pl/c/gazetka-promocyjna/..."]
}

CRITICAL: minimum 8 promos if web_search returns any leaflet. Empty array ONLY if web_search completely fails.`

  // Try OpenAI Responses API with web_search_preview first.
  let parsed: { promotions?: RawPromo[]; totalPotentialSavings?: number; sources?: unknown[] } | null = null
  let dataSource: 'live_web_search' | 'estimate' = 'estimate'

  const webSearchAI = getAIClientForWebSearch()
  if (webSearchAI) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const call = (webSearchAI.client as any).responses.create({
        model: webSearchAI.model,
        tools: [{ type: 'web_search_preview' }],
        input: prompt,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)
      const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 45000))
      const response = await Promise.race([call, timeout])
      if (response) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rawText = (response as any).output_text || ''
        const jsonMatch = rawText.match(/\{[\s\S]*\}/)
        if (jsonMatch) {
          parsed = JSON.parse(jsonMatch[0])
          dataSource = 'live_web_search'
        }
      }
    } catch (e) {
      console.error('[refresh-promotions web_search]', e)
    }
  }

  if (!parsed) {
    try {
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
      try { parsed = JSON.parse(content) } catch { parsed = null }
    } catch (e) {
      console.error('[refresh-promotions chat]', e)
    }
  }

  if (!parsed || !Array.isArray(parsed.promotions)) return null

  const sources: string[] = Array.isArray(parsed.sources)
    ? (parsed.sources as unknown[]).filter(isHttpUrl)
    : []
  const fallbackSource = sources[0] ?? null

  const cleanPromos = parsed.promotions
    .filter((p): p is RawPromo => typeof p === 'object' && p !== null)
    .map((p, i) => {
      const sourceUrl =
        (isHttpUrl(p.sourceUrl) ? p.sourceUrl : null) ??
        (isHttpUrl(p.leafletUrl) ? p.leafletUrl : null) ??
        (isHttpUrl(p.dealUrl) ? p.dealUrl : null) ??
        fallbackSource
      if (!sourceUrl) return null
      const leafletUrl = isHttpUrl(p.leafletUrl) ? p.leafletUrl : sourceUrl
      const dealUrl = isHttpUrl(p.dealUrl) ? p.dealUrl : null
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

  const promoUrls = cleanPromos.map(p => p.sourceUrl)
  const aggregateSources = Array.from(new Set([...sources, ...promoUrls])).slice(0, 8)

  return {
    promotions: cleanPromos,
    personalizedDeals: [],
    totalPotentialSavings: parsed.totalPotentialSavings ?? 0,
    weeklySummary: null,
    dataSource,
    sources: dataSource === 'live_web_search' ? aggregateSources : [],
  }
}

async function refresh(): Promise<{ written: number; skipped: number }> {
  let written = 0
  let skipped = 0
  // Pre-warm the two locale × currency combinations we actually serve.
  // Adding more here is cheap (one cron call per day per locale).
  const matrix: Array<['pl' | 'en', string]> = [
    ['pl', 'PLN'],
    ['en', 'PLN'],
  ]
  for (const [lang, currency] of matrix) {
    const payload = await buildPromotions(lang, currency)
    if (!payload) { skipped++; continue }
    const key = crypto.createHash('sha256')
      .update(`${PROMPT_VERSION}:GLOBAL:${lang}:${currency}`)
      .digest('hex')
      .slice(0, 48)
    await writeIntel('promotions', key, payload, PROMO_TTL_S, {
      revalidateAfterSeconds: PROMO_REVALIDATE_S,
    }).catch((e) => console.error('[refresh-promotions writeIntel]', e))
    written++
  }
  return { written, skipped }
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const result = await refresh()
  return NextResponse.json({ ok: true, ...result })
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const result = await refresh()
  return NextResponse.json({ ok: true, ...result })
}
