'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import { useTranslation } from '@/lib/i18n'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  ArrowLeft,
  Plus,
  CheckCircle2,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  Loader2,
  Receipt,
  BarChart3,
  Clock,
  Wallet,
  Camera,
  Plane,
  Home,
  Users,
  Banknote,
} from 'lucide-react'
import { SplitExpenseSheet } from '@/components/protected/groups/split-expense-sheet'
import { TripDashboard } from '@/components/protected/groups/trip-dashboard'
import { TripTimeline } from '@/components/protected/groups/trip-timeline'
import { GroupReceiptCard } from '@/components/protected/groups/group-receipt-card'
import { ReceiptItemAssigner } from '@/components/protected/groups/receipt-item-assigner'
import { ScanGroupReceiptSheet } from '@/components/protected/groups/scan-group-receipt-sheet'
import { SettlementSummary } from '@/components/protected/groups/settlement-summary'
import { AiExpenseInsights } from '@/components/protected/groups/ai-expense-insights'

const MEMBER_COLORS = [
  '#6366f1', '#ec4899', '#f59e0b', '#10b981',
  '#3b82f6', '#8b5cf6', '#ef4444', '#14b8a6',
]

interface GroupMember {
  id: string
  name: string
  email?: string | null
}

interface SplitPortion {
  memberId: string
  amount: number
  settled: boolean
}

interface Split {
  id: string
  description: string
  totalAmount: number
  paidByMemberId: string
  splits: SplitPortion[]
  createdAt: string
}

interface Group {
  id: string
  name: string
  emoji: string
  currency: string
  mode: string
  startDate: string | null
  endDate: string | null
  members: GroupMember[]
  splits: Split[]
}

interface ReceiptItem {
  id: string
  name: string
  quantity: string | number | null
  unitPrice: string | number | null
  totalPrice: string | number | null
}

interface Assignment {
  receiptItemId: string
  groupId: string
  memberId: string
  share: string
}

interface GroupReceipt {
  id: string
  vendor: string | null
  date: string | null
  total: string | number | null
  currency: string
  imageUrl: string | null
  paidByMemberId: string | null
  receiptItems: ReceiptItem[]
  assignments: Assignment[]
  paidByMember: { id: string; name: string } | null
  assignedItemCount: number
  totalItemCount: number
}

type TabId = 'overview' | 'receipts' | 'balances' | 'settlements' | 'timeline'

interface BalanceEntry {
  memberId: string
  memberName: string
  memberColor: string
  netBalance: number
}

