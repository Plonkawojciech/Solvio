import { auth } from '@/lib/auth-compat'
import { NextResponse } from 'next/server'
import { db, receipts, weeklySummaries, expenses } from '@/lib/db'
import { eq, desc } from 'drizzle-orm'
import { getAIClient } from '@/lib/ai-client'
import { rateLimit } from '@/lib/rate-limit'
import { PRICE_COMPARE_STORES } from '@/lib/stores'

const STORES = PRICE_COMPARE_STORES

// Module-level in-memory cache. Survives across warm requests on the
// same Vercel function instance (~5min idle). Cold starts re-compute,
// but that's still much better than always re-running a 15-30s AI call.
// Keyed by `${userId}:${lang}:${currency}` so identical payloads dedupe.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const promoCache = new Map<string, { result: any; expiresAt: number }>()
const PROMO_TTL_MS = 24 * 60 * 60 * 1000 // 24h — promotions are weekly anyway

export async function POST(request: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

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

  const { lang = 'pl', currency = 'PLN', force = false } = body
  const isPolish = lang === 'pl'

  // Serve cached payload if still warm. Saves 15-30s + an AI call.
  const cacheKey = `${userId}:${lang}:${currency}`
  if (!force) {
    const cached = promoCache.get(cacheKey)
    if (cached && cached.expiresAt > Date.now()) {
      return NextResponse.json(cached.result, {
        headers: { 'X-Cache': 'HIT', 'Cache-Control': 'private, max-age=300' },
      })
    }
  }

  // Rate-limit only when we *would* hit the AI (cache miss). Cached
  // responses cost us nothing, so they shouldn't burn the user's quota.
  const rl = rateLimit(`ai:promotions:${userId}`, { maxRequests: 10, windowMs: 60 * 60 * 1000 })
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Try again later.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
    )
  }

  try {
    // Get user's recent purchases (last 30 days) for personalization
    // Use receipts.items JSONB (populated by OCR) instead of receipt_items table (never populated by OCR)
    const [recentReceipts, recentExpenses] = await Promise.all([
      db
        .select({ items: receipts.items, vendor: receipts.vendor })
        .from(receipts)
        .where(eq(receipts.userId, userId))
        .orderBy(desc(receipts.createdAt))
        .limit(20),
      db
        .select({ title: expenses.title, amount: expenses.amount, vendor: expenses.vendor })
        .from(expenses)
        .where(eq(expenses.userId, userId))
        .orderBy(desc(expenses.date))
        .limit(30),
    ])

    // Extract item names from JSONB receipts.items
    const purchaseHistory = recentReceipts.flatMap(r => {
      const items = Array.isArray(r.items) ? r.items as Array<{ name?: string; nameTranslated?: string }> : []
      return items.map(i => i.nameTranslated || i.name).filter(Boolean)
    }).slice(0, 25) as string[]
    const vendorHistory = recentExpenses.map(e => e.vendor).filter(Boolean)
    const uniqueVendors = [...new Set(vendorHistory)]

    // Use OpenAI to search for current promotions
    const prompt = isPolish
      ? `Jesteś ekspertem od polskich promocji spożywczych. Na podstawie historii zakupów użytkownika, zaproponuj TYPOWE promocje i oszczędności w tych sklepach: ${STORES.join(', ')}.

WAŻNE: To są sugestie oparte na typowych cenach i promocjach. Nie masz dostępu do bieżących gazetek.

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

Zwróć 15-25 typowych promocji. Oznacz matchesPurchases=true dla produktów podobnych do historii zakupów.`
      : `You are a Polish grocery promotion expert. Based on the user's purchase history, suggest TYPICAL promotions and savings at these stores: ${STORES.join(', ')}.

IMPORTANT: These are suggestions based on typical prices and promotions. You do not have access to current leaflets.

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

Return 8-12 typical promotions. Mark matchesPurchases=true for products similar to purchase history.`

    const completion = await ai.client.chat.completions.create({
      model: ai.model,
      messages: [
        { role: 'system', content: 'You are a helpful assistant that returns only valid JSON.' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.5,
      // Cut from 4000 → 2200. We ask for 8-12 promotions instead of 15-25;
      // cached for 24h anyway, so user sees fewer but the call is ~2× faster.
      max_tokens: 2200,
      response_format: { type: 'json_object' },
    })

    const content = completion.choices[0]?.message?.content || '{}'
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let result: any
    try {
      result = JSON.parse(content)
    } catch {
      result = { promotions: [], personalizedDeals: [], totalPotentialSavings: 0 }
    }

    // Add IDs if missing
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const withIds = (arr: any[]) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

    const payload = {
      promotions: withIds(result.promotions),
      personalizedDeals: withIds(result.personalizedDeals),
      totalPotentialSavings: result.totalPotentialSavings || 0,
      weeklySummary,
    }

    // Cache the freshly-computed payload so the next 24h of requests skip
    // the AI call entirely. Tied to userId+lang+currency so changing any
    // of those still triggers a recompute.
    promoCache.set(cacheKey, { result: payload, expiresAt: Date.now() + PROMO_TTL_MS })

    return NextResponse.json(payload, {
      headers: { 'X-Cache': 'MISS', 'Cache-Control': 'private, max-age=300' },
    })
  } catch (err) {
    console.error('[promotions POST]', err)
    // If the AI call failed but we have a stale cached payload, serve it
    // rather than a 500. Better stale data than a blocked screen.
    const stale = promoCache.get(cacheKey)
    if (stale) {
      return NextResponse.json(stale.result, {
        headers: { 'X-Cache': 'STALE', 'Cache-Control': 'private, max-age=60' },
      })
    }
    return NextResponse.json({ error: 'Failed to fetch promotions' }, { status: 500 })
  }
}
