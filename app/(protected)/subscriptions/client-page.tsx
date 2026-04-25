'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import { useTranslation } from '@/lib/i18n'
import { useProductType } from '@/hooks/use-product-type'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Repeat,
  CalendarClock,
  TrendingUp,
  ListChecks,
  AlertTriangle,
} from 'lucide-react'

interface Occurrence {
  date: string
  amount: number
}

interface Subscription {
  title: string
  vendor: string | null
  categoryName: string
  amount: number
  frequency: 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'annual' | 'irregular'
  occurrences: Occurrence[]
  avgAmount: number
  nextExpectedDate: string | null
  confidence: number
  annualCost: number
}

interface SubscriptionSummary {
  count: number
  totalAnnualCost: number
  monthlyRecurringCost: number
}

interface ApiResponse {
  subscriptions: Subscription[]
  summary: SubscriptionSummary
}

const FREQUENCY_LABELS: Record<string, { pl: string; en: string }> = {
  weekly:    { pl: 'Tygodniowo',     en: 'Weekly' },
  biweekly:  { pl: 'Co 2 tygodnie', en: 'Bi-weekly' },
  monthly:   { pl: 'Miesięcznie',    en: 'Monthly' },
  quarterly: { pl: 'Kwartalnie',     en: 'Quarterly' },
  annual:    { pl: 'Rocznie',        en: 'Annual' },
  irregular: { pl: 'Nieregularnie',  en: 'Irregular' },
}

const FREQUENCY_COLORS: Record<string, string> = {
  weekly:    'bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/20',
  biweekly:  'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 border-cyan-500/20',
  monthly:   'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/20',
  quarterly: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/20',
  annual:    'bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/20',
  irregular: 'bg-muted text-muted-foreground border-border',
}

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  show: (i: number) => ({
    opacity: 1, y: 0,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    transition: { duration: 0.45, delay: i * 0.07, ease: [0.22, 1, 0.36, 1] as any },
  }),
}

function SkeletonCard() {
  return (
    <Card className="animate-pulse">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1.5 flex-1">
            <div className="h-4 bg-muted rounded w-2/3" />
            <div className="h-3 bg-muted rounded w-1/3" />
          </div>
          <div className="h-5 bg-muted rounded w-20" />
        </div>
        <div className="flex gap-4">
          <div className="h-3 bg-muted rounded w-24" />
          <div className="h-3 bg-muted rounded w-20" />
        </div>
      </CardContent>
    </Card>
  )
}

