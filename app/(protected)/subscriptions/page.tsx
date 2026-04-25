import { requirePersonal } from '@/lib/guards'
import SubscriptionsClient from './client-page'

export default async function Page() {
  await requirePersonal()
  return <SubscriptionsClient />
}
