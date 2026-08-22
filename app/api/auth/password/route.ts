import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/lib/db'
import { userCredentials } from '@/lib/db/schema'
import { hashPassword, verifyPassword } from '@/lib/password'
import { getSession } from '@/lib/session'
import { rateLimitPersistent } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

/**
 * Zmiana hasła zalogowanego użytkownika.
 *
 * Do tej pory apka nie miała jak zmienić hasła: pierwsze logowanie „zajmowało"
 * konto i to było jedyne miejsce, w którym hasło powstawało. Konto z pomyłkowo
 * ustawionym hasłem zostawało z nim na zawsze.
 *
 * Wymaga BIEŻĄCEGO hasła mimo aktywnej sesji — samo ciasteczko nie wystarczy,
 * bo przejęta sesja mogłaby wtedy przejąć konto na stałe.
 */
const schema = z.object({
  currentPassword: z.string().min(1, 'Podaj obecne hasło').max(200),
  newPassword: z.string().min(8, 'Nowe hasło musi mieć co najmniej 8 znaków').max(200),
})

export async function POST(req: Request) {
  const session = await getSession()
  if (!session?.userId) return NextResponse.json({ error: 'Brak autoryzacji' }, { status: 401 })

  // Zgadywanie obecnego hasła jest atakiem, więc limit jest ostry.
  const limit = await rateLimitPersistent(`auth:password:${session.userId}`, {
    maxRequests: 5,
    windowMs: 60 * 60 * 1000,
  })
  if (!limit.allowed) {
    return NextResponse.json({ error: 'Za dużo prób. Spróbuj za godzinę.' }, { status: 429 })
  }

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Nieprawidłowe żądanie' }, { status: 400 })
  }
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Nieprawidłowe dane' }, { status: 400 })
  }

  const [cred] = await db.select().from(userCredentials)
    .where(eq(userCredentials.userId, session.userId)).limit(1)
  if (!cred) {
    return NextResponse.json(
      { error: 'To konto nie ma jeszcze hasła — ustaw je przy logowaniu' },
      { status: 400 },
    )
  }

  const ok = await verifyPassword(parsed.data.currentPassword, cred.passwordHash)
  if (!ok) {
    return NextResponse.json({ error: 'Obecne hasło jest nieprawidłowe' }, { status: 401 })
  }

  await db.update(userCredentials)
    .set({ passwordHash: await hashPassword(parsed.data.newPassword) })
    .where(eq(userCredentials.userId, session.userId))

  console.log(`[auth] hasło zmienione dla ${session.userId}`)
  return NextResponse.json({ ok: true })
}
