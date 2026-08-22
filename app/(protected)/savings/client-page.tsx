'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTranslation } from '@/lib/i18n'
import { useProductType } from '@/hooks/use-product-type'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { NewGoalSheet } from '@/components/protected/personal/new-goal-sheet'
import { AddFundsSheet } from '@/components/protected/personal/add-funds-sheet'
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
  Pencil,
  Pause,
  Play,
  Trash2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { AppIcon, IconPicker } from '@/lib/app-icons'

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

interface Income {
  id: string
  name: string
  amount: string
  period: 'monthly' | 'weekly' | 'yearly' | 'oneoff'
  emoji: string | null
  isActive: boolean
}

/// Przeliczenie przychodu na kwotę miesięczną
function incomeMonthly(inc: Income): number {
  const n = parseFloat(inc.amount || '0')
  if (!inc.isActive) return 0
  switch (inc.period) {
    case 'weekly': return n * 52 / 12
    case 'yearly': return n / 12
    case 'oneoff': return 0
    default: return n
  }
}

// Paleta kategorii (spójna z dashboardem) — kolory segmentów paska przepływu
const CAT_COLORS = ['#e2493a', '#e29a2f', '#3f9c74', '#4f79e2', '#9a5fd1', '#c9c2b2']
// Kolor segmentu „Zostaje"
const LEFTOVER_COLOR = '#2e7a58'

// Klasa paska budżetu wg zapełnienia (jak na dashboardzie)
function barPctClass(pct: number): string {
  if (pct >= 100) return 'pb-fill pb-fill-bad'
  if (pct >= 75) return 'pb-fill pb-fill-warn'
  return 'pb-fill pb-fill-ok'
}

const CATEGORY_ICONS: Record<string, string> = {
  electronics: 'gamepad',
  travel: 'plane',
  emergency: 'umbrella',
  education: 'book',
  car: 'car',
  home: 'home',
  custom: 'gift',
}

// ---- Skeleton ----
function SavingsHubSkeleton() {
  return (
    <div className="flex flex-col gap-4 sm:gap-6 animate-pulse">
      <div className="space-y-2">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-5 w-72" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-28 w-full rounded-xl" />
      <div className="grid lg:grid-cols-[1.25fr_1fr] gap-4">
        <Skeleton className="h-72 rounded-xl" />
        <Skeleton className="h-72 rounded-xl" />
      </div>
    </div>
  )
}

