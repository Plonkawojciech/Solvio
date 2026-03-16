import { auth } from '@/lib/auth-compat'
import { NextResponse } from 'next/server'
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

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are a helpful assistant that returns only valid JSON with current Polish store promotions.' },
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
      result = { promotions: [], scannedStores: 0, totalDeals: 0 }
    }

    // Add IDs to promotions
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
