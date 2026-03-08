import { redirect } from 'next/navigation'
import { type NextRequest } from 'next/server'

// Clerk handles email verification automatically via its SDK.
// This route handles legacy/fallback redirect for any email links.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const type = searchParams.get('type')

  if (type === 'recovery') {
    redirect('/forgot-password')
  }

  redirect('/login?message=Email+confirmed')
}
