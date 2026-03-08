import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { receipts, priceComparisons } from '@/lib/db/schema'
import { eq, desc, gte, and } from 'drizzle-orm'
import OpenAI from 'openai'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { lang = 'en', currency = 'PLN', forceRefresh = false } = await req.json()
    const isPolish = lang === 'pl'

    // Get user's recent receipt items (last 60 days)
    const since = new Date()
    since.setDate(since.getDate() - 60)
    const sinceStr = since.toISOString().split('T')[0]

    const recentReceipts = await db.select().from(receipts)
      .where(and(eq(receipts.userId, userId), gte(receipts.date, sinceStr)))
      .orderBy(desc(receipts.date))
      .limit(30)

    // Collect all items from receipts
    const allItems: Array<{ name: string; price: number; vendor: string; date: string }> = []
    for (const receipt of recentReceipts) {
      const items = receipt.items as any[]
      if (Array.isArray(items)) {
        for (const item of items) {
          if (item.name && item.totalPrice) {
            allItems.push({
              name: item.name,
              price: Number(item.totalPrice),
              vendor: receipt.vendor || 'Unknown',
              date: receipt.date || sinceStr,
            })
          }
        }
      }
    }

    if (allItems.length === 0) {
      return NextResponse.json({
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

    // Take top 15 most expensive/frequent items for price checking
    const topProducts = Array.from(productMap.values())
      .sort((a, b) => b.price - a.price)
      .slice(0, 15)

    // Build AI prompt for price comparison with web search
    const productList = topProducts
      .map(
        (p, i) =>
          `${i + 1}. "${p.name}" - last paid ${p.price.toFixed(2)} ${currency} at ${p.vendor} on ${p.date}`,
      )
      .join('\n')

    const storeNames = isPolish
      ? 'Lidl, Biedronka, Zabka, Aldi, Kaufland, Netto, Chata Polska, Carrefour, Rossmann'
      : 'Lidl, Biedronka, Zabka, Aldi, Kaufland, Netto, Carrefour'

    const systemPrompt = isPolish
      ? `Jesteś ekspertem ds. porównywania cen w polskich sklepach spożywczych. Analizujesz zakupy użytkownika i szukasz aktualnych promocji i lepszych cen w ${storeNames}. Odpowiadasz tylko w JSON.`
      : `You are a price comparison expert for Polish grocery stores. You analyze user purchases and find current promotions and better prices at ${storeNames}. Respond only in JSON.`

    const userPrompt = `The user recently bought these products:\n${productList}\n\nSearch for current prices of these products in Polish stores (${storeNames}). For each product:\n1. Find the best current price/promotion\n2. Compare with what the user paid\n3. Calculate potential savings\n\nReturn JSON:\n{\n  "comparisons": [\n    {\n      "productName": "string",\n      "userLastPrice": number,\n      "userLastStore": "string",\n      "allPrices": [{"store": "string", "price": number, "promotion": "string or null", "validUntil": "date or null"}],\n      "bestPrice": number,\n      "bestStore": "string",\n      "bestDeal": "string (description of the deal)",\n      "savingsAmount": number,\n      "savingsPercent": number,\n      "recommendation": "string",\n      "buyNow": boolean\n    }\n  ],\n  "totalPotentialSavings": number,\n  "summary": "string",\n  "bestStoreOverall": "string",\n  "tip": "string"\n}`

    let result: any = {
      comparisons: [],
      totalPotentialSavings: 0,
      summary: '',
      bestStoreOverall: '',
      tip: '',
    }

    // Try with web search first
    try {
      const response = await (openai as any).responses.create({
        model: 'gpt-4o',
        tools: [{ type: 'web_search_preview' }],
        input: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.3,
      })
      const text = response.output_text || ''
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (jsonMatch) result = JSON.parse(jsonMatch[0])
    } catch {
      // Fallback to GPT-4o-mini without web search
      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
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
        max_tokens: 2000,
      })
      const text = response.choices[0]?.message?.content || '{}'
      result = JSON.parse(text)
    }

    // Save results to DB
    if (result.comparisons?.length) {
      for (const comp of result.comparisons) {
        await db.insert(priceComparisons).values({
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
      }
    }

    return NextResponse.json({
      comparisons: result.comparisons || [],
      totalPotentialSavings: result.totalPotentialSavings || 0,
      summary: result.summary || '',
      bestStoreOverall: result.bestStoreOverall || '',
      tip: result.tip || '',
      productsAnalyzed: topProducts.length,
    })
  } catch (err: any) {
    console.error('[prices/compare POST]', err)
    return NextResponse.json(
      { error: 'Failed to compare prices', detail: err.message },
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
  } catch (err) {
    return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 })
  }
}
