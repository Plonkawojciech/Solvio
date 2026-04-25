'use client'

import { useEffect, useState, useCallback } from 'react'
import { useTranslation } from '@/lib/i18n'
import { motion, AnimatePresence } from 'framer-motion'
import dynamic from 'next/dynamic'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'

/* ─── Lazy-load Recharts chart components (keeps ~500 KB recharts bundle out of initial JS) ─── */
const DynamicChartLoader = () => <div className="h-[300px] w-full animate-pulse rounded-lg bg-muted" />;
const { MonthlyTrendChart, CategoryPieChart, DailySpendingChart, CategoryBarChart, WeekdaySpendingChart } = {
  MonthlyTrendChart: dynamic(() => import('@/components/protected/analysis/analysis-charts').then(m => ({ default: m.MonthlyTrendChart })), { ssr: false, loading: DynamicChartLoader }),
  CategoryPieChart: dynamic(() => import('@/components/protected/analysis/analysis-charts').then(m => ({ default: m.CategoryPieChart })), { ssr: false, loading: DynamicChartLoader }),
  DailySpendingChart: dynamic(() => import('@/components/protected/analysis/analysis-charts').then(m => ({ default: m.DailySpendingChart })), { ssr: false, loading: DynamicChartLoader }),
  CategoryBarChart: dynamic(() => import('@/components/protected/analysis/analysis-charts').then(m => ({ default: m.CategoryBarChart })), { ssr: false, loading: DynamicChartLoader }),
  WeekdaySpendingChart: dynamic(() => import('@/components/protected/analysis/analysis-charts').then(m => ({ default: m.WeekdaySpendingChart })), { ssr: false, loading: DynamicChartLoader }),
}
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Sparkles, TrendingUp, TrendingDown, Minus,
  AlertTriangle, Lightbulb,
  RefreshCcw, Loader2, Brain,
  Target, Zap, PiggyBank, BarChart2, AlertCircle, Landmark,
  ChevronUp, ChevronDown, ShoppingCart, Store,
} from 'lucide-react'

/* ─── Types ─── */
interface Expense {
  id: string
  title: string
  amount: number | string
  date: string
  categoryId: string | null
}

interface ReceiptInsights {
  period: { days: number; since: string }
  summary: { totalReceipts: number; totalSpend: number; avgPerReceipt: number; uniqueVendors: number }
  topVendors: { name: string; total: number; count: number; avgSpend: number }[]
  topItems: { name: string; count: number; avgPrice: number; totalSpend: number }[]
  receiptsByWeek: { week: string; count: number }[]
}

interface AiInsight { type: 'positive' | 'warning' | 'info'; title: string; description: string; icon: string }
interface AiRecommendation { priority: 'high' | 'medium' | 'low'; title: string; description: string; potentialSaving: number | null }
interface AiAnomaly { date: string; category: string; description: string; amount: number }
interface AiCategoryTrend { category: string; trend: 'increasing' | 'decreasing' | 'stable'; changePercent: number; note: string }
interface BankStats {
  totalTransactions: number
  totalDebit: number
  totalCredit: number
  topMerchants: { name: string; amount: string }[]
  accountCount: number
}
interface AiResult {
  summary: string
  insights: AiInsight[]
  recommendations: AiRecommendation[]
  anomalies: AiAnomaly[]
  categoryTrends: AiCategoryTrend[]
  predictedMonthlySpend: number | null
  fallback?: boolean
  bankStats?: BankStats | null
}

/* ─── Period definitions ─── */
type Period = '7d' | '30d' | '3m' | '6m' | '1y' | 'all'

const PERIODS: { key: Period; labelPl: string; labelEn: string; days: number | null }[] = [
  { key: '7d',  labelPl: '7 dni',    labelEn: '7d',  days: 7 },
  { key: '30d', labelPl: '30 dni',   labelEn: '30d', days: 30 },
  { key: '3m',  labelPl: '3 mies.',  labelEn: '3m',  days: 90 },
  { key: '6m',  labelPl: '6 mies.',  labelEn: '6m',  days: 180 },
  { key: '1y',  labelPl: '1 rok',    labelEn: '1y',  days: 365 },
  { key: 'all', labelPl: 'Wszystko', labelEn: 'All', days: null },
]

/* ─── Helpers ─── */
function fmtMoney(v: number, cur: string) {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: cur, maximumFractionDigits: 0 }).format(v)
}
function ymLabel(ym: string, isPolish: boolean) {
  const [y, m] = ym.split('-')
  return new Date(parseInt(y), parseInt(m) - 1).toLocaleDateString(isPolish ? 'pl-PL' : 'en-US', { month: 'short', year: '2-digit' })
}

/** Filter expenses to last N days from today */
function filterByDays(exps: Expense[], days: number | null): Expense[] {
  if (days === null) return exps
  const since = new Date()
  since.setDate(since.getDate() - days)
  const sinceStr = since.toISOString().slice(0, 10)
  return exps.filter(e => (e.date || '') >= sinceStr)
}

/** Get expenses from the equivalent previous period window */
function filterPrevPeriod(exps: Expense[], days: number | null): Expense[] {
  if (days === null) return []
  const end = new Date()
  end.setDate(end.getDate() - days)
  const start = new Date(end)
  start.setDate(start.getDate() - days)
  const endStr = end.toISOString().slice(0, 10)
  const startStr = start.toISOString().slice(0, 10)
  return exps.filter(e => (e.date || '') >= startStr && (e.date || '') < endStr)
}

/** Human-readable subtitle for chosen period */
function periodSubtitle(period: Period, isPolish: boolean): string {
  const year = new Date().getFullYear()
  const labels: Record<Period, { pl: string; en: string }> = {
    '7d':  { pl: 'Ostatnie 7 dni',       en: 'Last 7 days' },
    '30d': { pl: 'Ostatnie 30 dni',      en: 'Last 30 days' },
    '3m':  { pl: 'Ostatnie 3 miesiące',  en: 'Last 3 months' },
    '6m':  { pl: 'Ostatnie 6 miesięcy',  en: 'Last 6 months' },
    '1y':  { pl: 'Ostatni rok',          en: 'Last year' },
    'all': { pl: 'Wszystkie wydatki',    en: 'All time' },
  }
  const l = labels[period]
  return `${isPolish ? l.pl : l.en} · ${year}`
}

