import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth-compat'
import { db } from '@/lib/db'
import { receipts, priceComparisons } from '@/lib/db/schema'
import { eq, desc, gte, and } from 'drizzle-orm'
import { getAIClient } from '@/lib/ai-client'
import { rateLimit } from '@/lib/rate-limit'
import { PRICE_COMPARE_STORES } from '@/lib/stores'
import { z } from 'zod'

const PriceCompareSchema = z.object({
  lang: z.enum(['pl', 'en']).optional().default('en'),
  currency: z.string().length(3).optional().default('PLN'),
})

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // RATE LIMIT: 20 requests per hour per userId
  const rl = rateLimit(`ai:prices:${userId}`, { maxRequests: 20, windowMs: 60 * 60 * 1000 })
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Try again later.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
    )
  }

  try {
    const rawBody = await req.json().catch(() => ({}))
    const parsedReq = PriceCompareSchema.safeParse(rawBody)
    const { lang, currency } = parsedReq.success ? parsedReq.data : { lang: 'en' as const, currency: 'PLN' }
    const isPolish = lang === 'pl'

    // Get user's recent receipt items (last 60 days)
    const since = new Date()
    since.setDate(since.getDate() - 60)
    const sinceStr = since.toISOString().split('T')[0]

    const recentReceipts = await db.select({
      id: receipts.id,
      vendor: receipts.vendor,
      date: receipts.date,
      total: receipts.total,
      items: receipts.items,
    }).from(receipts)
      .where(and(eq(receipts.userId, userId), gte(receipts.date, sinceStr)))
      .orderBy(desc(receipts.date))
      .limit(30)

    // Collect all items from receipts
    const allItems: Array<{ name: string; price: number; vendor: string; date: string }> = []
    for (const receipt of recentReceipts) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const items = receipt.items as any[]
      if (Array.isArray(items)) {
        for (const item of items) {
          // Items stored by OCR use `price`; older entries may use `totalPrice` — support both
          const itemPrice = item.price ?? item.totalPrice ?? null
          if (item.name && itemPrice && Number(itemPrice) > 0) {
            allItems.push({
              name: item.name,
              price: Number(itemPrice),
              vendor: receipt.vendor || 'Unknown',
              date: receipt.date || sinceStr,
            })
          }
        }
      }
    }

    if (allItems.length === 0) {
      return NextResponse.json({
        error: 'no_receipts',
        comparisons: [],
        message: isPolish
          ? 'Brak paragonów do analizy. Zeskanuj paragony aby zobaczyć porównanie cen.'
          : 'No receipts to analyze. Scan receipts to see price comparisons.',
      })
    }

    // Deduplicate by product name (take most recent)
    const productMap = new Map<string, typeof allItems[0]>()
    for (const item of allItems) {
      const key = item.name.toLowerCase().trim()
      if (!productMap.has(key) || item.date > (productMap.get(key)?.date || '')) {
        productMap.set(key, item)
      }
    }

    const topProducts = Array.from(productMap.values())
      .sort((a, b) => b.price - a.price)
      .slice(0, 8)

    // Build AI prompt for price comparison with web search
    const productList = topProducts
      .map(
        (p, i) =>
          `${i + 1}. "${p.name}" - last paid ${p.price.toFixed(2)} ${currency} at ${p.vendor} on ${p.date}`,
      )
      .join('\n')

    const storeNames = PRICE_COMPARE_STORES.join(', ')

    const systemPrompt = isPolish
      ? `Jesteś ekspertem ds. porównywania cen w polskich sklepach spożywczych. Analizujesz zakupy użytkownika i szukasz aktualnych promocji i lepszych cen w ${storeNames}. Odpowiadasz tylko w JSON.`
      : `You are a price comparison expert for Polish grocery stores. You analyze user purchases and find current promotions and better prices at ${storeNames}. Respond only in JSON.`

    const userPrompt = `The user recently bought these products:\n${productList}\n\nSearch for current prices of these products in Polish stores (${storeNames}). For each product:\n1. Find the best current price/promotion\n2. Compare with what the user paid\n3. Calculate potential savings\n\nReturn JSON:\n{\n  "comparisons": [\n    {\n      "productName": "string",\n      "userLastPrice": number,\n      "userLastStore": "string",\n      "allPrices": [{"store": "string", "price": number, "promotion": "string or null", "validUntil": "date or null"}],\n      "bestPrice": number,\n      "bestStore": "string",\n      "bestDeal": "string (description of the deal)",\n      "savingsAmount": number,\n      "savingsPercent": number,\n      "recommendation": "string",\n      "buyNow": boolean\n    }\n  ],\n  "totalPotentialSavings": number,\n  "summary": "string",\n  "bestStoreOverall": "string",\n  "tip": "string"\n}`

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let result: any = {
      comparisons: [],
      totalPotentialSavings: 0,
      summary: '',
      bestStoreOverall: '',
      tip: '',
    }
    let isEstimated = false

    const ai = getAIClient()
    if (!ai) {
      return NextResponse.json({ error: 'AI service not configured' }, { status: 503 })
    }

    // Web search only works with OpenAI direct (not Azure)
    if (ai.backend === 'openai') {
      try {
        const webSearchCall = ai.client.responses.create({
          model: ai.model,
          tools: [{ type: 'web_search_preview' }],
          instructions: systemPrompt,
          input: userPrompt,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any)
        const webSearchTimeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 10000))
        const response = await Promise.race([webSearchCall, webSearchTimeout])
        if (response) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const text = (response as any).output_text || ''
          const jsonMatch = text.match(/\{[\s\S]*\}/)
          if (jsonMatch) result = JSON.parse(jsonMatch[0])
          else throw new Error('No JSON in web search response')
        } else {
          throw new Error('Web search timeout')
        }
      } catch {
        isEstimated = true
      }
    } else {
      isEstimated = true
    }

    if (isEstimated) {
      const response = await ai.client.chat.completions.create({
        model: ai.model,
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content:
              userPrompt +
              '\n\nNote: You do not have real-time web access. Use your training data knowledge about typical prices in these Polish stores.',
          },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.3,
        max_tokens: 4000,
      })
      const text = response.choices[0]?.message?.content || '{}'
      try {
        result = JSON.parse(text)
      } catch {
        const jsonMatch = text.match(/\{[\s\S]*\}/)
        result = jsonMatch ? JSON.parse(jsonMatch[0]) : { comparisons: [] }
      }
    }

    // Save results to DB in parallel (not sequential)
    if (result.comparisons?.length) {
      await Promise.all(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        result.comparisons.map((comp: any) =>
          db.insert(priceComparisons).values({
            userId,
            productName: comp.productName,
            currentStore: comp.userLastStore,
            currentPrice: comp.userLastPrice?.toString(),
            bestStore: comp.bestStore,
            bestPrice: comp.bestPrice?.toString(),
            bestPriceValidUntil: comp.allPrices?.[0]?.validUntil || null,
            savingsAmount: comp.savingsAmount?.toString(),
            savingsPercent: comp.savingsPercent?.toString(),
            currency,
            allPrices: comp.allPrices || [],
            aiSummary: comp.recommendation,
          })
        )
      )
    }

    return NextResponse.json({
      comparisons: result.comparisons || [],
      totalPotentialSavings: result.totalPotentialSavings || 0,
      summary: result.summary || '',
      bestStoreOverall: result.bestStoreOverall || '',
      tip: result.tip || '',
      productsAnalyzed: topProducts.length,
      isEstimated,
    })
  } catch (err) {
    console.error('[prices/compare POST]', err)
    return NextResponse.json(
      { error: 'Operation failed' },
      { status: 500 },
    )
  }
}

// GET: return cached comparisons
export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const since = new Date()
    since.setHours(since.getHours() - 24) // last 24 hours
    const cached = await db
      .select()
      .from(priceComparisons)
      .where(and(eq(priceComparisons.userId, userId), gte(priceComparisons.checkedAt, since)))
      .orderBy(desc(priceComparisons.checkedAt))
      .limit(50)
    return NextResponse.json(cached)
  } catch {
    return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 })
  }
}
