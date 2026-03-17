'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTranslation } from '@/lib/i18n'
import { useProductType } from '@/hooks/use-product-type'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Target,
  PiggyBank,
  Trophy,
  Tag,
  Sparkles,
  ArrowRight,
  Plus,
  Wallet,
  TrendingUp,
  CreditCard,
  ShieldCheck,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ---- Types ----
interface SavingsGoal {
  id: string
  name: string
  emoji: string | null
  targetAmount: string
  currentAmount: string
  deadline: string | null
  isCompleted: boolean
}

interface CategoryBudget {
  id: string
  name: string
  icon: string | null
  budgeted: number
  spent: number
}

interface Challenge {
  id: string
  name: string
  emoji: string | null
  type: string
  isActive: boolean
  isCompleted: boolean | null
  currentProgress: string | null
  startDate: string
  endDate: string
}

type TabKey = 'goals' | 'budget' | 'challenges' | 'deals'

const TABS: { key: TabKey; icon: typeof Target }[] = [
  { key: 'goals', icon: Target },
  { key: 'budget', icon: PiggyBank },
  { key: 'challenges', icon: Trophy },
  { key: 'deals', icon: Tag },
]

// ---- Skeleton ----
function SavingsHubSkeleton() {
  return (
    <div className="flex flex-col gap-4 sm:gap-6 animate-pulse">
      <div className="space-y-2">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-5 w-72" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-24 rounded-xl" />
      </div>
      <Skeleton className="h-10 w-full rounded-lg" />
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
    </div>
  )
}

