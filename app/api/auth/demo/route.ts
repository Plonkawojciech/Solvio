import { clerkClient } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

const DEMO_EMAIL = 'demo@solvio.app'

// Demo login: looks up demo@solvio.app in Clerk, creates a one-use sign-in token,
// and redirects the user directly to the Clerk token URL — no 2FA required.
export async function GET(request: Request) {
  try {
    const client = await clerkClient()

    const users = await client.users.getUserList({ emailAddress: [DEMO_EMAIL] })

    if (!users.data.length) {
      // Demo account not found — fall back to login with an error param
      return NextResponse.redirect(new URL('/login?error=demo_unavailable', request.url))
    }

    const user = users.data[0]

    // One-use token valid for 10 minutes
    const signInToken = await client.signInTokens.createSignInToken({
      userId: user.id,
      expiresInSeconds: 600,
    })

    // signInToken.url is the Clerk-hosted URL that exchanges the ticket for a session
    return NextResponse.redirect(signInToken.url)
  } catch (err) {
    console.error('[demo-login] error:', err)
    return NextResponse.redirect(new URL('/login?error=demo_unavailable', request.url))
  }
}
