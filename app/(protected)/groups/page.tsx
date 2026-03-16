'use client'

import { useEffect, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Link from 'next/link'
import { useTranslation } from '@/lib/i18n'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Users,
  Plus,
  ArrowRight,
  AlertCircle,
  Sparkles,
  Zap,
  X,
  Clock,
} from 'lucide-react'
import { NewGroupSheet } from '@/components/protected/groups/new-group-sheet'
import { QuickSplitSheet } from '@/components/protected/groups/quick-split-sheet'

const MEMBER_COLORS = [
  '#6366f1', '#ec4899', '#f59e0b', '#10b981',
  '#3b82f6', '#8b5cf6', '#ef4444', '#14b8a6',
]

interface GroupMember {
  id: string
  name: string
  email?: string | null
}

interface Group {
  id: string
  name: string
  emoji: string
  currency: string
  mode: string
  startDate: string | null
  endDate: string | null
  totalBalance: number
  members: GroupMember[]
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

function MemberAvatars({ members }: { members: GroupMember[] }) {
  const visible = members.slice(0, 5)
  const overflow = members.length - 5
  return (
    <div className="flex -space-x-2">
      {visible.map((m, idx) => (
        <div
          key={m.id}
          title={m.name}
          className="h-8 w-8 rounded-full border-2 border-background flex items-center justify-center text-xs font-semibold text-white shrink-0"
          style={{ backgroundColor: MEMBER_COLORS[idx % MEMBER_COLORS.length] }}
        >
          {getInitials(m.name)}
        </div>
      ))}
      {overflow > 0 && (
        <div className="h-8 w-8 rounded-full border-2 border-background bg-muted flex items-center justify-center text-xs font-semibold text-muted-foreground">
          +{overflow}
        </div>
      )}
    </div>
  )
}

function GroupCardSkeleton() {
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <Skeleton className="h-12 w-12 rounded-xl shrink-0" />
            <div className="flex-1 min-w-0 space-y-2">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-4 w-20" />
            </div>
          </div>
          <Skeleton className="h-9 w-20 shrink-0" />
        </div>
        <div className="mt-4 pt-4 border-t flex items-center justify-between">
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-5 w-16" />
        </div>
      </CardContent>
    </Card>
  )
}

const cardVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35 } },
} as any

const MODE_BADGE_STYLES: Record<string, string> = {
  trip: 'bg-sky-50 dark:bg-sky-900/20 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-800',
  household: 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800',
}

const MODE_EMOJI: Record<string, string> = {
  trip: '✈️',
  household: '🏠',
}

