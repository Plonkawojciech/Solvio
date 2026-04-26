import { auth } from '@/lib/auth-compat'
import { NextResponse } from 'next/server'
import { db, receipts, weeklySummaries, expenses } from '@/lib/db'
import { eq, desc } from 'drizzle-orm'
import { getAIClient } from '@/lib/ai-client'
import { rateLimit } from '@/lib/rate-limit'
import { PRICE_COMPARE_STORES } from '@/lib/stores'
import { readAnyIntel, readIntel, writeIntel } from '@/lib/store-intel'
import crypto from 'crypto'

const STORES = PRICE_COMPARE_STORES

// Static map of store → main weekly leaflet URL. The AI rarely knows
// current /promocje URLs for sure; the canonical chain landing page is
// safer than letting the model invent broken links. Used both inside
// the prompt (so the AI gets a hint) and as a backfill in withIds when
// the AI returns null/missing leafletUrl.
const LEAFLET_URLS: Record<string, string> = {
  'Lidl': 'https://www.lidl.pl/c/gazetka-promocyjna/s10005637',
  'Biedronka': 'https://www.biedronka.pl/pl/gazetki',
  'Kaufland': 'https://www.kaufland.pl/oferta/aktualna-oferta-tygodniowa.html',
  'Auchan': 'https://www.auchan.pl/pl/oferta-tygodnia.html',
  'Carrefour': 'https://www.carrefour.pl/promocje',
  'Tesco': 'https://www.tesco.pl/gazetka',
  'Netto': 'https://www.netto.pl/gazetka',
  'Aldi': 'https://www.aldi.pl/gazetka.html',
  'Dino': 'https://grupadino.pl/gazetki/',
  'Stokrotka': 'https://www.stokrotka.pl/gazetka',
  'Polomarket': 'https://www.polomarket.pl/oferta-handlowa/gazetki',
  'Żabka': 'https://www.zabka.pl/promocje',
  'Rossmann': 'https://www.rossmann.pl/promocje',
  'Hebe': 'https://www.hebe.pl/promocje',
}

