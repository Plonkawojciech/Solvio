'use client'

import { motion } from 'framer-motion'
import { useTranslation } from '@/lib/i18n'
import { Button } from '@/components/ui/button'
import {
  CheckCircle2,
  Clock,
  XCircle,
  Copy,
  ExternalLink,
  ArrowRight,
  Loader2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import { useState } from 'react'

interface ItemBreakdown {
  itemName: string
  store: string
  date: string
  amount: number
  share: number
}

interface PaymentRequestData {
  id: string
  fromMemberId: string
  fromName: string
  fromColor: string
  toMemberId: string
  toName: string
  toColor: string
  amount: number
  currency: string
  status: string
  note: string | null
  shareToken: string | null
  bankAccount: string | null
  itemBreakdown: ItemBreakdown[] | null
  settledAt: string | null
  settledBy: string | null
  createdAt: string
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

function formatCurrency(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount)
  } catch {
    return `${amount.toFixed(2)} ${currency}`
  }
}

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  } catch {
    return dateStr
  }
}

function formatTime(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return ''
  }
}

interface PaymentRequestCardProps {
  request: PaymentRequestData
  currency: string
  groupName?: string
  groupEmoji?: string
  onMarkPaid?: () => void
  onCopyLink?: () => void
  isSettling?: boolean
  compact?: boolean
}

export function PaymentRequestCard({
  request,
  currency,
  groupName,
  groupEmoji,
  onMarkPaid,
  onCopyLink,
  isSettling,
  compact,
}: PaymentRequestCardProps) {
  const { t } = useTranslation()
  const [showBreakdown, setShowBreakdown] = useState(false)

  const isPending = request.status === 'pending'
  const isSettled = request.status === 'settled'


  const statusColor = isPending
    ? 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800'
    : isSettled
    ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800'
    : 'text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'

  const StatusIcon = isPending ? Clock : isSettled ? CheckCircle2 : XCircle

  return (
    <div
      className={`relative rounded-xl border overflow-hidden transition-all duration-200 hover:shadow-md ${
        isSettled ? 'opacity-75' : ''
      }`}
    >
      {/* Colored top accent */}
      <div
        className="h-1"
        style={{
          background: `linear-gradient(to right, ${request.fromColor}, ${request.toColor})`,
        }}
      />

      <div className="p-4 space-y-3">
        {/* Header: From -> To with status */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {/* From */}
            <div
              className="h-8 w-8 shrink-0 rounded-full flex items-center justify-center text-xs font-semibold text-white"
              style={{ backgroundColor: request.fromColor }}
              title={request.fromName}
            >
              {getInitials(request.fromName)}
            </div>

            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-sm font-medium truncate">{request.fromName}</span>
              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="text-sm font-medium truncate">{request.toName}</span>
            </div>

            {/* To */}
            <div
              className="h-8 w-8 shrink-0 rounded-full flex items-center justify-center text-xs font-semibold text-white"
              style={{ backgroundColor: request.toColor }}
              title={request.toName}
            >
              {getInitials(request.toName)}
            </div>
          </div>

          {/* Status badge */}
          <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border shrink-0 ${statusColor}`}
          >
            <StatusIcon className="h-3 w-3" />
            {isPending
              ? t('settlements.pending')
              : isSettled
              ? t('settlements.settled')
              : t('settlements.declined')}
          </span>
        </div>

        {/* Amount */}
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-2xl font-bold tabular-nums tracking-tight">
            {formatCurrency(request.amount, currency)}
          </p>
          {groupName && (
            <p className="text-xs text-muted-foreground truncate">
              {groupEmoji} {groupName}
            </p>
          )}
        </div>

        {/* Note */}
        {request.note && (
          <p className="text-sm text-muted-foreground bg-muted/50 rounded-lg px-3 py-2 italic">
            &ldquo;{request.note}&rdquo;
          </p>
        )}

        {/* Bank account */}
        {request.bankAccount && isPending && (
          <div className="flex items-center gap-2 text-xs bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg px-3 py-2">
            <span className="text-blue-600 dark:text-blue-400 font-medium">
              {t('settlements.bankAccount')}:
            </span>
            <span className="font-mono text-blue-800 dark:text-blue-300 select-all">
              {request.bankAccount}
            </span>
          </div>
        )}

        {/* Item breakdown toggle */}
        {request.itemBreakdown && request.itemBreakdown.length > 0 && (
          <div>
            <button
              type="button"
              onClick={() => setShowBreakdown(!showBreakdown)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {showBreakdown ? (
                <ChevronUp className="h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" />
              )}
              {t('settlements.breakdown')} ({request.itemBreakdown.length})
            </button>

            {showBreakdown && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="mt-2 space-y-1"
              >
                {request.itemBreakdown.map((item, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between text-xs px-3 py-1.5 rounded-lg bg-muted/30"
                  >
                    <div className="min-w-0">
                      <span className="font-medium">{item.itemName}</span>
                      {item.store && (
                        <span className="text-muted-foreground ml-1">({item.store})</span>
                      )}
                    </div>
                    <span className="font-medium tabular-nums shrink-0 ml-2">
                      {formatCurrency(item.share, currency)}
                    </span>
                  </div>
                ))}
              </motion.div>
            )}
          </div>
        )}

        {/* Dates */}
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
          <span>
            {t('settlements.createdAt')}: {formatDate(request.createdAt)}{' '}
            {formatTime(request.createdAt)}
          </span>
          {isSettled && request.settledAt && (
            <span>
              {t('settlements.settledAt')}: {formatDate(request.settledAt)}
            </span>
          )}
        </div>

        {/* Actions */}
        {!compact && (
          <div className="flex items-center gap-2 pt-1">
            {isPending && onMarkPaid && (
              <Button
                size="sm"
                className="h-8 text-xs gap-1"
                onClick={onMarkPaid}
                disabled={isSettling}
              >
                {isSettling ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-3 w-3" />
                )}
                {t('settlements.markPaid')}
              </Button>
            )}
            {onCopyLink && request.shareToken && (
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs gap-1"
                onClick={onCopyLink}
              >
                <Copy className="h-3 w-3" />
                {t('settlements.copyLink')}
              </Button>
            )}
            {request.shareToken && (
              <Button
                size="sm"
                variant="ghost"
                className="h-8 text-xs gap-1"
                asChild
              >
                <a
                  href={`/settlement/${request.id}?token=${request.shareToken}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ExternalLink className="h-3 w-3" />
                </a>
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
