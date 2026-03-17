import { requirePersonal } from '@/lib/guards'
import BudgetPage from './client-page'

export default async function Page() {
  await requirePersonal()
  return <BudgetPage />
}
