import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/session'
import { updateExpense } from '@/lib/expense-core'

export const dynamic = 'force-dynamic'

const schema = z.object({ ids: z.array(z.string().uuid()).min(1, 'Podaj co najmniej jedno id') })

/** Ręczne wypchnięcie wydatków do Finansów CRM-a. `updateExpense` zna już most,
 *  więc wystarczy poprosić go o push — dzięki temu nie ma drugiej ścieżki,
 *  która mogłaby się rozjechać z automatyczną. */
export async function POST(req: Request) {
  const session = await getSession()
  if (!session?.userId) return NextResponse.json({ error: 'Brak autoryzacji' }, { status: 401 })

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Nieprawidłowe żądanie' }, { status: 400 })
  }
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Nieprawidłowe dane' }, { status: 400 })
  }

  const results = []
  for (const id of parsed.data.ids) {
    const expense = await updateExpense(session.userId, id, { pushToCrm: true })
    results.push({ id, pushed: Boolean(expense?.crmEntryId), crmEntryId: expense?.crmEntryId ?? null })
  }
  const pushed = results.filter((r) => r.pushed).length
  return NextResponse.json({ ok: pushed > 0, pushed, results })
}
