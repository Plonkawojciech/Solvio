import { auth } from '@/lib/auth-compat'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { receipts, expenses, categories } from '@/lib/db/schema'
import { eq, gte, and, desc, asc } from 'drizzle-orm'
import { getAIClient } from '@/lib/ai-client'
import { rateLimit } from '@/lib/rate-limit'
import { z } from 'zod'
import { PRICE_COMPARE_STORES } from '@/lib/stores'

const RequestSchema = z.object({
  lang: z.enum(['pl', 'en']).optional().default('en'),
  currency: z.string().length(3).optional().default('PLN'),
  force: z.boolean().optional().default(false),
})

interface ItemAgg {
  name: string
  totalSpent: number
  count: number
  avgPrice: number
  lastPrice: number
  lastVendor: string
  lastDate: string
  vendors: Record<string, { price: number; date: string }>
  categoryName: string | null
}

// Module-level cache. Same pattern as `/api/personal/promotions` —
// shopping advice is based on 90-day rolling history, which barely
// changes hour-to-hour. Cache for 6h so the user can re-open the view
// repeatedly without burning a 15-30s AI call every time.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const advisorCache = new Map<string, { result: any; expiresAt: number }>()
const ADVISOR_TTL_MS = 6 * 60 * 60 * 1000 // 6h

