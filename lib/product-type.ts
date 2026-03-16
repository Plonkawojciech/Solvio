import { db } from './db'
import { userSettings } from './db/schema'
import { eq } from 'drizzle-orm'

export type ProductType = 'personal' | 'business'

export async function getProductType(userId: string): Promise<ProductType> {
  const result = await db.select({ productType: userSettings.productType })
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1)
  return (result[0]?.productType as ProductType) || 'personal'
}

export async function getOnboardingStatus(userId: string): Promise<boolean> {
  const result = await db.select({ onboardingComplete: userSettings.onboardingComplete })
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1)
  return result[0]?.onboardingComplete ?? false
}

export async function setProductType(userId: string, productType: ProductType, companyName?: string, nip?: string) {
  await db.update(userSettings)
    .set({
      productType,
      companyName: companyName || null,
      nip: nip || null,
      onboardingComplete: true,
      updatedAt: new Date(),
    })
    .where(eq(userSettings.userId, userId))
}
