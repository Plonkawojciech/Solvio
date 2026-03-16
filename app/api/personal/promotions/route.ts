import { auth } from '@/lib/auth-compat'
import { NextResponse } from 'next/server'
import { db, receipts, receiptItems, weeklySummaries, expenses } from '@/lib/db'
import { eq, desc, gte, sql } from 'drizzle-orm'
import OpenAI from 'openai'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

const STORES = ['Biedronka', 'Lidl', 'Żabka', 'Kaufland', 'Aldi', 'Auchan', 'Carrefour', 'Rossmann']

export async function POST(request: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { lang = 'pl', currency = 'PLN' } = body
  const isPolish = lang === 'pl'

  try {
    // Get user's recent purchases (last 30 days) for personalization
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
    const dateStr = thirtyDaysAgo.toISOString().slice(0, 10)

    const [recentItems, recentExpenses] = await Promise.all([
      db
        .select({ name: receiptItems.name, totalPrice: receiptItems.totalPrice })
        .from(receiptItems)
        .where(eq(receiptItems.userId, userId))
        .orderBy(desc(receiptItems.createdAt))
        .limit(50),
      db
        .select({ title: expenses.title, amount: expenses.amount, vendor: expenses.vendor })
        .from(expenses)
        .where(eq(expenses.userId, userId))
        .orderBy(desc(expenses.date))
        .limit(30),
    ])

    const purchaseHistory = recentItems.map(i => i.name).filter(Boolean).slice(0, 25)
    const vendorHistory = recentExpenses.map(e => e.vendor).filter(Boolean)
    const uniqueVendors = [...new Set(vendorHistory)]

    // Use OpenAI to search for current promotions
    const prompt = isPolish
      ? `Jesteś ekspertem od polskich promocji spożywczych. Wyszukaj AKTUALNE promocje w tych sklepach: ${STORES.join(', ')}.

Historia zakupów użytkownika (produkty które kupuje):
${purchaseHistory.join(', ')}

Sklepy w których kupuje: ${uniqueVendors.join(', ')}

Zwróć DOKŁADNIE w formacie JSON (tylko JSON, bez markdown):
{
  "promotions": [
    {
      "id": "unikalne-id",
      "store": "nazwa sklepu",
      "productName": "nazwa produktu",
      "regularPrice": 5.99,
      "promoPrice": 3.49,
      "discount": "-42%",
      "currency": "${currency}",
      "validFrom": "2026-03-16",
      "validUntil": "2026-03-22",
      "category": "kategoria produktu",
      "matchesPurchases": true
    }
  ],
  "personalizedDeals": [...te same pola, ale tylko produkty pasujące do historii zakupów...],
  "totalPotentialSavings": 45.50
}

Zwróć 15-25 promocji. Oznacz matchesPurchases=true dla produktów podobnych do historii zakupów.`
      : `You are a Polish grocery promotion expert. Search for CURRENT promotions at these stores: ${STORES.join(', ')}.

User's purchase history (products they buy):
${purchaseHistory.join(', ')}

Stores they shop at: ${uniqueVendors.join(', ')}

Return EXACTLY in JSON format (only JSON, no markdown):
{
  "promotions": [
    {
      "id": "unique-id",
      "store": "store name",
      "productName": "product name",
      "regularPrice": 5.99,
      "promoPrice": 3.49,
      "discount": "-42%",
      "currency": "${currency}",
      "validFrom": "2026-03-16",
      "validUntil": "2026-03-22",
      "category": "product category",
      "matchesPurchases": true
    }
  ],
  "personalizedDeals": [...same fields, but only products matching purchase history...],
  "totalPotentialSavings": 45.50
}

Return 15-25 promotions. Mark matchesPurchases=true for products similar to purchase history.`

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are a helpful assistant that returns only valid JSON.' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.7,
      max_tokens: 4000,
      response_format: { type: 'json_object' },
    })

    const content = completion.choices[0]?.message?.content || '{}'
    let result: any
    try {
      result = JSON.parse(content)
    } catch {
      result = { promotions: [], personalizedDeals: [], totalPotentialSavings: 0 }
    }

    // Add IDs if missing
    const withIds = (arr: any[]) =>
      (arr || []).map((p: any, i: number) => ({
        ...p,
        id: p.id || `promo-${Date.now()}-${i}`,
        currency: p.currency || currency,
      }))

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

    return NextResponse.json({
      promotions: withIds(result.promotions),
      personalizedDeals: withIds(result.personalizedDeals),
      totalPotentialSavings: result.totalPotentialSavings || 0,
      weeklySummary,
    })
  } catch (err) {
    console.error('[promotions POST]', err)
    return NextResponse.json({ error: 'Failed to fetch promotions' }, { status: 500 })
  }
}
