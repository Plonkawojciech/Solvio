import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { listClients, listCommitments } from '@/lib/crm/finance'

export const dynamic = 'force-dynamic'

/**
 * Konteksty potrzebne do sensownej edycji wpisu: klienci (do przypisania)
 * i zobowiązania cykliczne (żeby było wiadomo, skąd bierze się koszt,
 * którego nikt ręcznie nie dodawał — CRM materializuje je co miesiąc).
 *
 * Jedno żądanie zamiast dwóch, bo apka potrzebuje obu naraz i nic z tego
 * nie zmienia się w trakcie edycji.
 */
export async function GET() {
  const session = await getSession()
  if (!session?.userId) return NextResponse.json({ error: 'Brak autoryzacji' }, { status: 401 })

  const [clients, commitments] = await Promise.all([
    listClients(session.userId),
    listCommitments(session.userId),
  ])

  if (!clients.ok && !commitments.ok) {
    return NextResponse.json({ error: clients.error ?? 'CRM niedostępny' }, { status: 502 })
  }
  // Częściowa awaria nie jest awarią całości: lista klientów bez zobowiązań
  // wciąż pozwala przypisać wpis.
  return NextResponse.json({
    clients: clients.data?.clients ?? [],
    commitments: commitments.data?.commitments ?? [],
  })
}
