import { NextResponse } from 'next/server'
import { listDocuments, documentsQuery } from '@/lib/crm/accounting'
import { fromCrm, readQuery, requireUser } from '@/lib/crm/route-helpers'

export const dynamic = 'force-dynamic'

/** Faktury sprzedaży i koszty, strona po stronie. Tylko odczyt. */
export async function GET(req: Request) {
  const user = await requireUser()
  if (user instanceof NextResponse) return user

  const query = readQuery(req, documentsQuery)
  if (query instanceof NextResponse) return query

  return fromCrm(await listDocuments(user, query), 'CRM niedostępny')
}
