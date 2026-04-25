'use client'

import { useEffect, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTranslation } from '@/lib/i18n'
import { Skeleton } from '@/components/ui/skeleton'
import { ChevronDown, ChevronUp, Receipt, Calendar } from 'lucide-react'

const MEMBER_COLORS = [
  '#6366f1', '#ec4899', '#f59e0b', '#10b981',
  '#3b82f6', '#8b5cf6', '#ef4444', '#14b8a6',
]

interface GroupMember {
  id: string
  name: string
  email?: string | null
  color?: string | null
}

interface TimelineReceipt {
  id: string
  vendor: string | null
  date: string | null
  total: string | number | null
  currency: string
  paidByMemberId: string | null
  totalItemCount: number
  assignedItemCount: number
}

interface DayData {
  date: string
  receipts: TimelineReceipt[]
  total: number
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

function formatDateFull(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString(undefined, {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    })
  } catch {
    return dateStr
  }
}


interface TripTimelineProps {
  groupId: string
  startDate: string | null
  endDate: string | null
  currency: string
  members: GroupMember[]
}

export function TripTimeline({
  groupId,
  startDate,
  endDate,
  currency,
  members,
}: TripTimelineProps) {
  const { t } = useTranslation()
  const [receipts, setReceipts] = useState<TimelineReceipt[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set())

  const fetchReceipts = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/groups/${groupId}/receipts`)
      if (!res.ok) throw new Error('Failed')
      const data = await res.json()
      setReceipts(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (data.receipts || []).map((r: any) => ({
          id: r.id,
          vendor: r.vendor,
          date: r.date,
          total: r.total,
          currency: r.currency || currency,
          paidByMemberId: r.paidByMemberId,
          totalItemCount: r.totalItemCount || 0,
          assignedItemCount: r.assignedItemCount || 0,
        }))
      )
    } catch {
      // Silently fail
    } finally {
      setLoading(false)
    }
  }, [groupId, currency])

  useEffect(() => {
    fetchReceipts()
  }, [fetchReceipts])

  // Build timeline days
  const days: DayData[] = (() => {
    if (!startDate || !endDate) {
      // No trip dates, group by receipt dates
      const byDate: Record<string, TimelineReceipt[]> = {}
      for (const r of receipts) {
        const d = r.date || 'unknown'
        if (!byDate[d]) byDate[d] = []
        byDate[d].push(r)
      }
      return Object.entries(byDate)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, recs]) => ({
          date,
          receipts: recs,
          total: recs.reduce((s, r) => s + parseFloat(String(r.total ?? 0)), 0),
        }))
    }

    // Trip mode: enumerate all days from start to end
    const days: DayData[] = []
    const start = new Date(startDate)
    const end = new Date(endDate)
    const receiptsByDate: Record<string, TimelineReceipt[]> = {}

    for (const r of receipts) {
      const d = r.date || 'unknown'
      if (!receiptsByDate[d]) receiptsByDate[d] = []
      receiptsByDate[d].push(r)
    }

    const current = new Date(start)
    while (current <= end) {
      const dateStr = current.toISOString().split('T')[0]
      const dayReceipts = receiptsByDate[dateStr] || []
      days.push({
        date: dateStr,
        receipts: dayReceipts,
        total: dayReceipts.reduce((s, r) => s + parseFloat(String(r.total ?? 0)), 0),
      })
      current.setDate(current.getDate() + 1)
    }

    return days
  })()

  const toggleDay = (date: string) => {
    setExpandedDays((prev) => {
      const next = new Set(prev)
      if (next.has(date)) {
        next.delete(date)
      } else {
        next.add(date)
      }
      return next
    })
  }

  // Auto-expand days with receipts
  useEffect(() => {
    const withReceipts = days.filter((d) => d.receipts.length > 0).map((d) => d.date)
    setExpandedDays(new Set(withReceipts))
  }, [receipts]) // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return (
      <div className="space-y-3">
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="h-16 rounded-xl" />
        ))}
      </div>
    )
  }

  if (days.length === 0) {
    return (
      <div className="flex flex-col items-center py-16 gap-3 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <Calendar className="h-6 w-6 text-muted-foreground" />
        </div>
        <p className="font-medium">{t('groups.noReceipts')}</p>
        <p className="text-sm text-muted-foreground">{t('groups.noReceiptsDesc')}</p>
      </div>
    )
  }

  return (
    <div className="relative">
      {/* Vertical timeline line */}
      <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-border" />

      <div className="space-y-2">
        {days.map((day, dayIdx) => {
          const hasReceipts = day.receipts.length > 0
          const isExpanded = expandedDays.has(day.date)

          return (
            <motion.div
              key={day.date}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: dayIdx * 0.04, duration: 0.3 }}
            >
              {/* Day marker */}
              <button
                type="button"
                onClick={() => hasReceipts && toggleDay(day.date)}
                className={`relative flex items-center gap-3 w-full text-left pl-10 pr-4 py-3 rounded-xl transition-colors ${
                  hasReceipts
                    ? 'hover:bg-muted/50 cursor-pointer'
                    : 'cursor-default'
                }`}
              >
                {/* Timeline dot */}
                <div
                  className={`absolute left-2.5 h-3 w-3 rounded-full border-2 border-background ${
                    hasReceipts
                      ? 'bg-primary'
                      : 'bg-muted-foreground/30'
                  }`}
                />

                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium ${!hasReceipts ? 'text-muted-foreground' : ''}`}>
                    {formatDateFull(day.date)}
                  </p>
                  {hasReceipts && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {day.receipts.length} {day.receipts.length === 1 ? t('groups.item') : t('groups.items')} ·{' '}
                      {currency} {day.total.toFixed(2)}
                    </p>
                  )}
                </div>

                {hasReceipts && (
                  <div className="shrink-0">
                    {isExpanded ? (
                      <ChevronUp className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                )}
              </button>

              {/* Expanded receipt list */}
              <AnimatePresence>
                {isExpanded && hasReceipts && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.25 }}
                    className="overflow-hidden pl-10 pr-2"
                  >
                    <div className="space-y-2 pb-2">
                      {day.receipts.map((receipt, rIdx) => {
                        const payer = receipt.paidByMemberId
                          ? members.find((m) => m.id === receipt.paidByMemberId)
                          : null
                        const payerIdx = payer
                          ? members.findIndex((m) => m.id === payer.id)
                          : 0
                        const payerColor = MEMBER_COLORS[payerIdx % MEMBER_COLORS.length]

                        return (
                          <motion.div
                            key={receipt.id}
                            initial={{ opacity: 0, y: 4 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: rIdx * 0.05 }}
                            className="flex items-center gap-3 rounded-lg border p-3 bg-card"
                          >
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                              <Receipt className="h-4 w-4 text-muted-foreground" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">
                                {receipt.vendor || 'Receipt'}
                              </p>
                              <div className="flex items-center gap-2 mt-0.5">
                                {payer && (
                                  <div className="flex items-center gap-1">
                                    <div
                                      className="h-4 w-4 rounded-full flex items-center justify-center text-[7px] font-bold text-white"
                                      style={{ backgroundColor: payerColor }}
                                    >
                                      {getInitials(payer.name)}
                                    </div>
                                    <span className="text-xs text-muted-foreground">
                                      {payer.name}
                                    </span>
                                  </div>
                                )}
                                <span className="text-xs text-muted-foreground">
                                  · {receipt.assignedItemCount}/{receipt.totalItemCount} {t('groups.itemsAssigned')}
                                </span>
                              </div>
                            </div>
                            <span className="text-sm font-semibold tabular-nums shrink-0">
                              {currency} {parseFloat(String(receipt.total ?? 0)).toFixed(2)}
                            </span>
                          </motion.div>
                        )
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}
