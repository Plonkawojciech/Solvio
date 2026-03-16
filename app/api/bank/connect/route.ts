// ══════════════════════════════════════════════════════════════════════════════
// POST /api/bank/connect
// Generate PKO OAuth2 authorization URL for connecting a bank account.
// Returns { authorizationUrl, state }
// ══════════════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth-compat'
import { db } from '@/lib/db'
import { bankConnections } from '@/lib/db/schema'
import { getPkoClient } from '@/lib/pko/client'
import { encrypt } from '@/lib/pko/encryption'
import * as crypto from 'crypto'
import type { ScopeDetailsInput } from '@/lib/pko/types'

export async function POST(request: NextRequest) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = (await request.json()) as {
      scope?: 'ais-accounts' | 'ais' | 'pis'
    }

    const scope = body.scope ?? 'ais'
    const client = getPkoClient()

    // Generate a cryptographic state parameter for CSRF protection
    const state = crypto.randomBytes(32).toString('hex')

    // Build redirect URI
    const appUrl = process.env.NEXT_PUBLIC_APP_URL
      ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')
    const redirectUri = `${appUrl}/api/bank/callback`

    // Generate a consent ID
    const consentId = crypto.randomUUID()

    // Build scope details for AIS consent (90-day validity, multiple usage)
    const consentExpiry = new Date()
    consentExpiry.setDate(consentExpiry.getDate() + 90)

    const scopeDetails: ScopeDetailsInput = {
      privilegeList: [
        {
          'ais-accounts:getAccounts': { scopeUsageLimit: 'multiple' },
          'ais:getAccount': { scopeUsageLimit: 'multiple' },
          'ais:getTransactionsDone': {
            scopeUsageLimit: 'multiple',
            maxAllowedHistoryLong: 365,
          },
          'ais:getTransactionsPending': {
            scopeUsageLimit: 'multiple',
            maxAllowedHistoryLong: 365,
          },
          'ais:getTransactionDetail': { scopeUsageLimit: 'multiple' },
          'ais:getHolds': {
            scopeUsageLimit: 'multiple',
            maxAllowedHistoryLong: 365,
          },
        },
      ],
      scopeGroupType: scope,
      consentId,
      scopeTimeLimit: consentExpiry.toISOString(),
      throttlingPolicy: 'psd2Regulatory',
    }

    // Request authorization URL from PKO
    const authorizeResponse = await client.getAuthorizationUrl({
      redirectUri,
      scope,
      scopeDetails,
      state,
    })

    // Create a pending bank connection record
    await db.insert(bankConnections).values({
      userId,
      provider: 'pko',
      consentId,
      consentExpiresAt: consentExpiry,
      status: 'pending',
      // Store the state encrypted so we can verify it in callback
      accessToken: encrypt(JSON.stringify({ state, redirectUri, consentId })),
    })

    return NextResponse.json({
      authorizationUrl: authorizeResponse.aspspRedirectUri,
      state,
    })
  } catch (err) {
    console.error('[bank/connect POST]', err)
    const message = err instanceof Error ? err.message : 'Failed to generate authorization URL'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
