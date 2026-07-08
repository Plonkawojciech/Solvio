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
  AlertCircle,
  Zap,
  History,
  ArrowRight,
} from 'lucide-react'
import { NewGroupSheet } from '@/components/protected/groups/new-group-sheet'
import { AppIcon } from '@/lib/app-icons'
import { QuickSplitSheet } from '@/components/protected/groups/quick-split-sheet'

const MEMBER_COLORS = [
  '#6366f1', '#ec4899', '#f59e0b', '#10b981',
  '#3b82f6', '#8b5cf6', '#ef4444', '#14b8a6',
]

interface GroupMember {
  id: string
  name: string
  email?: string | null
  userId?: string | null
  balance?: number
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
  myBalance?: number
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

function GroupCardSkeleton() {
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-5 space-y-4">
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-9 rounded-xl shrink-0" />
          <Skeleton className="h-5 w-32" />
        </div>
        <Skeleton className="h-7 w-28" />
        <div className="space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-4/5" />
        </div>
        <Skeleton className="h-9 w-full" />
      </CardContent>
    </Card>
  )
}

const cardVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35 } },
// eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any

const MODE_ICON: Record<string, string> = {
  trip: 'plane',
  household: 'home',
}

export default function GroupsPage() {
  const { t, lang } = useTranslation()
  const pl = lang === 'pl'
  const [groups, setGroups] = useState<Group[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [quickSplitOpen, setQuickSplitOpen] = useState(false)

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

  const fmt = (n: number) =>
    Math.abs(n).toLocaleString(pl ? 'pl-PL' : 'en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  // Bilans łącznie ze wszystkich grup (Twoje saldo)
  const totalMyBalance = groups.reduce((s, g) => s + (Number(g.myBalance) || 0), 0)

  // Aktywne (z saldami) najpierw, rozliczone na końcu
  const sorted = [...groups].sort((a, b) => {
    const av = Math.abs(Number(a.myBalance) || 0) > 0.004 ? 0 : 1
    const bv = Math.abs(Number(b.myBalance) || 0) > 0.004 ? 0 : 1
    return av - bv
  })

  return (
    <div className="space-y-5">
      {/* Nagłówek */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="flex items-center justify-between gap-4 flex-wrap"
      >
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight">
            {t('groups.title')}
            {groups.length > 0 && Math.abs(totalMyBalance) > 0.004 && (
              <span className={`ml-2 text-sm font-bold tabular-nums ${totalMyBalance > 0 ? 'text-[#1e6b2f] dark:text-emerald-400' : 'text-[#b3402c] dark:text-red-400'}`}>
                · {pl ? 'bilans' : 'balance'} {totalMyBalance > 0 ? '+' : '−'}{fmt(totalMyBalance)} zł
              </span>
            )}
          </h1>
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

      {/* Zawartość */}
      {loading ? (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
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
          className="flex flex-col items-center justify-center py-20 sm:py-28 gap-5 text-center"
        >
          <div className="flex h-16 w-16 items-center justify-center rounded-md border border-border bg-card text-foreground shadow-[var(--nb-shadow-sm)]">
            <Users className="h-7 w-7" aria-hidden="true" />
          </div>
          <div className="space-y-2 max-w-sm">
            <h2 className="text-xl font-extrabold tracking-tight">{t('groups.emptyTitle')}</h2>
            <p className="text-muted-foreground text-sm leading-snug">
              {t('groups.emptyDesc')}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-center pt-1">
            <Button
              variant="outline"
              onClick={() => setQuickSplitOpen(true)}
              className="gap-2"
            >
              <Zap className="h-4 w-4" aria-hidden="true" />
              {t('groups.quickSplit')}
            </Button>
            <Button onClick={() => setSheetOpen(true)}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              {t('groups.emptyAction')}
            </Button>
          </div>
        </motion.div>
      ) : (
        <AnimatePresence>
          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4 items-start">
            {sorted.map((group, i) => {
              const myBalance = Number(group.myBalance) || 0
              const isSettled = Math.abs(myBalance) <= 0.004 &&
                group.members.every((m) => Math.abs(Number(m.balance) || 0) <= 0.004)
              // Skala mini-pasków względem największego |salda| w grupie
              const maxAbs = Math.max(1, ...group.members.map((m) => Math.abs(Number(m.balance) || 0)))
              return (
                <motion.div
                  key={group.id}
                  custom={i}
                  variants={cardVariants}
                  initial="hidden"
                  animate="visible"
                  exit={{ opacity: 0, y: -10, transition: { duration: 0.2 } }}
                >
                  <Card className={`overflow-hidden hover:shadow-[var(--nb-shadow-lg)] transition-shadow duration-200 ${isSettled ? 'opacity-65' : ''}`}>
                    <CardContent className="p-5 flex flex-col gap-3.5">
                      {/* Góra: ikona + nazwa + tryb */}
                      <div className="flex items-center gap-2.5">
                        <AppIcon value={group.emoji} fallback="globe" size="lg" chipClassName="bg-primary/10 text-primary" />
                        <Link href={`/groups/${group.id}`} className="flex-1 min-w-0 font-extrabold text-[15px] truncate hover:text-primary transition-colors">
                          {group.name}
                        </Link>
                        {group.mode && group.mode !== 'default' && MODE_ICON[group.mode] && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[10px] font-extrabold text-secondary-foreground shrink-0">
                            <AppIcon value={MODE_ICON[group.mode]} size="sm" chipClassName="bg-transparent text-current h-3.5 w-3.5" />
                          </span>
                        )}
                      </div>

                      {/* Twoje saldo */}
                      <div>
                        <p className="nb-label">{pl ? 'Twoje saldo' : 'Your balance'}</p>
                        {isSettled ? (
                          <p className="text-xl font-extrabold tabular-nums text-muted-foreground">0,00 {group.currency}</p>
                        ) : (
                          <p className={`text-xl font-extrabold tabular-nums ${myBalance >= 0 ? 'text-[#1e6b2f] dark:text-emerald-400' : 'text-[#b3402c] dark:text-red-400'}`}>
                            {myBalance >= 0 ? '+' : '−'}{fmt(myBalance)} {group.currency}
                          </p>
                        )}
                      </div>

                      {/* Salda członków — mini-paski */}
                      {isSettled ? (
                        <p className="text-xs text-muted-foreground">
                          {pl ? 'Wszystko wyrównane' : 'All settled up'} · {group.members.length} {group.members.length === 1 ? t('groups.member') : t('groups.members')}
                        </p>
                      ) : (
                        <div className="space-y-1.5">
                          {group.members.slice(0, 4).map((m, idx) => {
                            const bal = Number(m.balance) || 0
                            const color = MEMBER_COLORS[idx % MEMBER_COLORS.length]
                            return (
                              <div key={m.id} className="flex items-center gap-2 text-[11.5px] font-semibold">
                                <span
                                  title={m.name}
                                  className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full text-[9px] font-extrabold text-white"
                                  style={{ backgroundColor: color }}
                                >
                                  {getInitials(m.name)}
                                </span>
                                <span className="w-[64px] truncate">{m.name}</span>
                                <span className="flex-1 h-[5px] rounded-[3px] bg-muted overflow-hidden">
                                  <span
                                    className="block h-full rounded-[3px]"
                                    style={{ width: `${Math.min(100, (Math.abs(bal) / maxAbs) * 100)}%`, backgroundColor: color }}
                                  />
                                </span>
                                <span className={`w-[56px] text-right tabular-nums font-extrabold ${bal > 0.004 ? 'text-[#1e6b2f] dark:text-emerald-400' : bal < -0.004 ? 'text-[#b3402c] dark:text-red-400' : 'text-muted-foreground'}`}>
                                  {bal > 0.004 ? '+' : bal < -0.004 ? '−' : ''}{Math.abs(bal) > 0.004 ? fmt(bal) : '0'}
                                </span>
                              </div>
                            )
                          })}
                          {group.members.length > 4 && (
                            <p className="text-[10.5px] text-muted-foreground">+{group.members.length - 4} {t('groups.members')}</p>
                          )}
                        </div>
                      )}

                      {/* Akcje */}
                      <div className="mt-auto flex gap-2 border-t border-dashed border-border pt-3">
                        {isSettled ? (
                          <>
                            <Button asChild variant="outline" size="sm" className="flex-1 gap-1.5">
                              <Link href={`/groups/${group.id}?tab=timeline`}>
                                <History className="h-3.5 w-3.5" />
                                {pl ? 'Historia' : 'History'}
                              </Link>
                            </Button>
                            <Button asChild variant="ghost" size="sm" className="flex-1 gap-1.5">
                              <Link href={`/groups/${group.id}`}>
                                {t('groups.open')}
                                <ArrowRight className="h-3.5 w-3.5" />
                              </Link>
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button asChild variant="outline" size="sm" className="flex-1">
                              <Link href={`/groups/${group.id}?add=1`}>+ {pl ? 'Wydatek' : 'Expense'}</Link>
                            </Button>
                            <Button asChild size="sm" className="flex-1">
                              <Link href={`/groups/${group.id}?tab=settlements`}>
                                {myBalance < -0.004 ? (pl ? `Oddaj ${fmt(myBalance)}` : `Pay ${fmt(myBalance)}`) : (pl ? 'Rozlicz' : 'Settle')}
                              </Link>
                            </Button>
                          </>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              )
            })}
          </div>
        </AnimatePresence>
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
