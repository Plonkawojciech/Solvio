'use client'

import { useEffect, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import dynamic from 'next/dynamic'
import { useTranslation } from '@/lib/i18n'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  DollarSign,
  Users,
  Calendar,
  Receipt,
  TrendingUp,
  TrendingDown,
  ArrowRight,
} from 'lucide-react'

// Lazy-load Recharts for performance
const BarChartComponent = dynamic(
  () => import('recharts').then((mod) => {
    const { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } = mod
    return function PerPersonChart({ data, currency }: { data: MemberSpend[]; currency: string }) {
      return (
        <ResponsiveContainer width="100%" height={Math.max(160, data.length * 48)}>
          <BarChart data={data} layout="vertical" margin={{ left: 0, right: 0, top: 4, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.3} horizontal={false} />
            <XAxis type="number" tickFormatter={(v: number) => `${currency} ${v}`} fontSize={11} />
            <YAxis type="category" dataKey="memberName" width={80} fontSize={12} />
            <Tooltip
              formatter={(value: number) => [`${currency} ${value.toFixed(2)}`, 'Spent']}
              contentStyle={{ borderRadius: 8, fontSize: 12 }}
            />
            <Bar dataKey="amount" radius={[0, 6, 6, 0]} barSize={28}>
              {data.map((entry, i) => (
                <Cell key={i} fill={entry.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )
    }
  }),
  { ssr: false, loading: () => <Skeleton className="h-40 w-full" /> }
)

const DailyChartComponent = dynamic(
  () => import('recharts').then((mod) => {
    const { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } = mod
    return function DailyChart({ data, currency }: { data: DailySpend[]; currency: string }) {
      return (
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={data} margin={{ left: 0, right: 0, top: 4, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
            <XAxis
              dataKey="date"
              fontSize={10}
              tickFormatter={(d: string) => {
                try {
                  return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
                } catch { return d }
              }}
            />
            <YAxis fontSize={10} tickFormatter={(v: number) => `${v}`} />
            <Tooltip
              formatter={(value: number) => [`${currency} ${value.toFixed(2)}`, 'Total']}
              labelFormatter={(d: string) => {
                try {
                  return new Date(d).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
                } catch { return d }
              }}
              contentStyle={{ borderRadius: 8, fontSize: 12 }}
            />
            <Bar dataKey="amount" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} barSize={24} />
          </BarChart>
        </ResponsiveContainer>
      )
    }
  }),
  { ssr: false, loading: () => <Skeleton className="h-48 w-full" /> }
)

const MEMBER_COLORS = [
  '#6366f1', '#ec4899', '#f59e0b', '#10b981',
  '#3b82f6', '#8b5cf6', '#ef4444', '#14b8a6',
]

interface MemberSpend {
  memberId: string
  memberName: string
  color: string
  amount: number
}

interface DailySpend {
  date: string
  amount: number
}

interface BalanceEntry {
  fromId: string
  fromName: string
  toId: string
  toName: string
  amount: number
}

interface RecentReceipt {
  id: string
  vendor: string | null
  date: string | null
  total: string | number | null
  paidByMemberId: string | null
}

interface DashboardData {
  group: {
    id: string
    name: string
    emoji: string | null
    mode: string
    currency: string
    startDate: string | null
    endDate: string | null
  }
  members: Array<{ id: string; name: string; email?: string | null; color?: string | null }>
  kpis: {
    totalGroupSpend: number
    perPersonAvg: number
    daysOfTrip: number
    receiptsScanned: number
  }
  perMemberSpend: MemberSpend[]
  dailySpending: DailySpend[]
  categoryBreakdown: Record<string, number>
  balanceSummary: BalanceEntry[]
  recentReceipts: RecentReceipt[]
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

function getMemberColor(
  members: Array<{ id: string; name: string }>,
  memberId: string
): string {
  const idx = members.findIndex((m) => m.id === memberId)
  return MEMBER_COLORS[(idx >= 0 ? idx : 0) % MEMBER_COLORS.length]
}

const kpiCardVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3 } },
} as any

interface TripDashboardProps {
  groupId: string
}

export function TripDashboard({ groupId }: TripDashboardProps) {
  const { t } = useTranslation()
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  const fetchDashboard = useCallback(async () => {
    setLoading(true)
    setError(false)
    try {
      const res = await fetch(`/api/groups/${groupId}/dashboard`)
      if (!res.ok) throw new Error('Failed')
      const json = await res.json()
      setData(json)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [groupId])

  useEffect(() => {
    fetchDashboard()
  }, [fetchDashboard])

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-48 rounded-xl" />
        <Skeleton className="h-48 rounded-xl" />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">{t('groups.failedLoad')}</p>
      </div>
    )
  }

  const { group, members, kpis, perMemberSpend, dailySpending, balanceSummary, recentReceipts } = data
  const isTrip = group.mode === 'trip'

  const kpiItems = [
    {
      label: t('groups.totalGroupSpend'),
      value: `${group.currency} ${kpis.totalGroupSpend.toFixed(2)}`,
      icon: DollarSign,
      color: 'text-emerald-600 dark:text-emerald-400',
      bg: 'bg-emerald-50 dark:bg-emerald-900/20',
    },
    {
      label: t('groups.perPersonAvg'),
      value: `${group.currency} ${kpis.perPersonAvg.toFixed(2)}`,
      icon: Users,
      color: 'text-blue-600 dark:text-blue-400',
      bg: 'bg-blue-50 dark:bg-blue-900/20',
    },
    ...(isTrip
      ? [
          {
            label: t('groups.daysOfTrip'),
            value: String(kpis.daysOfTrip),
            icon: Calendar,
            color: 'text-amber-600 dark:text-amber-400',
            bg: 'bg-amber-50 dark:bg-amber-900/20',
          },
        ]
      : []),
    {
      label: t('groups.receiptsScanned'),
      value: String(kpis.receiptsScanned),
      icon: Receipt,
      color: 'text-purple-600 dark:text-purple-400',
      bg: 'bg-purple-50 dark:bg-purple-900/20',
    },
  ]

  return (
    <div className="space-y-5">
      {/* KPI Cards */}
      <div className={`grid gap-3 ${isTrip ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-3'}`}>
        {kpiItems.map((kpi, i) => {
          const Icon = kpi.icon
          return (
            <motion.div
              key={kpi.label}
              variants={kpiCardVariants}
              initial="hidden"
              animate="visible"
              custom={i}
              transition={{ delay: i * 0.08 }}
            >
              <Card className="overflow-hidden">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className={`flex h-8 w-8 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-lg ${kpi.bg}`}>
                      <Icon className={`h-4 w-4 sm:h-5 sm:w-5 ${kpi.color}`} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground truncate">{kpi.label}</p>
                      <p className="text-lg font-bold tabular-nums leading-tight">{kpi.value}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )
        })}
      </div>

      {/* Per-person spending chart */}
      {perMemberSpend.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{t('groups.perPerson')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="max-h-[50vh] overflow-y-auto">
                <BarChartComponent data={perMemberSpend} currency={group.currency} />
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Daily spending timeline (trip mode only) */}
      {isTrip && dailySpending.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{t('groups.dailySpending')}</CardTitle>
            </CardHeader>
            <CardContent>
              <DailyChartComponent data={dailySpending} currency={group.currency} />
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Balance summary — who owes whom */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35 }}
      >
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t('groups.balances')}</CardTitle>
          </CardHeader>
          <CardContent>
            {balanceSummary.length === 0 ? (
              <div className="text-center py-6">
                <p className="text-sm text-emerald-600 dark:text-emerald-400 font-medium">
                  {t('groups.allSettled')}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {t('groups.allSettledDesc')}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {balanceSummary.map((entry, i) => (
                  <motion.div
                    key={`${entry.fromId}-${entry.toId}`}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.4 + i * 0.05 }}
                    className="flex items-center gap-2 rounded-lg border p-3"
                  >
                    {/* From */}
                    <div
                      className="h-7 w-7 shrink-0 rounded-full flex items-center justify-center text-[10px] font-bold text-white"
                      style={{ backgroundColor: getMemberColor(members, entry.fromId) }}
                    >
                      {getInitials(entry.fromName)}
                    </div>
                    <div className="flex-1 min-w-0 text-sm">
                      <span className="font-medium">{entry.fromName}</span>
                      <span className="text-muted-foreground mx-1">{t('groups.owes')}</span>
                      <span className="font-medium">{entry.toName}</span>
                    </div>
                    {/* To */}
                    <div
                      className="h-7 w-7 shrink-0 rounded-full flex items-center justify-center text-[10px] font-bold text-white"
                      style={{ backgroundColor: getMemberColor(members, entry.toId) }}
                    >
                      {getInitials(entry.toName)}
                    </div>
                    <span className="text-sm font-semibold tabular-nums text-red-500 dark:text-red-400 shrink-0">
                      {group.currency} {entry.amount.toFixed(2)}
                    </span>
                  </motion.div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Recent receipts */}
      {recentReceipts.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{t('groups.recentReceipts')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {recentReceipts.map((r, i) => {
                const payer = r.paidByMemberId
                  ? members.find((m) => m.id === r.paidByMemberId)
                  : null
                return (
                  <motion.div
                    key={r.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.45 + i * 0.04 }}
                    className="flex items-center gap-3 rounded-lg border p-2.5"
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                      <Receipt className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{r.vendor || 'Receipt'}</p>
                      <p className="text-xs text-muted-foreground">
                        {r.date
                          ? new Date(r.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
                          : ''}
                        {payer ? ` · ${payer.name}` : ''}
                      </p>
                    </div>
                    <span className="text-sm font-semibold tabular-nums shrink-0">
                      {group.currency} {parseFloat(String(r.total ?? 0)).toFixed(2)}
                    </span>
                  </motion.div>
                )
              })}
            </CardContent>
          </Card>
        </motion.div>
      )}
    </div>
  )
}