/* ─── Animation variants ─── */
const cardVariant = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] } },
}

/* ─── Section divider ─── */
function SectionDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 my-2">
      <div className="h-px flex-1 bg-border/60" />
      <span className="text-xs font-semibold tracking-widest uppercase text-muted-foreground/70 px-1">{label}</span>
      <div className="h-px flex-1 bg-border/60" />
    </div>
  )
}

/* ─── Priority badge (bilingual) ─── */
function PriorityBadge({ priority, isPolish }: { priority: 'high' | 'medium' | 'low'; isPolish: boolean }) {
  const labels: Record<string, { pl: string; en: string; variant: 'destructive' | 'default' | 'secondary' }> = {
    high: { pl: 'Wysoki', en: 'High', variant: 'destructive' },
    medium: { pl: 'Średni', en: 'Medium', variant: 'default' },
    low: { pl: 'Niski', en: 'Low', variant: 'secondary' },
  }
  const cfg = labels[priority] ?? labels.low
  return (
    <Badge variant={cfg.variant} className="text-[10px] px-1.5 py-0">
      {isPolish ? cfg.pl : cfg.en}
    </Badge>
  )
}

/* ─── Period-over-period comparison badge ─── */
function ComparisonBadge({ current, prev, isPolish }: { current: number; prev: number; isPolish: boolean }) {
  if (prev === 0 || current === 0) return null
  const pct = ((current - prev) / prev) * 100
  const rounded = Math.round(Math.abs(pct))
  if (rounded === 0) return null
  const increased = pct > 0
  return (
    <div className="flex items-center gap-1 mt-1">
      <span className={`flex items-center gap-0.5 text-[10px] font-semibold ${increased ? 'text-red-500' : 'text-emerald-500'}`}>
        {increased ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        {rounded}%
      </span>
      <span className="text-[10px] text-muted-foreground">
        {isPolish ? 'vs poprzedni okres' : 'vs prev. period'}
      </span>
    </div>
  )
}

/* ─── Chart skeleton card ─── */
function ChartSkeleton({ height = 220 }: { height?: number }) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2">
        <div className="h-4 w-36 rounded bg-muted animate-pulse" />
        <div className="h-3 w-48 rounded bg-muted/60 animate-pulse mt-1" />
      </CardHeader>
      <CardContent>
        <div className="flex items-end gap-1 justify-around px-2" style={{ height }}>
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="flex-1 rounded-t bg-muted animate-pulse"
              style={{
                height: `${30 + Math.sin(i * 0.9) * 30 + 30}%`,
                animationDelay: `${i * 80}ms`,
              }}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

/* ─── Full page initial skeleton ─── */
function PageSkeleton({ isPolish }: { isPolish: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex flex-col gap-6 md:gap-8"
    >
      {/* Header skeleton */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="space-y-2">
          <div className="h-8 w-48 rounded bg-muted animate-pulse" />
          <div className="h-4 w-72 rounded bg-muted/60 animate-pulse" />
        </div>
        <div className="h-9 w-28 rounded bg-muted animate-pulse" />
      </div>
      {/* Section divider skeleton */}
      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-border/60" />
        <div className="h-3 w-20 rounded bg-muted/60 animate-pulse" />
        <div className="h-px flex-1 bg-border/60" />
      </div>
      {/* KPI skeleton */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {[0, 1, 2, 3].map(i => (
          <Card key={i} className="overflow-hidden">
            <CardContent className="p-4 sm:p-5">
              <div className="h-9 w-9 rounded-lg bg-muted animate-pulse mb-3" style={{ animationDelay: `${i * 100}ms` }} />
              <div className="h-3 w-24 rounded bg-muted/60 animate-pulse mb-2" />
              <div className="h-8 w-20 rounded bg-muted animate-pulse" style={{ animationDelay: `${i * 80 + 50}ms` }} />
            </CardContent>
          </Card>
        ))}
      </div>
      {/* Charts section divider */}
      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-border/60" />
        <div className="h-3 w-16 rounded bg-muted/60 animate-pulse" />
        <div className="h-px flex-1 bg-border/60" />
      </div>
      {/* Charts skeleton */}
      <div className="grid lg:grid-cols-2 gap-4 sm:gap-6">
        <ChartSkeleton height={220} />
        <ChartSkeleton height={220} />
      </div>
      <ChartSkeleton height={180} />
      <ChartSkeleton height={240} />
      {/* AI section divider */}
      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-border/60" />
        <div className="h-3 w-24 rounded bg-muted/60 animate-pulse" />
        <div className="h-px flex-1 bg-border/60" />
      </div>
      {/* AI loading banner */}
      <Card className="border-primary/20 bg-gradient-to-r from-primary/5 to-violet-500/5">
        <CardContent className="p-5 flex items-center gap-3">
          <Loader2 className="h-5 w-5 animate-spin text-primary flex-shrink-0" />
          <div className="flex flex-col gap-1 flex-1">
            <p className="text-sm font-medium">
              {isPolish ? 'AI analizuje Twoje wydatki…' : 'AI is analyzing your spending…'}
            </p>
            <p className="text-xs text-muted-foreground">
              {isPolish ? 'Może to potrwać 5–15 sekund' : 'This may take 5–15 seconds'}
            </p>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}

/* ─── AI Skeleton ─── */
function AiSkeleton({ isPolish }: { isPolish: boolean }) {
  return (
    <motion.div
      key="ai-skeleton"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex flex-col gap-4"
    >
      {/* Pulsing banner */}
      <Card className="border-primary/20 bg-gradient-to-r from-primary/5 to-violet-500/5">
        <CardContent className="p-5 flex items-center gap-3">
          <Loader2 className="h-5 w-5 animate-spin text-primary flex-shrink-0" />
          <div className="flex flex-col gap-1 flex-1">
            <p className="text-sm font-medium">
              {isPolish ? 'AI analizuje Twoje wydatki…' : 'AI is analyzing your spending…'}
            </p>
            <p className="text-xs text-muted-foreground">
              {isPolish ? 'Może to potrwać 5–15 sekund' : 'This may take 5–15 seconds'}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Skeleton cards */}
      <div className="grid lg:grid-cols-2 gap-4">
        {[0, 1].map(i => (
          <Card key={i} className="overflow-hidden">
            <CardHeader className="pb-3">
              <div className="h-4 w-32 rounded bg-muted animate-pulse" />
            </CardHeader>
            <CardContent className="space-y-3">
              {[0, 1, 2].map(j => (
                <div key={j} className="h-14 rounded-xl bg-muted/60 animate-pulse" style={{ animationDelay: `${(i * 3 + j) * 100}ms` }} />
              ))}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="overflow-hidden">
        <CardHeader className="pb-3">
          <div className="h-4 w-40 rounded bg-muted animate-pulse" />
        </CardHeader>
        <CardContent>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {[0, 1, 2, 3, 4].map(i => (
              <div key={i} className="h-16 rounded-xl bg-muted/60 animate-pulse" style={{ animationDelay: `${i * 80}ms` }} />
            ))}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}

export default function AnalysisPage() {
  const { t, lang } = useTranslation()
  const isPolish = lang === 'pl'

  const [loading, setLoading] = useState(true)
  const [aiLoading, setAiLoading] = useState(false)
  const [currency, setCurrency] = useState('PLN')
  const [allExpenses, setAllExpenses] = useState<Expense[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [ai, setAi] = useState<AiResult | null>(null)
  const [aiError, setAiError] = useState<string | null>(null)
  const [activePeriod, setActivePeriod] = useState<Period>('3m')
  const [catMap, setCatMap] = useState<Record<string, string>>({})
  const [receiptInsights, setReceiptInsights] = useState<ReceiptInsights | null>(null)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [monthlyData, setMonthlyData] = useState<any[]>([])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [categoryData, setCategoryData] = useState<any[]>([])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [dailyData, setDailyData] = useState<any[]>([])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [weekdayData, setWeekdayData] = useState<any[]>([])
  const [spendingStreak, setSpendingStreak] = useState(0)
  const [stats, setStats] = useState({ total90: 0, avg30: 0, topCat: '', txCount: 0, avgTx: 0 })
  const [prevStats, setPrevStats] = useState({ total: 0, txCount: 0, avgTx: 0 })

  const processExpenses = useCallback((
    exps: Expense[],
    cats: Record<string, string>,
    polish: boolean,
    periodDays: number | null,
    allExps: Expense[],
  ) => {
    const byMonth: Record<string, number> = {}
    const byCat: Record<string, number> = {}
    const byDay: Record<string, number> = {}

    for (const e of exps) {
      const amt = typeof e.amount === 'number' ? e.amount : parseFloat(String(e.amount)) || 0
      const cat = e.categoryId ? (cats[e.categoryId] || (polish ? 'Inne' : 'Other')) : (polish ? 'Inne' : 'Other')
      const ym = e.date?.slice(0, 7) ?? ''
      const day = e.date?.slice(0, 10) ?? ''
      byMonth[ym] = (byMonth[ym] || 0) + amt
      byCat[cat] = (byCat[cat] || 0) + amt
      byDay[day] = (byDay[day] || 0) + amt
    }

    setMonthlyData(
      Object.entries(byMonth)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([ym, total]) => ({ month: ymLabel(ym, polish), total: parseFloat(total.toFixed(2)) }))
    )
    const catEntries = Object.entries(byCat).sort((a, b) => b[1] - a[1])
    setCategoryData(catEntries.map(([name, value]) => ({ name, value: parseFloat(value.toFixed(2)) })))
    setDailyData(
      Object.entries(byDay)
        .sort(([a], [b]) => a.localeCompare(b))
        .slice(-30)
        .map(([date, total]) => ({ date: date.slice(5), total: parseFloat(total.toFixed(2)) }))
    )

    // ── Weekday spending breakdown ──
    // getDay() returns 0=Sun,1=Mon,...,6=Sat. Map to Mon–Sun order.
    const dayLabels = polish
      ? ['Pon', 'Wt', 'Śr', 'Czw', 'Pt', 'Sob', 'Nd']
      : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
    // Mon=0..Sun=6 in our array; getDay() Mon=1..Sun=0
    const weekdayTotals = Array.from({ length: 7 }, () => ({ sum: 0, count: 0 }))
    for (const e of exps) {
      if (!e.date) continue
      const amt = typeof e.amount === 'number' ? e.amount : parseFloat(String(e.amount)) || 0
      const d = new Date(e.date)
      const dow = d.getDay() // 0=Sun, 1=Mon, …, 6=Sat
      const idx = dow === 0 ? 6 : dow - 1 // convert to Mon=0…Sun=6
      weekdayTotals[idx].sum += amt
      weekdayTotals[idx].count += 1
    }
    setWeekdayData(weekdayTotals.map((wt, i) => ({
      day: dayLabels[i],
      total: parseFloat(wt.sum.toFixed(2)),
      count: wt.count,
      avg: wt.count > 0 ? parseFloat((wt.sum / wt.count).toFixed(2)) : 0,
    })))

    // ── Spending streak: consecutive days (last 7) with >= 1 expense ──
    const daysWithExpense = new Set(exps.map(e => e.date?.slice(0, 10) ?? ''))
    let streak = 0
    for (let i = 0; i < 7; i++) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      const key = d.toISOString().slice(0, 10)
      if (daysWithExpense.has(key)) streak++
      else break
    }
    setSpendingStreak(streak)

    const total90 = exps.reduce((s, e) => s + (typeof e.amount === 'number' ? e.amount : parseFloat(String(e.amount)) || 0), 0)
    const topCat = catEntries[0]?.[0] || '—'
    const numMonths = periodDays ? Math.max(1, periodDays / 30) : 1
    setStats({ total90, avg30: total90 / numMonths, topCat, txCount: exps.length, avgTx: exps.length ? total90 / exps.length : 0 })

    // Compute previous period for comparison badges
    const prevExps = filterPrevPeriod(allExps, periodDays)
    const prevTotal = prevExps.reduce((s, e) => s + (typeof e.amount === 'number' ? e.amount : parseFloat(String(e.amount)) || 0), 0)
    setPrevStats({ total: prevTotal, txCount: prevExps.length, avgTx: prevExps.length ? prevTotal / prevExps.length : 0 })
  }, [])

  const fetchAi = useCallback(async (cur: string) => {
    setAiLoading(true)
    setAiError(null)
    try {
      const res = await fetch('/api/analysis/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lang, currency: cur }),
      })
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()
      setAi(data)
    } catch (e) {
      setAiError(String(e))
    } finally {
      setAiLoading(false)
    }
  }, [lang])

  useEffect(() => {
    const controller = new AbortController()
    const signal = controller.signal

    const init = async () => {
      try {
        const [settingsRes, expensesRes, insightsRes] = await Promise.all([
          fetch('/api/data/settings', { signal }).then(r => r.json()),
          fetch('/api/data/expenses', { signal }).then(r => r.json()),
          fetch('/api/data/receipts/insights?days=90', { signal }).then(r => r.ok ? r.json() : null),
        ])

        if (signal.aborted) return

        const cur = (settingsRes?.settings?.currency || 'PLN').toUpperCase()
        setCurrency(cur)

        const exps: Expense[] = expensesRes?.expenses || []
        const cats: { id: string; name: string }[] = settingsRes?.categories || []
        const map = Object.fromEntries(cats.map((c: { id: string; name: string }) => [c.id, c.name]))

        setAllExpenses(exps)
        setCatMap(map)

        // Receipt insights
        if (insightsRes && insightsRes.summary) {
          setReceiptInsights(insightsRes as ReceiptInsights)
        }

        // Default period: 3m (90 days)
        const defaultPeriodCfg = PERIODS.find(p => p.key === '3m')!
        const filtered = filterByDays(exps, defaultPeriodCfg.days)
        setExpenses(filtered)
        processExpenses(filtered, map, isPolish, defaultPeriodCfg.days, exps)
        await fetchAi(cur)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (err: any) {
        if (err.name === 'AbortError') return
      } finally {
        if (!signal.aborted) setLoading(false)
      }
    }
    init()
    return () => controller.abort()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [processExpenses, fetchAi])

  // When period selector changes: re-filter + re-process client-side (no AI re-fetch)
  const handlePeriodChange = useCallback((period: Period) => {
    setActivePeriod(period)
    const cfg = PERIODS.find(p => p.key === period)!
    const filtered = filterByDays(allExpenses, cfg.days)
    setExpenses(filtered)
    processExpenses(filtered, catMap, isPolish, cfg.days, allExpenses)
  }, [allExpenses, catMap, isPolish, processExpenses])

  if (loading) {
    return (
      <div className="flex flex-col gap-6 md:gap-8 pb-10">
        <PageSkeleton isPolish={isPolish} />
      </div>
    )
  }

  const hasData = expenses.length > 0
  const activePeriodDays = PERIODS.find(p => p.key === activePeriod)?.days ?? null
  const prevMonthlyAvg = activePeriodDays
    ? prevStats.total / Math.max(1, activePeriodDays / 30)
    : 0

  // ── Spending momentum: last 7 days vs previous 7 days ──
  const last7Total = (() => {
    const since = new Date(); since.setDate(since.getDate() - 7)
    const sinceStr = since.toISOString().slice(0, 10)
    return allExpenses
      .filter(e => (e.date || '') >= sinceStr)
      .reduce((s, e) => s + (typeof e.amount === 'number' ? e.amount : parseFloat(String(e.amount)) || 0), 0)
  })()
  const prev7Total = (() => {
    const end = new Date(); end.setDate(end.getDate() - 7)
    const start = new Date(); start.setDate(start.getDate() - 14)
    const endStr = end.toISOString().slice(0, 10)
    const startStr = start.toISOString().slice(0, 10)
    return allExpenses
      .filter(e => (e.date || '') >= startStr && (e.date || '') < endStr)
      .reduce((s, e) => s + (typeof e.amount === 'number' ? e.amount : parseFloat(String(e.amount)) || 0), 0)
  })()
  const momentumPct = prev7Total > 0 && last7Total > 0
    ? ((last7Total - prev7Total) / prev7Total) * 100
    : null
  const momentumLabel = momentumPct === null ? null
    : momentumPct > 10 ? t('analysis.momentumAccel')
    : momentumPct < -10 ? t('analysis.momentumSlow')
    : t('analysis.momentumStable')
  const momentumColor = momentumPct === null ? ''
    : momentumPct > 10 ? 'border-orange-500/30 bg-orange-500/8 text-orange-600 dark:text-orange-400'
    : momentumPct < -10 ? 'border-emerald-500/30 bg-emerald-500/8 text-emerald-600 dark:text-emerald-400'
    : 'border-border bg-muted/40 text-muted-foreground'

  return (
    <div className="flex flex-col gap-6 md:gap-8 pb-10">
      {/* ── Header ── */}
      <motion.div
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4"
      >
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight flex items-center gap-2">
            <Brain className="h-7 w-7 text-primary" />
            {t('analysis.title')}
          </h1>
          <p className="text-sm text-muted-foreground mt-1" suppressHydrationWarning>
            {periodSubtitle(activePeriod, isPolish)}
          </p>
        </div>

        {/* Right side: period selector + refresh AI */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 self-start sm:self-auto">
          {/* Pill-style period selector */}
          <div className="flex items-center gap-0.5 rounded-lg border bg-muted/40 p-0.5">
            {PERIODS.map(p => (
              <button
                key={p.key}
                onClick={() => handlePeriodChange(p.key)}
                className={`
                  px-2.5 py-1 rounded-md text-xs font-medium transition-all duration-150
                  ${activePeriod === p.key
                    ? 'bg-background shadow-sm text-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-background/60'
                  }
                `}
              >
                {isPolish ? p.labelPl : p.labelEn}
              </button>
            ))}
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchAi(currency)}
            disabled={aiLoading || !hasData}
            className="self-start sm:self-auto whitespace-nowrap"
          >
            {aiLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCcw className="h-4 w-4 mr-2" />}
            <span suppressHydrationWarning>{t('analysis.refreshAi')}</span>
          </Button>
        </div>
      </motion.div>

      {/* ── Empty state ── */}
      {!hasData && (
        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4 }}
          className="flex flex-col items-center justify-center py-24 gap-5 text-center"
        >
          <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground" suppressHydrationWarning>
            {'// '}{t('analysis.noData')}
          </p>
          <div className="h-20 w-20 border-2 border-foreground bg-secondary shadow-[3px_3px_0_hsl(var(--foreground))] rounded-md flex items-center justify-center">
            <BarChart2 className="h-10 w-10 text-foreground" />
          </div>
          <div className="space-y-1 max-w-xs">
            <h2 className="text-xl font-bold" suppressHydrationWarning>{t('analysis.noData')}</h2>
            <p className="text-sm text-muted-foreground" suppressHydrationWarning>
              {isPolish
                ? 'Dodaj wydatki, aby zobaczyć głęboką analizę AI Twoich finansów.'
                : 'Add expenses to see your AI-powered financial analysis.'}
            </p>
          </div>
          {/* Feature preview pills */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="flex flex-wrap gap-2 justify-center max-w-sm"
          >
            {[
              { icon: TrendingUp, label: isPolish ? 'Trendy wydatków' : 'Spending trends' },
              { icon: Brain, label: isPolish ? 'Spostrzeżenia AI' : 'AI insights' },
              { icon: AlertTriangle, label: isPolish ? 'Wykrywanie anomalii' : 'Anomaly detection' },
              { icon: PiggyBank, label: isPolish ? 'Rekomendacje oszczędności' : 'Savings tips' },
            ].map(({ icon: Icon, label }) => (
              <span key={label} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border bg-background text-muted-foreground">
                <Icon className="h-3 w-3 text-primary" />
                {label}
              </span>
            ))}
          </motion.div>
        </motion.div>
      )}

      {hasData && (
        <>
          {/* ── Section: Overview ── */}
          <SectionDivider label={t('analysis.overview')} />

          {/* ── KPI Cards ── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {[
              {
                label: isPolish
                  ? `Wydano (${PERIODS.find(p => p.key === activePeriod)?.labelPl ?? ''})`
                  : `Spent (${PERIODS.find(p => p.key === activePeriod)?.labelEn ?? ''})`,
                value: fmtMoney(stats.total90, currency),
                icon: BarChart2, color: 'text-primary', bg: 'bg-primary/10',
                cmpCur: stats.total90, cmpPrev: prevStats.total,
              },
              {
                label: t('analysis.avgMonthly'),
                value: fmtMoney(stats.avg30, currency),
                icon: TrendingUp, color: 'text-violet-500', bg: 'bg-violet-500/10',
                cmpCur: stats.avg30, cmpPrev: prevMonthlyAvg,
              },
              {
                label: t('analysis.transactions'),
                value: stats.txCount.toString(),
                icon: Zap, color: 'text-emerald-500', bg: 'bg-emerald-500/10',
                cmpCur: stats.txCount, cmpPrev: prevStats.txCount,
              },
              {
                label: t('analysis.avgTx'),
                value: fmtMoney(stats.avgTx, currency),
                icon: Target, color: 'text-orange-500', bg: 'bg-orange-500/10',
                cmpCur: stats.avgTx, cmpPrev: prevStats.avgTx,
              },
            ].map((kpi, i) => (
              <motion.div key={kpi.label} custom={i} variants={cardVariant} initial="hidden" animate="visible">
                <Card className="hover:shadow-md transition-shadow">
                  <CardContent className="p-3 sm:p-5">
                    <div className={`inline-flex h-8 w-8 md:h-9 md:w-9 items-center justify-center rounded-lg ${kpi.bg} ${kpi.color} mb-2 md:mb-3`}>
                      <kpi.icon className="h-4 w-4" />
                    </div>
                    <p className="text-xs text-muted-foreground mb-0.5 md:mb-1 line-clamp-1">{kpi.label}</p>
                    <p className={`text-lg md:text-2xl font-extrabold ${kpi.color}`}>{kpi.value}</p>
                    {activePeriodDays !== null && (
                      <ComparisonBadge current={kpi.cmpCur} prev={kpi.cmpPrev} isPolish={isPolish} />
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>

          {/* ── Spending streak + momentum badges ── */}
          {(spendingStreak >= 2 || momentumLabel) && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.4, delay: 0.2 }}
              className="flex items-center gap-2 flex-wrap"
            >
              {spendingStreak >= 2 && (
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-orange-500/30 bg-orange-500/8 text-sm font-semibold text-orange-600 dark:text-orange-400">
                  <span>🔥</span>
                  <span suppressHydrationWarning>
                    {spendingStreak} {t('analysis.daysInARow')}
                  </span>
                  <span className="text-xs font-normal text-orange-500/70" suppressHydrationWarning>
                    · {t('analysis.spendingStreak')}
                  </span>
                </div>
              )}
              {momentumLabel && (
                <div
                  className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm font-semibold ${momentumColor}`}
                  title={t('analysis.momentumTooltip')}
                >
                  <span suppressHydrationWarning>{momentumLabel}</span>
                  <span className="text-xs font-normal opacity-60" suppressHydrationWarning>
                    · {t('analysis.momentum')}
                  </span>
                  {momentumPct !== null && (
                    <span className="text-xs font-bold opacity-80">
                      {momentumPct > 0 ? '+' : ''}{Math.round(momentumPct)}%
                    </span>
                  )}
                </div>
              )}
            </motion.div>
          )}

          {/* ── Section: Charts ── */}
          <SectionDivider label={t('analysis.charts')} />

          {/* ── Charts row ── */}
          <div className="grid lg:grid-cols-2 gap-4 sm:gap-6">
            <motion.div custom={0} variants={cardVariant} initial="hidden" animate="visible">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base" suppressHydrationWarning>{t('analysis.monthlyTrend')}</CardTitle>
                  <CardDescription className="text-xs" suppressHydrationWarning>{t('analysis.monthlyTrendDesc')}</CardDescription>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                  {monthlyData.length === 0 ? (
                    <div className="flex items-center justify-center h-[220px] text-sm text-muted-foreground">
                      {t('analysis.noMonthlyData')}
                    </div>
                  ) : (
                    <MonthlyTrendChart
                      data={monthlyData}
                      currency={currency}
                      spendingLabel={t('analysis.spending')}
                    />
                  )}
                </CardContent>
              </Card>
            </motion.div>

            <motion.div custom={1} variants={cardVariant} initial="hidden" animate="visible">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base" suppressHydrationWarning>{t('analysis.categoryBreakdown')}</CardTitle>
                  <CardDescription className="text-xs" suppressHydrationWarning>{t('analysis.categoryBreakdownDesc')}</CardDescription>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                  {categoryData.length === 0 ? (
                    <div className="flex items-center justify-center h-[220px] text-sm text-muted-foreground">
                      {t('analysis.noCategoryData')}
                    </div>
                  ) : (
                    <CategoryPieChart
                      data={categoryData}
                      currency={currency}
                      amountLabel={t('analysis.amount')}
                    />
                  )}
                </CardContent>
              </Card>
            </motion.div>
          </div>

          {/* ── Daily spending ── */}
          <motion.div custom={2} variants={cardVariant} initial="hidden" animate="visible">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base" suppressHydrationWarning>{t('analysis.dailySpending')}</CardTitle>
                <CardDescription className="text-xs">
                  {t('analysis.dailySpendingDesc')}
                </CardDescription>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                {dailyData.length === 0 ? (
                  <div className="flex items-center justify-center h-[180px] text-sm text-muted-foreground">
                    {t('analysis.noDailyData')}
                  </div>
                ) : (
                  <DailySpendingChart
                    data={dailyData}
                    currency={currency}
                    spendingLabel={t('analysis.spending')}
                    dateLabel={t('analysis.date')}
                  />
                )}
              </CardContent>
            </Card>
          </motion.div>

          {/* ── Weekday spending ── */}
          <motion.div custom={3} variants={cardVariant} initial="hidden" animate="visible">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base" suppressHydrationWarning>{t('analysis.weekdaySpending')}</CardTitle>
                <CardDescription className="text-xs" suppressHydrationWarning>{t('analysis.weekdaySpendingDesc')}</CardDescription>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                {weekdayData.every(d => d.total === 0) ? (
                  <div className="flex items-center justify-center h-[200px] text-sm text-muted-foreground">
                    {t('analysis.noData')}
                  </div>
                ) : (
                  <WeekdaySpendingChart
                    data={weekdayData}
                    currency={currency}
                    spendingLabel={t('analysis.spending')}
                    avgLabel={t('analysis.avgPerDay')}
                  />
                )}
              </CardContent>
            </Card>
          </motion.div>

          {/* ── Category bar comparison ── */}
          <motion.div custom={4} variants={cardVariant} initial="hidden" animate="visible">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base" suppressHydrationWarning>{t('analysis.categoryComparison')}</CardTitle>
                <CardDescription className="text-xs" suppressHydrationWarning>{t('analysis.categoryComparisonDesc')}</CardDescription>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                {categoryData.length === 0 ? (
                  <div className="flex items-center justify-center h-[240px] text-sm text-muted-foreground">
                    {t('analysis.noCategoryData')}
                  </div>
                ) : (
                  <CategoryBarChart
                    data={categoryData}
                    currency={currency}
                    amountLabel={t('analysis.amount')}
                  />
                )}
              </CardContent>
            </Card>
          </motion.div>

          {/* ── Section: Bank Transactions ── */}
          {!aiLoading && ai?.bankStats && (
            <>
              <SectionDivider label={isPolish ? 'Konto bankowe' : 'Bank Account'} />

              {/* Bank KPIs */}
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                <Card>
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground mb-1">{isPolish ? 'Wydano z konta (rok)' : 'Debited (year)'}</p>
                    <p className="text-xl font-bold tabular-nums text-red-500">{fmtMoney(ai.bankStats.totalDebit, currency)}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground mb-1">{isPolish ? 'Wpłynęło na konto (rok)' : 'Credited (year)'}</p>
                    <p className="text-xl font-bold tabular-nums text-emerald-500">{fmtMoney(ai.bankStats.totalCredit, currency)}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground mb-1">{isPolish ? 'Transakcji bankowych' : 'Bank transactions'}</p>
                    <p className="text-xl font-bold tabular-nums">{ai.bankStats.totalTransactions}</p>
                  </CardContent>
                </Card>
              </div>

              {/* Top Merchants */}
              {ai.bankStats.topMerchants.length > 0 && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Landmark className="h-4 w-4 text-primary" />
                      <span>{isPolish ? 'Najczęstsi odbiorcy (bank)' : 'Top merchants (bank)'}</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {ai.bankStats.topMerchants.map((m, i) => (
                      <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-muted/30 border">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-muted-foreground w-5 text-right">{i + 1}.</span>
                          <span className="text-sm font-medium truncate max-w-[200px]">{m.name}</span>
                        </div>
                        <span className="text-sm font-semibold tabular-nums">{fmtMoney(parseFloat(m.amount), currency)}</span>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}
            </>
          )}

          {/* ── Section: AI Insights ── */}
          <SectionDivider label={t('analysis.aiInsightsSection')} />

          {/* ── AI Summary Banner ── */}
          <AnimatePresence mode="wait">
            {aiLoading ? (
              <motion.div key="ai-loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <Card className="border-primary/30 bg-gradient-to-r from-primary/5 to-violet-500/5">
                  <CardContent className="p-5 flex items-center gap-3">
                    <Loader2 className="h-5 w-5 animate-spin text-primary flex-shrink-0" />
                    <div className="flex flex-col gap-0.5">
                      <p className="text-sm font-medium" suppressHydrationWarning>
                        {t('analysis.aiAnalyzing')}
                      </p>
                      <p className="text-xs text-muted-foreground" suppressHydrationWarning>
                        {t('analysis.aiAnalyzingWait')}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ) : ai?.summary ? (
              <motion.div key="ai-summary" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
                <Card className="border-primary/30 bg-gradient-to-r from-primary/5 via-background to-violet-500/5">
                  <CardContent className="p-5 flex items-start gap-3">
                    <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                      <Brain className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-primary mb-1 uppercase tracking-wide" suppressHydrationWarning>
                        {t('analysis.aiSummary')}
                      </p>
                      <p className="text-sm leading-relaxed">{ai.summary}</p>
                      {ai.predictedMonthlySpend && (
                        <p className="mt-2 text-xs text-muted-foreground" suppressHydrationWarning>
                          {t('analysis.predictedSpend')}
                          <span className="font-semibold text-foreground">{fmtMoney(ai.predictedMonthlySpend, currency)}</span>
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ) : null}
          </AnimatePresence>

          {/* ── AI Error state ── */}
          <AnimatePresence>
            {aiError && !ai && !aiLoading && (
              <motion.div key="ai-error" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <Card className="border-destructive/30 bg-destructive/5">
                  <CardContent className="p-4 flex items-center gap-3">
                    <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-destructive" suppressHydrationWarning>
                        {t('analysis.aiUnavailable')}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">{aiError}</p>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => fetchAi(currency)} className="shrink-0">
                      <RefreshCcw className="h-3.5 w-3.5 mr-1.5" />
                      <span suppressHydrationWarning>{t('analysis.retry')}</span>
                    </Button>
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── AI loading skeleton for insights/recommendations ── */}
          <AnimatePresence mode="wait">
            {aiLoading && <AiSkeleton isPolish={isPolish} />}
          </AnimatePresence>

          {/* ── AI Insights + Recommendations ── */}
          <AnimatePresence>
            {!aiLoading && ai && (ai.insights?.length > 0 || ai.recommendations?.length > 0) && (
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="grid lg:grid-cols-2 gap-4 sm:gap-6">
                {ai.insights?.length > 0 && (
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-violet-500" />
                        <span suppressHydrationWarning>{t('analysis.insights')}</span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {ai.insights.map((ins, i) => (
                        <motion.div key={i} initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.1 }}
                          className={`flex gap-3 p-3 rounded-xl border ${ins.type === 'positive' ? 'bg-emerald-500/8 border-emerald-500/20' : ins.type === 'warning' ? 'bg-orange-500/8 border-orange-500/20' : 'bg-blue-500/8 border-blue-500/20'}`}
                        >
                          <span className="text-xl flex-shrink-0 mt-0.5">{ins.icon}</span>
                          <div>
                            <p className={`text-sm font-semibold mb-0.5 ${ins.type === 'positive' ? 'text-emerald-600 dark:text-emerald-400' : ins.type === 'warning' ? 'text-orange-600 dark:text-orange-400' : 'text-blue-600 dark:text-blue-400'}`}>{ins.title}</p>
                            <p className="text-xs text-muted-foreground leading-relaxed">{ins.description}</p>
                          </div>
                        </motion.div>
                      ))}
                    </CardContent>
                  </Card>
                )}

                {ai.recommendations?.length > 0 && (
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Lightbulb className="h-4 w-4 text-amber-500" />
                        <span suppressHydrationWarning>{t('analysis.recommendations')}</span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {ai.recommendations.map((rec, i) => (
                        <motion.div key={i} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.1 }}
                          className="flex gap-3 p-3 rounded-xl border border-border/60 bg-muted/20 hover:bg-muted/40 transition-colors"
                        >
                          <div className="flex-shrink-0 mt-0.5">
                            <PriorityBadge priority={rec.priority} isPolish={isPolish} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2 mb-0.5">
                              <p className="text-sm font-semibold">{rec.title}</p>
                              {rec.potentialSaving != null && rec.potentialSaving > 0 && (
                                <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400 flex-shrink-0">
                                  <PiggyBank className="h-3 w-3 inline mr-0.5" />
                                  {fmtMoney(rec.potentialSaving, currency)}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground leading-relaxed">{rec.description}</p>
                          </div>
                        </motion.div>
                      ))}
                    </CardContent>
                  </Card>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Section: Trends & Anomalies ── */}
          {!aiLoading && ai && (ai.categoryTrends?.length > 0 || ai.anomalies?.length > 0) && (
            <SectionDivider label={t('analysis.trendsAndAnomalies')} />
          )}

          {/* ── Category Trends ── */}
          <AnimatePresence>
            {!aiLoading && ai?.categoryTrends && ai.categoryTrends.length > 0 && (
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <TrendingUp className="h-4 w-4 text-primary" />
                      <span suppressHydrationWarning>{t('analysis.trends')}</span>
                    </CardTitle>
                    <CardDescription className="text-xs" suppressHydrationWarning>
                      {t('analysis.categoryTrendsDesc')}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {ai.categoryTrends.map((trend, i) => (
                        <motion.div key={i} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.07 }}
                          className="flex items-center gap-3 p-3 rounded-xl border border-border/50 bg-muted/20"
                        >
                          <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg ${trend.trend === 'increasing' ? 'bg-red-500/10 text-red-500' : trend.trend === 'decreasing' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-blue-500/10 text-blue-500'}`}>
                            {trend.trend === 'increasing' ? <TrendingUp className="h-4 w-4" /> : trend.trend === 'decreasing' ? <TrendingDown className="h-4 w-4" /> : <Minus className="h-4 w-4" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{trend.category}</p>
                            <div className="flex items-center gap-1.5">
                              <span className={`text-xs font-semibold ${trend.trend === 'increasing' ? 'text-red-500' : trend.trend === 'decreasing' ? 'text-emerald-500' : 'text-blue-500'}`}>
                                {trend.changePercent > 0 ? '+' : ''}{trend.changePercent}%
                              </span>
                              {trend.note && <span className="text-xs text-muted-foreground truncate">{trend.note}</span>}
                            </div>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Anomalies ── */}
          <AnimatePresence>
            {!aiLoading && ai?.anomalies && ai.anomalies.length > 0 && (
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
                <Card className="border-orange-500/30">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-orange-500" />
                      <span suppressHydrationWarning>{t('analysis.anomalies')}</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {ai.anomalies.map((anom, i) => (
                      <motion.div key={i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.1 }}
                        className="flex gap-3 p-3 rounded-xl bg-orange-500/8 border border-orange-500/20"
                      >
                        <AlertTriangle className="h-4 w-4 text-orange-500 flex-shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="text-xs font-semibold text-orange-600 dark:text-orange-400">{anom.category}</span>
                            <span className="text-xs text-muted-foreground">{anom.date}</span>
                            <span className="text-xs font-medium ml-auto">{fmtMoney(anom.amount, currency)}</span>
                          </div>
                          <p className="text-xs text-muted-foreground">{anom.description}</p>
                        </div>
                      </motion.div>
                    ))}
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Section: Receipt Intelligence ── */}
          {receiptInsights && receiptInsights.summary.totalReceipts > 0 && (
            <>
              <SectionDivider label={t('analysis.receiptIntel')} />

              {/* Stat chips row */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45 }}
                className="grid grid-cols-2 sm:grid-cols-3 gap-3"
              >
                {[
                  {
                    label: isPolish ? 'Paragony (90 dni)' : 'Receipts (90 days)',
                    value: receiptInsights.summary.totalReceipts.toString(),
                    icon: ShoppingCart,
                    color: 'text-teal-500',
                    bg: 'bg-teal-500/10',
                  },
                  {
                    label: t('analysis.avgPerReceipt'),
                    value: fmtMoney(receiptInsights.summary.avgPerReceipt, currency),
                    icon: BarChart2,
                    color: 'text-blue-500',
                    bg: 'bg-blue-500/10',
                  },
                  {
                    label: t('analysis.uniqueVendors'),
                    value: receiptInsights.summary.uniqueVendors.toString(),
                    icon: Store,
                    color: 'text-violet-500',
                    bg: 'bg-violet-500/10',
                  },
                ].map((chip, i) => (
                  <motion.div key={chip.label} custom={i} variants={cardVariant} initial="hidden" animate="visible">
                    <Card className="hover:shadow-md transition-shadow">
                      <CardContent className="p-4">
                        <div className={`inline-flex h-8 w-8 items-center justify-center rounded-lg ${chip.bg} ${chip.color} mb-2`}>
                          <chip.icon className="h-4 w-4" />
                        </div>
                        <p className="text-xs text-muted-foreground mb-0.5">{chip.label}</p>
                        <p className={`text-xl font-extrabold tabular-nums ${chip.color}`}>{chip.value}</p>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </motion.div>

              {/* Top Vendors + Top Items */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.1 }}
                className="grid lg:grid-cols-2 gap-4 sm:gap-6"
              >
                {/* Top Vendors */}
                {receiptInsights.topVendors.length > 0 && (
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Store className="h-4 w-4 text-teal-500" />
                        <span suppressHydrationWarning>{t('analysis.topVendors')}</span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2.5">
                      {receiptInsights.topVendors.slice(0, 5).map((vendor, i) => {
                        const maxTotal = receiptInsights.topVendors[0]?.total || 1
                        const pct = Math.round((vendor.total / maxTotal) * 100)
                        return (
                          <motion.div
                            key={i}
                            initial={{ opacity: 0, x: -8 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: i * 0.07 }}
                            className="space-y-1"
                          >
                            <div className="flex items-center justify-between text-sm">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-muted-foreground w-4">{i + 1}.</span>
                                <span className="font-medium truncate max-w-[160px]">{vendor.name}</span>
                                <span className="text-xs text-muted-foreground">×{vendor.count}</span>
                              </div>
                              <span className="font-semibold tabular-nums">{fmtMoney(vendor.total, currency)}</span>
                            </div>
                            <div className="relative h-1.5 w-full rounded-full bg-muted overflow-hidden">
                              <div
                                className="h-full rounded-full bg-teal-500/70 transition-all duration-500"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </motion.div>
                        )
                      })}
                    </CardContent>
                  </Card>
                )}

                {/* Top Items */}
                {receiptInsights.topItems.length > 0 && (
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center gap-2">
                        <ShoppingCart className="h-4 w-4 text-blue-500" />
                        <span suppressHydrationWarning>{t('analysis.topItems')}</span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex flex-wrap gap-2">
                        {receiptInsights.topItems.slice(0, 8).map((item, i) => (
                          <motion.span
                            key={i}
                            initial={{ opacity: 0, scale: 0.85 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: i * 0.05 }}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border bg-muted/40 text-xs font-medium hover:bg-muted/70 transition-colors"
                          >
                            <span className="capitalize">{item.name}</span>
                            <span className="text-muted-foreground font-normal">×{item.count}</span>
                          </motion.span>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </motion.div>
            </>
          )}
        </>
      )}
    </div>
  )
}
