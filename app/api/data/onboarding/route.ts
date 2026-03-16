import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth-compat'
import { setProductType, type ProductType } from '@/lib/product-type'
import { db, companies } from '@/lib/db'
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

    // Set the product type and mark onboarding as complete
    await setProductType(userId, productType, companyName, nip)

    // For business: create company record and seed business categories
    if (productType === 'business') {
      await Promise.all([
        db.insert(companies).values({
          ownerId: userId,
          name: companyName || 'My Company',
          nip: nip || null,
        }),
        seedBusinessCategories(userId),
      ])
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Onboarding error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
