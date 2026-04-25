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
import { SavingsGoalCard } from '@/components/protected/personal/savings-goal-card'
import { NewGoalSheet } from '@/components/protected/personal/new-goal-sheet'
import { AddFundsSheet } from '@/components/protected/personal/add-funds-sheet'
import { FinancialHealthScore } from '@/components/protected/personal/financial-health-score'
import {
  Target,
  PiggyBank,
  Trophy,
  Tag,
  Sparkles,
  ArrowRight,
  Plus,
  Wallet,
  CreditCard,
  ShieldCheck,
  TrendingUp,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'

// ---- Types ----
interface SavingsGoal {
  id: string
  name: string
  emoji: string | null
  targetAmount: string
  currentAmount: string
  currency: string | null
  deadline: string | null
  priority: string | null
  color: string | null
  category: string | null
  isCompleted: boolean
  completedAt: string | null
  aiTips: string[] | null
  createdAt: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  deposits: any[]
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

const CATEGORY_EMOJIS: Record<string, string> = {
  electronics: '🎮',
  travel: '✈️',
  emergency: '🚨',
  education: '📚',
  car: '🚗',
  home: '🏠',
  custom: '🎁',
}

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
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] as any }}
          className={cn('h-full rounded-full', bgColor)}
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
    <div className="rounded-xl border bg-card p-3.5 hover:shadow-md hover:-translate-y-0.5 transition-all duration-300">
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
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

  // Goals state
  const [goals, setGoals] = useState<SavingsGoal[]>([])
  const [newGoalOpen, setNewGoalOpen] = useState(false)
  const [addFundsGoal, setAddFundsGoal] = useState<{
    id: string
    name: string
    emoji: string | null
    targetAmount: string
    currentAmount: string
    color: string | null
    currency: string | null
  } | null>(null)
  const [showCompleted, setShowCompleted] = useState(false)
  const [filterCategory, setFilterCategory] = useState<string | null>(null)
  const [goalToDelete, setGoalToDelete] = useState<string | null>(null)
  const [deletingGoal, setDeletingGoal] = useState(false)

  // Budget state
  const [budgetCategories, setBudgetCategories] = useState<CategoryBudget[]>([])
  const [totalSpent, setTotalSpent] = useState(0)
  const [totalBudgeted, setTotalBudgeted] = useState(0)

  // Challenges state
  const [challenges, setChallenges] = useState<Challenge[]>([])

  // Health score
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

  async function confirmDeleteGoal() {
    if (!goalToDelete) return
    setDeletingGoal(true)
    try {
      const res = await fetch(`/api/personal/goals/${goalToDelete}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      setGoals(prev => prev.filter(g => g.id !== goalToDelete))
      toast.success(t('goals.deleteGoal'))
      setGoalToDelete(null)
    } catch {
      toast.error(t('errors.deleteGoal'))
    } finally {
      setDeletingGoal(false)
    }
  }

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

  const activeGoals = goals.filter(g => !g.isCompleted)
  const completedGoals = goals.filter(g => g.isCompleted)
  const filteredGoals = filterCategory ? activeGoals.filter(g => g.category === filterCategory) : activeGoals

  // Monthly savings needed across all active goals
  const monthlyNeeded = activeGoals.reduce((sum, g) => {
    const target = parseFloat(g.targetAmount || '0')
    const current = parseFloat(g.currentAmount || '0')
    const remaining = target - current
    if (remaining <= 0) return sum
    if (g.deadline) {
      const daysLeft = Math.max(1, Math.ceil((new Date(g.deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
      return sum + (remaining / daysLeft) * 30
    }
    return sum + remaining / 12
  }, 0)

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
            {/* Goals header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold" suppressHydrationWarning>{t('savings.tabs.goals')}</h2>
                {activeGoals.length > 0 && (
                  <p className="text-sm text-muted-foreground" suppressHydrationWarning>{t('goals.subtitle')}</p>
                )}
              </div>
              <Button size="sm" onClick={() => setNewGoalOpen(true)} className="shrink-0">
                <Plus className="h-3.5 w-3.5 mr-1" />
                <span suppressHydrationWarning>{t('goals.newGoal')}</span>
              </Button>
            </div>

            {/* KPI strip for goals */}
            {activeGoals.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { icon: PiggyBank, label: t('goals.totalSaved'), value: formatAmount(totalSaved), color: 'text-emerald-600 dark:text-emerald-400' },
                  { icon: Target, label: t('goals.activeGoals'), value: String(activeGoals.length), color: 'text-primary' },
                  { icon: TrendingUp, label: t('goals.perMonth'), value: formatAmount(monthlyNeeded), color: 'text-amber-600 dark:text-amber-400' },
                  { icon: Sparkles, label: t('goals.completed'), value: String(completedGoals.length), color: 'text-purple-600 dark:text-purple-400' },
                ].map((kpi, i) => (
                  <Card key={i} className="hover:shadow-sm transition-shadow">
                    <CardHeader className="pb-1 pt-3 px-3">
                      <CardTitle className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
                        <kpi.icon className="h-3 w-3" />
                        <span suppressHydrationWarning>{kpi.label}</span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="px-3 pb-3 pt-0">
                      <div className={cn('text-base font-bold', kpi.color)}>{kpi.value}</div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {/* Category filter */}
            {activeGoals.length > 0 && (
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setFilterCategory(null)}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all min-h-[36px]',
                    !filterCategory ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/80 text-muted-foreground'
                  )}
                  suppressHydrationWarning
                >
                  {t('goals.allCategories')}
                </button>
                {Object.entries(CATEGORY_EMOJIS).map(([key, emo]) => (
                  <button
                    key={key}
                    onClick={() => setFilterCategory(filterCategory === key ? null : key)}
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all min-h-[36px]',
                      filterCategory === key ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/80 text-muted-foreground'
                    )}
                  >
                    <span>{emo}</span>
                    {t(`goals.category.${key}` as Parameters<typeof t>[0])}
                  </button>
                ))}
              </div>
            )}

            {/* Empty state */}
            {goals.length === 0 && (
              <Card>
                <CardContent className="p-8 text-center">
                  <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3" suppressHydrationWarning>
                    {'// '}{t('goals.emptyTitle')}
                  </p>
                  <div className="mx-auto mb-4 h-16 w-16 border-2 border-foreground bg-secondary shadow-[3px_3px_0_hsl(var(--foreground))] rounded-md flex items-center justify-center">
                    <Target className="h-8 w-8 text-foreground" />
                  </div>
                  <h3 className="font-semibold mb-1" suppressHydrationWarning>{t('goals.emptyTitle')}</h3>
                  <p className="text-sm text-muted-foreground mb-4" suppressHydrationWarning>{t('goals.emptyDesc')}</p>
                  <Button size="sm" onClick={() => setNewGoalOpen(true)}>
                    <Plus className="h-3.5 w-3.5 mr-1.5" />
                    <span suppressHydrationWarning>{t('goals.newGoal')}</span>
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Active goals grid */}
            {filteredGoals.length > 0 && (
              <motion.div
                className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4"
                variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.05 } } }}
                initial="hidden"
                animate="visible"
              >
                {filteredGoals.map((goal, i) => (
                  <SavingsGoalCard
                    key={goal.id}
                    goal={goal}
                    index={i}
                    onAddFunds={g => setAddFundsGoal({ id: g.id, name: g.name, emoji: g.emoji, targetAmount: g.targetAmount, currentAmount: g.currentAmount, color: g.color, currency: g.currency })}
                    onDelete={(gid: string) => setGoalToDelete(gid)}
                    currency={currency}
                  />
                ))}
              </motion.div>
            )}

            {/* AI Coach + Financial Health — shown when goals exist */}
            {activeGoals.length > 0 && (
              <div className="grid md:grid-cols-2 gap-4">
                <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-emerald-500/5">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Sparkles className="h-5 w-5 text-primary" />
                      {t('goals.aiCoach')}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-start gap-2 bg-background/50 rounded-lg px-3 py-2.5 border border-border/40">
                      <TrendingUp className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                      <p className="text-sm leading-relaxed">
                        {t('goals.aiCoachSaveMonthly')
                          .replace('%amount', monthlyNeeded.toFixed(0))
                          .replace('%currency', currency)}
                      </p>
                    </div>
                    {activeGoals.slice(0, 2).map(g => {
                      const target = parseFloat(g.targetAmount || '0')
                      const current = parseFloat(g.currentAmount || '0')
                      const pct = target > 0 ? (current / target) * 100 : 0
                      const onTrack = pct >= 50 || !g.deadline
                      return (
                        <div key={g.id} className="flex items-start gap-2 text-xs text-muted-foreground">
                          <span className="text-base">{g.emoji}</span>
                          <span>
                            {g.name} — {onTrack ? t('goals.onTrack') : t('goals.behindSchedule')}
                            {' '}({Math.round(pct)}%)
                          </span>
                          <Badge variant="outline" className={cn('ml-auto text-[10px]', onTrack ? 'border-emerald-500/30 text-emerald-600' : 'border-amber-500/30 text-amber-600')}>
                            {onTrack ? '✓' : '!'}
                          </Badge>
                        </div>
                      )
                    })}
                    {activeGoals[0]?.aiTips && activeGoals[0].aiTips.length > 0 && (
                      <div className="pt-2 border-t border-border/40 space-y-1.5">
                        {activeGoals[0].aiTips.slice(0, 2).map((tip, i) => (
                          <p key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                            <span className="text-primary mt-0.5">•</span>
                            {tip}
                          </p>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
                <FinancialHealthScore />
              </div>
            )}

            {/* Completed goals */}
            {completedGoals.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <button
                    onClick={() => setShowCompleted(!showCompleted)}
                    className="flex items-center justify-between w-full"
                  >
                    <CardTitle className="text-base flex items-center gap-2">
                      <Sparkles className="h-5 w-5 text-purple-500" />
                      {t('goals.completedGoals')} ({completedGoals.length})
                    </CardTitle>
                    {showCompleted ? (
                      <ChevronUp className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    )}
                  </button>
                </CardHeader>
                <AnimatePresence>
                  {showCompleted && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3 }}
                      className="overflow-hidden"
                    >
                      <CardContent className="pt-0">
                        <div className="divide-y divide-border/40">
                          {completedGoals.map(g => {
                            const createdDate = new Date(g.createdAt)
                            const completedDate = g.completedAt ? new Date(g.completedAt) : null
                            const daysTaken = completedDate
                              ? Math.ceil((completedDate.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24))
                              : null
                            return (
                              <div key={g.id} className="flex items-center gap-3 py-3">
                                <span className="text-xl">{g.emoji || '🎯'}</span>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-semibold">{g.name}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {parseFloat(g.targetAmount).toLocaleString('pl-PL', { minimumFractionDigits: 2 })} {g.currency || currency}
                                  </p>
                                </div>
                                <div className="text-right shrink-0">
                                  {completedDate && (
                                    <p className="text-xs text-muted-foreground">
                                      {t('goals.reachedOn')} {completedDate.toLocaleDateString(lang === 'pl' ? 'pl-PL' : 'en-US')}
                                    </p>
                                  )}
                                  {daysTaken !== null && (
                                    <p className="text-[10px] text-muted-foreground">
                                      {daysTaken} {t('goals.days')}
                                    </p>
                                  )}
                                </div>
                                <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/20 text-[10px]">
                                  <ShieldCheck className="h-3 w-3 mr-0.5" />
                                  ✓
                                </Badge>
                              </div>
                            )
                          })}
                        </div>
                      </CardContent>
                    </motion.div>
                  )}
                </AnimatePresence>
              </Card>
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
                    <div
                      className="h-2 rounded-full bg-muted/50 overflow-hidden"
                      role="progressbar"
                      aria-valuenow={Math.round((totalSpent / totalBudgeted) * 100)}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={t('dashboard.budgetProgress') || 'Budget progress'}
                    >
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.min((totalSpent / totalBudgeted) * 100, 100)}%` }}
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
                  <motion.div
                    className="divide-y"
                    variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.05 } } }}
                    initial="hidden"
                    animate="visible"
                  >
                    {budgetWithAmounts.slice(0, 5).map(cat => (
                      <motion.div key={cat.id} variants={{ hidden: { opacity: 0, y: 8 }, visible: { opacity: 1, y: 0, transition: { duration: 0.3 } } }}>
                        <BudgetMiniRow cat={cat} currency={currency} locale={locale} />
                      </motion.div>
                    ))}
                  </motion.div>
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
              <motion.div
                className="grid gap-3 grid-cols-1 sm:grid-cols-2"
                variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.05 } } }}
                initial="hidden"
                animate="visible"
              >
                {activeChallenges.slice(0, 4).map(ch => (
                  <motion.div key={ch.id} variants={{ hidden: { opacity: 0, y: 8 }, visible: { opacity: 1, y: 0, transition: { duration: 0.3 } } }}>
                    <ChallengeMiniCard challenge={ch} />
                  </motion.div>
                ))}
              </motion.div>
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

      {/* Sheets */}
      <NewGoalSheet
        open={newGoalOpen}
        onOpenChange={setNewGoalOpen}
        onCreated={fetchData}
        currency={currency}
      />
      <AddFundsSheet
        open={!!addFundsGoal}
        onOpenChange={open => { if (!open) setAddFundsGoal(null) }}
        goal={addFundsGoal}
        onDeposited={fetchData}
        currency={currency}
      />
      <ConfirmDialog
        open={goalToDelete !== null}
        onOpenChange={(open) => !open && !deletingGoal && setGoalToDelete(null)}
        title={t('goals.deleteConfirm')}
        confirmLabel={t('common.delete')}
        cancelLabel={t('common.cancel')}
        destructive
        loading={deletingGoal}
        onConfirm={confirmDeleteGoal}
      />
    </motion.div>
  )
}
