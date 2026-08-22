import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createBalance, listBalances } from '@/lib/crm/registry'
import { fromCrm, readBody, requireUser } from '@/lib/crm/route-helpers'

export const dynamic = 'force-dynamic'

/** Stan konta: ręczne odczyty plus oś czasu wyliczona przez CRM. */
export async function GET(req: Request) {
  const user = await requireUser()
  if (user instanceof NextResponse) return user

  const q = new URL(req.url).searchParams
  const months = Number(q.get('months')) || 6
  const forward = Number(q.get('forward')) || 3
  return fromCrm(await listBalances(user, months, forward), 'CRM niedostępny')
}

const createSchema = z.object({
  at: z.string().min(1, 'Podaj datę odczytu'),
  amount: z.union([z.number(), z.string()]),
  note: z.string().max(500).optional(),
})

export async function POST(req: Request) {
  const user = await requireUser()
  if (user instanceof NextResponse) return user

  const body = await readBody(req, createSchema)
  if (body instanceof NextResponse) return body

  return fromCrm(await createBalance(user, body), 'CRM odrzucił odczyt', 201)
}