export async function POST(request: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const rawBody = await request.json().catch(() => ({}))
  const parsed = RequestSchema.safeParse(rawBody)
  const { lang, currency, force } = parsed.success ? parsed.data : { lang: 'en' as const, currency: 'PLN', force: false }
  const isPolish = lang === 'pl'

  // Cache check before rate-limit and AI work.
  const cacheKey = `${userId}:${lang}:${currency}`
  if (!force) {
    const cached = advisorCache.get(cacheKey)
    if (cached && cached.expiresAt > Date.now()) {
      return NextResponse.json(cached.result, {
        headers: { 'X-Cache': 'HIT', 'Cache-Control': 'private, max-age=300' },
      })
    }
  }

  const rl = rateLimit(`ai:advisor:${userId}`, { maxRequests: 10, windowMs: 60 * 60 * 1000 })
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Try again later.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
    )
  }

  const since90 = new Date()
  since90.setDate(since90.getDate() - 90)
  const since90Str = since90.toISOString().slice(0, 10)

  try {
    const [receiptsData, expensesData, cats] = await Promise.all([
      db.select({
        id: receipts.id,
        vendor: receipts.vendor,
        date: receipts.date,
        total: receipts.total,
        items: receipts.items,
      }).from(receipts)
        .where(and(eq(receipts.userId, userId), gte(receipts.date, since90Str)))
        .orderBy(desc(receipts.date))
        .limit(100),
      db.select({
        title: expenses.title,
        amount: expenses.amount,
        date: expenses.date,
        vendor: expenses.vendor,
        categoryId: expenses.categoryId,
      }).from(expenses)
        .where(and(eq(expenses.userId, userId), gte(expenses.date, since90Str)))
        .orderBy(asc(expenses.date)),
      db.select().from(categories).where(eq(categories.userId, userId)),
    ])

    const catById = new Map(cats.map(c => [c.id, c]))

    // Aggregate items from receipts
    const itemMap = new Map<string, ItemAgg>()
    for (const receipt of receiptsData) {
      if (!receipt.items || !Array.isArray(receipt.items)) continue
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const item of receipt.items as any[]) {
        const price = Number(item.price ?? item.totalPrice ?? 0)
        if (!item.name || price <= 0) continue
        const key = item.name.toLowerCase().trim()
        const vendor = receipt.vendor || 'Unknown'
        const date = receipt.date || since90Str
        const catName = item.category_id ? (catById.get(item.category_id)?.name || null) : null

        const existing = itemMap.get(key)
        if (existing) {
          existing.totalSpent += price
          existing.count++
          existing.avgPrice = existing.totalSpent / existing.count
          if (date > existing.lastDate) {
            existing.lastPrice = price
            existing.lastVendor = vendor
            existing.lastDate = date
          }
          if (!existing.vendors[vendor] || date > existing.vendors[vendor].date) {
            existing.vendors[vendor] = { price, date }
          }
          if (catName && !existing.categoryName) existing.categoryName = catName
        } else {
          itemMap.set(key, {
            name: item.name,
            totalSpent: price,
            count: 1,
            avgPrice: price,
            lastPrice: price,
            lastVendor: vendor,
            lastDate: date,
            vendors: { [vendor]: { price, date } },
            categoryName: catName,
          })
        }
      }
    }

    // Category spending from expenses
    const categorySpend: Record<string, number> = {}
    const vendorSpend: Record<string, number> = {}
    for (const e of expensesData) {
      const cat = e.categoryId ? (catById.get(e.categoryId)?.name || 'Other') : 'Other'
      categorySpend[cat] = (categorySpend[cat] || 0) + Number(e.amount || 0)
      const v = e.vendor || 'Unknown'
      vendorSpend[v] = (vendorSpend[v] || 0) + Number(e.amount || 0)
    }

    const topProducts = Array.from(itemMap.values())
      .sort((a, b) => b.totalSpent - a.totalSpent)
      .slice(0, 25)

    const topVendors = Object.entries(vendorSpend)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([vendor, amount]) => ({ vendor, amount }))

    if (topProducts.length === 0) {
      return NextResponse.json({
        error: 'no_data',
        recommendations: [],
        weeklyPlan: null,
        summary: isPolish
          ? 'Brak danych do analizy. Zeskanuj paragony, aby otrzymać rekomendacje zakupowe.'
          : 'No data to analyze. Scan receipts to get shopping recommendations.',
      })
    }

    const productList = topProducts
      .map((p, i) =>
        `${i + 1}. "${p.name}" — avg ${p.avgPrice.toFixed(2)} ${currency}, last paid ${p.lastPrice.toFixed(2)} at ${p.lastVendor} (${p.lastDate}), bought ${p.count}x total ${p.totalSpent.toFixed(2)} ${currency}${p.categoryName ? `, category: ${p.categoryName}` : ''}`
      )
      .join('\n')

    const vendorList = topVendors
      .map(v => `${v.vendor}: ${v.amount.toFixed(2)} ${currency}`)
      .join(', ')

    const storeList = PRICE_COMPARE_STORES.join(', ')

    const systemPrompt = isPolish
      ? `Jesteś ekspertem ds. zakupów w Polsce. Znasz aktualne ceny i promocje w polskich sklepach: ${storeList}. Analizujesz historię zakupów użytkownika i dajesz konkretne, wiarygodne rekomendacje oszczędnościowe. Odpowiadaj TYLKO w JSON.`
      : `You are a Polish shopping expert. You know current prices and promotions at Polish stores: ${storeList}. You analyze user purchase history and give specific, credible savings recommendations. Respond ONLY in JSON.`

    const userPrompt = `${isPolish ? 'Historia zakupów użytkownika (ostatnie 90 dni)' : 'User purchase history (last 90 days)'}:

${isPolish ? 'PRODUKTY' : 'PRODUCTS'}:
${productList}

${isPolish ? 'WYDATKI WG SKLEPÓW' : 'SPENDING BY STORE'}: ${vendorList}
${isPolish ? 'WYDATKI WG KATEGORII' : 'SPENDING BY CATEGORY'}: ${JSON.stringify(categorySpend)}

${isPolish ? 'ZADANIE' : 'TASK'}:
${isPolish
  ? `Dla każdego produktu z listy:
1. Podaj w którym sklepie (${storeList}) jest aktualnie najtaniej
2. Porównaj z ceną którą użytkownik zapłacił
3. Jeśli jest promocja lub wielosztuka — napisz o tym
4. Daj konkretną rekomendację: "kup w X" lub "zostań w Y — dobra cena"

Na końcu podaj PLAN TYGODNIOWY — w których sklepach kupować jakie produkty, aby zmaksymalizować oszczędności.`
  : `For each product:
1. Find which store (${storeList}) currently has the best price
2. Compare with the price the user paid
3. If there's a promotion or multi-buy deal — mention it
4. Give a specific recommendation: "buy at X" or "stay at Y — good price"

