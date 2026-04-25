'use client'

import { useState } from 'react'
import { CheckCircle2, Clock, XCircle, Copy, ArrowRight, Loader2 } from 'lucide-react'
import { formatAmount, formatDate } from '@/lib/format'

interface ItemBreakdown {
  itemName: string
  store: string
  date: string
  amount: number
  share: number
}

interface SettlementData {
  id: string
  fromName: string
  fromColor: string
  toName: string
  toColor: string
  amount: number
  currency: string
  status: string
  note: string | null
  bankAccount: string | null
  itemBreakdown: ItemBreakdown[] | null
  settledAt: string | null
  settledBy: string | null
  createdAt: string
  shareToken: string | null
  group: {
    name: string
    emoji: string | null
    currency: string
    mode: string
    startDate: string | null
    endDate: string | null
  } | null
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}


export function SettlementPageClient({
  data,
  hasValidToken,
  token,
}: {
  data: SettlementData
  hasValidToken: boolean
  token: string | null
}) {
  const [status, setStatus] = useState(data.status)
  const [marking, setMarking] = useState(false)
  const [showBreakdown, setShowBreakdown] = useState(false)

  const isPending = status === 'pending'
  const isSettled = status === 'settled'

  const handleMarkPaid = async () => {
    setMarking(true)
    try {
      const res = await fetch(`/api/settlement/${data.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, action: 'settle' }),
      })
      if (res.ok) {
        setStatus('settled')
      }
    } catch {
      // Silent fail
    } finally {
      setMarking(false)
    }
  }

  const handleCopy = (text: string) => {
    try {
      navigator.clipboard.writeText(text)
    } catch {
      const textArea = document.createElement('textarea')
      textArea.value = text
      document.body.appendChild(textArea)
      textArea.select()
      document.execCommand('copy')
      document.body.removeChild(textArea)
    }
  }

  if (!hasValidToken) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center">
          <div className="flex h-16 w-16 mx-auto items-center justify-center rounded-full bg-red-100 mb-4">
            <XCircle className="h-8 w-8 text-red-500" />
          </div>
          <h1 className="text-xl font-bold text-gray-900">Invalid link</h1>
          <p className="text-gray-500 mt-2">This settlement link is invalid or expired.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 py-8 px-4 print:bg-white print:py-0">
      <div className="max-w-md mx-auto">
        {/* Main card */}
        <div className="bg-white rounded-3xl shadow-xl overflow-hidden print:shadow-none print:rounded-none">
          {/* Gradient header */}
          <div
            className="px-8 py-10 text-center"
            style={{
              background: `linear-gradient(135deg, ${data.fromColor}dd, ${data.toColor}dd)`,
            }}
          >
            {/* Solvio branding */}
            <div className="flex items-center justify-center gap-2 mb-6">
              <div className="w-7 h-7 rounded-lg bg-white/20 flex items-center justify-center backdrop-blur-sm">
                <span className="text-white font-black text-xs">S</span>
              </div>
              <span className="text-white/80 text-xs font-light tracking-[0.2em] uppercase">
                Solvio
              </span>
            </div>

            {/* Group info */}
            {data.group && (
              <p className="text-white/60 text-xs tracking-[0.15em] uppercase mb-2">
                {data.group.emoji} {data.group.name}
                {data.group.mode === 'trip' && data.group.startDate && data.group.endDate && (
                  <span className="block mt-0.5 tracking-normal normal-case text-white/40">
                    {formatDate(data.group.startDate)} — {formatDate(data.group.endDate)}
                  </span>
                )}
              </p>
            )}

            <p className="text-white/50 text-[10px] tracking-[0.3em] uppercase mb-6">
              Payment Request
            </p>

            {/* Amount */}
            <p className="text-5xl font-black text-white tracking-tight tabular-nums">
              {formatAmount(data.amount, data.currency)}
            </p>

            {/* Status */}
            <div className="mt-4 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/15 backdrop-blur-sm">
              {isPending ? (
                <>
                  <Clock className="h-3.5 w-3.5 text-white/80" />
                  <span className="text-xs font-medium text-white/80">Pending</span>
                </>
              ) : isSettled ? (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5 text-white" />
                  <span className="text-xs font-medium text-white">Settled</span>
                </>
              ) : (
                <>
                  <XCircle className="h-3.5 w-3.5 text-white/80" />
                  <span className="text-xs font-medium text-white/80">Declined</span>
                </>
              )}
            </div>
          </div>

          {/* From -> To section */}
          <div className="px-8 py-6">
            <div className="flex items-center justify-between gap-4">
              {/* From */}
              <div className="flex flex-col items-center gap-2 flex-1">
                <div
                  className="h-14 w-14 rounded-full flex items-center justify-center text-lg font-bold text-white shadow-lg"
                  style={{
                    backgroundColor: data.fromColor,
                    boxShadow: `0 4px 14px ${data.fromColor}40`,
                  }}
                >
                  {getInitials(data.fromName)}
                </div>
                <div className="text-center">
                  <p className="text-sm font-semibold text-gray-900">{data.fromName}</p>
                  <p className="text-[10px] text-gray-500 uppercase tracking-wider">Owes</p>
                </div>
              </div>

              {/* Arrow */}
              <div className="flex flex-col items-center gap-1 shrink-0">
                <div
                  className="w-16 h-0.5 rounded-full"
                  style={{
                    background: `linear-gradient(to right, ${data.fromColor}, ${data.toColor})`,
                  }}
                />
                <ArrowRight className="h-5 w-5 text-gray-500" />
              </div>

              {/* To */}
              <div className="flex flex-col items-center gap-2 flex-1">
                <div
                  className="h-14 w-14 rounded-full flex items-center justify-center text-lg font-bold text-white shadow-lg"
                  style={{
                    backgroundColor: data.toColor,
                    boxShadow: `0 4px 14px ${data.toColor}40`,
                  }}
                >
                  {getInitials(data.toName)}
                </div>
                <div className="text-center">
                  <p className="text-sm font-semibold text-gray-900">{data.toName}</p>
                  <p className="text-[10px] text-gray-500 uppercase tracking-wider">Receives</p>
                </div>
              </div>
            </div>
          </div>

          {/* Divider */}
          <div className="px-6">
            <div className="border-t border-dashed border-gray-200" />
          </div>

          {/* Note */}
          {data.note && (
            <div className="px-8 py-4">
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-1.5">Message</p>
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-sm text-gray-700 italic">&ldquo;{data.note}&rdquo;</p>
              </div>
            </div>
          )}

          {/* Bank account */}
          {data.bankAccount && isPending && (
            <div className="px-8 py-4">
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-1.5">
                Bank account for transfer
              </p>
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 flex items-center justify-between gap-2">
                <span className="font-mono text-sm text-blue-800 select-all break-all">
                  {data.bankAccount}
                </span>
                <button
                  type="button"
                  onClick={() => handleCopy(data.bankAccount!)}
                  className="shrink-0 p-1.5 rounded-lg hover:bg-blue-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 transition-colors min-h-[36px] min-w-[36px] flex items-center justify-center"
                  aria-label="Copy bank account number to clipboard"
                >
                  <Copy className="h-4 w-4 text-blue-600" aria-hidden="true" />
                </button>
              </div>
            </div>
          )}

          {/* Item breakdown */}
          {data.itemBreakdown && data.itemBreakdown.length > 0 && (
            <div className="px-8 py-4">
              <button
                type="button"
                onClick={() => setShowBreakdown(!showBreakdown)}
                aria-expanded={showBreakdown}
                aria-controls="settlement-breakdown-list"
                aria-label={`${showBreakdown ? 'Hide' : 'Show'} item breakdown (${data.itemBreakdown.length} items)`}
                className="text-xs text-gray-500 uppercase tracking-wider mb-2 hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 rounded transition-colors cursor-pointer flex items-center gap-1"
              >
                Details ({data.itemBreakdown.length} items)
                <svg
                  className={`h-3 w-3 transition-transform ${showBreakdown ? 'rotate-180' : ''}`}
                  aria-hidden="true"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {showBreakdown && (
                <div id="settlement-breakdown-list" className="space-y-1.5">
                  {data.itemBreakdown.map((item, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between text-sm py-1.5 px-3 rounded-lg bg-gray-50"
                    >
                      <div>
                        <span className="text-gray-800">{item.itemName}</span>
                        {item.store && (
                          <span className="text-gray-500 text-xs ml-1">({item.store})</span>
                        )}
                      </div>
                      <span className="font-medium text-gray-900 tabular-nums">
                        {formatAmount(item.share, data.currency)}
                      </span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between text-sm font-semibold pt-2 border-t border-gray-200 px-3">
                    <span className="text-gray-600">Total</span>
                    <span className="text-gray-900 tabular-nums">
                      {formatAmount(
                        data.itemBreakdown.reduce((sum, i) => sum + i.share, 0),
                        data.currency
                      )}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Divider */}
          <div className="px-6">
            <div className="border-t border-dashed border-gray-200" />
          </div>

          {/* Date info */}
          <div className="px-8 py-4 text-center">
            <p className="text-xs text-gray-500">
              Created {formatDate(data.createdAt)}
            </p>
            {isSettled && data.settledAt && (
              <p className="text-xs text-emerald-600 mt-0.5">
                Settled {formatDate(data.settledAt)}
              </p>
            )}
          </div>

          {/* Action button */}
          {isPending && hasValidToken && (
            <div className="px-8 pb-6">
              <button
                onClick={handleMarkPaid}
                disabled={marking}
                className="w-full py-3.5 rounded-xl font-semibold text-white text-sm transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-60"
                style={{
                  background: `linear-gradient(135deg, ${data.fromColor}, ${data.toColor})`,
                  boxShadow: `0 4px 14px ${data.toColor}30`,
                }}
              >
                {marking ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
                {marking ? 'Marking...' : "I've paid this"}
              </button>
            </div>
          )}

          {/* Settled confirmation */}
          {isSettled && (
            <div className="px-8 pb-6">
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center">
                <CheckCircle2 className="h-6 w-6 text-emerald-600 mx-auto mb-2" />
                <p className="text-sm font-semibold text-emerald-800">Payment confirmed</p>
                <p className="text-xs text-emerald-600 mt-0.5">
                  This settlement has been marked as paid
                </p>
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="px-8 py-4 bg-gray-50 text-center">
            <p className="text-[10px] text-gray-500">
              ID: <span className="font-mono">{data.id.slice(0, 8)}...</span>
            </p>
            <p className="text-[10px] text-gray-500 mt-0.5">
              Powered by{' '}
              <a
                href="https://solvio-lac.vercel.app"
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-600 hover:underline font-medium"
              >
                Solvio
              </a>{' '}
              &bull; solvio-lac.vercel.app
            </p>
          </div>
        </div>

        {/* Actions below card — hidden on print */}
        <div className="mt-6 flex justify-center gap-3 print:hidden">
          <button
            type="button"
            onClick={() => window.print()}
            aria-label="Print this settlement receipt"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-gray-800 text-white text-sm font-medium hover:bg-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-800 focus-visible:ring-offset-2 transition-colors"
          >
            <svg className="w-4 h-4" aria-hidden="true" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"
              />
            </svg>
            Print
          </button>
          <a
            href="https://solvio-lac.vercel.app"
            aria-label="Open Solvio home page"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg border border-gray-200 bg-white text-gray-700 text-sm font-medium hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 focus-visible:ring-offset-2 transition-colors"
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
            .print\\:py-0 { padding-top: 0 !important; padding-bottom: 0 !important; }
          }
        `}</style>
      </div>
    </div>
  )
}
