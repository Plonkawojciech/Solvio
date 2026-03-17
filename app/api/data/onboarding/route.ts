import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth-compat'
import { getSession, SESSION_COOKIE } from '@/lib/session'
import { setProductType, type ProductType } from '@/lib/product-type'
import { db, companies, companyMembers } from '@/lib/db'
import { eq } from 'drizzle-orm'
import { seedBusinessCategories } from '@/lib/db/seed-user'

export async function POST(req: Request) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const { productType, companyName, nip } = body as {
      productType: ProductType
      companyName?: string
      nip?: string
    }

    if (!productType || !['personal', 'business'].includes(productType)) {
      return NextResponse.json({ error: 'Invalid productType' }, { status: 400 })
    }

    const session = await getSession()

    // Set the product type and mark onboarding as complete
    await setProductType(userId, productType, companyName, nip)

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
    const payload = Buffer.from(JSON.stringify({
      email: session?.email,
      productType,
    })).toString('base64')

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
