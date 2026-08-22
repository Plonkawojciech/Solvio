import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { crmSummary, listCrmEntries } from '@/lib/crm-client'

export const dynamic = 'force-dynamic'

/** Odczyt Finansów CRM-a przez Solvio — apka nie zna klucza CRM-a i nie ma
 *  go poznać; sekret zostaje na serwerze. */
export async function GET(req: Request) {
  const session = await getSession()
  if (!session?.userId) return NextResponse.json({ error: 'Brak autoryzacji' }, { status: 401 })

  const q = new URL(req.url).searchParams
  const type = q.get('type')
  const [entries, summary] = await Promise.all([
    listCrmEntries(session.userId, {
      from: q.get('from') ?? undefined,
      to: q.get('to') ?? undefined,
      type: type === 'INCOME' || type === 'EXPENSE' ? type : undefined,
      limit: Number(q.get('limit')) || 100,
    }),
    crmSummary(session.userId),
  ])

  if (!entries.ok) {
    return NextResponse.json({ error: entries.error ?? 'CRM niedostępny' }, { status: 502 })
  }
  return NextResponse.json({
    entries: entries.data?.entries ?? [],
    summary: summary.ok ? summary.data : null,
  })
}
