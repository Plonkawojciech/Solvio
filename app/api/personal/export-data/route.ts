import { auth } from '@/lib/auth-compat'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { expenses, receipts, categories, categoryBudgets, userSettings, monthlyBudgets } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { rateLimitPersistent } from '@/lib/rate-limit'

/**
 * GET /api/personal/export-data
 *
 * Streams the user's full data dump as a single JSON object using a
 * `ReadableStream`. Round-2 perf change: previously this route ran
 * 6 parallel SELECTs, then built a string with `JSON.stringify(.., null, 2)`
 * and returned it in one buffer. For heavy users that's multiple MB held
 * in serverless function memory plus a long TTFB while the whole dump
 * is rendered.
 *
 * Now: tables are fetched and serialised one at a time, each row pushed
 * to the stream as compact JSON separated by commas. `Transfer-Encoding:
 * chunked` lets the browser/iOS start writing to disk as bytes arrive.
 * Memory footprint becomes the size of one table at a time, not all six.
 *
 * Output is still a single valid JSON object — `JSON.parse(blob)` works
 * exactly as before.
 */
export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const rl = await rateLimitPersistent(`export-data:${userId}`, { maxRequests: 3, windowMs: 60 * 60 * 1000 })
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too many export requests. Try again later.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
    )
  }

  // Define what gets exported, in order. Each entry is a key in the
  // output object plus a thunk that returns the rows. We don't await
  // the thunks here — we hold them so the stream can drive when each
  // SELECT runs, freeing the previous batch's rows for GC before
  // pulling the next.
  const sections: Array<{
    key: string
    fetch: () => Promise<unknown[]>
    arrayShape: boolean
  }> = [
    { key: 'expenses', arrayShape: true, fetch: () =>
      db.select().from(expenses).where(eq(expenses.userId, userId)) as unknown as Promise<unknown[]>
    },
    // Skip rawOcr at the SELECT level — for heavy users it's MBs of
    // OCR JSON we'd just throw away post-fetch.
    { key: 'receipts', arrayShape: true, fetch: () =>
      db.select({
        id: receipts.id,
        userId: receipts.userId,
        vendor: receipts.vendor,
        date: receipts.date,
        total: receipts.total,
        currency: receipts.currency,
        imageUrl: receipts.imageUrl,
        items: receipts.items,
        status: receipts.status,
        hash: receipts.hash,
        groupId: receipts.groupId,
        paidByMemberId: receipts.paidByMemberId,
        exchangeRate: receipts.exchangeRate,
        detectedLanguage: receipts.detectedLanguage,
        createdAt: receipts.createdAt,
      }).from(receipts).where(eq(receipts.userId, userId)) as unknown as Promise<unknown[]>
    },
    { key: 'categories', arrayShape: true, fetch: () =>
      db.select().from(categories).where(eq(categories.userId, userId)) as unknown as Promise<unknown[]>
    },
    { key: 'categoryBudgets', arrayShape: true, fetch: () =>
      db.select().from(categoryBudgets).where(eq(categoryBudgets.userId, userId)) as unknown as Promise<unknown[]>
    },
    { key: 'monthlyBudgets', arrayShape: true, fetch: () =>
      db.select().from(monthlyBudgets).where(eq(monthlyBudgets.userId, userId)) as unknown as Promise<unknown[]>
    },
    // settings is a single object, not an array — special-cased below.
    { key: 'settings', arrayShape: false, fetch: () =>
      db.select().from(userSettings).where(eq(userSettings.userId, userId)) as unknown as Promise<unknown[]>
    },
  ]

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      try {
        // Header + non-row metadata.
        controller.enqueue(encoder.encode(
          `{"exportedAt":${JSON.stringify(new Date().toISOString())},"version":"1.0"`
        ))

        for (const section of sections) {
          const rows = await section.fetch()

          if (section.arrayShape) {
            controller.enqueue(encoder.encode(`,"${section.key}":[`))
            // Write rows one at a time so we never hold a big serialised
            // string in memory. JSON.stringify per-row is O(rowSize),
            // not O(totalDumpSize).
            for (let i = 0; i < rows.length; i++) {
              const sep = i === 0 ? '' : ','
              controller.enqueue(encoder.encode(sep + JSON.stringify(rows[i])))
            }
            controller.enqueue(encoder.encode(']'))
          } else {
            // Single-object section (settings). LIMIT 1 semantically.
            const single = rows[0] ?? null
            controller.enqueue(encoder.encode(
              `,"${section.key}":${JSON.stringify(single)}`
            ))
          }
        }

        controller.enqueue(encoder.encode('}'))
        controller.close()
      } catch (err) {
        console.error('[export-data GET]', err)
        // Best-effort error: emit a closing brace + error key so the
        // payload stays valid JSON, then close. Client sees an object
        // with a partial dump + `error: "..."`.
        try {
          controller.enqueue(encoder.encode(`,"error":${JSON.stringify((err as Error).message || 'export failed')}}`))
          controller.close()
        } catch {
          controller.error(err as Error)
        }
      }
    },
  })

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="solvio-export-${new Date().toISOString().slice(0, 10)}.json"`,
      // Defense-in-depth: tell intermediaries this is per-user data and
      // not to cache it.
      'Cache-Control': 'private, no-store',
    },
  })
}