// ---- Health Score Mini Gauge ----
function HealthGauge({ score }: { score: number }) {
  const color = score >= 70 ? 'text-emerald-500' : score >= 40 ? 'text-yellow-500' : 'text-red-500'
  const bgColor = score >= 70 ? 'bg-emerald-500' : score >= 40 ? 'bg-yellow-500' : 'bg-red-500'

  return (
    <div className="flex items-center gap-2">
      <div className="relative h-10 w-10">
        <svg viewBox="0 0 36 36" className="h-10 w-10 -rotate-90">
          <circle cx="18" cy="18" r="15" fill="none" stroke="currentColor" strokeWidth="3" className="text-muted/30" />
          <circle
            cx="18" cy="18" r="15" fill="none" strokeWidth="3"
            className={color}
            stroke="currentColor"
            strokeDasharray={`${(score / 100) * 94.25} 94.25`}
            strokeLinecap="round"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={cn('text-[10px] font-bold', color)}>{score}</span>
        </div>
      </div>
      <div className="h-2 flex-1 rounded-full bg-muted/30 overflow-hidden max-w-24 hidden sm:block">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${score}%` }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] as any }}
          className={cn('h-full rounded-full', bgColor)}
        />
      </div>
    </div>
  )
}

// ---- Goal Mini Card ----
function GoalMiniCard({ goal, currency, locale }: { goal: SavingsGoal; currency: string; locale: string }) {
  const current = parseFloat(goal.currentAmount || '0')
  const target = parseFloat(goal.targetAmount || '1')
  const pct = Math.min(Math.round((current / target) * 100), 100)

  const formatAmount = (v: number) =>
    new Intl.NumberFormat(locale, { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v)

  return (
    <div className="rounded-xl border bg-card p-3.5 hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-lg">{goal.emoji || '🎯'}</span>
          <span className="text-sm font-medium truncate max-w-[120px]">{goal.name}</span>
        </div>
        {goal.isCompleted && (
          <Badge className="bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900 text-[10px] px-1.5">
            <ShieldCheck className="h-3 w-3 mr-0.5" />
            100%
          </Badge>
        )}
      </div>
      <div className="flex items-end justify-between text-xs text-muted-foreground mb-1.5">
        <span className="tabular-nums font-medium text-foreground">{formatAmount(current)}</span>
        <span className="tabular-nums">{formatAmount(target)}</span>
      </div>
      <div className="h-1.5 rounded-full bg-muted/50 overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] as any }}
          className={cn('h-full rounded-full', pct >= 100 ? 'bg-emerald-500' : 'bg-primary')}
        />
      </div>
    </div>
  )
}

// ---- Budget Category Row ----
function BudgetMiniRow({ cat, currency, locale }: { cat: CategoryBudget; currency: string; locale: string }) {
  const pct = cat.budgeted > 0 ? Math.min(Math.round((cat.spent / cat.budgeted) * 100), 100) : 0
  const isOver = cat.spent > cat.budgeted && cat.budgeted > 0

  const formatAmount = (v: number) =>
    new Intl.NumberFormat(locale, { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v)

  return (
    <div className="flex items-center gap-3 py-2">
      <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 text-sm">
        {cat.icon || '📂'}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between text-sm mb-1">
          <span className="font-medium truncate">{cat.name}</span>
          <span className={cn('text-xs tabular-nums', isOver ? 'text-red-500 font-semibold' : 'text-muted-foreground')}>
            {formatAmount(cat.spent)} / {formatAmount(cat.budgeted)}
          </span>
        </div>
        <div className="h-1.5 rounded-full bg-muted/50 overflow-hidden">
          <div
            className={cn('h-full rounded-full transition-all', isOver ? 'bg-red-500' : 'bg-primary')}
            style={{ width: `${Math.min(pct, 100)}%` }}
          />
        </div>
      </div>
    </div>
  )
}

// ---- Challenge Mini Card ----
function ChallengeMiniCard({ challenge }: { challenge: Challenge }) {
  const { t } = useTranslation()
  const progress = parseFloat(challenge.currentProgress || '0')
  const daysLeft = Math.max(0, Math.ceil((new Date(challenge.endDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))

  return (
    <div className="rounded-xl border bg-card p-3.5 hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-lg">{challenge.emoji || '💪'}</span>
          <span className="text-sm font-medium truncate max-w-[160px]">{challenge.name}</span>
        </div>
        <Badge
          className={cn(
            'text-[10px] px-1.5',
            challenge.isCompleted
              ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400'
              : challenge.isActive
              ? 'bg-yellow-100 dark:bg-yellow-950/60 text-yellow-700 dark:text-yellow-400'
              : 'bg-muted text-muted-foreground'
          )}
        >
          {challenge.isCompleted
            ? t('goals.completed')
            : `${daysLeft} ${t('goals.daysLeft')}`
          }
        </Badge>
      </div>
      <div className="h-1.5 rounded-full bg-muted/50 overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${Math.min(progress, 100)}%` }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] as any }}
          className={cn('h-full rounded-full', progress >= 100 ? 'bg-emerald-500' : 'bg-violet-500')}
        />
      </div>
    </div>
  )
}

