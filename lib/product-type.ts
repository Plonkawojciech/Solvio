import { db } from './db'
import { userSettings } from './db/schema'
import { eq } from 'drizzle-orm'

export type ProductType = 'personal' | 'business'

/**
 * Single query to fetch both productType and onboardingComplete from user_settings.
 * Replaces the previous 2-query pattern (getProductType + getOnboardingStatus).
 */
export async function getUserSetup(userId: string): Promise<{ productType: ProductType; onboardingComplete: boolean }> {
  const [result] = await db.select({
    productType: userSettings.productType,
    onboardingComplete: userSettings.onboardingComplete,
  }).from(userSettings).where(eq(userSettings.userId, userId)).limit(1)

  return {
    productType: (result?.productType as ProductType) || 'personal',
    onboardingComplete: result?.onboardingComplete ?? false,
  }
}

/** @deprecated Use getUserSetup() for combined fetch. Kept for backward compatibility. */
export async function getProductType(userId: string): Promise<ProductType> {
  const { productType } = await getUserSetup(userId)
  return productType
}

/** @deprecated Use getUserSetup() for combined fetch. Kept for backward compatibility. */
export async function getOnboardingStatus(userId: string): Promise<boolean> {
  const { onboardingComplete } = await getUserSetup(userId)
  return onboardingComplete
}

export async function setProductType(userId: string, productType: ProductType, companyName?: string, nip?: string) {
  await db.insert(userSettings)
    .values({
      userId,
      productType,
      companyName: companyName || null,
      nip: nip || null,
      onboardingComplete: true,
    })
    .onConflictDoUpdate({
      target: userSettings.userId,
      set: {
        productType,
        companyName: companyName || null,
        nip: nip || null,
        onboardingComplete: true,
        updatedAt: new Date(),
      },
    })
}
