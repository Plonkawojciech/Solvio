import { clerkClient } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

// Dev-only magic login: creates a one-use Clerk sign-in token for any existing user by email.
// Only enabled when NEXT_PUBLIC_DEV_MAGIC_LOGIN=true OR NODE_ENV=development.
export async function POST(req: Request) {
  const isDev =
    process.env.NEXT_PUBLIC_DEV_MAGIC_LOGIN === 'true' ||
    process.env.NODE_ENV === 'development'

  if (!isDev) {
    return NextResponse.json({ error: 'Not available' }, { status: 403 })
  }

  const { email } = await req.json()
  if (!email || typeof email !== 'string') {
    return NextResponse.json({ error: 'Email required' }, { status: 400 })
  }

  const client = await clerkClient()

  const users = await client.users.getUserList({ emailAddress: [email.trim()] })
  if (!users.data.length) {
    return NextResponse.json({ error: 'No user found with that email' }, { status: 404 })
  }

  const user = users.data[0]

  // One-use token, valid for 10 minutes
  const signInToken = await client.signInTokens.createSignInToken({
    userId: user.id,
    expiresInSeconds: 600,
  })

  // signInToken.url is the ready-to-use Clerk redirect URL that includes the ticket param
  return NextResponse.json({ url: signInToken.url })
}