// ---- Health Score Mini Gauge ----
function HealthGauge({ score }: { score: number }) {
  const color = score >= 70 ? 'text-emerald-500' : score >= 40 ? 'text-yellow-500' : 'text-red-500'

  return (
    <div className="relative h-10 w-10 shrink-0">
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
      <AppIcon value={cat.icon} chipClassName="bg-primary/10 text-primary" />
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
          <AppIcon value={challenge.emoji} fallback="dumbbell" size="sm" />
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

// ---- Income Dialog: dodawanie / edycja przychodu ----
/* Wojtek: „słabo się wpisuje" — gołe inputy zamienione na porządny dialog
   z pickerem ikony, walidacją i toastami. POST/PUT na /api/personal/incomes. */
function IncomeDialog({
  open, onOpenChange, editing, pl, onSaved,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  editing: Income | null
  pl: boolean
  onSaved: () => void
}) {
  const { t } = useTranslation()
  const [emoji, setEmoji] = useState('briefcase')
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [period, setPeriod] = useState<Income['period']>('monthly')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    if (editing) {
      setEmoji(editing.emoji || 'briefcase')
      setName(editing.name)
      setAmount(editing.amount)
      setPeriod(editing.period === 'oneoff' ? 'monthly' : editing.period)
    } else {
      setEmoji('briefcase')
      setName('')
      setAmount('')
      setPeriod('monthly')
    }
  }, [open, editing])

  async function save() {
    const num = parseFloat(amount.replace(',', '.'))
    if (!name.trim() || !num || num <= 0) {
      toast.error(t('savings.incomeNameAmountRequired'))
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/personal/incomes', {
        method: editing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editing
          ? { id: editing.id, name: name.trim(), amount: num, period, emoji, isActive: editing.isActive }
          : { name: name.trim(), amount: num, period, emoji }),
      })
      if (!res.ok) throw new Error()
      toast.success(editing ? t('savings.incomeSaved') : t('savings.incomeAdded'))
      onOpenChange(false)
      onSaved()
    } catch {
      toast.error(t('savings.incomeSaveFailed'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle suppressHydrationWarning>
            {editing ? t('savings.editIncome') : t('savings.addIncome')}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-1">
          <div className="flex gap-3">
            <div className="space-y-1.5">
              <Label suppressHydrationWarning>{t('savings.pickIcon')}</Label>
              <IconPicker value={emoji} onChange={setEmoji} pl={pl} />
            </div>
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="income-name" suppressHydrationWarning>{t('savings.incomeName')}</Label>
              <Input
                id="income-name"
                placeholder={pl ? 'np. Pensja' : 'e.g. Salary'}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="income-amount" suppressHydrationWarning>{t('savings.incomeAmount')}</Label>
              <Input
                id="income-amount"
                inputMode="decimal"
                placeholder="5000"
                className="tabular-nums"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label suppressHydrationWarning>{t('savings.incomeCycle')}</Label>
              <Select value={period} onValueChange={(v) => setPeriod(v as Income['period'])}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">{t('savings.cycleMonthly')}</SelectItem>
                  <SelectItem value="weekly">{t('savings.cycleWeekly')}</SelectItem>
                  <SelectItem value="yearly">{t('savings.cycleYearly')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving} suppressHydrationWarning>
            {t('common.cancel')}
          </Button>
          <Button onClick={save} disabled={saving} suppressHydrationWarning>
            {t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default function SavingsHub() {
  const { t, lang, mounted } = useTranslation()
  const { isPersonal } = useProductType()
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [incomesList, setIncomesList] = useState<Income[]>([])
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

  // Income dialog state
  const [incomeDialogOpen, setIncomeDialogOpen] = useState(false)
  const [editingIncome, setEditingIncome] = useState<Income | null>(null)

  // Budget state
  const [budgetCategories, setBudgetCategories] = useState<CategoryBudget[]>([])
  const [totalSpent, setTotalSpent] = useState(0)
  const [totalBudgeted, setTotalBudgeted] = useState(0)

  // Challenges state
  const [challenges, setChallenges] = useState<Challenge[]>([])

  // Health score
  const [healthScore, setHealthScore] = useState(65)

  const locale = lang === 'pl' ? 'pl-PL' : 'en-US'

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
      const [settingsRes, goalsRes, budgetRes, challengesRes, incomesRes] = await Promise.allSettled([
        fetch('/api/data/settings').then(r => r.json()),
        fetch('/api/personal/goals').then(r => r.json()),
        fetch(`/api/personal/budget?month=${new Date().toISOString().slice(0, 7)}`).then(r => r.json()),
        fetch('/api/personal/challenges').then(r => r.json()),
        fetch('/api/personal/incomes').then(r => r.json()),
      ])

      if (incomesRes.status === 'fulfilled') {
        setIncomesList(incomesRes.value.incomes || [])
      }

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

  // ── Income actions ──
  function openAddIncome() {
    setEditingIncome(null)
    setIncomeDialogOpen(true)
  }
  function openEditIncome(inc: Income) {
    setEditingIncome(inc)
    setIncomeDialogOpen(true)
  }
  async function toggleIncomeActive(inc: Income) {
    await fetch('/api/personal/incomes', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: inc.id, isActive: !inc.isActive }),
    })
    fetchData()
  }
  async function removeIncome(inc: Income) {
    if (!confirm(t('savings.deleteIncomeConfirm').replace('%name', inc.name))) return
    await fetch('/api/personal/incomes', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: inc.id }),
    })
    fetchData()
  }

  const totalSaved = goals.reduce((sum, g) => sum + parseFloat(g.currentAmount || '0'), 0)

  const formatAmount = (v: number) =>
    new Intl.NumberFormat(locale, { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v)

  const cycleLabel = (p: Income['period']) =>
    p === 'weekly' ? t('savings.cycleWeekly')
      : p === 'yearly' ? t('savings.cycleYearly')
      : p === 'oneoff' ? t('savings.cycleOneoff')
      : t('savings.cycleMonthly')

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

  // Bilans miesiąca: suma aktywnych przychodów (znormalizowana do miesiąca) − wydatki
  const monthlyIncome = incomesList.reduce((s, inc) => s + incomeMonthly(inc), 0)
  const monthlySurplus = monthlyIncome - totalSpent
  const savingRate = monthlyIncome > 0 ? Math.round((monthlySurplus / monthlyIncome) * 100) : null

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

  // ETA celu — z nadwyżki miesięcznej, w ostateczności z terminu
  const goalEta = (g: SavingsGoal): string | null => {
    const remaining = parseFloat(g.targetAmount || '0') - parseFloat(g.currentAmount || '0')
    if (remaining <= 0) return null
    if (monthlySurplus > 0) {
      const m = Math.ceil(remaining / monthlySurplus)
      return new Date(new Date().getFullYear(), new Date().getMonth() + m, 1)
        .toLocaleDateString(locale, { month: 'short', year: 'numeric' })
    }
    if (g.deadline) {
      return new Date(g.deadline).toLocaleDateString(locale, { month: 'short', year: 'numeric' })
    }
    return null
  }

  // Segmenty paska przepływu: największe kategorie wydatków + „Zostaje"
  const flowSegments: { label: string; value: number; color: string; pct: number }[] = []
  if (monthlyIncome > 0) {
    const spentCats = budgetCategories.filter(c => c.spent > 0).sort((a, b) => b.spent - a.spent)
    const top = spentCats.slice(0, 5)
    top.forEach((c, i) => {
      flowSegments.push({ label: c.name, value: c.spent, color: CAT_COLORS[i % CAT_COLORS.length], pct: (c.spent / monthlyIncome) * 100 })
    })
    const otherSpent = totalSpent - top.reduce((s, c) => s + c.spent, 0)
    if (otherSpent > 0.5) {
      flowSegments.push({ label: t('categories.other'), value: otherSpent, color: CAT_COLORS[5], pct: (otherSpent / monthlyIncome) * 100 })
    }
    if (monthlySurplus > 0) {
      flowSegments.push({ label: t('savings.flowLeft'), value: monthlySurplus, color: LEFTOVER_COLOR, pct: (monthlySurplus / monthlyIncome) * 100 })
    }
  }

  const incomeMonthlyTotal = incomesList.reduce((s, inc) => s + incomeMonthly(inc), 0)
  const budgetPct = totalBudgeted > 0 ? (totalSpent / totalBudgeted) * 100 : 0

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.35 }} className="flex flex-col gap-4 sm:gap-6">
      {/* Header */}
      <motion.div custom={0} initial="hidden" animate="show" variants={fadeUp} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight" suppressHydrationWarning>
            {t('savings.title')}
          </h1>
          <p className="text-sm text-muted-foreground mt-1" suppressHydrationWarning>
            {t('savings.subtitle')}
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={openAddIncome}>
            <Plus className="h-3.5 w-3.5 mr-1" />
            <span suppressHydrationWarning>{t('savings.addIncome')}</span>
          </Button>
          <Button size="sm" onClick={() => setNewGoalOpen(true)}>
            <Plus className="h-3.5 w-3.5 mr-1" />
            <span suppressHydrationWarning>{t('goals.newGoal')}</span>
          </Button>
        </div>
      </motion.div>

      {/* KPI strip (4) */}
      <motion.div custom={1} initial="hidden" animate="show" variants={fadeUp}>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Zostaje w tym miesiącu */}
          <Card className="hover:shadow-md transition-shadow">
            <CardContent className="p-4 flex items-center gap-3">
              <div className={cn('h-10 w-10 rounded-xl flex items-center justify-center shrink-0', monthlySurplus >= 0 ? 'bg-emerald-500/10' : 'bg-red-500/10')}>
                <TrendingUp className={cn('h-5 w-5', monthlySurplus >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 rotate-180')} />
              </div>
              <div className="min-w-0">
                <p className="nb-label truncate" suppressHydrationWarning>{t('savings.leftThisMonth')}</p>
                <p className={cn('text-lg font-extrabold tabular-nums', monthlySurplus >= 0 ? 'text-[#1e6b2f] dark:text-emerald-400' : 'text-[#b3402c] dark:text-red-400')}>
                  {monthlyIncome > 0 ? `${monthlySurplus >= 0 ? '+' : ''}${formatAmount(monthlySurplus)}` : '—'}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Łącznie odłożone */}
          <Card className="hover:shadow-md transition-shadow">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-emerald-500/10 flex items-center justify-center shrink-0">
                <Wallet className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div className="min-w-0">
                <p className="nb-label truncate" suppressHydrationWarning>{t('savings.totalSaved')}</p>
                <p className="text-lg font-extrabold tabular-nums">{formatAmount(totalSaved)}</p>
              </div>
            </CardContent>
          </Card>

          {/* Odkładasz % */}
          <Card className="hover:shadow-md transition-shadow">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <PiggyBank className="h-5 w-5 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="nb-label truncate" suppressHydrationWarning>{t('savings.savingRate')}</p>
                <p className="text-lg font-extrabold tabular-nums">
                  {savingRate !== null ? `${Math.max(0, savingRate)}%` : '—'}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Zdrowie finansowe */}
          <Card className="hover:shadow-md transition-shadow">
            <CardContent className="p-4 flex items-center gap-3">
              <HealthGauge score={healthScore} />
              <div className="min-w-0">
                <p className="nb-label truncate" suppressHydrationWarning>{t('savings.healthScore')}</p>
                <p className="text-lg font-extrabold tabular-nums">{healthScore}/100</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </motion.div>

      {/* Flow card — hero równanie */}
      <motion.div custom={2} initial="hidden" animate="show" variants={fadeUp}>
        <Card>
          <CardContent className="p-4 sm:p-5 space-y-4">
            {monthlyIncome > 0 ? (
              <>
                <div className="flex flex-wrap items-end justify-center gap-x-5 gap-y-2 sm:justify-start">
                  <div>
                    <p className="nb-label" suppressHydrationWarning>{t('savings.flowIn')}</p>
                    <p className="text-lg font-extrabold tabular-nums text-[#1e6b2f] dark:text-emerald-400">{formatAmount(monthlyIncome)}</p>
                  </div>
                  <span className="text-2xl font-bold text-muted-foreground pb-1">−</span>
                  <div>
                    <p className="nb-label" suppressHydrationWarning>{t('savings.flowOut')}</p>
                    <p className="text-lg font-extrabold tabular-nums text-[#b3402c] dark:text-red-400">{formatAmount(totalSpent)}</p>
                  </div>
                  <span className="text-2xl font-bold text-muted-foreground pb-1">=</span>
                  <div>
                    <p className="nb-label" suppressHydrationWarning>{t('savings.flowLeft')}</p>
                    <p className={cn('text-xl font-extrabold tabular-nums', monthlySurplus >= 0 ? 'text-[#1e6b2f] dark:text-emerald-400' : 'text-[#b3402c] dark:text-red-400')}>
                      {monthlySurplus >= 0 ? '+' : ''}{formatAmount(monthlySurplus)}
                    </p>
                  </div>
                </div>

                {flowSegments.length > 0 && (
                  <div>
                    <div className="flex h-3.5 w-full overflow-hidden rounded-full bg-muted/40">
                      {flowSegments.map((s, i) => (
                        <div
                          key={i}
                          title={`${s.label} · ${formatAmount(s.value)}`}
                          style={{ width: `${s.pct}%`, backgroundColor: s.color }}
                          className="h-full"
                        />
                      ))}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
                      {flowSegments.map((s, i) => (
                        <span key={i} className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                          <span className="h-2 w-2 rounded-[3px]" style={{ backgroundColor: s.color }} />
                          {s.label} <span className="tabular-nums">{Math.round(s.pct)}%</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="flex flex-col items-center gap-3 py-3 text-center sm:flex-row sm:justify-between sm:text-left">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                    <Wallet className="h-5 w-5 text-primary" />
                  </div>
                  <p className="text-sm text-muted-foreground max-w-md" suppressHydrationWarning>{t('savings.noIncomeCta')}</p>
                </div>
                <Button size="sm" onClick={openAddIncome} className="shrink-0">
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  <span suppressHydrationWarning>{t('savings.addIncome')}</span>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Main grid */}
      <motion.div custom={3} initial="hidden" animate="show" variants={fadeUp} className="grid lg:grid-cols-[1.25fr_1fr] gap-4">
        {/* LEFT column */}
        <div className="flex flex-col gap-4">
          {/* Cele */}
          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="nb-label" suppressHydrationWarning>{t('savings.tabs.goals')}</p>
                {activeGoals.length > 0 && (
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {activeGoals.length} · <b className="text-amber-600 dark:text-amber-400">{formatAmount(monthlyNeeded)}</b>/{t('savings.perMonthShort')}
                  </span>
                )}
              </div>

              {/* Category filter */}
              {activeGoals.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  <button
                    onClick={() => setFilterCategory(null)}
                    className={cn(
                      'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all',
                      !filterCategory ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/80 text-muted-foreground'
                    )}
                    suppressHydrationWarning
                  >
                    {t('goals.allCategories')}
                  </button>
                  {Object.entries(CATEGORY_ICONS).map(([key, iconName]) => (
                    <button
                      key={key}
                      onClick={() => setFilterCategory(filterCategory === key ? null : key)}
                      className={cn(
                        'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all',
                        filterCategory === key ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/80 text-muted-foreground'
                      )}
                    >
                      <AppIcon value={iconName} size="sm" chipClassName="bg-transparent text-current" />
                      {t(`goals.category.${key}` as Parameters<typeof t>[0])}
                    </button>
                  ))}
                </div>
              )}

              {/* Empty state */}
              {goals.length === 0 && (
                <div className="py-6 text-center">
                  <div className="mx-auto mb-3 h-14 w-14 border border-border bg-secondary shadow-[var(--nb-shadow-sm)] rounded-md flex items-center justify-center">
                    <Target className="h-7 w-7 text-foreground" />
                  </div>
                  <h3 className="font-semibold mb-1" suppressHydrationWarning>{t('goals.emptyTitle')}</h3>
                  <p className="text-sm text-muted-foreground mb-4" suppressHydrationWarning>{t('goals.emptyDesc')}</p>
                  <Button size="sm" onClick={() => setNewGoalOpen(true)}>
                    <Plus className="h-3.5 w-3.5 mr-1.5" />
                    <span suppressHydrationWarning>{t('goals.newGoal')}</span>
                  </Button>
                </div>
              )}

              {/* Compact goal rows */}
              {filteredGoals.length > 0 && (
                <div className="divide-y divide-border/40">
                  {filteredGoals.map(g => {
                    const target = parseFloat(g.targetAmount || '0')
                    const current = parseFloat(g.currentAmount || '0')
                    const pct = target > 0 ? Math.min(Math.round((current / target) * 100), 100) : 0
                    const eta = goalEta(g)
                    return (
                      <div key={g.id} className="flex items-center gap-3 py-2.5">
                        <AppIcon value={g.emoji} fallback="target" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <span className="text-sm font-semibold truncate">{g.name}</span>
                            <span className="text-xs tabular-nums text-muted-foreground shrink-0">
                              {formatAmount(current)} / {formatAmount(target)}
                              {eta && <> · {t('savings.ready')} {eta}</>}
                            </span>
                          </div>
                          <div className="h-1.5 rounded-full bg-muted/50 overflow-hidden">
                            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 shrink-0 px-2"
                          onClick={() => setAddFundsGoal({ id: g.id, name: g.name, emoji: g.emoji, targetAmount: g.targetAmount, currentAmount: g.currentAmount, color: g.color, currency: g.currency })}
                        >
                          <Plus className="h-3.5 w-3.5 sm:mr-1" />
                          <span className="hidden sm:inline" suppressHydrationWarning>{t('goals.addFunds')}</span>
                        </Button>
                        <button
                          className="p-1 text-muted-foreground hover:text-destructive shrink-0"
                          title={t('goals.deleteGoal')}
                          onClick={() => setGoalToDelete(g.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* AI Coach footer */}
              {activeGoals.length > 0 && (
                <div className="pt-3 border-t border-border/40 space-y-2">
                  <p className="text-xs font-semibold text-primary flex items-center gap-1.5" suppressHydrationWarning>
                    <Sparkles className="h-3.5 w-3.5" />
                    {t('goals.aiCoach')}
                  </p>
                  <p className="text-sm text-muted-foreground leading-relaxed flex items-start gap-1.5">
                    <TrendingUp className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                    <span>
                      {t('goals.aiCoachSaveMonthly')
                        .replace('%amount', monthlyNeeded.toFixed(0))
                        .replace('%currency', currency)}
                    </span>
                  </p>
                  {monthlyIncome > 0 && monthlySurplus > 0 && (
                    <p className="text-sm text-muted-foreground leading-relaxed flex items-start gap-1.5">
                      <Wallet className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                      <span>
                        {lang === 'pl'
                          ? `Jesteś ~${formatAmount(monthlySurplus)} na plusie miesięcznie — tyle realnie możesz odkładać.`
                          : `You run ~${formatAmount(monthlySurplus)} surplus per month — that's what you can realistically save.`}
                      </span>
                    </p>
                  )}
                  {activeGoals[0]?.aiTips && activeGoals[0].aiTips.length > 0 && (
                    <div className="space-y-1">
                      {activeGoals[0].aiTips.slice(0, 2).map((tip, i) => (
                        <p key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                          <span className="text-primary mt-0.5">•</span>
                          {tip}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Completed goals */}
              {completedGoals.length > 0 && (
                <div className="pt-3 border-t border-border/40">
                  <button
                    onClick={() => setShowCompleted(!showCompleted)}
                    className="flex items-center justify-between w-full"
                  >
                    <span className="text-sm font-semibold flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-purple-500" />
                      {t('goals.completedGoals')} ({completedGoals.length})
                    </span>
                    {showCompleted ? (
                      <ChevronUp className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    )}
                  </button>
                  <AnimatePresence>
                    {showCompleted && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3 }}
                        className="overflow-hidden"
                      >
                        <div className="divide-y divide-border/40 pt-1">
                          {completedGoals.map(g => {
                            const completedDate = g.completedAt ? new Date(g.completedAt) : null
                            return (
                              <div key={g.id} className="flex items-center gap-3 py-2.5">
                                <AppIcon value={g.emoji} fallback="target" />
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-semibold truncate">{g.name}</p>
                                  <p className="text-xs text-muted-foreground tabular-nums">
                                    {formatAmount(parseFloat(g.targetAmount || '0'))}
                                  </p>
                                </div>
                                {completedDate && (
                                  <p className="text-xs text-muted-foreground shrink-0">
                                    {t('goals.reachedOn')} {completedDate.toLocaleDateString(locale)}
                                  </p>
                                )}
                                <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/20 text-[10px] shrink-0">
                                  <ShieldCheck className="h-3 w-3" />
                                </Badge>
                              </div>
                            )
                          })}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Wyzwania */}
          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="nb-label" suppressHydrationWarning>{t('savings.tabs.challenges')}</p>
                <Link href="/challenges" className="text-xs font-bold text-primary inline-flex items-center gap-0.5 hover:underline">
                  <span suppressHydrationWarning>{t('savings.viewAll')}</span>
                  <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
              {activeChallenges.length === 0 ? (
                <div className="py-6 text-center">
                  <Trophy className="h-9 w-9 text-muted-foreground/40 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground" suppressHydrationWarning>{t('savings.challengesEmpty')}</p>
                  <Button className="mt-3" size="sm" asChild>
                    <Link href="/challenges">
                      <Plus className="h-3.5 w-3.5 mr-1.5" />
                      <span suppressHydrationWarning>{t('challenges.new')}</span>
                    </Link>
                  </Button>
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {activeChallenges.slice(0, 4).map(ch => (
                    <ChallengeMiniCard key={ch.id} challenge={ch} />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* RIGHT column */}
        <div className="flex flex-col gap-4">
          {/* Przychody */}
          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="nb-label" suppressHydrationWarning>{t('savings.income')}</p>
                <span className="text-xs text-muted-foreground tabular-nums">
                  <b className="text-emerald-600 dark:text-emerald-400">{formatAmount(incomeMonthlyTotal)}</b>/{t('savings.perMonthShort')}
                </span>
              </div>

              {incomesList.length === 0 ? (
                <p className="text-xs text-muted-foreground" suppressHydrationWarning>{t('savings.incomeEmpty')}</p>
              ) : (
                <div className="space-y-1.5">
                  {incomesList.map(inc => (
                    <div key={inc.id} className={cn('flex items-center gap-2', !inc.isActive && 'opacity-50')}>
                      <AppIcon value={inc.emoji} fallback="briefcase" size="sm" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {inc.name}
                          {!inc.isActive && <span className="ml-1.5 text-[10px] text-muted-foreground" suppressHydrationWarning>({t('savings.paused')})</span>}
                        </p>
                        <p className="text-[11px] text-muted-foreground" suppressHydrationWarning>{cycleLabel(inc.period)}</p>
                      </div>
                      <span className="tabular-nums font-bold text-sm shrink-0">{formatAmount(parseFloat(inc.amount))}</span>
                      <button className="p-1 text-muted-foreground hover:text-foreground shrink-0" title={t('common.edit')} onClick={() => openEditIncome(inc)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button className="p-1 text-muted-foreground hover:text-foreground shrink-0" title={inc.isActive ? t('savings.pauseIncome') : t('savings.resumeIncome')} onClick={() => toggleIncomeActive(inc)}>
                        {inc.isActive ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                      </button>
                      <button className="p-1 text-muted-foreground hover:text-destructive shrink-0" title={t('common.delete')} onClick={() => removeIncome(inc)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <Button variant="outline" size="sm" className="w-full" onClick={openAddIncome}>
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                <span suppressHydrationWarning>{t('savings.addIncome')}</span>
              </Button>
            </CardContent>
          </Card>

          {/* Budżet miesiąca */}
          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="nb-label" suppressHydrationWarning>{t('savings.budgetMonth')}</p>
                <Link href="/budget" className="text-xs font-bold text-primary inline-flex items-center gap-0.5 hover:underline">
                  <span suppressHydrationWarning>{t('savings.allBudgets')}</span>
                  <ArrowRight className="h-3 w-3" />
                </Link>
              </div>

              <div className="flex items-end justify-between">
                <p className="text-lg font-extrabold tabular-nums">{formatAmount(totalSpent)}</p>
                <p className="text-xs text-muted-foreground tabular-nums">/ {formatAmount(totalBudgeted)}</p>
              </div>

              {totalBudgeted > 0 && (
                <div
                  className="pb-track"
                  role="progressbar"
                  aria-valuenow={Math.round(budgetPct)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={t('dashboard.budgetProgress') || 'Budget progress'}
                >
                  <span className={barPctClass(budgetPct)} style={{ width: `${Math.min(budgetPct, 100)}%` }} />
                </div>
              )}

              {budgetWithAmounts.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-2" suppressHydrationWarning>{t('savings.budgetEmpty')}</p>
              ) : (
                <div className="divide-y divide-border/40">
                  {budgetWithAmounts.slice(0, 5).map(cat => (
                    <BudgetMiniRow key={cat.id} cat={cat} currency={currency} locale={locale} />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Oszczędzaj więcej */}
          <Card>
            <CardContent className="p-4 space-y-2">
              <p className="nb-label" suppressHydrationWarning>{t('savings.saveMore')}</p>
              <Link href="/promotions" className="flex items-center gap-3 rounded-lg px-2 py-2 -mx-1 hover:bg-muted/50 transition-colors">
                <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <Tag className="h-4 w-4 text-primary" />
                </div>
                <span className="flex-1 text-sm font-medium" suppressHydrationWarning>{t('savings.promosForYou')}</span>
                <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
              </Link>
              <Link href="/loyalty" className="flex items-center gap-3 rounded-lg px-2 py-2 -mx-1 hover:bg-muted/50 transition-colors">
                <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <CreditCard className="h-4 w-4 text-primary" />
                </div>
                <span className="flex-1 text-sm font-medium" suppressHydrationWarning>{t('savings.loyaltyCards')}</span>
                <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
              </Link>
            </CardContent>
          </Card>
        </div>
      </motion.div>

      {/* Sheets & dialogs */}
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
      <IncomeDialog
        open={incomeDialogOpen}
        onOpenChange={setIncomeDialogOpen}
        editing={editingIncome}
        pl={lang === 'pl'}
        onSaved={fetchData}
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
