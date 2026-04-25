import { auth } from '@/lib/auth-compat'
import { NextResponse } from 'next/server'
import { getAIClient } from '@/lib/ai-client'
import { rateLimit } from '@/lib/rate-limit'
import { PRICE_COMPARE_STORES } from '@/lib/stores'
import { z } from 'zod'

const SearchSchema = z.object({
  query: z.string().min(1).max(200),
  lang: z.enum(['pl', 'en']).optional().default('pl'),
  currency: z.string().length(3).optional().default('PLN'),
})

export async function POST(request: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const rl = rateLimit(`ai:product-search:${userId}`, { maxRequests: 30, windowMs: 60 * 60 * 1000 })
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Try again later.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
    )
  }

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })

  const parsed = SearchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten().fieldErrors }, { status: 400 })
  }

  const { query, lang, currency } = parsed.data
  const isPolish = lang === 'pl'
  const storeNames = PRICE_COMPARE_STORES.slice(0, 15).join(', ')

  const ai = getAIClient()
  if (!ai) {
    return NextResponse.json({ error: 'AI service not configured' }, { status: 503 })
  }

  const systemPrompt = isPolish
    ? `Jesteś ekspertem od cen produktów w polskich sklepach. Użytkownik szuka produktu — podaj szacunkowe ceny w różnych sklepach. Odpowiadasz TYLKO w JSON.`
    : `You are a pricing expert for Polish stores. The user is searching for a product — provide estimated prices across stores. Respond ONLY in JSON.`

  const userPrompt = isPolish
    ? `Szukam produktu: "${query}"

Podaj szacunkowe ceny tego produktu (lub najbliższych odpowiedników) w tych sklepach: ${storeNames}.

Odpowiedz w JSON:
{
  "product": "${query}",
  "category": "kategoria produktu",
  "results": [
    {
      "store": "nazwa sklepu",
      "productName": "dokładna nazwa produktu w sklepie",
      "price": 0.00,
      "pricePerUnit": "cena za kg/l/szt",
      "isPromo": false,
      "promoDetails": null,
      "availability": "dostępny|możliwy|niedostępny"
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
    : `Searching for product: "${query}"

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
      "availability": "available|possible|unavailable"
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

    if (ai.backend === 'openai') {
      try {
        const webSearchCall = ai.client.responses.create({
          model: ai.model,
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
          if (jsonMatch) result = JSON.parse(jsonMatch[0])
        }
      } catch {
        // fallback to chat completions
      }
    }

    if (!result) {
      const completion = await ai.client.chat.completions.create({
        model: ai.model,
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

    return NextResponse.json({
      query,
      product: result.product || query,
      category: result.category || null,
      results: result.results || [],
      cheapestStore: result.cheapestStore || null,
      cheapestPrice: result.cheapestPrice || null,
      averagePrice: result.averagePrice || null,
      priceRange: result.priceRange || null,
      alternatives: result.alternatives || [],
      tip: result.tip || null,
      currency,
      isEstimated: ai.backend !== 'openai',
    })
  } catch (err) {
    console.error('[product-search POST]', err)
    return NextResponse.json(
      { error: isPolish ? 'Nie udało się wyszukać produktu' : 'Failed to search product' },
      { status: 500 },
    )
  }
}
