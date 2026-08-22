import { NextResponse } from 'next/server'
import { getRequestAuth } from '@/lib/api-auth'
import { getReceipt } from '@/lib/receipt-core'
import { renderReceiptHtml } from '@/lib/receipts/render'

export const dynamic = 'force-dynamic'

/** Paragon wygenerowany z danych — do podglądu i do druku. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getRequestAuth(req)
  if (!auth) return NextResponse.json({ error: 'Brak autoryzacji' }, { status: 401 })

  const { id } = await params
  const receipt = await getReceipt(auth.userId, id)
  if (!receipt) return NextResponse.json({ error: 'Nie znaleziono paragonu' }, { status: 404 })

  return new Response(renderReceiptHtml(receipt), {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'private, no-store' },
  })
}
