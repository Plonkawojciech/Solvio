'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTranslation } from '@/lib/i18n'
import { useProductType } from '@/hooks/use-product-type'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { SavingsGoalCard } from '@/components/protected/personal/savings-goal-card'
import { NewGoalSheet } from '@/components/protected/personal/new-goal-sheet'
import { AddFundsSheet } from '@/components/protected/personal/add-funds-sheet'
import { FinancialHealthScore } from '@/components/protected/personal/financial-health-score'
import {
  Target,
  Plus,
  Sparkles,
  PiggyBank,
  TrendingUp,
  ChevronDown,
  ChevronUp,
  Loader2,
  Gamepad2,
  Plane,
  AlertTriangle,
  GraduationCap,
  Car,
  Home,
  Gift,
} from 'lucide-react'
import { toast } from 'sonner'

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
  deposits: any[]
}

const CATEGORY_ICONS: Record<string, any> = {
  electronics: Gamepad2,
  travel: Plane,
  emergency: AlertTriangle,
  education: GraduationCap,
  car: Car,
  home: Home,
  custom: Gift,
}

const CATEGORY_EMOJIS: Record<string, string> = {
  electronics: '🎮',
  travel: '✈️',
  emergency: '🚨',
  education: '📚',
  car: '🚗',
  home: '🏠',
  custom: '🎁',
}