export default function GroupsPage() {
  const { t } = useTranslation()
  const [groups, setGroups] = useState<Group[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [quickSplitOpen, setQuickSplitOpen] = useState(false)
  const [tipDismissed, setTipDismissed] = useState(false)

  const fetchGroups = useCallback(async () => {
    setLoading(true)
    setError(false)
    try {
      const res = await fetch('/api/groups')
      if (!res.ok) throw new Error('Failed to fetch')
      const data = await res.json()
      setGroups(Array.isArray(data) ? data : (data.groups ?? []))
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchGroups()
  }, [fetchGroups])

  // Compute total unsettled debts across all groups
  const totalUnsettled = groups.reduce((sum, g) => {
    const balance = Math.abs(Number(g.totalBalance) || 0)
    return sum + balance
  }, 0)
  const unsettledGroupCount = groups.filter(
    (g) => Math.abs(Number(g.totalBalance) || 0) > 0
  ).length

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="flex items-center justify-between gap-4"
      >
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">{t('groups.title')}</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            {t('groups.subtitle')}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            onClick={() => setQuickSplitOpen(true)}
            className="gap-2"
          >
            <Zap className="h-4 w-4" />
            <span className="hidden sm:inline">{t('groups.quickSplit')}</span>
          </Button>
          <Button onClick={() => setSheetOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            {t('groups.newGroup')}
          </Button>
        </div>
      </motion.div>

      {/* AI tip banner — unsettled debts */}
      {!loading && !error && unsettledGroupCount > 0 && !tipDismissed && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3 rounded-xl border border-violet-200 dark:border-violet-800 bg-violet-50/50 dark:bg-violet-900/10 p-3.5"
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-100 dark:bg-violet-800/30">
            <Sparkles className="h-4 w-4 text-violet-600 dark:text-violet-400" />
          </div>
          <p className="text-sm font-medium text-violet-700 dark:text-violet-300 flex-1">
            {t('groups.unsettledDebts')}: {unsettledGroupCount}{' '}
            {unsettledGroupCount === 1 ? t('groups.member') : t('groups.members')} —{' '}
            {totalUnsettled.toFixed(2)} PLN
          </p>
          <button
            onClick={() => setTipDismissed(true)}
            className="p-1 rounded-md hover:bg-violet-200 dark:hover:bg-violet-800/40 text-violet-500 transition-colors shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </motion.div>
      )}

      {/* Content */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <GroupCardSkeleton key={i} />
          ))}
        </div>
      ) : error ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center justify-center py-20 gap-4 text-center"
        >
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
            <AlertCircle className="h-7 w-7 text-destructive" />
          </div>
          <div>
            <p className="font-semibold">{t('groups.failedLoad')}</p>
          </div>
          <Button variant="outline" onClick={fetchGroups}>
            {t('common.refresh')}
          </Button>
        </motion.div>
      ) : groups.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4 }}
          className="flex flex-col items-center justify-center py-24 gap-5 text-center"
        >
          <div className="relative">
            <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-primary/10">
              <Users className="h-10 w-10 text-primary" />
            </div>
            {/* Decorative rings */}
            <div className="absolute -inset-4 rounded-full border-2 border-primary/10 animate-pulse" />
            <div className="absolute -inset-8 rounded-full border border-primary/5" />
          </div>
          <div className="space-y-1.5">
            <h2 className="text-xl font-semibold">{t('groups.emptyTitle')}</h2>
            <p className="text-muted-foreground max-w-sm text-sm leading-relaxed">
              {t('groups.emptyDesc')}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              onClick={() => setQuickSplitOpen(true)}
              size="lg"
              className="gap-2"
            >
              <Zap className="h-4 w-4" />
              {t('groups.quickSplit')}
            </Button>
            <Button onClick={() => setSheetOpen(true)} size="lg">
              <Plus className="h-4 w-4 mr-2" />
              {t('groups.emptyAction')}
            </Button>
          </div>
        </motion.div>
      ) : (
        <AnimatePresence>
          <div className="space-y-3">
            {groups.map((group, i) => (
              <motion.div
                key={group.id}
                custom={i}
                variants={cardVariants}
                initial="hidden"
                animate="visible"
                exit={{ opacity: 0, y: -10, transition: { duration: 0.2 } }}
              >
                <Card className="overflow-hidden hover:shadow-md transition-shadow duration-200 group/card">
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between gap-3">
                      {/* Left: emoji + name + member count */}
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-2xl">
                          {group.emoji || '👥'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className="font-semibold truncate leading-tight">{group.name}</p>
                            {group.mode && group.mode !== 'default' && (
                              <span
                                className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold border shrink-0 ${
                                  MODE_BADGE_STYLES[group.mode] || ''
                                }`}
                              >
                                {MODE_EMOJI[group.mode] || ''}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {group.members.length}{' '}
                            {group.members.length === 1
                              ? t('groups.member')
                              : t('groups.members')}
                          </p>
                        </div>
                      </div>
                      {/* Open button */}
                      <Button
                        asChild
                        size="sm"
                        variant="outline"
                        className="shrink-0 group-hover/card:bg-primary group-hover/card:text-primary-foreground group-hover/card:border-primary transition-colors"
                      >
                        <Link href={`/groups/${group.id}`}>
                          {t('groups.open')}
                          <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
                        </Link>
                      </Button>
                    </div>

                    {/* Bottom: avatars + balance */}
                    <div className="mt-4 pt-4 border-t flex items-center justify-between gap-3">
                      <MemberAvatars members={group.members} />
                      <div className="text-right">
                        {group.totalBalance === 0 ? (
                          <span className="text-xs font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                            {t('groups.settled')}
                          </span>
                        ) : (
                          <div>
                            <p className="text-xs text-muted-foreground">{t('groups.balance')}</p>
                            <p
                              className={`text-sm font-semibold tabular-nums ${
                                Number(group.totalBalance) > 0
                                  ? 'text-emerald-600 dark:text-emerald-400'
                                  : 'text-red-500 dark:text-red-400'
                              }`}
                            >
                              {Number(group.totalBalance) > 0 ? '+' : ''}
                              {group.currency} {Math.abs(Number(group.totalBalance)).toFixed(2)}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </AnimatePresence>
      )}

      {/* Recent activity section */}
      {!loading && !error && groups.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.3 }}
          className="space-y-3"
        >
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">{t('groups.recentActivity')}</h3>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {groups
              .filter((g) => Math.abs(Number(g.totalBalance) || 0) > 0)
              .slice(0, 3)
              .map((group) => (
                <Link key={group.id} href={`/groups/${group.id}`}>
                  <Card className="overflow-hidden hover:shadow-sm transition-shadow">
                    <CardContent className="p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-lg">{group.emoji || '👥'}</span>
                        <span className="text-xs font-semibold truncate">{group.name}</span>
                      </div>
                      <p
                        className={`text-sm font-bold tabular-nums ${
                          Number(group.totalBalance) > 0
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-red-500 dark:text-red-400'
                        }`}
                      >
                        {Number(group.totalBalance) > 0 ? '+' : ''}
                        {Math.abs(Number(group.totalBalance)).toFixed(2)} {group.currency}
                      </p>
                    </CardContent>
                  </Card>
                </Link>
              ))}
          </div>
        </motion.div>
      )}

      <NewGroupSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        onCreated={fetchGroups}
      />

      <QuickSplitSheet
        open={quickSplitOpen}
        onOpenChange={setQuickSplitOpen}
      />
    </div>
  )
}
