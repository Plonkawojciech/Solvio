import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createCommitment, listCommitments } from '@/lib/crm/registry'
import { fromCrm, readBody, requireUser } from '@/lib/crm/route-helpers'

export const dynamic = 'force-dynamic'

/** Zobowiązania cykliczne CRM-a — serie, z których co miesiąc powstaje wpis. */
export async function GET() {
  const user = await requireUser()
  if (user instanceof NextResponse) return user

  return fromCrm(await listCommitments(user), 'CRM niedostępny')
}

const createSchema = z.object({
  title: z.string().trim().min(1, 'Podaj tytuł').max(200),
  type: z.enum(['INCOME', 'EXPENSE']).default('EXPENSE'),
  amount: z.union([z.number(), z.string()]),
  category: z.string().max(100).optional(),
  note: z.string().max(2000).optional(),
  clientId: z.string().nullable().optional(),
  startDate: z.string().min(1, 'Podaj datę startu'),
  endDate: z.string().nullable().optional(),
  active: z.boolean().optional(),
  intervalMonths: z.number().int().min(1).max(120).optional(),
})

export async function POST(req: Request) {
  const user = await requireUser()
  if (user instanceof NextResponse) return user

  const body = await readBody(req, createSchema)
  if (body instanceof NextResponse) return body

  return fromCrm(await createCommitment(user, body), 'CRM odrzucił zobowiązanie', 201)
}
