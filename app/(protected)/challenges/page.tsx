import { requirePersonal } from '@/lib/guards'
import ChallengesPage from './client-page'

export default async function Page() {
  await requirePersonal()
  return <ChallengesPage />
}
