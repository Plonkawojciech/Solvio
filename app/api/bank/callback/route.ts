// ══════════════════════════════════════════════════════════════════════════════
// GET /api/bank/callback
// OAuth2 callback from PKO. Exchanges code for tokens, fetches accounts,
// stores them in DB, and redirects to /bank?connected=true.
// ══════════════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth-compat'
import { db } from '@/lib/db'
import { bankConnections, bankAccounts } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { getPkoClient, PkoApiError } from '@/lib/pko/client'
import { encrypt, decrypt } from '@/lib/pko/encryption'

export async function GET(request: NextRequest) {
  const { userId } = await auth()
  const appUrl = process.env.NEXT_PUBLIC_APP_URL
    ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')

  if (!userId) {
    return NextResponse.redirect(new URL('/login?error=unauthorized', appUrl))
  }

  try {
    const { searchParams } = request.nextUrl
    const code = searchParams.get('code')
    const state = searchParams.get('state')
    const error = searchParams.get('error')
    const errorDescription = searchParams.get('error_description')

    // Handle error from PKO
    if (error) {
      console.error('[bank/callback] PKO error:', error, errorDescription)
      // Clean up pending connection
      await db
        .update(bankConnections)
        .set({ status: 'revoked', updatedAt: new Date() })
        .where(and(eq(bankConnections.userId, userId), eq(bankConnections.status, 'pending')))

      return NextResponse.redirect(
        new URL(`/bank?error=${encodeURIComponent(errorDescription ?? error)}`, appUrl),
      )
    }

    if (!code || !state) {
      return NextResponse.redirect(new URL('/bank?error=missing_params', appUrl))
    }

    // Find the pending connection and verify state
    const pendingConnections = await db
      .select()
      .from(bankConnections)
      .where(and(eq(bankConnections.userId, userId), eq(bankConnections.status, 'pending')))
      .limit(5) // Get recent pending ones

    let matchedConnection: typeof pendingConnections[0] | null = null
    let storedRedirectUri: string | null = null
    let storedConsentId: string | null = null

    for (const conn of pendingConnections) {
      if (!conn.accessToken) continue
      try {
        const stored = JSON.parse(decrypt(conn.accessToken)) as {
          state: string
          redirectUri: string
          consentId: string
        }
        if (stored.state === state) {
          matchedConnection = conn
          storedRedirectUri = stored.redirectUri
          storedConsentId = stored.consentId
          break
        }
      } catch {
        // Skip connections we can't decrypt (corrupted or different format)
        continue
      }
    }

    if (!matchedConnection || !storedRedirectUri) {
      return NextResponse.redirect(new URL('/bank?error=invalid_state', appUrl))
    }

    // Exchange code for tokens
    const client = getPkoClient()
    const tokenResponse = await client.exchangeCode({
      code,
      redirectUri: storedRedirectUri,
    })

    // Encrypt tokens for storage
    const encryptedAccessToken = encrypt(tokenResponse.access_token)
    const encryptedRefreshToken = tokenResponse.refresh_token
      ? encrypt(tokenResponse.refresh_token)
      : null

    // Calculate consent expiry from token response or default to 90 days
    const consentExpiresAt = tokenResponse.scope_details?.scopeTimeLimit
      ? new Date(tokenResponse.scope_details.scopeTimeLimit)
      : (() => {
          const d = new Date()
          d.setDate(d.getDate() + 90)
          return d
        })()

    const consentId = storedConsentId
      ?? tokenResponse.scope_details?.consentId
      ?? matchedConnection.consentId

    // Update the connection with tokens
    await db
      .update(bankConnections)
      .set({
        accessToken: encryptedAccessToken,
        refreshToken: encryptedRefreshToken,
        consentId,
        consentExpiresAt,
        status: 'active',
        updatedAt: new Date(),
      })
      .where(eq(bankConnections.id, matchedConnection.id))

    // Fetch user's accounts
    try {
      const accountsResponse = await client.getAccounts(tokenResponse.access_token)

      if (accountsResponse.accounts && accountsResponse.accounts.length > 0) {
        const accountIds: string[] = []

        for (const acc of accountsResponse.accounts) {
          // Get detailed account info for balance
          let balance: string | null = null
          let currency = 'PLN'
          let accountName: string | null = null

          try {
            const detail = await client.getAccount(tokenResponse.access_token, acc.accountNumber)
            if (detail.account) {
              balance = detail.account.availableBalance
              currency = detail.account.currency
              accountName = detail.account.accountNameClient ?? null
            }
          } catch {
            // Non-critical — can sync balance later
          }

          const [inserted] = await db
            .insert(bankAccounts)
            .values({
              connectionId: matchedConnection.id,
              userId,
              accountNumber: acc.accountNumber,
              accountName: accountName ?? acc.accountTypeName ?? 'PKO Account',
              accountType: acc.accountType?.description ?? acc.accountType?.code ?? 'personal',
              currency,
              balance,
              balanceUpdatedAt: balance ? new Date() : null,
              isActive: true,
            })
            .returning({ id: bankAccounts.id })

          if (inserted) {
            accountIds.push(inserted.id)
          }
        }

        // Store account IDs on the connection
        if (accountIds.length > 0) {
          await db
            .update(bankConnections)
            .set({ accountIds, updatedAt: new Date() })
            .where(eq(bankConnections.id, matchedConnection.id))
        }
      }
    } catch (err) {
      // Account fetching failed — connection is still valid, accounts can be synced later
      console.error('[bank/callback] Failed to fetch accounts:', err)
    }

    return NextResponse.redirect(new URL('/bank?connected=true', appUrl))
  } catch (err) {
    console.error('[bank/callback]', err)
    const errorMsg = err instanceof PkoApiError
      ? `pko_error_${err.statusCode}`
      : 'connection_failed'
    return NextResponse.redirect(new URL(`/bank?error=${errorMsg}`, appUrl))
  }
}
