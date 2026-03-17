import { requirePersonal } from '@/lib/guards'
import PromotionsPage from './client-page'

export default async function Page() {
  await requirePersonal()
  return <PromotionsPage />
}
