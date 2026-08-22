import { NextResponse } from 'next/server'
import { deleteBalance } from '@/lib/crm/registry'
import { fromCrm, requireUser } from '@/lib/crm/route-helpers'

export const dynamic = 'force-dynamic'

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser()
  if (user instanceof NextResponse) return user

  const { id } = await params
  return fromCrm(await deleteBalance(user, id), 'CRM odrzucił usunięcie')
}
