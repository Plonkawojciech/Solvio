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
import { rateLimitPersistent } from '@/lib/rate-limit'
import { withApiTiming } from '@/lib/api-timing'
import * as crypto from 'crypto'
import { z } from 'zod'

// SECURITY FIX: Zod validation. Nordigen institutionIds are short
// alphanumeric tokens (e.g. "PKO_BP_BPKOPLPW"); cap length and charset
// to prevent oversize payloads / injection of control bytes into the
// outbound Nordigen request.
const BankConnectSchema = z.object({
  institutionId: z.string().min(2).max(80).regex(/^[A-Za-z0-9_-]+$/, 'institutionId must be alphanumeric'),
})

async function postBankConnect(request: NextRequest) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // SECURITY FIX: rate-limit per-user — bank connection initiations are an
  // expensive Nordigen API call, capped at 10/hour to slow account-lockout/scan abuse.
  const rl = await rateLimitPersistent(`bank:connect:${userId}`, { maxRequests: 10, windowMs: 60 * 60 * 1000 })
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too many bank connection attempts. Try again later.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
    )
  }

  try {
    const rawBody = await request.json().catch(() => null)
    if (!rawBody) {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }
    const parsed = BankConnectSchema.safeParse(rawBody)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      )
    }
    const body = parsed.data

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

export const POST = withApiTiming('api.bank.connect.POST', postBankConnect)
