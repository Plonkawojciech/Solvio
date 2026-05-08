'use client'

import { useState } from 'react'
import {
  ArrowRight,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Loader2,
  Printer,
  XCircle,
} from 'lucide-react'
import { formatAmount, formatDate } from '@/lib/format'
import { pluralizeEN, pluralizePL } from '@/lib/plural'

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

export interface SettlementPageLabels {
  invalidTitle: string
  invalidDescription: string
  paymentRequest: string
  pending: string
  settled: string
  declined: string
  owes: string
  receives: string
  message: string
  bankAccount: string
  copyBankAccount: string
  copied: string
  details: string
  total: string
  created: string
  settledAt: string
  markPaid: string
  marking: string
  paymentConfirmed: string
  paymentConfirmedDescription: string
  markFailed: string
  print: string
  openSolvio: string
  showBreakdown: string
  hideBreakdown: string
  poweredBy: string
  itemOne: string
  itemFew?: string
  itemMany?: string
  itemOther: string
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((word) => word[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

function softColor(hex: string, alpha: string): string {
  return `${hex}${alpha}`
}

export function SettlementPageClient({
  data,
  hasValidToken,
  token,
  lang,
  labels,
}: {
  data: SettlementData
  hasValidToken: boolean
  token: string | null
  lang: 'pl' | 'en'
  labels: SettlementPageLabels
}) {
  const [status, setStatus] = useState(data.status)
  const [marking, setMarking] = useState(false)
  const [showBreakdown, setShowBreakdown] = useState(false)
  const [copyState, setCopyState] = useState<'idle' | 'copied'>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const isPending = status === 'pending'
  const isSettled = status === 'settled'

  const breakdownCountLabel = (() => {
    const count = data.itemBreakdown?.length ?? 0
    return lang === 'pl'
      ? pluralizePL({
          count,
          one: labels.itemOne,
          few: labels.itemFew ?? labels.itemOther,
          many: labels.itemMany ?? labels.itemOther,
          other: labels.itemOther,
        })
      : pluralizeEN({
          count,
          one: labels.itemOne,
          other: labels.itemOther,
        })
  })()

  const handleMarkPaid = async () => {
    setMarking(true)
    setErrorMessage(null)

    try {
      const response = await fetch(`/api/settlement/${data.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, action: 'settle' }),
      })

      if (!response.ok) {
        setErrorMessage(labels.markFailed)
        return
      }

      setStatus('settled')
    } catch {
      setErrorMessage(labels.markFailed)
    } finally {
      setMarking(false)
    }
  }

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopyState('copied')
      window.setTimeout(() => setCopyState('idle'), 2000)
    } catch {
      const textArea = document.createElement('textarea')
      textArea.value = text
      document.body.appendChild(textArea)
      textArea.select()
      document.execCommand('copy')
      document.body.removeChild(textArea)
      setCopyState('copied')
      window.setTimeout(() => setCopyState('idle'), 2000)
    }
  }

  if (!hasValidToken) {
    return (
      <div className="min-h-screen bg-background px-4 py-10 text-foreground">
        <div className="mx-auto flex max-w-md items-center justify-center">
          <div className="w-full rounded-3xl border border-border bg-card p-8 text-center shadow-lg">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <XCircle className="h-8 w-8" aria-hidden="true" />
            </div>
            <h1 className="text-xl font-bold">{labels.invalidTitle}</h1>
            <p className="mt-2 text-sm text-muted-foreground">{labels.invalidDescription}</p>
            <a
              href="https://solvio-lac.vercel.app"
              className="mt-6 inline-flex min-h-[44px] items-center justify-center rounded-xl border border-border bg-foreground px-5 py-3 text-sm font-semibold text-background transition-colors hover:bg-foreground/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {labels.openSolvio}
            </a>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background px-4 py-8 text-foreground print:bg-white print:py-0">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 overflow-hidden print:hidden"
      >
        <div className="absolute left-[-8rem] top-[-6rem] h-64 w-64 rounded-full blur-3xl opacity-20" style={{ backgroundColor: softColor(data.fromColor, '55') }} />
        <div className="absolute bottom-[-7rem] right-[-5rem] h-72 w-72 rounded-full blur-3xl opacity-15" style={{ backgroundColor: softColor(data.toColor, '55') }} />
      </div>

      <div className="relative mx-auto max-w-md">
        <div className="overflow-hidden rounded-[2rem] border border-border bg-card shadow-xl print:rounded-none print:border-0 print:shadow-none">
          <div
            className="px-8 py-10 text-center text-white"
            style={{
              background: `linear-gradient(145deg, ${data.fromColor}, ${data.toColor})`,
            }}
          >
            <div className="mb-6 flex items-center justify-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/15 font-black backdrop-blur-sm">
                S
              </div>
              <span className="text-xs uppercase tracking-[0.22em] text-white/80">Solvio</span>
            </div>

            {data.group && (
              <p className="mb-2 text-xs uppercase tracking-[0.16em] text-white/75">
                {data.group.emoji ? `${data.group.emoji} ` : ''}
                {data.group.name}
                {data.group.mode === 'trip' && data.group.startDate && data.group.endDate && (
                  <span className="mt-1 block normal-case tracking-normal text-white/55">
                    {formatDate(data.group.startDate)} - {formatDate(data.group.endDate)}
                  </span>
                )}
              </p>
            )}

            <p className="mb-6 text-[11px] uppercase tracking-[0.28em] text-white/60">
              {labels.paymentRequest}
            </p>

            <p className="text-5xl font-black tracking-tight tabular-nums">
              {formatAmount(data.amount, data.currency)}
            </p>

            <div className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 backdrop-blur-sm">
              {isPending ? (
                <>
                  <Clock className="h-3.5 w-3.5 text-white/80" aria-hidden="true" />
                  <span className="text-xs font-medium text-white/85">{labels.pending}</span>
                </>
              ) : isSettled ? (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5 text-white" aria-hidden="true" />
                  <span className="text-xs font-medium text-white">{labels.settled}</span>
                </>
              ) : (
                <>
                  <XCircle className="h-3.5 w-3.5 text-white/80" aria-hidden="true" />
                  <span className="text-xs font-medium text-white/85">{labels.declined}</span>
                </>
              )}
            </div>
          </div>

          <div className="px-8 py-6">
            <div className="flex items-center justify-between gap-4">
              <div className="flex flex-1 flex-col items-center gap-2">
                <div
                  className="flex h-14 w-14 items-center justify-center rounded-full text-lg font-bold text-white shadow-lg"
                  style={{
                    backgroundColor: data.fromColor,
                    boxShadow: `0 12px 28px ${softColor(data.fromColor, '33')}`,
                  }}
                >
                  {getInitials(data.fromName)}
                </div>
                <div className="text-center">
                  <p className="text-sm font-semibold text-foreground">{data.fromName}</p>
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                    {labels.owes}
                  </p>
                </div>
              </div>

              <div className="flex shrink-0 flex-col items-center gap-1">
                <div
                  className="h-0.5 w-16 rounded-full"
                  style={{
                    background: `linear-gradient(to right, ${data.fromColor}, ${data.toColor})`,
                  }}
                />
                <ArrowRight className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
              </div>

              <div className="flex flex-1 flex-col items-center gap-2">
                <div
                  className="flex h-14 w-14 items-center justify-center rounded-full text-lg font-bold text-white shadow-lg"
                  style={{
                    backgroundColor: data.toColor,
                    boxShadow: `0 12px 28px ${softColor(data.toColor, '33')}`,
                  }}
                >
                  {getInitials(data.toName)}
                </div>
                <div className="text-center">
                  <p className="text-sm font-semibold text-foreground">{data.toName}</p>
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                    {labels.receives}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="px-6">
            <div className="border-t border-dashed border-border" />
          </div>

          {data.note && (
            <div className="px-8 py-4">
              <p className="mb-1.5 text-xs uppercase tracking-wider text-muted-foreground">
                {labels.message}
              </p>
              <div className="rounded-2xl border border-border bg-muted/40 p-4">
                <p className="text-sm italic text-foreground/85">&ldquo;{data.note}&rdquo;</p>
              </div>
            </div>
          )}

          {data.bankAccount && isPending && (
            <div className="px-8 py-4">
              <p className="mb-1.5 text-xs uppercase tracking-wider text-muted-foreground">
                {labels.bankAccount}
              </p>
              <div className="flex items-center justify-between gap-2 rounded-2xl border border-border bg-muted/40 p-3">
                <span className="select-all break-all font-mono text-sm text-foreground">
                  {data.bankAccount}
                </span>
                <button
                  type="button"
                  onClick={() => handleCopy(data.bankAccount!)}
                  className="flex min-h-[40px] min-w-[40px] shrink-0 items-center justify-center rounded-xl border border-border bg-background text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  aria-label={labels.copyBankAccount}
                >
                  {copyState === 'copied' ? (
                    <Check className="h-4 w-4 text-emerald-600" aria-hidden="true" />
                  ) : (
                    <Copy className="h-4 w-4" aria-hidden="true" />
                  )}
                </button>
              </div>
              <p className="mt-2 text-xs text-muted-foreground" aria-live="polite">
                {copyState === 'copied' ? labels.copied : ''}
              </p>
            </div>
          )}

          {data.itemBreakdown && data.itemBreakdown.length > 0 && (
            <div className="px-8 py-4">
              <button
                type="button"
                onClick={() => setShowBreakdown((value) => !value)}
                aria-expanded={showBreakdown}
                aria-controls="settlement-breakdown-list"
                aria-label={`${showBreakdown ? labels.hideBreakdown : labels.showBreakdown}: ${breakdownCountLabel}`}
                className="mb-2 flex min-h-[44px] items-center gap-1 rounded-lg text-xs uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                {labels.details} ({breakdownCountLabel})
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
                  {data.itemBreakdown.map((item, index) => (
                    <div
                      key={`${item.itemName}-${item.share}-${index}`}
                      className="flex items-center justify-between rounded-2xl border border-border bg-muted/35 px-3 py-2 text-sm"
                    >
                      <div className="min-w-0">
                        <span className="text-foreground">{item.itemName}</span>
                        {item.store && (
                          <span className="ml-1 text-xs text-muted-foreground">
                            ({item.store})
                          </span>
                        )}
                      </div>
                      <span className="font-medium tabular-nums text-foreground">
                        {formatAmount(item.share, data.currency)}
                      </span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between border-t border-border px-3 pt-3 text-sm font-semibold">
                    <span className="text-muted-foreground">{labels.total}</span>
                    <span className="tabular-nums text-foreground">
                      {formatAmount(
                        data.itemBreakdown.reduce((sum, item) => sum + item.share, 0),
                        data.currency,
                      )}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="px-6">
            <div className="border-t border-dashed border-border" />
          </div>

          <div className="px-8 py-4 text-center">
            <p className="text-xs text-muted-foreground">
              {labels.created} {formatDate(data.createdAt)}
            </p>
            {isSettled && data.settledAt && (
              <p className="mt-0.5 text-xs text-emerald-600">
                {labels.settledAt} {formatDate(data.settledAt)}
              </p>
            )}
          </div>

          {errorMessage && (
            <div className="px-8 pb-2">
              <div className="rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {errorMessage}
              </div>
            </div>
          )}

          {isPending && hasValidToken && (
            <div className="px-8 pb-6">
              <button
                type="button"
                onClick={handleMarkPaid}
                disabled={marking}
                className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl px-5 py-3 text-sm font-semibold text-white transition-opacity disabled:opacity-65"
                style={{
                  background: `linear-gradient(145deg, ${data.fromColor}, ${data.toColor})`,
                  boxShadow: `0 12px 28px ${softColor(data.toColor, '33')}`,
                }}
              >
                {marking ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                )}
                {marking ? labels.marking : labels.markPaid}
              </button>
            </div>
          )}

          {isSettled && (
            <div className="px-8 pb-6">
              <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/10 p-4 text-center">
                <CheckCircle2 className="mx-auto mb-2 h-6 w-6 text-emerald-600" aria-hidden="true" />
                <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                  {labels.paymentConfirmed}
                </p>
                <p className="mt-0.5 text-xs text-emerald-700/80 dark:text-emerald-400/80">
                  {labels.paymentConfirmedDescription}
                </p>
              </div>
            </div>
          )}

          <div className="bg-muted/25 px-8 py-4 text-center">
            <p className="text-[10px] text-muted-foreground">
              ID: <span className="font-mono text-foreground">{data.id.slice(0, 8)}...</span>
            </p>
            <p className="mt-0.5 text-[10px] text-muted-foreground">
              {labels.poweredBy}{' '}
              <a
                href="https://solvio-lac.vercel.app"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-foreground hover:underline"
              >
                Solvio
              </a>
            </p>
          </div>
        </div>

        <div className="mt-6 flex justify-center gap-3 print:hidden">
          <button
            type="button"
            onClick={() => window.print()}
            aria-label={labels.print}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-colors hover:bg-foreground/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <Printer className="h-4 w-4" aria-hidden="true" />
            {labels.print}
          </button>
          <a
            href="https://solvio-lac.vercel.app"
            aria-label={labels.openSolvio}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-border bg-card px-5 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            {labels.openSolvio}
          </a>
        </div>

        <style>{`
          @media print {
            body { margin: 0; }
            .print\\:hidden { display: none !important; }
            .print\\:shadow-none { box-shadow: none !important; }
            .print\\:rounded-none { border-radius: 0 !important; }
            .print\\:py-0 { padding-top: 0 !important; padding-bottom: 0 !important; }
          }
        `}</style>
      </div>
    </div>
  )
}
