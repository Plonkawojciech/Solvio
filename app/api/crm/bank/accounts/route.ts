import { NextResponse } from 'next/server'
import { listBankAccounts } from '@/lib/crm/bank'
import { fromCrm, requireUser } from '@/lib/crm/route-helpers'

export const dynamic = 'force-dynamic'

/** Firmowe rachunki z CRM-a z ostatnim saldem. Tylko odczyt. */
export async function GET() {
  const user = await requireUser()
  if (user instanceof NextResponse) return user

  return fromCrm(await listBankAccounts(user), 'CRM niedostępny')
}
