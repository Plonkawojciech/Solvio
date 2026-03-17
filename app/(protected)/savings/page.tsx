import { requirePersonal } from '@/lib/guards'
import SavingsHub from './client-page'

export default async function Page() {
  await requirePersonal()
  return <SavingsHub />
}
