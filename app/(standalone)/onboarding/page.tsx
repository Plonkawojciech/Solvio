import { getSession } from '@/lib/session'
import { redirect } from 'next/navigation'
import { getOnboardingStatus } from '@/lib/product-type'
import { OnboardingClient } from './onboarding-client'

export default async function OnboardingPage() {
  const session = await getSession()
  if (!session?.userId) redirect('/login')

  // If already onboarded, go to dashboard
  const onboardingComplete = await getOnboardingStatus(session.userId)
  if (onboardingComplete) redirect('/dashboard')

  return <OnboardingClient />
}
