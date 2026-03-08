import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { db, expenses, receipts, categories } from '@/lib/db'
import { eq, gte, and, desc } from 'drizzle-orm'
import OpenAI from 'openai'

interface ReceiptItem {
  name: string
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

export async function POST(request: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { lang = 'en', currency = 'PLN' } = await request.json().catch(() => ({}))
  const isPolish = lang === 'pl'

  // Fetch last 30 days receipts + expenses
  const since = new Date()
  since.setDate(since.getDate() - 30)
  const sinceStr = since.toISOString().slice(0, 10)

  const [receiptsData, expensesData, cats] = await Promise.all([
    db.select().from(receipts)
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
      const items: ReceiptItem[] = Array.isArray(receipt.items) ? receipt.items : (receipt.items as any).items || []
      for (const item of items) {
        if (!item.name || !item.price || item.price <= 0) continue
        const key = item.name.toLowerCase().trim()
        const existing = productMap.get(key)
        if (existing) {
          existing.totalPaid += item.price * (item.quantity || 1)
          existing.count += item.quantity || 1
          existing.avgPrice = existing.totalPaid / existing.count
          existing.dates.push(receipt.date || '')
        } else {
          productMap.set(key, {
            name: item.name,
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
      "prices": { "Biedronka": 0.00, "Lidl": 0.00, "Kaufland": 0.00, "Auchan": 0.00 },
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
      "prices": { "Biedronka": 0.00, "Lidl": 0.00, "Kaufland": 0.00, "Auchan": 0.00 },
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
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

    let webData: any = null

    // Try web search with Responses API
    try {
      const webResponse = await openai.responses.create({
        model: 'gpt-4o',
        tools: [{ type: 'web_search_preview' as any }],
        input: searchPrompt,
      })
      const rawText = (webResponse as any).output_text || ''
      // Extract JSON from the response
      const jsonMatch = rawText.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        webData = JSON.parse(jsonMatch[0])
      }
    } catch {
      // Web search unavailable, fall back to chat completions
    }

    // Fallback: use chat completions without web search
    if (!webData) {
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
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

    // Generate AI summary
    const summaryPrompt = isPolish
      ? `Na podstawie tych danych finansowych użytkownika, napisz krótkie (3-4 zdania) podsumowanie audytu tygodniowego po polsku:
- Łącznie wydano: ${totalSpent.toFixed(2)} ${currency} w ${transactionCount} transakcjach
- Potencjalne oszczędności: ${webData.totalPotentialSaving?.toFixed(2) || '?'} ${currency}
- Najlepszy sklep: ${webData.bestStore || '?'}
- Kategorie: ${JSON.stringify(categoryMap)}
Bądź przyjazny, konkretny i motywujący. Zaadresuj bezpośrednio do użytkownika ("Ty").`
      : `Based on the user's financial data, write a short (3-4 sentence) weekly audit summary in English:
- Total spent: ${totalSpent.toFixed(2)} ${currency} in ${transactionCount} transactions
- Potential savings: ${webData.totalPotentialSaving?.toFixed(2) || '?'} ${currency}
- Best store: ${webData.bestStore || '?'}
- Categories: ${JSON.stringify(categoryMap)}
Be friendly, specific and motivating. Address the user directly ("you").`

    const summaryCompletion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: summaryPrompt }],
      temperature: 0.5,
    })
    const aiSummary = summaryCompletion.choices[0]?.message?.content || ''

    return NextResponse.json({
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
    })
  } catch (err) {
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
