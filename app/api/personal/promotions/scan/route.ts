import { auth } from '@/lib/auth-compat'
import { NextResponse } from 'next/server'
import { getAIClient } from '@/lib/ai-client'
import { rateLimit } from '@/lib/rate-limit'
import { PRICE_COMPARE_STORES } from '@/lib/stores'

const STORES = PRICE_COMPARE_STORES

export async function POST(request: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // SECURITY FIX: Rate limiting for OpenAI-powered endpoint
  const rl = rateLimit(`ai:promotions-scan:${userId}`, { maxRequests: 10, windowMs: 60 * 60 * 1000 })
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Try again later.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
    )
  }

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

  const { stores, lang = 'pl', currency = 'PLN' } = body
  const targetStores = stores && stores.length > 0 ? stores : STORES
  const isPolish = lang === 'pl'

  try {
    const prompt = isPolish
      ? `Wyszukaj AKTUALNE promocje i gazetki z tych polskich sklepów: ${targetStores.join(', ')}.

Podaj aktualne oferty promocyjne dostępne w tym tygodniu. Dla każdej podaj:
- Nazwę produktu
- Cenę regularną (jeśli znana)
- Cenę promocyjną
- Zniżkę procentową
- Datę ważności oferty
- Kategorię produktu (np. nabiał, mięso, owoce, chemia, napoje)

Zwróć w formacie JSON:
{
  "promotions": [
    {
      "store": "Biedronka",
      "productName": "Masło ekstra 200g",
      "regularPrice": 7.99,
      "promoPrice": 4.99,
      "discount": "-38%",
      "currency": "${currency}",
      "validUntil": "2026-03-22",
      "category": "Nabiał"
    }
  ],
  "scannedStores": ${targetStores.length},
  "totalDeals": 0
}

Zwróć 20-30 najlepszych promocji. Tylko prawdziwe, aktualne oferty.`
      : `Search for CURRENT promotions and flyers from these Polish stores: ${targetStores.join(', ')}.

Provide current promotional offers available this week. For each provide:
- Product name
- Regular price (if known)
- Promotional price
- Discount percentage
- Offer validity date
- Product category (e.g., dairy, meat, fruits, cleaning, beverages)

Return in JSON format:
{
  "promotions": [
    {
      "store": "Biedronka",
      "productName": "Extra Butter 200g",
      "regularPrice": 7.99,
      "promoPrice": 4.99,
      "discount": "-38%",
      "currency": "${currency}",
      "validUntil": "2026-03-22",
      "category": "Dairy"
    }
  ],
  "scannedStores": ${targetStores.length},
  "totalDeals": 0
}

Return 20-30 best promotions. Only real, current offers.`

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let result: any = null

    // Web search only available with OpenAI direct (Azure doesn't support Responses API)
    if (ai.backend === 'openai') {
      try {
        const webSearchCall = ai.client.responses.create({
          model: ai.model,
          tools: [{ type: 'web_search_preview' }],
          input: prompt,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any)
        const webSearchTimeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 10000))
        const webResponse = await Promise.race([webSearchCall, webSearchTimeout])
        if (webResponse) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const rawText = (webResponse as any).output_text || ''
          const jsonMatch = rawText.match(/\{[\s\S]*\}/)
          if (jsonMatch) result = JSON.parse(jsonMatch[0])
        }
      } catch {
        // Web search failed or timed out, fall through to chat completions
      }
    }

    // Fallback: chat completions estimates (fast, ~2s)
    if (!result) {
      const completion = await ai.client.chat.completions.create({
        model: ai.model,
        messages: [
          { role: 'system', content: 'You are a helpful assistant that returns only valid JSON with current Polish store promotions.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.3,
        max_tokens: 4000,
        response_format: { type: 'json_object' },
      })

      const content = completion.choices[0]?.message?.content || '{}'
      try {
        result = JSON.parse(content)
      } catch {
        result = { promotions: [], scannedStores: 0, totalDeals: 0 }
      }
    }

    // Add IDs to promotions
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const promotions = (result.promotions || []).map((p: any, i: number) => ({
      ...p,
      id: `scan-${Date.now()}-${i}`,
      currency: p.currency || currency,
    }))

    return NextResponse.json({
      promotions,
      scannedStores: result.scannedStores || targetStores.length,
      totalDeals: promotions.length,
    })
  } catch (err) {
    console.error('[promotions/scan POST]', err)
    return NextResponse.json({ error: 'Failed to scan promotions' }, { status: 500 })
  }
}
