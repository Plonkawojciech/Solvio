import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth-compat'
import { db } from '@/lib/db'
import { userSettings, companies, companyMembers } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { cookies } from 'next/headers'
import { SESSION_COOKIE, buildSignedSession, getSession } from '@/lib/session'
import { seedBusinessCategories } from '@/lib/db/seed-user'

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { productType } = body

  if (!productType || !['personal', 'business'].includes(productType)) {
    return NextResponse.json({ error: 'Invalid productType' }, { status: 400 })
  }

  // Update product type
  await db.update(userSettings)
    .set({ productType, updatedAt: new Date() })
    .where(eq(userSettings.userId, userId))

  // If switching to business, ensure company exists
  if (productType === 'business') {
    const existingCompany = await db.select({ id: companies.id })
      .from(companies)
      .where(eq(companies.ownerId, userId))
      .limit(1)

    if (existingCompany.length === 0) {
      // Create a default company
      const [company] = await db.insert(companies).values({
        ownerId: userId,
        name: 'My Company',
      }).returning({ id: companies.id })

      // Add owner as member
      await db.insert(companyMembers).values({
        companyId: company.id,
        userId,
        role: 'owner',
        displayName: 'Owner',
        isActive: true,
      })
    }

    // Seed business categories
    await seedBusinessCategories(userId)
  }

  // Update session cookie with new productType
  const cookieStore = await cookies()
  const raw = cookieStore.get(SESSION_COOKIE)?.value
  if (raw) {
    try {
      // SECURITY FIX: HMAC-signed session cookie — re-sign with updated productType
      // Parse the current session via getSession() to preserve all fields safely,
      // then rebuild and re-sign the cookie.
      const session = await getSession()
      if (session) {
        // SECURITY FIX: httpOnly must be true
        const updated = buildSignedSession({ email: session.email, productType })
        cookieStore.set(SESSION_COOKIE, updated, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: 60 * 60 * 24 * 30,
          path: '/',
        })
      }
    } catch { /* ignore */ }
  }

  return NextResponse.json({ success: true, productType })
}