export default function SubscriptionsClient() {
  const { t, lang, mounted } = useTranslation()
  const { isPersonal } = useProductType()
  const router = useRouter()

  const [data, setData] = useState<ApiResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [currency, setCurrency] = useState('PLN')

  // Redirect business users
  useEffect(() => {
    if (mounted && !isPersonal) {
      router.push('/dashboard')
    }
  }, [mounted, isPersonal, router])

  // Fetch currency setting
  useEffect(() => {
    fetch('/api/data/settings')
      .then(r => r.json())
      .then(d => { if (d?.settings?.currency) setCurrency(d.settings.currency.toUpperCase()) })
      .catch((err) => console.error('Failed to fetch settings:', err))
  }, [])

  const fetchSubscriptions = useCallback(async () => {
    try {
      const res = await fetch('/api/personal/subscriptions')
      if (!res.ok) throw new Error()
      const json = await res.json()
      setData(json)
    } catch {
      setData({ subscriptions: [], summary: { count: 0, totalAnnualCost: 0, monthlyRecurringCost: 0 } })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSubscriptions()
  }, [fetchSubscriptions])

  if (!mounted) return null

  const summary = data?.summary
  const subscriptions = data?.subscriptions ?? []

  const fmt = (amount: number) =>
    amount.toLocaleString(lang === 'pl' ? 'pl-PL' : 'en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  const freqLabel = (freq: string) =>
    lang === 'pl' ? (FREQUENCY_LABELS[freq]?.pl ?? freq) : (FREQUENCY_LABELS[freq]?.en ?? freq)

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '—'
    return new Date(dateStr).toLocaleDateString(lang === 'pl' ? 'pl-PL' : 'en-US')
  }

  const kpis = [
    {
      icon: TrendingUp,
      label: lang === 'pl' ? 'Koszt roczny' : 'Annual cost',
      value: `${fmt(summary?.totalAnnualCost ?? 0)} ${currency}`,
      color: 'text-rose-600 dark:text-rose-400',
    },
    {
      icon: CalendarClock,
      label: lang === 'pl' ? 'Koszt miesięczny' : 'Monthly cost',
      value: `${fmt(summary?.monthlyRecurringCost ?? 0)} ${currency}`,
      color: 'text-amber-600 dark:text-amber-400',
    },
    {
      icon: ListChecks,
      label: lang === 'pl' ? 'Wykryte subskrypcje' : 'Detected subscriptions',
      value: String(summary?.count ?? 0),
      color: 'text-primary',
    },
  ]

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <motion.div
        custom={0}
        initial="hidden"
        animate="show"
        variants={fadeUp}
        className="flex flex-col gap-1"
      >
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight flex items-center gap-2">
          <Repeat className="h-7 w-7 text-primary" />
          {t('subscriptions.title')}
        </h1>
        <p className="text-muted-foreground text-sm">{t('subscriptions.subtitle')}</p>
      </motion.div>

      {/* KPI cards */}
      <motion.div custom={1} initial="hidden" animate="show" variants={fadeUp}>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {kpis.map((kpi, i) => (
            <Card key={i} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                  <kpi.icon className="h-3.5 w-3.5" />
                  {kpi.label}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className={`text-xl font-bold ${kpi.color}`}>{kpi.value}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      </motion.div>

      {/* Loading skeletons */}
      {loading && (
        <motion.div custom={2} initial="hidden" animate="show" variants={fadeUp} className="space-y-3">
          {[0, 1, 2, 3].map(i => <SkeletonCard key={i} />)}
        </motion.div>
      )}

      {/* Empty state */}
      {!loading && subscriptions.length === 0 && (
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center justify-center py-20 gap-6 text-center"
        >
          <div className="relative">
            <div className="h-24 w-24 rounded-full bg-primary/10 flex items-center justify-center">
              <Repeat className="h-12 w-12 text-primary" />
            </div>
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 10, repeat: Infinity, ease: 'linear' }}
              className="absolute inset-0 rounded-full border-2 border-dashed border-primary/30"
            />
          </div>
          <div className="space-y-2 max-w-sm">
            <h2 className="text-xl font-bold">{t('subscriptions.emptyTitle')}</h2>
            <p className="text-muted-foreground text-sm">{t('subscriptions.emptyDesc')}</p>
          </div>
        </motion.div>
      )}

      {/* Subscriptions list */}
      {!loading && subscriptions.length > 0 && (
        <motion.div custom={2} initial="hidden" animate="show" variants={fadeUp} className="space-y-3">
          {subscriptions.map((sub, i) => (
            <motion.div
              key={i}
              custom={i}
              initial="hidden"
              animate="show"
              variants={fadeUp}
            >
              <Card className="hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                    {/* Left: name / vendor / category */}
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold leading-tight">{sub.title}</p>
                        <Badge
                          variant="outline"
                          className={`text-[10px] px-1.5 py-0 ${FREQUENCY_COLORS[sub.frequency] ?? FREQUENCY_COLORS.irregular}`}
                        >
                          {freqLabel(sub.frequency)}
                        </Badge>
                        {sub.confidence < 0.7 && (
                          <span className="flex items-center gap-0.5 text-[10px] text-amber-600 dark:text-amber-400">
                            <AlertTriangle className="h-3 w-3" />
                            {t('subscriptions.lowConfidence')}
                          </span>
                        )}
                      </div>
                      {sub.vendor && (
                        <p className="text-xs text-muted-foreground">{sub.vendor}</p>
                      )}
                      <p className="text-[11px] text-muted-foreground/70">{sub.categoryName}</p>
                    </div>

                    {/* Right: amounts + meta */}
                    <div className="flex sm:flex-col items-start sm:items-end gap-x-6 gap-y-1 shrink-0 flex-wrap">
                      <div className="text-right">
                        <p className="text-base font-bold text-foreground">
                          {fmt(sub.avgAmount)} {currency}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {t('subscriptions.perOccurrence')}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-rose-600 dark:text-rose-400">
                          {fmt(sub.annualCost)} {currency}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {t('subscriptions.perYear')}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Footer row */}
                  <div className="mt-3 pt-3 border-t border-border/40 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
                    <span>
                      {t('subscriptions.occurrences')}: <span className="font-medium text-foreground">{sub.occurrences.length}</span>
                    </span>
                    {sub.nextExpectedDate && (
                      <span>
                        {t('subscriptions.nextExpected')}: <span className="font-medium text-foreground">{formatDate(sub.nextExpectedDate)}</span>
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </motion.div>
      )}
    </div>
  )
}
