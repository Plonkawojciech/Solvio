import { getSession } from '@/lib/session'
import { redirect } from 'next/navigation'
import LandingPage from '@/components/landing_page/landing-page'

export default async function Page() {
  const session = await getSession()
  if (session?.userId) redirect('/dashboard')

  return <LandingPage />
}