interface OwingRelation {
  fromId: string
  fromName: string
  toId: string
  toName: string
  amount: number
  splitId: string
  description: string
  settled: boolean
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
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

function computeBalances(members: GroupMember[], splits: Split[]): BalanceEntry[] {
  const balances = new Map<string, number>()
  members.forEach((m) => balances.set(m.id, 0))

  for (const split of splits) {
    for (const portion of split.splits) {
      if (portion.memberId === split.paidByMemberId) continue
      if (!portion.settled) {
        balances.set(
          split.paidByMemberId,
          (balances.get(split.paidByMemberId) ?? 0) + portion.amount
        )
        balances.set(
          portion.memberId,
          (balances.get(portion.memberId) ?? 0) - portion.amount
        )
      }
    }
  }

  return members.map((m, idx) => ({
    memberId: m.id,
    memberName: m.name,
    memberColor: MEMBER_COLORS[idx % MEMBER_COLORS.length],
    netBalance: balances.get(m.id) ?? 0,
  }))
}

function computeOwingRelations(members: GroupMember[], splits: Split[]): OwingRelation[] {
  const memberMap = new Map(members.map((m) => [m.id, m.name]))
  const relations: OwingRelation[] = []

  for (const split of splits) {
    for (const portion of split.splits) {
      if (portion.memberId === split.paidByMemberId) continue
      relations.push({
        fromId: portion.memberId,
        fromName: memberMap.get(portion.memberId) ?? portion.memberId,
        toId: split.paidByMemberId,
        toName: memberMap.get(split.paidByMemberId) ?? split.paidByMemberId,
        amount: portion.amount,
        splitId: split.id,
        description: split.description,
        settled: portion.settled,
      })
    }
  }

  return relations
}

function MemberAvatar({
  member,
  color,
  size = 'md',
}: {
  member: GroupMember
  color: string
  size?: 'sm' | 'md' | 'lg'
}) {
  const sizeClass =
    size === 'sm'
      ? 'h-7 w-7 text-xs'
      : size === 'lg'
      ? 'h-12 w-12 text-sm'
      : 'h-9 w-9 text-xs'
  return (
    <div
      className={`${sizeClass} shrink-0 rounded-full flex items-center justify-center font-semibold text-white`}
      style={{ backgroundColor: color }}
      title={member.name}
    >
      {getInitials(member.name)}
    </div>
  )
}

function getModeEmoji(mode: string): string {
  switch (mode) {
    case 'trip': return ''
    case 'household': return ''
    default: return ''
  }
}

function getModeBadgeStyle(mode: string): string {
  switch (mode) {
    case 'trip':
      return 'bg-sky-50 dark:bg-sky-900/20 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-800'
    case 'household':
      return 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800'
    default:
      return 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800'
  }
}

export default function GroupDetailPage() {
  const { t } = useTranslation()
  const params = useParams()
  const groupId = params?.id as string

  const [group, setGroup] = useState<Group | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [settlingId, setSettlingId] = useState<string | null>(null)
  const [splitSheetOpen, setSplitSheetOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<TabId>('overview')

  // Receipts state
  const [groupReceipts, setGroupReceipts] = useState<GroupReceipt[]>([])
  const [receiptMembers, setReceiptMembers] = useState<Array<{ id: string; name: string; email?: string | null; color?: string | null }>>([])
  const [receiptsLoading, setReceiptsLoading] = useState(false)
  const [scanSheetOpen, setScanSheetOpen] = useState(false)
  const [selectedReceipt, setSelectedReceipt] = useState<GroupReceipt | null>(null)

  const memberColorMap = useCallback(
    (memberId: string): string => {
      if (!group) return MEMBER_COLORS[0]
      const idx = group.members.findIndex((m) => m.id === memberId)
      return MEMBER_COLORS[(idx >= 0 ? idx : 0) % MEMBER_COLORS.length]
    },
    [group]
  )

  const fetchGroup = useCallback(async () => {
    if (!groupId) return
    setLoading(true)
    setError(false)
    try {
      const res = await fetch(`/api/groups/${groupId}`)
      if (!res.ok) throw new Error('Failed to fetch')
      const data = await res.json()
      setGroup(data)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [groupId])

  const fetchReceipts = useCallback(async () => {
    if (!groupId) return
    setReceiptsLoading(true)
    try {
      const res = await fetch(`/api/groups/${groupId}/receipts`)
      if (!res.ok) throw new Error('Failed')
      const data = await res.json()
      setGroupReceipts(data.receipts || [])
      setReceiptMembers(data.members || [])
    } catch {
      // silent
    } finally {
      setReceiptsLoading(false)
    }
  }, [groupId])

  useEffect(() => {
    fetchGroup()
  }, [fetchGroup])

  useEffect(() => {
    if (activeTab === 'receipts' && groupReceipts.length === 0) {
      fetchReceipts()
    }
  }, [activeTab, fetchReceipts, groupReceipts.length])

  const handleSettle = async (splitId: string, memberId: string) => {
    setSettlingId(`${splitId}-${memberId}`)
    try {
      const res = await fetch(`/api/groups/splits/${splitId}/settle`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberId }),
      })
      if (!res.ok) throw new Error('Failed to settle')
      toast.success(t('groups.settled'))
      await fetchGroup()
    } catch {
      toast.error(t('groups.failedLoad'))
    } finally {
      setSettlingId(null)
    }
  }

  const getAssignedMemberIds = (receipt: GroupReceipt): string[] => {
    const memberIds = new Set<string>()
    for (const a of receipt.assignments) {
      memberIds.add(a.memberId)
    }
    return Array.from(memberIds)
  }

  if (loading) {
    return (
      <div className="space-y-6 max-w-2xl mx-auto">
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-9 rounded-full" />
          <Skeleton className="h-7 w-48" />
        </div>
        <Skeleton className="h-12 w-full rounded-xl" />
        <Skeleton className="h-32 w-full rounded-xl" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    )
  }

  if (error || !group) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
          <AlertCircle className="h-7 w-7 text-destructive" />
        </div>
        <div>
          <p className="font-semibold">{t('groups.notFound')}</p>
          <p className="text-sm text-muted-foreground">{t('groups.notFoundDesc')}</p>
        </div>
        <Button asChild variant="outline">
          <Link href="/groups">
            <ArrowLeft className="h-4 w-4 mr-2" />
            {t('groups.backToGroups')}
          </Link>
        </Button>
      </div>
    )
  }

  const balances = computeBalances(group.members, group.splits)
  const owingRelations = computeOwingRelations(group.members, group.splits)
  const unsettledRelations = owingRelations.filter((r) => !r.settled)
  const allSettled = unsettledRelations.length === 0

  const isTrip = group.mode === 'trip'
  const isHousehold = group.mode === 'household'

  const tabs: Array<{ id: TabId; label: string; icon: React.ElementType }> = [
    { id: 'overview', label: t('groups.overview'), icon: BarChart3 },
    { id: 'receipts', label: t('groups.receiptTab'), icon: Receipt },
    { id: 'balances', label: t('groups.balancesTab'), icon: Wallet },
    { id: 'settlements', label: t('settlements.settlementsTab'), icon: Banknote },
    ...(isTrip ? [{ id: 'timeline' as TabId, label: t('groups.timeline'), icon: Clock }] : []),
  ]

  return (
    <div className="space-y-5 max-w-2xl mx-auto">
      {/* Back link + header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="space-y-4"
      >
        <Link
          href="/groups"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          {t('groups.backToGroups')}
        </Link>

        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-3xl">
              {group.emoji || getModeEmoji(group.mode)}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight">{group.name}</h1>
                {/* Mode badge */}
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${getModeBadgeStyle(group.mode)}`}>
                  {getModeEmoji(group.mode)}{' '}
                  {t(`groups.mode.${group.mode}` as any)}
                </span>
              </div>
              <p className="text-sm text-muted-foreground">
                {group.members.length}{' '}
                {group.members.length === 1 ? t('groups.member') : t('groups.members')} · {group.currency}
                {isTrip && group.startDate && group.endDate && (
                  <span className="ml-1">
                    · {formatDate(group.startDate)} — {formatDate(group.endDate)}
                  </span>
                )}
                {isHousehold && (
                  <span className="ml-1">· {t('groups.ongoing')}</span>
                )}
              </p>
            </div>
          </div>
          <Button onClick={() => setSplitSheetOpen(true)} size="sm" className="shrink-0">
            <Plus className="h-4 w-4 mr-1.5" />
            {t('groups.addSplit')}
          </Button>
        </div>
      </motion.div>

      {/* Tab navigation */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05, duration: 0.3 }}
      >
        <div className="flex gap-1 p-1 bg-muted/50 rounded-xl overflow-x-auto scrollbar-hide scroll-px-1 snap-x snap-mandatory">
          {tabs.map((tab) => {
            const Icon = tab.icon
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`relative flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium transition-all duration-200 whitespace-nowrap min-w-fit snap-start ${
                  isActive
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
                }`}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            )
          })}
        </div>
      </motion.div>

      {/* Tab content */}
      <AnimatePresence mode="wait">
        {/* OVERVIEW TAB */}
        {activeTab === 'overview' && (
          <motion.div
            key="overview"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.25 }}
            className="space-y-5"
          >
            <AiExpenseInsights groupId={groupId} />
            <TripDashboard groupId={groupId} />
          </motion.div>
        )}

        {/* RECEIPTS TAB */}
        {activeTab === 'receipts' && (
          <motion.div
            key="receipts"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.25 }}
            className="space-y-4"
          >
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {groupReceipts.length} {groupReceipts.length === 1 ? t('groups.item') : t('groups.items')}
              </p>
              <Button size="sm" variant="outline" onClick={() => setScanSheetOpen(true)}>
                <Camera className="h-4 w-4 mr-1.5" />
                {t('groups.scanReceipt')}
              </Button>
            </div>

            {receiptsLoading ? (
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => (
                  <Skeleton key={i} className="h-36 rounded-xl" />
                ))}
              </div>
            ) : groupReceipts.length === 0 ? (
              <div className="flex flex-col items-center py-16 gap-4 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
                  <Receipt className="h-7 w-7 text-muted-foreground" />
                </div>
                <div>
                  <p className="font-semibold">{t('groups.noReceipts')}</p>
                  <p className="text-sm text-muted-foreground">{t('groups.noReceiptsDesc')}</p>
                </div>
                <Button onClick={() => setScanSheetOpen(true)}>
                  <Camera className="h-4 w-4 mr-2" />
                  {t('groups.scanFirst')}
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {groupReceipts.map((receipt, i) => (
                  <GroupReceiptCard
                    key={receipt.id}
                    vendor={receipt.vendor}
                    date={receipt.date}
                    total={receipt.total}
                    currency={receipt.currency || group.currency}
                    items={receipt.receiptItems}
                    assignedItemCount={receipt.assignedItemCount}
                    totalItemCount={receipt.totalItemCount}
                    assignedMemberIds={getAssignedMemberIds(receipt)}
                    members={receiptMembers}
                    paidByMember={receipt.paidByMember}
                    onClick={() => setSelectedReceipt(receipt)}
                    index={i}
                  />
                ))}
              </div>
            )}
          </motion.div>
        )}

        {/* BALANCES TAB */}
        {activeTab === 'balances' && (
          <motion.div
            key="balances"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.25 }}
            className="space-y-4"
          >
            {/* Members */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{t('groups.membersTitle')}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-3">
                  {group.members.map((m, idx) => (
                    <div key={m.id} className="flex items-center gap-2 bg-muted/50 rounded-full pl-1 pr-3 py-1">
                      <MemberAvatar
                        member={m}
                        color={MEMBER_COLORS[idx % MEMBER_COLORS.length]}
                        size="sm"
                      />
                      <span className="text-sm font-medium">{m.name}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Balances */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{t('groups.balances')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {allSettled ? (
                  <div className="flex flex-col items-center py-6 gap-2 text-center">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30">
                      <CheckCircle2 className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <p className="font-semibold text-emerald-600 dark:text-emerald-400">
                      {t('groups.allSettled')}
                    </p>
                    <p className="text-sm text-muted-foreground">{t('groups.allSettledDesc')}</p>
                  </div>
                ) : (
                  <div className="divide-y rounded-xl border overflow-hidden">
                    {unsettledRelations.map((rel, i) => {
                      const settleKey = `${rel.splitId}-${rel.fromId}`
                      const isSettling = settlingId === settleKey
                      return (
                        <motion.div
                          key={`${rel.splitId}-${rel.fromId}`}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: i * 0.05 }}
                          className="flex items-center gap-3 px-4 py-3 bg-background"
                        >
                          <div
                            className="h-8 w-8 shrink-0 rounded-full flex items-center justify-center text-xs font-semibold text-white"
                            style={{ backgroundColor: memberColorMap(rel.fromId) }}
                          >
                            {getInitials(rel.fromName)}
                          </div>

                          <div className="flex-1 min-w-0">
                            <p className="text-sm">
                              <span className="font-medium">{rel.fromName}</span>
                              <span className="text-muted-foreground mx-1">{t('groups.owes')}</span>
                              <span className="font-medium">{rel.toName}</span>
                            </p>
                            <p className="text-xs text-muted-foreground truncate">{rel.description}</p>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-sm font-semibold text-red-500 dark:text-red-400 tabular-nums">
                              {group.currency} {rel.amount.toFixed(2)}
                            </span>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-9 px-3 text-xs"
                              onClick={() => handleSettle(rel.splitId, rel.fromId)}
                              disabled={isSettling}
                            >
                              {isSettling ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                t('groups.settle')
                              )}
                            </Button>
                          </div>
                        </motion.div>
                      )
                    })}
                  </div>
                )}

                {!allSettled && (
                  <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {balances
                      .filter((b) => Math.abs(b.netBalance) > 0.01)
                      .map((b) => (
                        <div
                          key={b.memberId}
                          className="flex items-center gap-2 rounded-lg border p-2.5"
                        >
                          <div
                            className="h-7 w-7 shrink-0 rounded-full flex items-center justify-center text-xs font-semibold text-white"
                            style={{ backgroundColor: b.memberColor }}
                          >
                            {getInitials(b.memberName)}
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs text-muted-foreground truncate">{b.memberName}</p>
                            <p
                              className={`text-xs font-semibold tabular-nums ${
                                b.netBalance > 0
                                  ? 'text-emerald-600 dark:text-emerald-400'
                                  : 'text-red-500 dark:text-red-400'
                              }`}
                            >
                              {b.netBalance > 0 ? (
                                <TrendingUp className="inline h-3 w-3 mr-0.5" />
                              ) : (
                                <TrendingDown className="inline h-3 w-3 mr-0.5" />
                              )}
                              {b.netBalance > 0 ? '+' : ''}
                              {group.currency} {Math.abs(b.netBalance).toFixed(2)}
                            </p>
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Splits history */}
            <Card>
              <CardHeader className="pb-3 flex flex-row items-center justify-between">
                <CardTitle className="text-base">{t('groups.splits')}</CardTitle>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setSplitSheetOpen(true)}
                  className="h-8"
                >
                  <Plus className="h-3.5 w-3.5 mr-1.5" />
                  {t('groups.addSplit')}
                </Button>
              </CardHeader>
              <CardContent>
                {group.splits.length === 0 ? (
                  <div className="flex flex-col items-center py-10 gap-3 text-center">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                      <Receipt className="h-6 w-6 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="font-medium">{t('groups.noSplits')}</p>
                      <p className="text-sm text-muted-foreground">{t('groups.noSplitsDesc')}</p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <AnimatePresence initial={false}>
                      {group.splits.map((split, i) => {
                        const payer = group.members.find((m) => m.id === split.paidByMemberId)
                        const payerIdx = group.members.findIndex((m) => m.id === split.paidByMemberId)
                        const payerColor = MEMBER_COLORS[payerIdx >= 0 ? payerIdx % MEMBER_COLORS.length : 0]
                        const allPortionsSettled = split.splits
                          .filter((p) => p.memberId !== split.paidByMemberId)
                          .every((p) => p.settled)

                        return (
                          <motion.div
                            key={split.id}
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ delay: i * 0.04 }}
                            className="flex items-start gap-3 rounded-xl border p-3 hover:bg-muted/30 transition-colors"
                          >
                            <div
                              className="h-9 w-9 shrink-0 rounded-full flex items-center justify-center text-xs font-semibold text-white mt-0.5"
                              style={{ backgroundColor: payerColor }}
                            >
                              {payer ? getInitials(payer.name) : '?'}
                            </div>

                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2">
                                <p className="font-medium text-sm truncate">{split.description}</p>
                                <p className="text-sm font-semibold tabular-nums shrink-0">
                                  {group.currency} {Number(split.totalAmount).toFixed(2)}
                                </p>
                              </div>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {t('groups.paidBy')} {payer?.name ?? '?'} · {formatDate(split.createdAt)}
                              </p>

                              <div className="mt-2 flex flex-wrap gap-1.5">
                                {split.splits
                                  .filter((p) => p.memberId !== split.paidByMemberId)
                                  .map((portion) => {
                                    const mem = group.members.find((m) => m.id === portion.memberId)
                                    const memIdx = group.members.findIndex((m) => m.id === portion.memberId)
                                    const memColor = MEMBER_COLORS[memIdx >= 0 ? memIdx % MEMBER_COLORS.length : 0]
                                    return (
                                      <span
                                        key={portion.memberId}
                                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                                          portion.settled
                                            ? 'bg-muted text-muted-foreground line-through'
                                            : 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400'
                                        }`}
                                      >
                                        <span
                                          className="h-3.5 w-3.5 rounded-full inline-block shrink-0"
                                          style={{ backgroundColor: memColor }}
                                        />
                                        {mem?.name ?? portion.memberId}: {group.currency}{' '}
                                        {portion.amount.toFixed(2)}
                                      </span>
                                    )
                                  })}
                              </div>
                            </div>

                            {allPortionsSettled && (
                              <div className="shrink-0 mt-0.5">
                                <span className="inline-flex items-center gap-1 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 px-2 py-0.5 rounded-full text-xs font-medium">
                                  <CheckCircle2 className="h-3 w-3" />
                                  {t('groups.settled')}
                                </span>
                              </div>
                            )}
                          </motion.div>
                        )
                      })}
                    </AnimatePresence>
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* SETTLEMENTS TAB */}
        {activeTab === 'settlements' && (
          <motion.div
            key="settlements"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.25 }}
          >
            <SettlementSummary groupId={groupId} />
          </motion.div>
        )}

        {/* TIMELINE TAB */}
        {activeTab === 'timeline' && isTrip && (
          <motion.div
            key="timeline"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.25 }}
          >
            <TripTimeline
              groupId={groupId}
              startDate={group.startDate}
              endDate={group.endDate}
              currency={group.currency}
              members={group.members.map((m, i) => ({
                ...m,
                color: MEMBER_COLORS[i % MEMBER_COLORS.length],
              }))}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Split expense sheet */}
      <SplitExpenseSheet
        open={splitSheetOpen}
        onOpenChange={setSplitSheetOpen}
        groupId={groupId}
        currency={group.currency}
        members={group.members}
        onCreated={fetchGroup}
      />

      {/* Scan group receipt sheet */}
      <ScanGroupReceiptSheet
        open={scanSheetOpen}
        onOpenChange={setScanSheetOpen}
        groupId={groupId}
        currency={group.currency}
        members={group.members.map((m, i) => ({
          ...m,
          color: MEMBER_COLORS[i % MEMBER_COLORS.length],
        }))}
        onScanned={(receiptId) => {
          fetchReceipts()
          // After scanning, auto-navigate to receipts tab and try to select the new receipt
          setActiveTab('receipts')
        }}
      />

      {/* Item assigner overlay */}
      <AnimatePresence>
        {selectedReceipt && (
          <ReceiptItemAssigner
            groupId={groupId}
            receiptId={selectedReceipt.id}
            vendor={selectedReceipt.vendor || 'Receipt'}
            date={selectedReceipt.date}
            currency={selectedReceipt.currency || group.currency}
            total={selectedReceipt.total}
            items={selectedReceipt.receiptItems}
            members={receiptMembers.length > 0
              ? receiptMembers
              : group.members.map((m, i) => ({
                  ...m,
                  color: MEMBER_COLORS[i % MEMBER_COLORS.length],
                }))}
            initialAssignments={selectedReceipt.assignments}
            onClose={() => setSelectedReceipt(null)}
            onSaved={() => {
              setSelectedReceipt(null)
              fetchReceipts()
            }}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
