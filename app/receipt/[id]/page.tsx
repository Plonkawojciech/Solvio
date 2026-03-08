import { db } from '@/lib/db'
import { receipts } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { notFound } from 'next/navigation'

export const dynamic = 'force-dynamic'

type ReceiptItem = {
  name: string
  quantity?: number | null
  price?: number | null
  category_id?: string | null
}

function formatCurrency(amount: number | string | null | undefined, currency: string): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : (amount ?? 0)
  if (isNaN(num)) return `0.00 ${currency}`
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || 'PLN',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(num)
  } catch {
    return `${num.toFixed(2)} ${currency}`
  }
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  } catch {
    return dateStr
  }
}

export default async function SharedReceiptPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const [receipt] = await db.select().from(receipts).where(eq(receipts.id, id))
  if (!receipt) notFound()

  const items: ReceiptItem[] = Array.isArray(receipt.items)
    ? (receipt.items as ReceiptItem[])
    : []

  const total = receipt.total ? parseFloat(String(receipt.total)) : null
  const currency = receipt.currency || 'PLN'
  const itemsSubtotal = items.reduce((sum, item) => sum + (item.price ?? 0), 0)

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4 print:bg-white print:py-0">
      <div className="max-w-lg mx-auto">

        {/* Receipt card */}
        <div
          className="bg-white rounded-2xl shadow-xl overflow-hidden print:shadow-none print:rounded-none"
          style={{ fontFamily: "'Courier New', Courier, monospace" }}
        >
          {/* Header */}
          <div className="bg-gradient-to-br from-slate-800 to-slate-900 text-white px-8 py-8 text-center print:bg-none print:text-black">
            <div className="flex items-center justify-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center">
                <span className="text-white font-black text-sm">S</span>
              </div>
              <span className="text-white/80 text-sm font-light tracking-widest uppercase">Solvio</span>
            </div>
            <p className="text-white/50 text-xs tracking-[0.3em] uppercase mb-4">Digital Receipt</p>
            <h1 className="text-3xl font-bold text-white tracking-tight">
              {receipt.vendor || 'Receipt'}
            </h1>
            <p className="text-white/60 text-sm mt-2">{formatDate(receipt.date)}</p>
          </div>

          {/* Divider with scissors */}
          <div className="relative flex items-center px-6 py-0">
            <div className="flex-1 border-t-2 border-dashed border-gray-200" />
            <div className="px-3 text-gray-300 text-lg select-none">✂</div>
            <div className="flex-1 border-t-2 border-dashed border-gray-200" />
          </div>

          {/* Items */}
          <div className="px-8 py-6">
            {items.length > 0 ? (
              <>
                {/* Column headers */}
                <div className="flex items-center justify-between text-xs text-gray-400 uppercase tracking-wider mb-3 pb-2 border-b border-dashed border-gray-200">
                  <span className="flex-1">Item</span>
                  <span className="w-12 text-center">Qty</span>
                  <span className="w-24 text-right">Price</span>
                </div>

                {/* Items list */}
                <div className="space-y-2">
                  {items.map((item, i) => {
                    const qty = item.quantity ?? 1
                    const price = item.price ?? 0
                    const unitPrice = qty > 1 ? price / qty : null

                    return (
                      <div key={i} className="group">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="flex-1 text-sm text-gray-800 leading-tight">
                            {item.name}
                          </span>
                          <span className="w-12 text-center text-sm text-gray-500 shrink-0">
                            {qty !== 1 ? `×${qty}` : '1'}
                          </span>
                          <span className="w-24 text-right text-sm font-medium text-gray-900 shrink-0">
                            {formatCurrency(price, currency)}
                          </span>
                        </div>
                        {unitPrice !== null && qty > 1 && (
                          <div className="text-xs text-gray-400 pl-0 mt-0.5">
                            {formatCurrency(unitPrice, currency)} each
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>

                {/* Totals */}
                <div className="mt-6 pt-4 border-t-2 border-dashed border-gray-200 space-y-2">
                  <div className="flex justify-between text-sm text-gray-600">
                    <span>Subtotal ({items.length} items)</span>
                    <span>{formatCurrency(itemsSubtotal, currency)}</span>
                  </div>
                  {total !== null && Math.abs(total - itemsSubtotal) > 0.005 && (
                    <div className="flex justify-between text-sm text-gray-600">
                      <span>Other charges / rounding</span>
                      <span>{formatCurrency(total - itemsSubtotal, currency)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-base font-bold text-gray-900 pt-2 border-t border-gray-200">
                    <span className="tracking-wide uppercase text-sm">Total</span>
                    <span className="text-lg">{formatCurrency(total ?? itemsSubtotal, currency)}</span>
                  </div>
                </div>
              </>
            ) : (
              <div className="py-8 text-center">
                <p className="text-gray-400 text-sm">No itemized data available</p>
                {total !== null && (
                  <div className="mt-4 flex justify-between text-base font-bold text-gray-900">
                    <span className="uppercase text-sm tracking-wide">Total</span>
                    <span className="text-lg">{formatCurrency(total, currency)}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Receipt image (if available) */}
          {receipt.imageUrl && (
            <div className="px-8 pb-4">
              <p className="text-xs text-gray-400 uppercase tracking-wider mb-2">Receipt Image</p>
              <div className="rounded-lg overflow-hidden border border-gray-100">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={receipt.imageUrl}
                  alt="Receipt image"
                  className="w-full object-cover max-h-64"
                />
              </div>
            </div>
          )}

          {/* Divider */}
          <div className="relative flex items-center px-6">
            <div className="flex-1 border-t-2 border-dashed border-gray-200" />
          </div>

          {/* Footer */}
          <div className="px-8 py-6 text-center space-y-1">
            <p className="text-xs text-gray-400">
              Receipt ID: <span className="font-mono text-gray-500">{id.slice(0, 8)}...</span>
            </p>
            <p className="text-xs text-gray-400">
              Generated by{' '}
              <a
                href="https://solvio-lac.vercel.app"
                target="_blank"
                rel="noopener noreferrer"
                className="text-slate-600 hover:underline font-medium print:no-underline"
              >
                Solvio
              </a>{' '}
              &bull; solvio-lac.vercel.app
            </p>
          </div>
        </div>

        {/* Actions — hidden on print */}
        <div className="mt-6 flex justify-center gap-3 print:hidden">
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-slate-800 text-white text-sm font-medium hover:bg-slate-700 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            Print receipt
          </button>

          <a
            href="https://solvio-lac.vercel.app"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg border border-slate-200 bg-white text-slate-700 text-sm font-medium hover:bg-slate-50 transition-colors"
          >
            Open Solvio
          </a>
        </div>

        {/* Print styles */}
        <style>{`
          @media print {
            body { margin: 0; }
            .print\\:hidden { display: none !important; }
            .print\\:bg-white { background-color: white !important; }
            .print\\:shadow-none { box-shadow: none !important; }
            .print\\:rounded-none { border-radius: 0 !important; }
            .print\\:bg-none { background: none !important; }
            .print\\:text-black { color: black !important; }
            .print\\:py-0 { padding-top: 0 !important; padding-bottom: 0 !important; }
            .print\\:no-underline { text-decoration: none !important; }
          }
        `}</style>
      </div>
    </div>
  )
}
