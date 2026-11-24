import { NextResponse } from 'next/server'
import { accountingOverview, overviewQuery } from '@/lib/crm/accounting'
import { fromCrm, readQuery, requireUser } from '@/lib/crm/route-helpers'

export const dynamic = 'force-dynamic'

/** Rozliczenie miesiąca we wszystkich podmiotach (`period`). Tylko odczyt. */
export async function GET(req: Request) {
  const user = await requireUser()
  if (user instanceof NextResponse) return user

  const query = readQuery(req, overviewQuery)
  if (query instanceof NextResponse) return query

  return fromCrm(await accountingOverview(user, query), 'CRM niedostępny')
}