// Persistent cache backed by `store_intel` (kind: 'promotions').
// Survives serverless cold-starts and is shared across the fleet.
// Hard TTL: 24h (leaflets are weekly, but we want a fresh-ish feel);
// revalidate-after: 6h (so a logged-in user once a day sees a quick
// stale-served + bg-refresh experience).
const PROMO_TTL_S = 24 * 60 * 60
const PROMO_REVALIDATE_S = 6 * 60 * 60

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

  // Cache key includes userId because the personalised section
  // depends on the user's purchase history. Generic promotions could
  // dedupe across users, but splitting that out is a follow-up — for
  // now we accept some redundancy in exchange for a single response.
  const intelKey = crypto.createHash('sha256')
    .update(`${userId}:${lang}:${currency}`)
    .digest('hex')
    .slice(0, 48)

  // Force refresh: skip the SWR helper and write a fresh row directly.
  // Otherwise: return cached if fresh, return cached + bg-refresh if
  // stale, fetch synchronously on miss.
  if (force) {
    // Drop the row so the next read is a hard miss.
    // (writeIntel below will replace it with a fresh result.)
  } else {
    const cached = await readIntel<unknown>('promotions', intelKey).catch(() => null)
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

  // Cache miss (or force) — rate-limit before the AI call. Cached hits
  // never reach this gate so they don't burn the user's quota.
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

    // Extract item names from JSONB receipts.items. Prefer AI-cleaned
    // names (`nameClean`) over the raw POS-truncated form so the AI is
    // matching promotions against real product names like "Chleb żytnio-
    // orkiszowy" rather than "ChlezytnOrkisz".
    const purchaseHistory = recentReceipts.flatMap(r => {
      const items = Array.isArray(r.items) ? r.items as Array<{ name?: string; nameClean?: string; nameTranslated?: string }> : []
      return items.map(i => i.nameClean || i.nameTranslated || i.name).filter(Boolean)
    }).slice(0, 25) as string[]
    const vendorHistory = recentExpenses.map(e => e.vendor).filter(Boolean)
    const uniqueVendors = [...new Set(vendorHistory)]

    // Date hints for the AI — without these, it sometimes returns
    // 2024 dates from training data, which look stale to the user.
    const today = new Date()
    const todayStr = today.toISOString().slice(0, 10)
    const weekAhead = new Date(today)
    weekAhead.setDate(today.getDate() + 7)
    const weekAheadStr = weekAhead.toISOString().slice(0, 10)

    const leafletHints = STORES.map(s => `${s}: ${LEAFLET_URLS[s] || `(brak linku — wpisz null)`}`).join('\n')

    // Use OpenAI to search for current promotions
    const prompt = isPolish
      ? `Jesteś ekspertem od polskich promocji spożywczych. Na podstawie historii zakupów użytkownika, zaproponuj TYPOWE promocje i oszczędności w tych sklepach: ${STORES.join(', ')}.

WAŻNE: To są sugestie oparte na typowych cenach i promocjach. Nie masz dostępu do bieżących gazetek — daty validFrom/validUntil mają mieścić się W BIEŻĄCYM TYGODNIU (od ${todayStr} do ${weekAheadStr}), bo gazetki sieci handlowych są tygodniowe.

Historia zakupów użytkownika (produkty które kupuje):
${purchaseHistory.join(', ')}

Sklepy w których kupuje: ${uniqueVendors.join(', ')}

LINKI DO GAZETEK (użyj ich jako "leafletUrl" — to oficjalne strony z gazetkami, NIE wymyślaj innych URL-i):
${leafletHints}

Zwróć DOKŁADNIE w formacie JSON (tylko JSON, bez markdown):
{
  "promotions": [
    {
      "id": "unikalne-id",
      "store": "nazwa sklepu",
      "productName": "pełna, czytelna nazwa produktu (np. \\"Chleb żytnio-orkiszowy\\", nie \\"ChlezytnOrkisz\\")",
      "regularPrice": 5.99,
      "promoPrice": 3.49,
      "discount": "-42%",
      "currency": "${currency}",
      "validFrom": "${todayStr}",
      "validUntil": "${weekAheadStr}",
      "category": "kategoria produktu",
      "matchesPurchases": true,
      "leafletUrl": "https://...",
      "dealUrl": null
    }
  ],
  "personalizedDeals": [...te same pola, ale tylko produkty pasujące do historii zakupów...],
  "totalPotentialSavings": 45.50
}

ZASADY:
- "leafletUrl" → użyj URL-a z mapy powyżej dla danego sklepu, lub null jeśli sklep nie ma w mapie.
- "dealUrl" → konkretny link do produktu/promocji jeśli go znasz (np. lidl.pl/p/produkt-xxx); jeśli nie jesteś pewien, daj null.
- "validUntil" NIGDY nie może być w przeszłości (przed ${todayStr}).
- Nazwy produktów muszą być pełne i czytelne po polsku, nie skróty z paragonu.

Zwróć 15-25 typowych promocji. Oznacz matchesPurchases=true dla produktów podobnych do historii zakupów.`
      : `You are a Polish grocery promotion expert. Based on the user's purchase history, suggest TYPICAL promotions and savings at these stores: ${STORES.join(', ')}.

IMPORTANT: These are suggestions based on typical prices and promotions. You do not have access to current leaflets — validFrom/validUntil dates must fall within THIS WEEK (from ${todayStr} to ${weekAheadStr}), because retail leaflets are weekly.

User's purchase history (products they buy):
${purchaseHistory.join(', ')}

Stores they shop at: ${uniqueVendors.join(', ')}

LEAFLET LINKS (use these as "leafletUrl" — official chain leaflet pages, do NOT invent other URLs):
${leafletHints}

Return EXACTLY in JSON format (only JSON, no markdown):
{
  "promotions": [
    {
      "id": "unique-id",
      "store": "store name",
      "productName": "full readable product name (e.g. \\"Rye-spelt bread\\", not \\"ChlezytnOrkisz\\")",
      "regularPrice": 5.99,
      "promoPrice": 3.49,
      "discount": "-42%",
      "currency": "${currency}",
      "validFrom": "${todayStr}",
      "validUntil": "${weekAheadStr}",
      "category": "product category",
      "matchesPurchases": true,
      "leafletUrl": "https://...",
      "dealUrl": null
    }
  ],
  "personalizedDeals": [...same fields, but only products matching purchase history...],
  "totalPotentialSavings": 45.50
}

RULES:
- "leafletUrl" → use the URL from the map above for that store, or null if store not listed.
- "dealUrl" → specific product/promo link if you know it (e.g. lidl.pl/p/product-xxx); if unsure, return null.
- "validUntil" must NEVER be in the past (before ${todayStr}).
- Product names must be full, readable, in correct Polish — never POS-truncated abbreviations.

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

    // Add IDs if missing + backfill leafletUrl from the static map when
    // the AI returned null. We only fall back if the model didn't
    // provide a URL itself — but if it did, we accept it as-is. Also
    // forward dealUrl untouched so the iOS card can render an "open
    // deal" link when the AI knows a specific URL.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const withIds = (arr: any[]) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (arr || []).map((p: any, i: number) => {
        const storeName = typeof p.store === 'string' ? p.store : ''
        // Try exact match first, then case-insensitive, then partial.
        const fallbackLeaflet = LEAFLET_URLS[storeName]
          || Object.entries(LEAFLET_URLS).find(([k]) => k.toLowerCase() === storeName.toLowerCase())?.[1]
          || Object.entries(LEAFLET_URLS).find(([k]) => storeName.toLowerCase().includes(k.toLowerCase()))?.[1]
          || null
        return {
          ...p,
          id: p.id || `promo-${Date.now()}-${i}`,
          currency: p.currency || currency,
          leafletUrl: p.leafletUrl || fallbackLeaflet,
          dealUrl: p.dealUrl || null,
        }
      })

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

    // Persist into store_intel so subsequent requests across the
    // fleet (not just this Vercel instance) get instant hits.
    await writeIntel('promotions', intelKey, payload, PROMO_TTL_S, {
      revalidateAfterSeconds: PROMO_REVALIDATE_S,
    }).catch((e) => console.error('[promotions cache write]', e))

    const now = new Date()
    return NextResponse.json({
      ...payload,
      fetchedAt: now.toISOString(),
      freshUntil: new Date(now.getTime() + PROMO_TTL_S * 1000).toISOString(),
      cacheState: 'miss',
    }, {
      headers: { 'X-Cache': 'MISS', 'Cache-Control': 'private, max-age=300' },
    })
  } catch (err) {
    console.error('[promotions POST]', err)
    // If the AI call failed but we have an *expired* cached payload,
    // surface it as a stale fallback. Better old data than a blocked
    // screen. `readAnyIntel` ignores expiry, so even rows past
    // `expires_at` are returned here.
    const expired = await readAnyIntel<unknown>('promotions', intelKey).catch(() => null)
    if (expired) {
      return NextResponse.json({
        ...(expired.data as object),
        fetchedAt: expired.fetchedAt.toISOString(),
        cacheState: 'stale',
      }, {
        headers: { 'X-Cache': 'STALE', 'Cache-Control': 'private, max-age=60' },
      })
    }
    return NextResponse.json({ error: 'Failed to fetch promotions' }, { status: 500 })
  }
}
