import { NextResponse } from 'next/server'
import { listBankTransactions } from '@/lib/crm/bank'
import { fromCrm, requireUser } from '@/lib/crm/route-helpers'

export const dynamic = 'force-dynamic'

const DAY = /^\d{4}-\d{2}-\d{2}$/

/** Transakcje firmowych rachunków z zakresu dat (`from`, `to`, opcjonalnie
 *  `accountId`). Tylko odczyt — dopasowania zatwierdza się w CRM-ie. */
export async function GET(req: Request) {
  const user = await requireUser()
  if (user instanceof NextResponse) return user

  const q = new URL(req.url).searchParams
  const from = q.get('from') ?? undefined
  const to = q.get('to') ?? undefined
  if ((from && !DAY.test(from)) || (to && !DAY.test(to))) {
    return NextResponse.json({ error: 'Daty w formacie RRRR-MM-DD' }, { status: 400 })
  }
  const accountId = q.get('accountId') ?? undefined

  return fromCrm(await listBankTransactions(user, { from, to, accountId }), 'CRM niedostępny')
}
