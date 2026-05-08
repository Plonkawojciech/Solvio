import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth-compat'
import { getSession, SESSION_COOKIE, buildSignedSession } from '@/lib/session'
import { setProductType } from '@/lib/product-type'
import { db, companies, companyMembers } from '@/lib/db'
import { eq } from 'drizzle-orm'
import { seedBusinessCategories } from '@/lib/db/seed-user'
import { z } from 'zod'

// SECURITY FIX: Zod schema with strict bounds + enum on productType.
// Caps NIP / companyName lengths to defend against payload-bloat / DOS
// and against attempts to overflow downstream string columns.
const OnboardingSchema = z.object({
  productType: z.enum(['personal', 'business']),
  companyName: z.string().max(200).optional().nullable(),
  // Polish NIP is 10 digits but accept arbitrary 10-20 chars to be permissive
  nip: z.string().max(20).optional().nullable(),
})

export async function POST(req: Request) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const rawBody = await req.json().catch(() => null)
    if (!rawBody) {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }
    const parsed = OnboardingSchema.safeParse(rawBody)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten().fieldErrors }, { status: 400 })
    }
    const { productType, companyName, nip } = parsed.data

    const session = await getSession()

    // Set the product type and mark onboarding as complete
    // (Zod returns string | null | undefined — pass `?? undefined` to satisfy
    // setProductType's optional-string signature without changing semantics.)
    await setProductType(userId, productType, companyName ?? undefined, nip ?? undefined)

    // For business: create company + owner membership + seed business categories
    if (productType === 'business') {
      // Check if company already exists for this owner
      const existingCompany = await db.select({ id: companies.id })
        .from(companies)
        .where(eq(companies.ownerId, userId))
        .limit(1)

      let companyId: string

      if (existingCompany[0]) {
        companyId = existingCompany[0].id
      } else {
        const [newCompany] = await db.insert(companies).values({
          ownerId: userId,
          name: companyName || 'My Company',
          nip: nip || null,
        }).returning({ id: companies.id })
        companyId = newCompany.id
      }

      // Create owner as company member (idempotent)
      const existingMember = await db.select({ id: companyMembers.id })
        .from(companyMembers)
        .where(eq(companyMembers.userId, userId))
        .limit(1)

      if (!existingMember[0]) {
        await db.insert(companyMembers).values({
          companyId,
          userId,
          role: 'owner',
          displayName: companyName || session?.email?.split('@')[0] || 'Owner',
          email: session?.email || null,
          isActive: true,
        })
      }

      await seedBusinessCategories(userId)
    }

    // Update the session cookie to include productType (used by middleware for route gating)
    // SECURITY FIX: HMAC-signed session cookie
    const payload = buildSignedSession({
      email: session?.email,
      productType,
    })

    const res = NextResponse.json({ success: true })
    res.cookies.set(SESSION_COOKIE, payload, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30,
      path: '/',
    })
    return res
  } catch (error) {
    console.error('Onboarding error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
