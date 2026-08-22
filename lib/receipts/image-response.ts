import { NextResponse } from 'next/server'
import { getRequestAuth } from '@/lib/api-auth'
import { receiptImageKey } from '@/lib/receipt-core'
import { readImage } from './storage'

/**
 * Zdjęcie paragonu. Jedna implementacja dla trasy sesyjnej i kluczowej —
 * plik wychodzi wyłącznie do właściciela, więc autoryzacja jest tu, a nie
 * w warstwie plików.
 */
export async function receiptImageResponse(req: Request, id: string): Promise<Response> {
  const auth = await getRequestAuth(req)
  if (!auth) return NextResponse.json({ error: 'Brak autoryzacji' }, { status: 401 })

  const key = await receiptImageKey(auth.userId, id)
  if (!key) return NextResponse.json({ error: 'Paragon nie ma zdjęcia' }, { status: 404 })

  const found = await readImage(key)
  if (!found) return NextResponse.json({ error: 'Zdjęcia nie ma w magazynie' }, { status: 404 })
  if (found.kind === 'redirect') return NextResponse.redirect(found.url)

  return new Response(new Uint8Array(found.image.buffer), {
    headers: {
      'Content-Type': found.image.contentType,
      'Content-Length': String(found.image.buffer.length),
      // Zdjęcie paragonu nigdy się nie zmienia, ale jest prywatne —
      // cache tylko w przeglądarce właściciela.
      'Cache-Control': 'private, max-age=31536000, immutable',
    },
  })
}
