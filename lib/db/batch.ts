import { db } from './index'

type Executor = typeof db

/**
 * Wspólny odpowiednik `db.batch([...])` dla obu driverów bazy.
 *
 * Powód istnienia: żaden driver nie ma obu mechanizmów naraz.
 *  - Neon HTTP  — ma `db.batch()` (jeden pipelined POST, statementy lecą
 *    w jednej transakcji), ale `db.transaction()` rzuca wyjątkiem
 *    ("No transactions support in neon-http driver").
 *  - node-postgres (self-host, Docker/Coolify) — jest odwrotnie: ma
 *    prawdziwe `db.transaction()`, a `db.batch()` w ogóle nie istnieje.
 *
 * Warstwa `db` jest typowana po stronie Neona (patrz rzutowanie w
 * `lib/db/index.ts`), więc TypeScript NIE złapie wywołania `db.batch()`
 * na zwykłym Postgresie — poleciałoby dopiero w runtime jako
 * "db.batch is not a function". Dlatego wszystkie miejsca wsadowe idą
 * przez ten helper.
 *
 * Atomowość jest zachowana na obu driverach: batch na Neonie, transakcja
 * na pg. Statementy buduje callback, bo na pg muszą powstać z obiektu
 * transakcji, a nie z globalnego `db`.
 *
 * Użycie:
 *   const [cats, settings] = await dbBatch((x) => [
 *     x.select().from(categories).where(eq(categories.userId, userId)),
 *     x.select().from(userSettings).where(eq(userSettings.userId, userId)),
 *   ], { atomic: false })   // atomic: false dla czystych odczytów
 */
export async function dbBatch<T extends readonly [unknown, ...unknown[]]>(
  build: (x: Executor) => T,
  opts: { atomic?: boolean } = {},
): Promise<{ [K in keyof T]: Awaited<T[K]> }> {
  const atomic = opts.atomic ?? true
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = db as any

  // Neon: jeden pipelined POST niezależnie od atomic — i tak jest najtaniej.
  if (typeof client.batch === 'function') {
    return client.batch(build(db))
  }

  // pg, odczyty: transakcja niczego tu nie kupuje, a serializuje zapytania.
  // Pool trzyma otwarte połączenia, więc równolegle jest po prostu szybciej.
  if (!atomic) {
    return Promise.all(build(db)) as Promise<{ [K in keyof T]: Awaited<T[K]> }>
  }

  // pg, zapisy: prawdziwa transakcja — wszystko albo nic.
  return client.transaction(async (tx: Executor) => {
    const results: unknown[] = []
    for (const statement of build(tx)) {
      results.push(await statement)
    }
    return results
  })
}
