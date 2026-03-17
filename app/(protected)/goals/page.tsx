import { requirePersonal } from '@/lib/guards'
import GoalsPage from './client-page'

export default async function Page() {
  await requirePersonal()
  return <GoalsPage />
}
