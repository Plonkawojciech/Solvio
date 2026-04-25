import { auth } from '@/lib/auth-compat'
import { NextResponse } from 'next/server'
import { rateLimit } from '@/lib/rate-limit'
import { STORE_PATTERNS, ALL_POLISH_STORES } from '@/lib/stores'
import { z } from 'zod'

const NearbySchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  radius: z.number().min(500).max(50000).optional().default(5000),
  lang: z.enum(['pl', 'en']).optional().default('pl'),
})

interface OverpassElement {
  type: string
  id: number
  lat?: number
  lon?: number
  center?: { lat: number; lon: number }
  tags?: Record<string, string>
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function matchKnownStore(name: string): string | null {
  for (const [pattern, storeName] of STORE_PATTERNS) {
    if (pattern.test(name)) return storeName
  }
  return null
}

export async function POST(request: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const rl = rateLimit(`nearby:${userId}`, { maxRequests: 30, windowMs: 60 * 60 * 1000 })
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Try again later.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
    )
  }

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })

  const parsed = NearbySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten().fieldErrors }, { status: 400 })
  }

  const { lat, lng, radius, lang } = parsed.data
  const isPolish = lang === 'pl'

  try {
    const query = `[out:json][timeout:10];(node["shop"~"supermarket|convenience|chemist|department_store|hardware|electronics"](around:${radius},${lat},${lng});way["shop"~"supermarket|convenience|chemist|department_store|hardware|electronics"](around:${radius},${lat},${lng}););out center;`

    const overpassRes = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `data=${encodeURIComponent(query)}`,
      signal: AbortSignal.timeout(12000),
    })

    if (!overpassRes.ok) {
      throw new Error(`Overpass API error: ${overpassRes.status}`)
    }

    const data = await overpassRes.json()
    const elements: OverpassElement[] = data.elements || []

    const stores = elements
      .map(el => {
        const elLat = el.lat ?? el.center?.lat
        const elLon = el.lon ?? el.center?.lon
        if (!elLat || !elLon) return null

        const name = el.tags?.name || el.tags?.brand || null
        if (!name) return null

        const distance = haversineKm(lat, lng, elLat, elLon)
        const knownBrand = matchKnownStore(name)
        const shopType = el.tags?.shop || 'supermarket'

        let category: string
        switch (shopType) {
          case 'supermarket': category = isPolish ? 'Supermarket' : 'Supermarket'; break
          case 'convenience': category = isPolish ? 'Sklep spożywczy' : 'Convenience'; break
          case 'chemist': category = isPolish ? 'Drogeria' : 'Drugstore'; break
          case 'department_store': category = isPolish ? 'Dom handlowy' : 'Department store'; break
          case 'hardware': category = isPolish ? 'Sklep budowlany' : 'Hardware store'; break
          case 'electronics': category = isPolish ? 'Elektronika' : 'Electronics'; break
          default: category = isPolish ? 'Sklep' : 'Store'
        }

        return {
          id: String(el.id),
          name: knownBrand || name,
          originalName: name,
          brand: knownBrand,
          isKnown: !!knownBrand,
          lat: elLat,
          lng: elLon,
          distance: Math.round(distance * 1000),
          address: [el.tags?.['addr:street'], el.tags?.['addr:housenumber']].filter(Boolean).join(' ') || null,
          city: el.tags?.['addr:city'] || null,
          openingHours: el.tags?.opening_hours || null,
          phone: el.tags?.phone || el.tags?.['contact:phone'] || null,
          website: el.tags?.website || el.tags?.['contact:website'] || null,
          category,
          shopType,
        }
      })
      .filter(Boolean)
      .sort((a, b) => a!.distance - b!.distance)

    const knownStores = stores.filter(s => s!.isKnown)
    const allKnownBrands = ALL_POLISH_STORES as readonly string[]
    const foundBrands = new Set(knownStores.map(s => s!.brand))
    const nearbyBrands = [...foundBrands]

    return NextResponse.json({
      stores,
      total: stores.length,
      knownStoresCount: knownStores.length,
      nearbyBrands,
      allKnownBrands: [...allKnownBrands],
      searchRadius: radius,
      center: { lat, lng },
    })
  } catch (err) {
    console.error('[nearby-stores POST]', err)
    return NextResponse.json(
      { error: isPolish ? 'Nie udało się pobrać sklepów w okolicy' : 'Failed to fetch nearby stores' },
      { status: 500 },
    )
  }
}
