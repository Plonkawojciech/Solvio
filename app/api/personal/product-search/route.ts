import { auth } from '@/lib/auth-compat'
import { NextResponse } from 'next/server'
import { getAIClient, getAIClientForWebSearch } from '@/lib/ai-client'
import { rateLimitPersistent } from '@/lib/rate-limit'
import { PRICE_COMPARE_STORES } from '@/lib/stores'
import { z } from 'zod'
import { withApiTiming } from '@/lib/api-timing'
import { readAnyIntel, readIntel, writeIntel } from '@/lib/store-intel'
import crypto from 'crypto'

const SearchSchema = z.object({
  query: z.string().min(1).max(200),
  lang: z.enum(['pl', 'en']).optional().default('pl'),
  currency: z.string().length(3).optional().default('PLN'),
  force: z.boolean().optional().default(false),
})

const PRODUCT_SEARCH_TTL_S = 12 * 60 * 60
const PRODUCT_SEARCH_REVALIDATE_S = 2 * 60 * 60

async function postProductSearch(request: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })

  const parsed = SearchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten().fieldErrors }, { status: 400 })
  }

  const { query, lang, currency, force } = parsed.data
  const isPolish = lang === 'pl'
  const storeNames = PRICE_COMPARE_STORES.slice(0, 15).join(', ')
  const cleanQuery = query.trim()
  const intelKey = crypto.createHash('sha256')
    .update(`${lang}:${currency}:${cleanQuery.toLowerCase()}`)
    .digest('hex')
    .slice(0, 48)

  if (!force) {
    const cached = await readIntel<unknown>('product_search', intelKey).catch(() => null)
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

  const rl = await rateLimitPersistent(`ai:product-search:${userId}`, { maxRequests: 30, windowMs: 60 * 60 * 1000 })
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Try again later.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
    )
  }

  const webSearchAI = getAIClientForWebSearch()
  const fallbackAI = getAIClient()
  if (!webSearchAI && !fallbackAI) {
    return NextResponse.json({ error: 'AI service not configured' }, { status: 503 })
  }

  const systemPrompt = isPolish
    ? `Jesteś ekspertem od cen produktów w polskich sklepach. Użytkownik szuka produktu — podaj szacunkowe ceny w różnych sklepach. Odpowiadasz TYLKO w JSON.`
    : `You are a pricing expert for Polish stores. The user is searching for a product — provide estimated prices across stores. Respond ONLY in JSON.`

  const userPrompt = isPolish
    ? `Szukam produktu: "${cleanQuery}"

Podaj szacunkowe ceny tego produktu (lub najbliższych odpowiedników) w tych sklepach: ${storeNames}.

Odpowiedz w JSON:
{
  "product": "${cleanQuery}",
  "category": "kategoria produktu",
  "results": [
    {
      "store": "nazwa sklepu",
      "productName": "dokładna nazwa produktu w sklepie",
      "price": 0.00,
      "pricePerUnit": "cena za kg/l/szt",
      "isPromo": false,
      "promoDetails": null,
      "availability": "dostępny|możliwy|niedostępny",
      "sourceUrl": "https://..."
    }
  ],
  "cheapestStore": "nazwa najtańszego sklepu",
  "cheapestPrice": 0.00,
  "averagePrice": 0.00,
  "priceRange": { "min": 0.00, "max": 0.00 },
  "alternatives": [
    {
      "name": "alternatywny produkt",
      "avgPrice": 0.00,
      "whyBetter": "dlaczego warto rozważyć"
    }
  ],
  "tip": "wskazówka zakupowa",
  "currency": "${currency}"
}`
    : `Searching for product: "${cleanQuery}"

Provide estimated prices for this product (or closest equivalents) at these stores: ${storeNames}.

Respond in JSON:
{
  "product": "${query}",
  "category": "product category",
  "results": [
    {
      "store": "store name",
      "productName": "exact product name at store",
      "price": 0.00,
      "pricePerUnit": "price per kg/l/unit",
      "isPromo": false,
      "promoDetails": null,
      "availability": "available|possible|unavailable",
      "sourceUrl": "https://..."
    }
  ],
  "cheapestStore": "cheapest store name",
  "cheapestPrice": 0.00,
  "averagePrice": 0.00,
  "priceRange": { "min": 0.00, "max": 0.00 },
  "alternatives": [
    {
      "name": "alternative product",
      "avgPrice": 0.00,
      "whyBetter": "reason to consider"
    }
  ],
  "tip": "shopping tip",
  "currency": "${currency}"
}`

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let result: any = null
    let usedLiveSearch = false

    if (webSearchAI) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const webSearchCall = (webSearchAI.client as any).responses.create({
          model: webSearchAI.model,
          tools: [{ type: 'web_search_preview' }],
          instructions: systemPrompt,
          input: userPrompt,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any)
        const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 12000))
        const response = await Promise.race([webSearchCall, timeout])
        if (response) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const text = (response as any).output_text || ''
          const jsonMatch = text.match(/\{[\s\S]*\}/)
          if (jsonMatch) {
            result = JSON.parse(jsonMatch[0])
            usedLiveSearch = true
          }
        }
      } catch {
        // fallback to chat completions
      }
    }

    if (!result) {
      if (!fallbackAI) {
        return NextResponse.json({ error: 'AI service not configured' }, { status: 503 })
      }
      const completion = await fallbackAI.client.chat.completions.create({
        model: fallbackAI.model,
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: userPrompt + (isPolish
              ? '\n\nUwaga: podaj szacunkowe ceny na podstawie swojej wiedzy o cenach w polskich sklepach.'
              : '\n\nNote: provide estimated prices based on your knowledge of Polish store prices.'),
          },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.3,
        max_tokens: 3000,
      })
      const text = completion.choices[0]?.message?.content || '{}'
      try {
        result = JSON.parse(text)
      } catch {
        const jsonMatch = text.match(/\{[\s\S]*\}/)
        result = jsonMatch ? JSON.parse(jsonMatch[0]) : { results: [] }
      }
    }

    const payload = {
      query: cleanQuery,
      product: result.product || cleanQuery,
      category: result.category || null,
      results: result.results || [],
      cheapestStore: result.cheapestStore || null,
      cheapestPrice: result.cheapestPrice || null,
      averagePrice: result.averagePrice || null,
      priceRange: result.priceRange || null,
      alternatives: result.alternatives || [],
      tip: result.tip || null,
      currency,
      isEstimated: !usedLiveSearch,
      dataSource: usedLiveSearch ? 'live_web_search' : 'estimate',
    }

    await writeIntel('product_search', intelKey, payload, PRODUCT_SEARCH_TTL_S, {
      revalidateAfterSeconds: PRODUCT_SEARCH_REVALIDATE_S,
    }).catch((e) => console.error('[product-search cache write]', e))

    const now = new Date()
    return NextResponse.json({
      ...payload,
      fetchedAt: now.toISOString(),
      freshUntil: new Date(now.getTime() + PRODUCT_SEARCH_TTL_S * 1000).toISOString(),
      cacheState: 'miss',
    }, {
      headers: { 'X-Cache': 'MISS', 'Cache-Control': 'private, max-age=300' },
    })
  } catch (err) {
    console.error('[product-search POST]', err)
    const expired = await readAnyIntel<unknown>('product_search', intelKey).catch(() => null)
    if (expired) {
      return NextResponse.json({
        ...(expired.data as object),
        fetchedAt: expired.fetchedAt.toISOString(),
        cacheState: 'stale',
      }, {
        headers: { 'X-Cache': 'STALE', 'Cache-Control': 'private, max-age=60' },
      })
    }
    return NextResponse.json(
      { error: isPolish ? 'Nie udało się wyszukać produktu' : 'Failed to search product' },
      { status: 500 },
    )
  }
}

export const POST = withApiTiming('api.personal.product-search.POST', postProductSearch)
