'use client'

import { useEffect, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import { useTranslation } from '@/lib/i18n'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  CheckCircle2,
  ArrowRight,
  Send,
  Share2,
  TrendingUp,
  TrendingDown,
  Minus,
  Receipt,
  Users,
  Filter,
} from 'lucide-react'
import { PaymentRequestCard } from './payment-request-card'
import { SendRequestSheet } from './send-request-sheet'

interface PersonBreakdown {
  memberId: string
  name: string
  color: string
  totalPaid: number
  totalConsumed: number
  netBalance: number
}

interface Debt {
  fromId: string
  fromName: string
  fromColor: string
  toId: string
  toName: string
  toColor: string
  amount: number
}

interface PaymentRequest {
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
  itemBreakdown: Array<{
    itemName: string
    store: string
    date: string
    amount: number
    share: number
  }> | null
  settledAt: string | null
  settledBy: string | null
  createdAt: string
}

interface SettlementData {
  group: {
    id: string
    name: string
    emoji: string
    currency: string
    mode: string
    startDate: string | null
    endDate: string | null
  }
  perPersonBreakdown: PersonBreakdown[]
  debts: Debt[]
  paymentRequests: PaymentRequest[]
  stats: {
    totalGroupSpend: number
    receiptsCount: number
    membersCount: number
    allSettled: boolean
    pendingCount: number
    settledCount: number
    totalPendingAmount: number
    totalSettledAmount: number
  }
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

function formatDate(dateStr: string | null): string {
  if (!dateStr) return ''
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

export function SettlementSummary({ groupId }: { groupId: string }) {
  const { t } = useTranslation()
  const [data, setData] = useState<SettlementData | null>(null)
  const [loading, setLoading] = useState(true)
  const [sendSheetOpen, setSendSheetOpen] = useState(false)
  const [selectedDebt, setSelectedDebt] = useState<Debt | null>(null)
  const [filter, setFilter] = useState<'all' | 'pending' | 'settled'>('all')
  const [settlingId, setSettlingId] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/groups/${groupId}/settlements`)
      if (!res.ok) throw new Error('Failed')
      const json = await res.json()
      setData(json)
    } catch {
      toast.error(t('groups.failedLoad'))
    } finally {
      setLoading(false)
    }
  }, [groupId, t])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const handleSendRequest = (debt: Debt) => {
    setSelectedDebt(debt)
    setSendSheetOpen(true)
  }

  const handleMarkPaid = async (requestId: string) => {
    if (!data) return
    setSettlingId(requestId)
    try {
      const res = await fetch(`/api/groups/${groupId}/settlements/${requestId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'settle', settledBy: 'creditor' }),
      })
      if (!res.ok) throw new Error('Failed')
      toast.success(t('settlements.markedPaid'))
      await fetchData()
    } catch {
      toast.error(t('settlements.markFailed'))
    } finally {
      setSettlingId(null)
    }
  }

  const handleCopyLink = async (request: PaymentRequest) => {
    const url = `${window.location.origin}/settlement/${request.id}?token=${request.shareToken}`
    try {
      await navigator.clipboard.writeText(url)
      toast.success(t('settlements.linkCopied'))
    } catch {
      // Fallback
      const textArea = document.createElement('textarea')
      textArea.value = url
      document.body.appendChild(textArea)
      textArea.select()
      document.execCommand('copy')
      document.body.removeChild(textArea)
      toast.success(t('settlements.linkCopied'))
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 rounded-xl" />
        <Skeleton className="h-48 rounded-xl" />
        <Skeleton className="h-24 rounded-xl" />
      </div>
    )
  }

  if (!data) return null

  const { group, perPersonBreakdown, debts, paymentRequests: requests, stats } = data

  const filteredRequests =
    filter === 'all'
      ? requests
      : requests.filter((r) => r.status === filter)

  const completionRate =
    stats.pendingCount + stats.settledCount > 0
      ? Math.round((stats.settledCount / (stats.pendingCount + stats.settledCount)) * 100)
      : debts.length === 0
      ? 100
      : 0

  return (
    <div className="space-y-5">
      {/* Stats overview */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <Card className="overflow-hidden">
          <div className="bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 p-5 text-white">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20 text-xl backdrop-blur-sm">
                {group.emoji || '💰'}
              </div>
              <div>
                <h3 className="font-bold text-lg">{group.name}</h3>
                {group.mode === 'trip' && group.startDate && group.endDate && (
                  <p className="text-white/70 text-xs">
                    {formatDate(group.startDate)} — {formatDate(group.endDate)}
                  </p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="bg-white/10 rounded-xl p-3 backdrop-blur-sm">
                <p className="text-white/60 text-[10px] uppercase tracking-wider font-medium">
                  {t('settlements.totalSpend')}
                </p>
                <p className="text-lg font-bold mt-0.5 tabular-nums">
                  {formatCurrency(stats.totalGroupSpend, group.currency)}
                </p>
              </div>
              <div className="bg-white/10 rounded-xl p-3 backdrop-blur-sm">
                <p className="text-white/60 text-[10px] uppercase tracking-wider font-medium">
                  {t('settlements.perPerson')}
                </p>
                <p className="text-lg font-bold mt-0.5 tabular-nums">
                  {formatCurrency(
                    stats.membersCount > 0 ? stats.totalGroupSpend / stats.membersCount : 0,
                    group.currency
                  )}
                </p>
              </div>
              <div className="bg-white/10 rounded-xl p-3 backdrop-blur-sm">
                <p className="text-white/60 text-[10px] uppercase tracking-wider font-medium">
                  {t('settlements.completionRate')}
                </p>
                <div className="flex items-end gap-1.5 mt-0.5">
                  <p className="text-lg font-bold tabular-nums">{completionRate}%</p>
                </div>
              </div>
            </div>

            {/* Mini stats */}
            <div className="flex items-center gap-4 mt-3 text-white/50 text-xs">
              <span className="flex items-center gap-1">
                <Receipt className="h-3 w-3" />
                {stats.receiptsCount} {t('settlements.receiptsCount')}
              </span>
              <span className="flex items-center gap-1">
                <Users className="h-3 w-3" />
                {stats.membersCount} {t('settlements.membersCount')}
              </span>
            </div>
          </div>
        </Card>
      </motion.div>

      {/* Per-person breakdown */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05, duration: 0.3 }}
      >
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t('settlements.summary')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {perPersonBreakdown.map((person, i) => (
              <motion.div
                key={person.memberId}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.04 }}
                className="flex items-center gap-3 rounded-xl border p-3 hover:bg-muted/30 transition-colors"
              >
                <div
                  className="h-10 w-10 shrink-0 rounded-full flex items-center justify-center text-sm font-semibold text-white"
                  style={{ backgroundColor: person.color }}
                >
                  {getInitials(person.name)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">{person.name}</p>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                    <span>
                      {t('settlements.totalPaid')}: {formatCurrency(person.totalPaid, group.currency)}
                    </span>
                    <span>
                      {t('settlements.totalConsumed')}: {formatCurrency(person.totalConsumed, group.currency)}
                    </span>
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <p
                    className={`text-sm font-semibold tabular-nums ${
                      person.netBalance > 0.01
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : person.netBalance < -0.01
                        ? 'text-red-500 dark:text-red-400'
                        : 'text-muted-foreground'
                    }`}
                  >
                    {person.netBalance > 0.01 ? (
                      <TrendingUp className="inline h-3.5 w-3.5 mr-0.5" />
                    ) : person.netBalance < -0.01 ? (
                      <TrendingDown className="inline h-3.5 w-3.5 mr-0.5" />
                    ) : (
                      <Minus className="inline h-3.5 w-3.5 mr-0.5" />
                    )}
                    {person.netBalance > 0 ? '+' : ''}
                    {formatCurrency(person.netBalance, group.currency)}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {t('settlements.netBalance')}
                  </p>
                </div>
              </motion.div>
            ))}
          </CardContent>
        </Card>
      </motion.div>

      {/* Who owes whom — simplified debts */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.3 }}
      >
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t('settlements.whoOwesWhom')}</CardTitle>
          </CardHeader>
          <CardContent>
            {stats.allSettled && debts.length === 0 ? (
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="flex flex-col items-center py-8 gap-3 text-center"
              >
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30">
                  <CheckCircle2 className="h-7 w-7 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                  <p className="font-bold text-emerald-600 dark:text-emerald-400 text-lg">
                    {t('settlements.allSettled')}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {t('settlements.allSettledDesc')}
                  </p>
                </div>
              </motion.div>
            ) : (
              <div className="space-y-3">
                {debts.map((debt, i) => {
                  // Check if there's already a pending request for this debt
                  const existingRequest = requests.find(
                    (r) =>
                      r.fromMemberId === debt.fromId &&
                      r.toMemberId === debt.toId &&
                      r.status === 'pending'
                  )

                  return (
                    <motion.div
                      key={`${debt.fromId}-${debt.toId}`}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.06 }}
                      className="group relative flex items-center gap-3 rounded-xl border p-4 hover:shadow-md transition-all duration-200"
                    >
                      {/* From avatar */}
                      <div
                        className="h-10 w-10 shrink-0 rounded-full flex items-center justify-center text-sm font-semibold text-white shadow-sm"
                        style={{ backgroundColor: debt.fromColor }}
                        title={debt.fromName}
                      >
                        {getInitials(debt.fromName)}
                      </div>

                      {/* Arrow with amount */}
                      <div className="flex-1 flex flex-col items-center gap-0.5">
                        <p className="text-xs text-muted-foreground">{debt.fromName}</p>
                        <div className="flex items-center gap-2 w-full">
                          <div
                            className="flex-1 h-0.5 rounded-full"
                            style={{
                              background: `linear-gradient(to right, ${debt.fromColor}, ${debt.toColor})`,
                            }}
                          />
                          <ArrowRight
                            className="h-4 w-4 shrink-0"
                            style={{ color: debt.toColor }}
                          />
                        </div>
                        <p className="font-bold text-base tabular-nums">
                          {formatCurrency(debt.amount, group.currency)}
                        </p>
                        <p className="text-xs text-muted-foreground">{debt.toName}</p>
                      </div>

                      {/* To avatar */}
                      <div
                        className="h-10 w-10 shrink-0 rounded-full flex items-center justify-center text-sm font-semibold text-white shadow-sm"
                        style={{ backgroundColor: debt.toColor }}
                        title={debt.toName}
                      >
                        {getInitials(debt.toName)}
                      </div>

                      {/* Send request button */}
                      <div className="shrink-0">
                        {existingRequest ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 text-xs gap-1"
                            onClick={() => handleCopyLink(existingRequest)}
                          >
                            <Share2 className="h-3 w-3" />
                            {t('settlements.shareLink')}
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            className="h-8 text-xs gap-1"
                            onClick={() => handleSendRequest(debt)}
                          >
                            <Send className="h-3 w-3" />
                            {t('settlements.sendRequest')}
                          </Button>
                        )}
                      </div>
                    </motion.div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Payment requests list */}
      {requests.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.3 }}
        >
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">{t('settlements.requests')}</CardTitle>
                <div className="flex gap-1 p-0.5 bg-muted/50 rounded-lg">
                  {(['all', 'pending', 'settled'] as const).map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setFilter(f)}
                      className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                        filter === f
                          ? 'bg-background text-foreground shadow-sm'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {f === 'all'
                        ? t('settlements.all')
                        : f === 'pending'
                        ? t('settlements.filterPending')
                        : t('settlements.filterSettled')}
                    </button>
                  ))}
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Stats bar */}
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                {stats.totalPendingAmount > 0 && (
                  <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                    <div className="h-2 w-2 rounded-full bg-amber-500" />
                    {t('settlements.totalPending')}: {formatCurrency(stats.totalPendingAmount, group.currency)}
                  </span>
                )}
                {stats.totalSettledAmount > 0 && (
                  <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                    <div className="h-2 w-2 rounded-full bg-emerald-500" />
                    {t('settlements.totalSettled')}: {formatCurrency(stats.totalSettledAmount, group.currency)}
                  </span>
                )}
              </div>

              <AnimatePresence mode="popLayout">
                {filteredRequests.map((request, i) => (
                  <motion.div
                    key={request.id}
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ delay: i * 0.03 }}
                  >
                    <PaymentRequestCard
                      request={request}
                      currency={group.currency}
                      groupName={group.name}
                      groupEmoji={group.emoji}
                      onMarkPaid={() => handleMarkPaid(request.id)}
                      onCopyLink={() => handleCopyLink(request)}
                      isSettling={settlingId === request.id}
                    />
                  </motion.div>
                ))}
              </AnimatePresence>

              {filteredRequests.length === 0 && (
                <div className="flex flex-col items-center py-8 gap-2 text-center">
                  <Filter className="h-8 w-8 text-muted-foreground/50" />
                  <p className="text-sm text-muted-foreground">
                    {t('settlements.noSettlementsDesc')}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Empty state if no requests and no debts */}
      {requests.length === 0 && debts.length === 0 && !stats.allSettled && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center py-12 gap-4 text-center"
        >
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
            <Send className="h-7 w-7 text-muted-foreground" />
          </div>
          <div>
            <p className="font-semibold">{t('settlements.noSettlements')}</p>
            <p className="text-sm text-muted-foreground">{t('settlements.noSettlementsDesc')}</p>
          </div>
        </motion.div>
      )}

      {/* Send request sheet */}
      <SendRequestSheet
        open={sendSheetOpen}
        onOpenChange={setSendSheetOpen}
        groupId={groupId}
        currency={group.currency}
        debt={selectedDebt}
        groupName={group.name}
        groupEmoji={group.emoji}
        onSent={() => {
          fetchData()
          setSendSheetOpen(false)
        }}
      />
    </div>
  )
}
