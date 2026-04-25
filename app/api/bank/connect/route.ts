// ══════════════════════════════════════════════════════════════════════════════
// POST /api/bank/connect
// Create a Nordigen requisition for connecting a bank account.
// Body: { institutionId: string }
// Returns { link, requisitionId }
// ══════════════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth-compat'
import { db } from '@/lib/db'
import { bankConnections } from '@/lib/db/schema'
import { getNordigenClient } from '@/lib/nordigen/client'
import * as crypto from 'crypto'

export async function POST(request: NextRequest) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = (await request.json()) as { institutionId?: string }

    if (!body.institutionId) {
      return NextResponse.json(
        { error: 'Missing required field: institutionId' },
        { status: 400 },
      )
    }

    const client = getNordigenClient()

    // Build redirect URI
    const appUrl = process.env.NEXT_PUBLIC_APP_URL
      ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')
    const redirectUri = `${appUrl}/api/bank/callback`

    // Generate a unique reference for this requisition
    const reference = `solvio-${userId.slice(0, 8)}-${crypto.randomBytes(8).toString('hex')}`

    // Create an End User Agreement (90 days access, all scopes)
    const agreement = await client.createAgreement({
      institution_id: body.institutionId,
      max_historical_days: 90,
      access_valid_for_days: 90,
      access_scope: ['balances', 'details', 'transactions'],
    })

    // Create a requisition — user will be redirected to the bank for authorization
    const requisition = await client.createRequisition({
      redirect: redirectUri,
      institution_id: body.institutionId,
      reference,
      agreement: agreement.id,
      user_language: 'PL',
    })

    // Get institution name for display
    let institutionName = body.institutionId
    try {
      const institution = await client.getInstitution(body.institutionId)
      institutionName = institution.name
    } catch {
      // Non-critical — use institutionId as fallback
    }

    // Calculate consent expiry
    const consentExpiry = new Date()
    consentExpiry.setDate(consentExpiry.getDate() + 90)

    // Create a pending bank connection record
    await db.insert(bankConnections).values({
      userId,
      provider: institutionName,
      institutionId: body.institutionId,
      requisitionId: requisition.id,
      consentId: agreement.id,
      consentExpiresAt: consentExpiry,
      status: 'pending',
    })

    return NextResponse.json({
      link: requisition.link,
      requisitionId: requisition.id,
    })
  } catch (err) {
    console.error('[bank/connect POST]', err)
    return NextResponse.json({ error: 'Operation failed' }, { status: 500 })
  }
}