At the end, provide a WEEKLY PLAN — which stores to visit for which products to maximize savings.`}

Return JSON:
{
  "recommendations": [
    {
      "productName": "string",
      "category": "string or null",
      "userAvgPrice": number,
      "userLastStore": "string",
      "bestStore": "string",
      "bestPrice": number,
      "bestDeal": "string (deal description, e.g. 'multi-pack 3 for 9.99')",
      "alternativeStores": [{"store": "string", "price": number, "deal": "string or null"}],
      "savingsPerUnit": number,
      "savingsPercent": number,
      "verdict": "great_price|good_price|could_save|switch_store|big_savings",
      "tip": "string (1 sentence actionable tip)"
    }
  ],
  "weeklyPlan": {
    "stores": [
      {
        "store": "string",
        "products": ["product names to buy here"],
        "estimatedTotal": number,
        "whyThisStore": "string"
      }
    ],
    "totalEstimated": number,
    "totalSavings": number,
    "savingsPercent": number
  },
  "topInsights": [
    { "type": "savings|habit|tip|warning", "title": "string", "description": "string", "icon": "emoji" }
  ],
  "summary": "string (2-3 sentences overall)",
  "totalPotentialMonthlySavings": number,
  "bestOverallStore": "string"
}`

    const ai = getAIClient()
    if (!ai) {
      return NextResponse.json({ error: 'AI service not configured' }, { status: 503 })
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let result: any = null

    // Try web search first (OpenAI only) for real-time prices
    if (ai.backend === 'openai') {
      try {
        const webSearchCall = ai.client.responses.create({
          model: ai.model,
          tools: [{ type: 'web_search_preview' }],
          instructions: systemPrompt,
          input: userPrompt,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any)
        const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 15000))
        const response = await Promise.race([webSearchCall, timeout])
        if (response) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const text = (response as any).output_text || ''
          const jsonMatch = text.match(/\{[\s\S]*\}/)
          if (jsonMatch) result = JSON.parse(jsonMatch[0])
        }
      } catch {
        // Fall through to chat completions
      }
    }

    // Fallback: chat completions with training data
    if (!result) {
      const completion = await ai.client.chat.completions.create({
        model: ai.model,
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: userPrompt + (isPolish
              ? '\n\nUwaga: nie masz dostępu do internetu. Podaj szacunkowe ceny na podstawie wiedzy o typowych cenach w polskich sklepach. Bądź realistyczny.'
              : '\n\nNote: no internet access. Provide estimated prices based on typical Polish store pricing knowledge. Be realistic.'),
          },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.3,
        max_tokens: 4000,
      })
      const text = completion.choices[0]?.message?.content || '{}'
      try {
        result = JSON.parse(text)
      } catch {
        const jsonMatch = text.match(/\{[\s\S]*\}/)
        result = jsonMatch ? JSON.parse(jsonMatch[0]) : { recommendations: [] }
      }
    }

    const payload = {
      recommendations: result.recommendations || [],
      weeklyPlan: result.weeklyPlan || null,
      topInsights: result.topInsights || [],
      summary: result.summary || '',
      totalPotentialMonthlySavings: result.totalPotentialMonthlySavings || 0,
      bestOverallStore: result.bestOverallStore || '',
      productsAnalyzed: topProducts.length,
      currency,
      storesKnown: PRICE_COMPARE_STORES.length,
    }

    advisorCache.set(cacheKey, { result: payload, expiresAt: Date.now() + ADVISOR_TTL_MS })

    return NextResponse.json(payload, {
      headers: { 'X-Cache': 'MISS', 'Cache-Control': 'private, max-age=300' },
    })
  } catch (err) {
    console.error('[shopping-advisor POST]', err)
    // Serve stale cache rather than dropping the user on a 500.
    const stale = advisorCache.get(cacheKey)
    if (stale) {
      return NextResponse.json(stale.result, {
        headers: { 'X-Cache': 'STALE', 'Cache-Control': 'private, max-age=60' },
      })
    }
    return NextResponse.json({ error: 'Analysis failed' }, { status: 500 })
  }
}
