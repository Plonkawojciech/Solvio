import { NextResponse } from 'next/server'
import { listTodo } from '@/lib/crm/accounting'
import { fromCrm, requireUser } from '@/lib/crm/route-helpers'

export const dynamic = 'force-dynamic'

/** „Wymaga uwagi": wyjątki do rozstrzygnięcia. Tylko odczyt — rozwiązuje się je na webie. */
export async function GET() {
  const user = await requireUser()
  if (user instanceof NextResponse) return user

  return fromCrm(await listTodo(user), 'CRM niedostępny')
}
