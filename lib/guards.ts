import { redirect } from 'next/navigation'
import { getSession } from './session'
import { getProductType } from './product-type'

/**
 * Server-side guard: redirect business users away from personal-only pages.
 * Call at the top of any server component page that is personal-only.
 */
export async function requirePersonal() {
  const session = await getSession()
  if (!session?.userId) redirect('/login')
  const pt = await getProductType(session.userId)
  if (pt === 'business') redirect('/dashboard')
}

/**
 * Server-side guard: redirect personal users away from business-only pages.
 * Call at the top of any server component page that is business-only.
 */
export async function requireBusiness() {
  const session = await getSession()
  if (!session?.userId) redirect('/login')
  const pt = await getProductType(session.userId)
  if (pt === 'personal') redirect('/dashboard')
}
