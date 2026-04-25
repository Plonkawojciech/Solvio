// ══════════════════════════════════════════════════════════════════════════════
// GET /api/bank/institutions
// List available banks from GoCardless/Nordigen for a given country.
// Query: ?country=pl (default: pl)
// ══════════════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth-compat'
import { getNordigenClient } from '@/lib/nordigen/client'

// Cache institutions for 1 hour (they don't change often)
let cachedInstitutions: { data: unknown; country: string; expiresAt: number } | null = null

export async function GET(request: NextRequest) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const country = request.nextUrl.searchParams.get('country') ?? 'pl'

    // Return cached data if fresh
    const now = Date.now()
    if (cachedInstitutions && cachedInstitutions.country === country && cachedInstitutions.expiresAt > now) {
      return NextResponse.json({ institutions: cachedInstitutions.data })
    }

    const client = getNordigenClient()
    const institutions = await client.getInstitutions(country)

    // Map to a simpler format for the frontend
    const mapped = institutions.map((inst) => ({
      id: inst.id,
      name: inst.name,
      bic: inst.bic,
      logo: inst.logo,
      transactionTotalDays: inst.transaction_total_days,
    }))

    // Cache for 1 hour
    cachedInstitutions = {
      data: mapped,
      country,
      expiresAt: now + 60 * 60 * 1000,
    }

    return NextResponse.json({ institutions: mapped })
  } catch (err) {
    console.error('[bank/institutions GET]', err)
    return NextResponse.json({ error: 'Failed to fetch institutions' }, { status: 500 })
  }
}
