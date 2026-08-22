import { NextResponse } from 'next/server'
import { z } from 'zod'
import { deleteCommitment, updateCommitment } from '@/lib/crm/registry'
import { fromCrm, readBody, requireUser } from '@/lib/crm/route-helpers'

export const dynamic = 'force-dynamic'

const patchSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  type: z.enum(['INCOME', 'EXPENSE']).optional(),
  amount: z.union([z.number(), z.string()]).optional(),
  category: z.string().max(100).optional(),
  note: z.string().max(2000).optional(),
  clientId: z.string().nullable().optional(),
  startDate: z.string().min(1).optional(),
  endDate: z.string().nullable().optional(),
  /** Wyłączenie serii zatrzymuje materializację, nie kasuje historii. */
  active: z.boolean().optional(),
  intervalMonths: z.number().int().min(1).max(120).optional(),
})

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser()
  if (user instanceof NextResponse) return user

  const body = await readBody(req, patchSchema)
  if (body instanceof NextResponse) return body

  const { id } = await params
  return fromCrm(await updateCommitment(user, id, body), 'CRM odrzucił zmianę')
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser()
  if (user instanceof NextResponse) return user

  const { id } = await params
  return fromCrm(await deleteCommitment(user, id), 'CRM odrzucił usunięcie')
}