// ---- Main Hub ----
export default function SavingsHub() {
  const { t, lang, mounted } = useTranslation()
  const { isPersonal } = useProductType()
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<TabKey>('goals')
  const [currency, setCurrency] = useState('PLN')

  // Data
  const [goals, setGoals] = useState<SavingsGoal[]>([])
  const [budgetCategories, setBudgetCategories] = useState<CategoryBudget[]>([])
  const [totalSpent, setTotalSpent] = useState(0)
  const [totalBudgeted, setTotalBudgeted] = useState(0)
  const [challenges, setChallenges] = useState<Challenge[]>([])
  const [healthScore, setHealthScore] = useState(65)

  const locale = lang === 'pl' ? 'pl-PL' : 'en-US'

  // Read hash for initial tab
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const hash = window.location.hash.replace('#', '') as TabKey
      if (['goals', 'budget', 'challenges', 'deals'].includes(hash)) {
        setActiveTab(hash)
      }
    }
  }, [])

  // Redirect business users
  useEffect(() => {
    if (mounted && !isPersonal) {
      router.push('/dashboard')
    }
  }, [mounted, isPersonal, router])

  // Fetch all data
  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [settingsRes, goalsRes, budgetRes, challengesRes] = await Promise.allSettled([
        fetch('/api/data/settings').then(r => r.json()),
        fetch('/api/personal/goals').then(r => r.json()),
        fetch(`/api/personal/budget?month=${new Date().toISOString().slice(0, 7)}`).then(r => r.json()),
        fetch('/api/personal/challenges').then(r => r.json()),
      ])

      if (settingsRes.status === 'fulfilled') {
        const s = settingsRes.value
        if (s?.settings?.currency) setCurrency(s.settings.currency.toUpperCase())
      }

      if (goalsRes.status === 'fulfilled') {
        setGoals(goalsRes.value.goals || [])
      }

      if (budgetRes.status === 'fulfilled') {
        const bd = budgetRes.value
        setBudgetCategories(bd.categoryBreakdown || [])
        setTotalSpent(bd.totalSpent || 0)
        const tb = (bd.categoryBreakdown || []).reduce((sum: number, c: CategoryBudget) => sum + c.budgeted, 0)
        setTotalBudgeted(tb)
      }

      if (challengesRes.status === 'fulfilled') {
        setChallenges(challengesRes.value.challenges || [])
      }

      // Calculate health score based on budget usage
      if (budgetRes.status === 'fulfilled') {
        const bd = budgetRes.value
        const spent = bd.totalSpent || 0
        const tb = (bd.categoryBreakdown || []).reduce((sum: number, c: CategoryBudget) => sum + c.budgeted, 0)
        if (tb > 0) {
          const ratio = spent / tb
          setHealthScore(Math.max(0, Math.min(100, Math.round((1 - ratio * 0.8) * 100))))
        }
      }
    } catch {
      // Silent fail — hub is summary only
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (isPersonal) fetchData()
  }, [fetchData, isPersonal])

  const totalSaved = goals.reduce((sum, g) => sum + parseFloat(g.currentAmount || '0'), 0)

  const formatAmount = (v: number) =>
    new Intl.NumberFormat(locale, { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v)

  const handleTabChange = (tab: TabKey) => {
    setActiveTab(tab)
    if (typeof window !== 'undefined') {
      window.history.replaceState(null, '', `#${tab}`)
    }
  }

  if (!isPersonal) return null
  if (loading) return <SavingsHubSkeleton />

  const fadeUp = {
    hidden: { opacity: 0, y: 24 },
    show: (i: number) => ({
      opacity: 1, y: 0,
      transition: { duration: 0.5, delay: i * 0.08, ease: [0.22, 1, 0.36, 1] as const },
    }),
  }

  const activeChallenges = challenges.filter(c => c.isActive && !c.isCompleted)
  const budgetWithAmounts = budgetCategories.filter(c => c.budgeted > 0)

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.35 }} className="flex flex-col gap-4 sm:gap-6">
      {/* Header */}
      <motion.div custom={0} initial="hidden" animate="show" variants={fadeUp}>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight" suppressHydrationWarning>
          {t('savings.title')}
        </h1>
        <p className="text-sm text-muted-foreground mt-1" suppressHydrationWarning>
          {t('savings.subtitle')}
        </p>
      </motion.div>

      {/* KPI strip */}
      <motion.div custom={1} initial="hidden" animate="show" variants={fadeUp}>
        <div className="grid grid-cols-2 gap-3">
          <Card className="hover:shadow-md transition-shadow">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-emerald-500/10 flex items-center justify-center shrink-0">
                <Wallet className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground uppercase tracking-wide font-medium" suppressHydrationWarning>
                  {t('savings.totalSaved')}
                </p>
                <p className="text-lg font-bold tabular-nums">{formatAmount(totalSaved)}</p>
              </div>
            </CardContent>
          </Card>

          <Card className="hover:shadow-md transition-shadow">
            <CardContent className="p-4 flex items-center gap-3">
              <HealthGauge score={healthScore} />
              <div>
                <p className="text-[11px] text-muted-foreground uppercase tracking-wide font-medium" suppressHydrationWarning>
                  {t('savings.healthScore')}
                </p>
                <p className="text-lg font-bold tabular-nums">{healthScore}/100</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </motion.div>

      {/* AI Tip Banner */}
      <motion.div custom={2} initial="hidden" animate="show" variants={fadeUp}>
        <div className="rounded-xl border bg-gradient-to-r from-primary/5 via-violet-500/5 to-emerald-500/5 p-3.5 flex items-start gap-3">
          <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
            <Sparkles className="h-4 w-4 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-primary mb-0.5" suppressHydrationWarning>{t('savings.aiTip')}</p>
            <p className="text-sm text-muted-foreground leading-relaxed" suppressHydrationWarning>
              {t('savings.aiTipText')}
            </p>
          </div>
        </div>
      </motion.div>

      {/* Tabs */}
      <motion.div custom={3} initial="hidden" animate="show" variants={fadeUp}>
        <div className="flex gap-1 p-1 bg-muted/50 rounded-lg">
          {TABS.map(tab => {
            const Icon = tab.icon
            const isActive = activeTab === tab.key
            return (
              <button
                key={tab.key}
                onClick={() => handleTabChange(tab.key)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition-all flex-1 justify-center',
                  isActive
                    ? 'bg-background shadow-sm text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                )}
                suppressHydrationWarning
              >
                <Icon className="h-4 w-4" />
                <span className="hidden sm:inline">{t(`savings.tabs.${tab.key}`)}</span>
              </button>
            )
          })}
        </div>
      </motion.div>

      {/* Tab Content */}
      <AnimatePresence mode="wait">
        {activeTab === 'goals' && (
          <motion.div
            key="goals"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.3 }}
            className="space-y-4"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold" suppressHydrationWarning>{t('savings.tabs.goals')}</h2>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" asChild>
                  <Link href="/goals">
                    <span suppressHydrationWarning>{t('savings.viewAll')}</span>
                    <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
                  </Link>
                </Button>
                <Button size="sm" asChild>
                  <Link href="/goals">
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    <span suppressHydrationWarning>{t('goals.newGoal')}</span>
                  </Link>
                </Button>
              </div>
            </div>

            {goals.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center">
                  <Target className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground" suppressHydrationWarning>{t('savings.goalsEmpty')}</p>
                  <Button className="mt-4" size="sm" asChild>
                    <Link href="/goals">
                      <Plus className="h-3.5 w-3.5 mr-1.5" />
                      <span suppressHydrationWarning>{t('goals.newGoal')}</span>
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                {goals.slice(0, 6).map(goal => (
                  <GoalMiniCard key={goal.id} goal={goal} currency={currency} locale={locale} />
                ))}
              </div>
            )}
          </motion.div>
        )}

        {activeTab === 'budget' && (
          <motion.div
            key="budget"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.3 }}
            className="space-y-4"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold" suppressHydrationWarning>{t('savings.monthOverview')}</h2>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" asChild>
                  <Link href="/budget">
                    <span suppressHydrationWarning>{t('savings.viewAll')}</span>
                    <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
                  </Link>
                </Button>
                <Button size="sm" variant="secondary" asChild>
                  <Link href="/budget">
                    <Wallet className="h-3.5 w-3.5 mr-1.5" />
                    <span suppressHydrationWarning>{t('savings.canIAfford')}</span>
                  </Link>
                </Button>
              </div>
            </div>

            {/* Budget overview card */}
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="text-xs text-muted-foreground" suppressHydrationWarning>{t('dashboard.totalSpent')}</p>
                    <p className="text-xl font-bold tabular-nums">{formatAmount(totalSpent)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground" suppressHydrationWarning>{t('dashboard.budgetProgress')}</p>
                    <p className="text-xl font-bold tabular-nums">{formatAmount(totalBudgeted)}</p>
                  </div>
                </div>

                {/* Overall progress bar */}
                {totalBudgeted > 0 && (
                  <div className="mb-4">
                    <div className="h-2 rounded-full bg-muted/50 overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.min((totalSpent / totalBudgeted) * 100, 100)}%` }}
                        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] as any }}
                        className={cn(
                          'h-full rounded-full',
                          totalSpent > totalBudgeted ? 'bg-red-500' : 'bg-primary'
                        )}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 text-right">
                      {Math.round((totalSpent / totalBudgeted) * 100)}% {t('dashboard.used')}
                    </p>
                  </div>
                )}

                {budgetWithAmounts.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4" suppressHydrationWarning>
                    {t('savings.budgetEmpty')}
                  </p>
                ) : (
                  <div className="divide-y">
                    {budgetWithAmounts.slice(0, 5).map(cat => (
                      <BudgetMiniRow key={cat.id} cat={cat} currency={currency} locale={locale} />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        )}

        {activeTab === 'challenges' && (
          <motion.div
            key="challenges"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.3 }}
            className="space-y-4"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold" suppressHydrationWarning>{t('savings.activeChallenges')}</h2>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" asChild>
                  <Link href="/challenges">
                    <span suppressHydrationWarning>{t('savings.viewAll')}</span>
                    <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
                  </Link>
                </Button>
                <Button size="sm" asChild>
                  <Link href="/challenges">
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    <span suppressHydrationWarning>{t('challenges.new')}</span>
                  </Link>
                </Button>
              </div>
            </div>

            {activeChallenges.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center">
                  <Trophy className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground" suppressHydrationWarning>{t('savings.challengesEmpty')}</p>
                  <Button className="mt-4" size="sm" asChild>
                    <Link href="/challenges">
                      <Plus className="h-3.5 w-3.5 mr-1.5" />
                      <span suppressHydrationWarning>{t('challenges.new')}</span>
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
                {activeChallenges.slice(0, 4).map(ch => (
                  <ChallengeMiniCard key={ch.id} challenge={ch} />
                ))}
              </div>
            )}
          </motion.div>
        )}

        {activeTab === 'deals' && (
          <motion.div
            key="deals"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.3 }}
            className="space-y-4"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold" suppressHydrationWarning>{t('savings.personalizedDeals')}</h2>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" asChild>
                  <Link href="/promotions">
                    <span suppressHydrationWarning>{t('savings.viewAll')}</span>
                    <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
                  </Link>
                </Button>
              </div>
            </div>

            <Card>
              <CardContent className="p-8 text-center">
                <Tag className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground" suppressHydrationWarning>{t('savings.dealsEmpty')}</p>
                <Button className="mt-4" size="sm" variant="outline" asChild>
                  <Link href="/promotions">
                    <Tag className="h-3.5 w-3.5 mr-1.5" />
                    <span suppressHydrationWarning>{t('savings.viewAll')}</span>
                  </Link>
                </Button>
              </CardContent>
            </Card>

            {/* Loyalty Cards section */}
            <div className="flex items-center justify-between mt-6">
              <h2 className="text-lg font-semibold" suppressHydrationWarning>{t('savings.loyaltyCards')}</h2>
              <Button variant="outline" size="sm" asChild>
                <Link href="/loyalty">
                  <CreditCard className="h-3.5 w-3.5 mr-1.5" />
                  <span suppressHydrationWarning>{t('savings.viewAll')}</span>
                </Link>
              </Button>
            </div>

            <Card>
              <CardContent className="p-6 text-center">
                <CreditCard className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground" suppressHydrationWarning>
                  {t('settings.loyaltyCardsDesc')}
                </p>
                <Button className="mt-3" size="sm" variant="outline" asChild>
                  <Link href="/loyalty">
                    <span suppressHydrationWarning>{t('settings.manageLoyalty')}</span>
                  </Link>
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
