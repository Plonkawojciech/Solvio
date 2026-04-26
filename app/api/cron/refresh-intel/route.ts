import { NextResponse } from 'next/server'
import { gcStaleIntel, intelStats, writeIntel } from '@/lib/store-intel'

/**
 * `/api/cron/refresh-intel` — scheduled maintenance for the store-intel
 * cache. Wire into Vercel Cron (or any external scheduler) e.g. once
 * per hour:
 *
 *   "crons": [
 *     { "path": "/api/cron/refresh-intel", "schedule": "0 * * * *" }
 *   ]
 *
 * What it does:
 *   1. Garbage-collect rows past their `expires_at` boundary so the
 *      table doesn't grow unbounded.
 *   2. Pre-warm the `leaflet` namespace with canonical chain leaflet
 *      URLs (a static map). The actual leaflet *contents* update
 *      weekly via `/api/personal/promotions` AI calls; this just
 *      makes sure the URL map is always in `store_intel` so we have
 *      a single source of truth.
 *   3. Return stats so the operator can see the cache size at a glance.
 *
 * Auth: Vercel Cron sets `x-vercel-cron-signature`; an env-var bearer
 * token is also accepted so a generic external scheduler can call it.
 */

// Static chain → leaflet URL map. Mirrors the one in
// `app/api/personal/promotions/route.ts`. Move to a single shared
// module if it grows further.
const LEAFLET_URLS: Record<string, string> = {
  Lidl: 'https://www.lidl.pl/c/gazetka-promocyjna/s10005637',
  Biedronka: 'https://www.biedronka.pl/pl/gazetki',
  Kaufland: 'https://www.kaufland.pl/oferta/aktualna-oferta-tygodniowa.html',
  Auchan: 'https://www.auchan.pl/pl/oferta-tygodnia.html',
  Carrefour: 'https://www.carrefour.pl/promocje',
  Netto: 'https://www.netto.pl/gazetka',
  Aldi: 'https://www.aldi.pl/gazetka.html',
  Dino: 'https://grupadino.pl/gazetki/',
  Stokrotka: 'https://www.stokrotka.pl/gazetka',
  Polomarket: 'https://www.polomarket.pl/oferta-handlowa/gazetki',
  Żabka: 'https://www.zabka.pl/promocje',
  Rossmann: 'https://www.rossmann.pl/promocje',
  Hebe: 'https://www.hebe.pl/promocje',
}

// Rough opening-hours per chain — used as a hint for the AI optimizer
// and for direct surfacing in the iOS UI. These are typical defaults;
// individual store branches obviously vary.
const CHAIN_HOURS: Record<string, { weekday: string; saturday: string; sunday: string; note?: string }> = {
  Lidl: { weekday: '07:00–22:00', saturday: '07:00–22:00', sunday: '08:00–20:00 (handlowa)', note: 'Niehandlowe niedziele zamknięte' },
  Biedronka: { weekday: '06:00–23:00', saturday: '06:00–23:00', sunday: '07:00–22:00 (handlowa)', note: 'Niehandlowe niedziele zamknięte' },
  Kaufland: { weekday: '07:00–22:00', saturday: '07:00–22:00', sunday: '09:00–19:00 (handlowa)', note: 'Niehandlowe niedziele zamknięte' },
  Auchan: { weekday: '07:00–22:00', saturday: '07:00–22:00', sunday: '09:00–20:00 (handlowa)' },
  Carrefour: { weekday: '07:00–22:00', saturday: '07:00–22:00', sunday: '09:00–20:00 (handlowa)' },
  Dino: { weekday: '06:30–22:00', saturday: '06:30–22:00', sunday: '08:00–20:00 (handlowa)' },
  Stokrotka: { weekday: '06:30–22:00', saturday: '06:30–22:00', sunday: '08:00–20:00 (handlowa)' },
  Żabka: { weekday: '06:00–23:00', saturday: '06:00–23:00', sunday: '06:00–23:00', note: 'Otwarta także w niehandlowe niedziele (sklep convenience)' },
}

// Refresh windows. Hours change rarely (months); leaflet URLs are
// stable per chain (they redirect to the latest week internally).
const HOURS_TTL_S = 30 * 24 * 60 * 60      // 30 days
const LEAFLET_TTL_S = 7 * 24 * 60 * 60     // 7 days

function authorized(req: Request): boolean {
  const url = new URL(req.url)
  const queryToken = url.searchParams.get('token')
  const headerSig = req.headers.get('x-vercel-cron-signature')
  const headerAuth = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  const expected = process.env.CRON_SECRET
  if (!expected) return false
  return queryToken === expected || headerAuth === expected || (headerSig != null && headerSig.length > 0)
}

async function refresh(): Promise<{ leafletWritten: number; hoursWritten: number; gcDeleted: number }> {
  let leafletWritten = 0
  let hoursWritten = 0

  for (const [chain, url] of Object.entries(LEAFLET_URLS)) {
    await writeIntel(
      'leaflet',
      chain.toLowerCase(),
      { chain, url, refreshedAt: new Date().toISOString() },
      LEAFLET_TTL_S,
      { revalidateAfterSeconds: Math.floor(LEAFLET_TTL_S / 2), source: url },
    )
    leafletWritten++
  }

  for (const [chain, hours] of Object.entries(CHAIN_HOURS)) {
    await writeIntel(
      'hours',
      chain.toLowerCase(),
      { chain, ...hours },
      HOURS_TTL_S,
      { revalidateAfterSeconds: Math.floor(HOURS_TTL_S / 2) },
    )
    hoursWritten++
  }

  const gcDeleted = await gcStaleIntel()
  return { leafletWritten, hoursWritten, gcDeleted }
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const result = await refresh()
  const stats = await intelStats()
  return NextResponse.json({ ok: true, ...result, stats })
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const result = await refresh()
  const stats = await intelStats()
  return NextResponse.json({ ok: true, ...result, stats })
}
