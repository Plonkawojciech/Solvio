import { auth } from '@/lib/auth-compat'
import { NextResponse } from 'next/server'
import { db, expenses, receipts, categories } from '@/lib/db'
import { eq, gte, and, desc } from 'drizzle-orm'
import { getAIClient } from '@/lib/ai-client'
import { rateLimit } from '@/lib/rate-limit'
import { GROCERY_STORES } from '@/lib/stores'

interface ReceiptItem {
  name: string
  nameClean?: string | null
  nameTranslated?: string | null
  price?: number
  quantity?: number
  category_id?: string
}

interface ProductEntry {
  name: string
  totalPaid: number
  count: number
  avgPrice: number
  vendor: string
  dates: string[]
}

// Module-level in-memory cache. Mirror of /api/personal/promotions and
// /api/prices/compare: the Savings hub auto-loads audit on tab entry,
// so caching prevents a 15-25s spinner on every visit. 6h TTL — audit
// summarises last 30 days and changes slowly.
// Keyed by `${userId}:${lang}:${currency}` so identical payloads dedupe.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const auditCache = new Map<string, { result: any; expiresAt: number }>()
const AUDIT_TTL_MS = 6 * 60 * 60 * 1000

export async function POST(request: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { lang = 'en', currency = 'PLN', force = false } = await request.json().catch(() => ({}))
  const isPolish = lang === 'pl'

  // Serve cached payload if still warm.
  const cacheKey = `${userId}:${lang}:${currency}`
  if (!force) {
    const cached = auditCache.get(cacheKey)
    if (cached && cached.expiresAt > Date.now()) {
      return NextResponse.json(cached.result, {
        headers: { 'X-Cache': 'HIT', 'Cache-Control': 'private, max-age=300' },
      })
    }
  }

  // Rate-limit only when we *would* hit the AI (cache miss).
  // 5 requests / hour / userId.
  const rl = rateLimit(`ai:audit:${userId}`, { maxRequests: 5, windowMs: 60 * 60 * 1000 })
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Try again later.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
    )
  }

  // Fetch last 30 days receipts + expenses
  const since = new Date()
  since.setDate(since.getDate() - 30)
  const sinceStr = since.toISOString().slice(0, 10)

  const [receiptsData, expensesData, cats] = await Promise.all([
    db.select({
      id: receipts.id,
      vendor: receipts.vendor,
      date: receipts.date,
      total: receipts.total,
      items: receipts.items,
    }).from(receipts)
      .where(and(eq(receipts.userId, userId), gte(receipts.date, sinceStr)))
      .orderBy(desc(receipts.createdAt))
      .limit(100),
    db.select().from(expenses)
      .where(and(eq(expenses.userId, userId), gte(expenses.date, sinceStr)))
      .orderBy(desc(expenses.date))
      .limit(300),
    db.select().from(categories).where(eq(categories.userId, userId)),
  ])

  const catById = new Map(cats.map(c => [c.id, c]))

  if (!expensesData || expensesData.length === 0) {
    return NextResponse.json({
      error: 'no_data',
      message: isPolish
        ? 'Brak wydatków w ostatnich 30 dniach. Dodaj wydatki, aby zobaczyć audyt.'
        : 'No expenses in the last 30 days. Add expenses to see your audit.',
    })
  }

  // Extract individual items from receipts (stored in items jsonb field)
  const productMap = new Map<string, ProductEntry>()

  for (const receipt of receiptsData) {
    if (!receipt.items) continue
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const items: ReceiptItem[] = Array.isArray(receipt.items) ? receipt.items : (receipt.items as any).items || []
      for (const item of items) {
        // Prefer AI-cleaned name → translated → raw OCR. Cleaned names
        // dedupe better (different POS-truncations of the same product
        // collapse) and give the audit AI a real product to reason about.
        const displayName = item.nameClean || item.nameTranslated || item.name
        if (!displayName || !item.price || item.price <= 0) continue
        const key = displayName.toLowerCase().trim()
        const existing = productMap.get(key)
        if (existing) {
          existing.totalPaid += item.price * (item.quantity || 1)
          existing.count += item.quantity || 1
          existing.avgPrice = existing.totalPaid / existing.count
          existing.dates.push(receipt.date || '')
        } else {
          productMap.set(key, {
            name: displayName,
            totalPaid: item.price * (item.quantity || 1),
            count: item.quantity || 1,
            avgPrice: item.price,
            vendor: receipt.vendor || 'Unknown',
            dates: [receipt.date || ''],
          })
        }
      }
    } catch {
      // ignore malformed JSON
    }
  }

  // Summary stats
  const totalSpent = expensesData.reduce((s, e) => s + Number(e.amount || 0), 0)
  const transactionCount = expensesData.length

  // Top products by total spend
  const topProducts = Array.from(productMap.values())
    .sort((a, b) => b.totalPaid - a.totalPaid)
    .slice(0, 15)

  // Category breakdown
  const categoryMap: Record<string, number> = {}
  for (const e of expensesData) {
    const cat = e.categoryId ? (catById.get(e.categoryId)?.name || 'Other') : 'Other'
    categoryMap[cat] = (categoryMap[cat] || 0) + Number(e.amount || 0)
  }

  // Store breakdown
  const storeMap: Record<string, number> = {}
  for (const e of expensesData) {
    const store = e.vendor || 'Unknown'
    storeMap[store] = (storeMap[store] || 0) + Number(e.amount || 0)
  }

  const topStores = Object.entries(storeMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([store, amount]) => ({ store, amount }))

  // Build the search query
  const productListForSearch = topProducts
    .slice(0, 10)
    .map(p => `- ${p.name} (zapłacono: ${p.avgPrice.toFixed(2)} ${currency}/${isPolish ? 'szt' : 'unit'})`)
    .join('\n')

  const topStoreNames = topStores.map(s => s.store).join(', ')

  const searchPrompt = isPolish
    ? `Jesteś ekspertem od cen w polskich supermarketach. Użytkownik kupił następujące produkty w sklepach: ${topStoreNames}.

ZAKUPIONE PRODUKTY (z cenami które zapłacił):
${productListForSearch}

Odpowiedz TYLKO w formacie JSON (bez markdown, bez backticks):
{
  "priceComparisons": [
    {
      "product": "nazwa produktu",
      "pricePaid": 0.00,
      "prices": { ${GROCERY_STORES.slice(0, 6).map(s => `"${s}": 0.00`).join(', ')} },
      "cheapestStore": "nazwa sklepu",
      "cheapestPrice": 0.00,
      "potentialSaving": 0.00,
      "verdict": "dobry_wybor|mozna_taniej|znaczna_oszczednosc"
    }
  ],
  "currentPromotions": [],
  "bestStore": "nazwa sklepu ogólnie najtańszego",
  "totalPotentialSaving": 0.00,
  "personalMessage": "2-3 zdania personalnego komentarza do użytkownika po polsku",
  "topTip": "najważniejsza wskazówka na przyszłość"
}`
    : `You are a pricing expert for Polish supermarkets. A user bought the following products at: ${topStoreNames}.

PURCHASED PRODUCTS (with prices paid):
${productListForSearch}

Respond ONLY in JSON format (no markdown, no backticks):
{
  "priceComparisons": [
    {
      "product": "product name",
      "pricePaid": 0.00,
      "prices": { ${GROCERY_STORES.slice(0, 6).map(s => `"${s}": 0.00`).join(', ')} },
      "cheapestStore": "store name",
      "cheapestPrice": 0.00,
      "potentialSaving": 0.00,
      "verdict": "good_choice|could_be_cheaper|significant_saving"
    }
  ],
  "currentPromotions": [],
  "bestStore": "overall cheapest store name",
  "totalPotentialSaving": 0.00,
  "personalMessage": "2-3 sentence personal comment to the user in English",
  "topTip": "most important tip for next time"
}`

  try {
    const ai = getAIClient()
    if (!ai) {
      return NextResponse.json({ error: 'AI service not configured' }, { status: 503 })
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let webData: any = null

    // Web search only available with OpenAI direct (Azure doesn't support Responses API)
    if (ai.backend === 'openai') {
      try {
        const webSearchCall = ai.client.responses.create({
          model: ai.model,
          tools: [{ type: 'web_search_preview' }],
          input: searchPrompt,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any)
        const webSearchTimeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 15000))
        const webResponse = await Promise.race([webSearchCall, webSearchTimeout])
        if (webResponse) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const rawText = (webResponse as any).output_text || ''
          const jsonMatch = rawText.match(/\{[\s\S]*\}/)
          if (jsonMatch) {
            webData = JSON.parse(jsonMatch[0])
          }
        }
      } catch {
        // Web search unavailable, fall back to chat completions
      }
    }

    // Fallback: use chat completions without web search
    if (!webData) {
      const completion = await ai.client.chat.completions.create({
        model: ai.model,
        messages: [{
          role: 'user',
          content: searchPrompt + (isPolish
            ? '\n\nUwaga: nie masz dostępu do internetu, ale podaj szacunkowe ceny na podstawie swojej wiedzy o cenach w polskich sklepach.'
            : '\n\nNote: you do not have internet access, but provide estimated prices based on your knowledge of Polish supermarket prices.'),
        }],
        response_format: { type: 'json_object' },
        temperature: 0.3,
      })
      webData = JSON.parse(completion.choices[0]?.message?.content || '{}')
    }

    // Generate summary from template instead of a second OpenAI call (saves 2-3s)
    const saving = webData.totalPotentialSaving?.toFixed(2) || '0.00'
    const bestStoreText = webData.bestStore || (isPolish ? 'nieznany' : 'unknown')
    const topCats = Object.entries(categoryMap)
      .sort((a, b) => (b[1] as number) - (a[1] as number))
      .slice(0, 2)
      .map(([cat]) => cat)
      .join(isPolish ? ' i ' : ' and ')

    const aiSummary = isPolish
      ? `W ostatnich 30 dniach wydałeś ${totalSpent.toFixed(2)} ${currency} w ${transactionCount} transakcjach. Twoje główne kategorie to ${topCats}. Możesz potencjalnie zaoszczędzić ${saving} ${currency} robiąc zakupy w ${bestStoreText}. ${webData.topTip || 'Sprawdzaj gazetki promocyjne przed zakupami!'}`
      : `Over the last 30 days you spent ${totalSpent.toFixed(2)} ${currency} across ${transactionCount} transactions. Your top categories are ${topCats}. You could potentially save ${saving} ${currency} by shopping at ${bestStoreText}. ${webData.topTip || 'Check weekly flyers before shopping!'}`

    const payload = {
      period: { from: sinceStr, to: new Date().toISOString().slice(0, 10) },
      totalSpent,
      transactionCount,
      currency,
      categoryBreakdown: categoryMap,
      topStores,
      topProducts: topProducts.slice(0, 10),
      priceComparisons: webData.priceComparisons || [],
      currentPromotions: webData.currentPromotions || [],
      bestStore: webData.bestStore || null,
      totalPotentialSaving: webData.totalPotentialSaving || 0,
      personalMessage: webData.personalMessage || null,
      topTip: webData.topTip || null,
      aiSummary,
      webSearchUsed: true,
    }

    // Cache for 6h so subsequent tab entries are instant.
    auditCache.set(cacheKey, { result: payload, expiresAt: Date.now() + AUDIT_TTL_MS })

    return NextResponse.json(payload, {
      headers: { 'X-Cache': 'MISS', 'Cache-Control': 'private, max-age=300' },
    })
  } catch (err) {
    // If AI failed but we have a stale cached audit, return that
    // instead of forcing the user to wait. Stale beats blank.
    const stale = auditCache.get(cacheKey)
    if (stale) {
      return NextResponse.json(stale.result, {
        headers: { 'X-Cache': 'STALE', 'Cache-Control': 'private, max-age=60' },
      })
    }
    // Full fallback - return basic stats without AI
    return NextResponse.json({
      period: { from: sinceStr, to: new Date().toISOString().slice(0, 10) },
      totalSpent,
      transactionCount,
      currency,
      categoryBreakdown: categoryMap,
      topStores,
      topProducts: topProducts.slice(0, 10),
      priceComparisons: [],
      currentPromotions: [],
      bestStore: null,
      totalPotentialSaving: 0,
      personalMessage: null,
      topTip: null,
      aiSummary: isPolish
        ? `W ostatnich 30 dniach wydałeś ${totalSpent.toFixed(2)} ${currency} w ${transactionCount} transakcjach. Sprawdź sekcję wydatków po kategoriach, aby zobaczyć gdzie idzie najwięcej pieniędzy.`
        : `Over the last 30 days you spent ${totalSpent.toFixed(2)} ${currency} across ${transactionCount} transactions. Check the category breakdown below to see where most of your money goes.`,
      webSearchUsed: false,
      error: (err as Error).message,
    })
  }
}
