import { NextResponse } from 'next/server'
import { listObligations, obligationsQuery } from '@/lib/crm/accounting'
import { fromCrm, readQuery, requireUser } from '@/lib/crm/route-helpers'

export const dynamic = 'force-dynamic'

/** Terminy podatkowe i ZUS, strona po stronie. Tylko odczyt — odhacza się je na webie. */
export async function GET(req: Request) {
  const user = await requireUser()
  if (user instanceof NextResponse) return user

  const query = readQuery(req, obligationsQuery)
  if (query instanceof NextResponse) return query

  return fromCrm(await listObligations(user, query), 'CRM niedostępny')
}
