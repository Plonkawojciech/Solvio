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
} from 'lucide-react'
import { SplitExpenseSheet } from '@/components/protected/groups/split-expense-sheet'

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
  members: GroupMember[]
  splits: Split[]
}

interface BalanceEntry {
  memberId: string
  memberName: string
  memberColor: string
  netBalance: number // positive = owed money, negative = owes money
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
        // Payer is owed this amount
        balances.set(
          split.paidByMemberId,
          (balances.get(split.paidByMemberId) ?? 0) + portion.amount
        )
        // Portion member owes this amount
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

export default function GroupDetailPage() {
  const { t } = useTranslation()
  const params = useParams()
  const groupId = params?.id as string

  const [group, setGroup] = useState<Group | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [settlingId, setSettlingId] = useState<string | null>(null)
  const [splitSheetOpen, setSplitSheetOpen] = useState(false)

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

  useEffect(() => {
    fetchGroup()
  }, [fetchGroup])

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

  if (loading) {
    return (
      <div className="space-y-6 max-w-2xl mx-auto">
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-9 rounded-full" />
          <Skeleton className="h-7 w-48" />
        </div>
        <Skeleton className="h-32 w-full rounded-xl" />
        <Skeleton className="h-48 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
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

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
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
              {group.emoji || '👥'}
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">{group.name}</h1>
              <p className="text-sm text-muted-foreground">
                {group.members.length}{' '}
                {group.members.length === 1 ? t('groups.member') : t('groups.members')} ·{' '}
                {group.currency}
              </p>
            </div>
          </div>
          <Button onClick={() => setSplitSheetOpen(true)} className="shrink-0">
            <Plus className="h-4 w-4 mr-2" />
            {t('groups.addSplit')}
          </Button>
        </div>
      </motion.div>

      {/* Members */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.05 }}
      >
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t('groups.addMembers')}</CardTitle>
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
      </motion.div>

      {/* Balances */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
      >
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
                      {/* From avatar */}
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
                          className="h-7 px-2 text-xs"
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

            {/* Net balance summary per member */}
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
      </motion.div>

      {/* Splits history */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.15 }}
      >
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
                        {/* Payer avatar */}
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

                          {/* Individual portions */}
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

                        {/* Status badge */}
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

      {/* Split expense sheet */}
      <SplitExpenseSheet
        open={splitSheetOpen}
        onOpenChange={setSplitSheetOpen}
        groupId={groupId}
        currency={group.currency}
        members={group.members}
        onCreated={fetchGroup}
      />
    </div>
  )
}