export default function GoalsPage() {
  const { t, lang, mounted } = useTranslation()
  const { isPersonal } = useProductType()
  const router = useRouter()

  const [goals, setGoals] = useState<SavingsGoal[]>([])
  const [loading, setLoading] = useState(true)
  const [currency, setCurrency] = useState('PLN')
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

  // Redirect business users
  useEffect(() => {
    if (mounted && !isPersonal) {
      router.push('/dashboard')
    }
  }, [mounted, isPersonal, router])

  // Fetch currency
  useEffect(() => {
    fetch('/api/data/settings')
      .then(r => r.json())
      .then(d => { if (d?.settings?.currency) setCurrency(d.settings.currency.toUpperCase()) })
      .catch(() => {})
  }, [])

  const fetchGoals = useCallback(async () => {
    try {
      const res = await fetch('/api/personal/goals')
      if (!res.ok) throw new Error()
      const data = await res.json()
      setGoals(data.goals || [])
    } catch {
      toast.error('Failed to load goals')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchGoals()
  }, [fetchGoals])

  async function handleDelete(id: string) {
    if (!confirm(t('goals.deleteConfirm'))) return
    try {
      const res = await fetch(`/api/personal/goals/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      setGoals(prev => prev.filter(g => g.id !== id))
      toast.success(t('goals.deleteGoal'))
    } catch {
      toast.error('Failed to delete goal')
    }
  }

  if (!mounted) return null

  const activeGoals = goals.filter(g => !g.isCompleted)
  const completedGoals = goals.filter(g => g.isCompleted)
  const totalSaved = goals.reduce((sum, g) => sum + parseFloat(g.currentAmount || '0'), 0)
  const totalTarget = activeGoals.reduce((sum, g) => sum + parseFloat(g.targetAmount || '0'), 0)

  // Filter by category
  const filteredGoals = filterCategory
    ? activeGoals.filter(g => g.category === filterCategory)
    : activeGoals

  // Calculate monthly savings needed for all active goals
  const monthlyNeeded = activeGoals.reduce((sum, g) => {
    const target = parseFloat(g.targetAmount || '0')
    const current = parseFloat(g.currentAmount || '0')
    const remaining = target - current
    if (remaining <= 0) return sum
    if (g.deadline) {
      const daysLeft = Math.max(1, Math.ceil((new Date(g.deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
      return sum + (remaining / daysLeft) * 30
    }
    return sum + remaining / 12 // Default: 12 months
  }, 0)

  const fadeUp = {
    hidden: { opacity: 0, y: 20 },
    show: (i: number) => ({
      opacity: 1, y: 0,
      transition: { duration: 0.45, delay: i * 0.07, ease: [0.22, 1, 0.36, 1] as any },
    }),
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <motion.div
        custom={0}
        initial="hidden"
        animate="show"
        variants={fadeUp}
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4"
      >
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight flex items-center gap-2">
            <Target className="h-7 w-7 text-primary" />
            {t('goals.title')}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">{t('goals.subtitle')}</p>
        </div>
        <Button onClick={() => setNewGoalOpen(true)} className="min-h-[44px] shrink-0">
          <Plus className="h-4 w-4 mr-1.5" />
          {t('goals.newGoal')}
        </Button>
      </motion.div>

      {/* Stats cards */}
      <motion.div custom={1} initial="hidden" animate="show" variants={fadeUp}>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            {
              icon: PiggyBank,
              label: t('goals.totalSaved'),
              value: `${totalSaved.toLocaleString('pl-PL', { minimumFractionDigits: 2 })} ${currency}`,
              color: 'text-emerald-600 dark:text-emerald-400',
            },
            {
              icon: Target,
              label: t('goals.activeGoals'),
              value: String(activeGoals.length),
              color: 'text-primary',
            },
            {
              icon: TrendingUp,
              label: t('goals.perMonth'),
              value: `${monthlyNeeded.toFixed(0)} ${currency}`,
              color: 'text-amber-600 dark:text-amber-400',
              sub: t('goals.saveTo'),
            },
            {
              icon: Sparkles,
              label: t('goals.completed'),
              value: String(completedGoals.length),
              color: 'text-purple-600 dark:text-purple-400',
            },
          ].map((kpi, i) => (
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

      {/* Category filter */}
      <motion.div custom={2} initial="hidden" animate="show" variants={fadeUp}>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setFilterCategory(null)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all min-h-[36px] ${
              !filterCategory ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/80 text-muted-foreground'
            }`}
          >
            {t('goals.allCategories')}
          </button>
          {Object.entries(CATEGORY_EMOJIS).map(([key, emo]) => (
            <button
              key={key}
              onClick={() => setFilterCategory(filterCategory === key ? null : key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all min-h-[36px] ${
                filterCategory === key ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/80 text-muted-foreground'
              }`}
            >
              <span>{emo}</span>
              {t(`goals.category.${key}` as any)}
            </button>
          ))}
        </div>
      </motion.div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      )}

      {/* Empty state */}
      {!loading && goals.length === 0 && (
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center justify-center py-20 gap-6 text-center"
        >
          <div className="relative">
            <div className="h-24 w-24 rounded-full bg-primary/10 flex items-center justify-center">
              <Target className="h-12 w-12 text-primary" />
            </div>
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 10, repeat: Infinity, ease: 'linear' }}
              className="absolute inset-0 rounded-full border-2 border-dashed border-primary/30"
            />
          </div>
          <div className="space-y-2 max-w-sm">
            <h2 className="text-xl font-bold">{t('goals.emptyTitle')}</h2>
            <p className="text-muted-foreground text-sm">{t('goals.emptyDesc')}</p>
          </div>
          <Button onClick={() => setNewGoalOpen(true)} size="lg">
            <Plus className="h-4 w-4 mr-2" />
            {t('goals.newGoal')}
          </Button>
        </motion.div>
      )}

      {/* Active goals grid */}
      {!loading && filteredGoals.length > 0 && (
        <motion.div custom={3} initial="hidden" animate="show" variants={fadeUp}>
          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredGoals.map((goal, i) => (
              <SavingsGoalCard
                key={goal.id}
                goal={goal}
                index={i}
                onAddFunds={g => setAddFundsGoal({ id: g.id, name: g.name, emoji: g.emoji, targetAmount: g.targetAmount, currentAmount: g.currentAmount, color: g.color, currency: g.currency })}
                onDelete={handleDelete}
                currency={currency}
              />
            ))}
          </div>
        </motion.div>
      )}

      {/* AI Financial Coach + Health Score */}
      {!loading && activeGoals.length > 0 && (
        <motion.div custom={4} initial="hidden" animate="show" variants={fadeUp}>
          <div className="grid md:grid-cols-2 gap-4">
            {/* AI Coach */}
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
                    {lang === 'pl'
                      ? `Aby osiągnąć wszystkie cele, oszczędzaj ${monthlyNeeded.toFixed(0)} ${currency} miesięcznie.`
                      : `To reach all your goals, save ${monthlyNeeded.toFixed(0)} ${currency} per month.`}
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
                      <Badge variant="outline" className={`ml-auto text-[10px] ${onTrack ? 'border-emerald-500/30 text-emerald-600' : 'border-amber-500/30 text-amber-600'}`}>
                        {onTrack ? '✓' : '!'}
                      </Badge>
                    </div>
                  )
                })}

                {/* Show AI tips from first goal */}
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

            {/* Financial health */}
            <FinancialHealthScore />
          </div>
        </motion.div>
      )}

      {/* Completed goals */}
      {!loading && completedGoals.length > 0 && (
        <motion.div custom={5} initial="hidden" animate="show" variants={fadeUp}>
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
        </motion.div>
      )}

      {/* Sheets */}
      <NewGoalSheet
        open={newGoalOpen}
        onOpenChange={setNewGoalOpen}
        onCreated={fetchGoals}
        currency={currency}
      />
      <AddFundsSheet
        open={!!addFundsGoal}
        onOpenChange={open => { if (!open) setAddFundsGoal(null) }}
        goal={addFundsGoal}
        onDeposited={fetchGoals}
        currency={currency}
      />
    </div>
  )
}
