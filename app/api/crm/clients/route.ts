import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient, listClients } from '@/lib/crm/registry'
import { fromCrm, readBody, requireUser } from '@/lib/crm/route-helpers'

export const dynamic = 'force-dynamic'

/** Klienci CRM-a — źródło MRR i adresat wpisów przychodowych. */
export async function GET() {
  const user = await requireUser()
  if (user instanceof NextResponse) return user

  return fromCrm(await listClients(user), 'CRM niedostępny')
}

const createSchema = z.object({
  name: z.string().trim().min(1, 'Podaj nazwę klienta').max(200),
  service: z.string().max(200).optional(),
  status: z.enum(['ACTIVE', 'IN_TALKS', 'AGREED', 'FINISHED']).optional(),
  monthlyFee: z.union([z.number(), z.string()]).optional(),
  projectValue: z.union([z.number(), z.string()]).optional(),
  contactName: z.string().max(200).optional(),
  phone: z.string().max(60).optional(),
  email: z.string().max(200).optional(),
  notes: z.string().max(4000).optional(),
})

export async function POST(req: Request) {
  const user = await requireUser()
  if (user instanceof NextResponse) return user

  const body = await readBody(req, createSchema)
  if (body instanceof NextResponse) return body

  return fromCrm(await createClient(user, body), 'CRM odrzucił klienta', 201)
}
