import { NextResponse } from 'next/server'
import { z } from 'zod'
import { deleteClient, updateClient } from '@/lib/crm/registry'
import { fromCrm, readBody, requireUser } from '@/lib/crm/route-helpers'

export const dynamic = 'force-dynamic'

const patchSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  service: z.string().max(200).optional(),
  status: z.enum(['ACTIVE', 'IN_TALKS', 'AGREED', 'FINISHED']).optional(),
  monthlyFee: z.union([z.number(), z.string()]).optional(),
  projectValue: z.union([z.number(), z.string()]).optional(),
  contactName: z.string().max(200).optional(),
  phone: z.string().max(60).optional(),
  email: z.string().max(200).optional(),
  notes: z.string().max(4000).optional(),
})

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser()
  if (user instanceof NextResponse) return user

  const body = await readBody(req, patchSchema)
  if (body instanceof NextResponse) return body

  const { id } = await params
  return fromCrm(await updateClient(user, id, body), 'CRM odrzucił zmianę')
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser()
  if (user instanceof NextResponse) return user

  const { id } = await params
  return fromCrm(await deleteClient(user, id), 'CRM odrzucił usunięcie')
}
