import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/session'
import {
  deleteCrmConnection,
  getCrmConnectionView,
  saveCrmConnection,
  testCrmConnection,
} from '@/lib/crm/connection'

export const dynamic = 'force-dynamic'

/** Wpięcie CRM-a robi człowiek w apce, nie integracja — stąd sesja, nie klucz API. */
async function requireUser() {
  const session = await getSession()
  return session?.userId ?? null
}

export async function GET() {
  const userId = await requireUser()
  if (!userId) return NextResponse.json({ error: 'Brak autoryzacji' }, { status: 401 })
  return NextResponse.json(await getCrmConnectionView(userId))
}

const putSchema = z.object({
  baseUrl: z.string().url().optional(),
  apiKey: z.string().trim().min(10, 'Klucz wygląda na zbyt krótki').max(200),
  autoPush: z.boolean().optional(),
  defaultCategory: z.string().trim().max(100).optional(),
})

export async function PUT(req: Request) {
  const userId = await requireUser()
  if (!userId) return NextResponse.json({ error: 'Brak autoryzacji' }, { status: 401 })

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Nieprawidłowe żądanie' }, { status: 400 })
  }
  const parsed = putSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Nieprawidłowe dane' }, { status: 400 })
  }

  const conn = {
    baseUrl: (parsed.data.baseUrl ?? 'https://crm.programo.pl').replace(/\/+$/, ''),
    apiKey: parsed.data.apiKey,
    autoPush: parsed.data.autoPush ?? false,
    defaultCategory: parsed.data.defaultCategory || 'solvio',
  }

  // Sprawdzamy klucz PRZED zapisem — inaczej „połączono" znaczyłoby tylko
  // „zapisano tekst", a błąd wyszedłby dopiero przy pierwszym wydatku.
  const test = await testCrmConnection(conn)
  if (!test.ok) {
    return NextResponse.json(
      { error: `CRM odrzucił połączenie: ${test.error ?? 'nieznany błąd'}` },
      { status: test.status === 401 || test.status === 403 ? 400 : 502 },
    )
  }

  await saveCrmConnection(userId, conn)
  return NextResponse.json(await getCrmConnectionView(userId))
}

export async function DELETE() {
  const userId = await requireUser()
  if (!userId) return NextResponse.json({ error: 'Brak autoryzacji' }, { status: 401 })
  await deleteCrmConnection(userId)
  return NextResponse.json({ ok: true })
}
