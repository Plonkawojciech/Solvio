import { NextResponse } from 'next/server'
import { listJpk, jpkQuery } from '@/lib/crm/accounting'
import { fromCrm, readQuery, requireUser } from '@/lib/crm/route-helpers'

export const dynamic = 'force-dynamic'

/** Pliki JPK i ich status w MF. Tylko odczyt — wysyłka wyłącznie na webie. */
export async function GET(req: Request) {
  const user = await requireUser()
  if (user instanceof NextResponse) return user

  const query = readQuery(req, jpkQuery)
  if (query instanceof NextResponse) return query

  return fromCrm(await listJpk(user, query), 'CRM niedostępny')
}
