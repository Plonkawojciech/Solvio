import { requirePersonal } from '@/lib/guards'
import LoyaltyPage from './client-page'

export default async function Page() {
  await requirePersonal()
  return <LoyaltyPage />
}
