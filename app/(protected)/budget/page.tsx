'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import { useTranslation } from '@/lib/i18n'
import { useProductType } from '@/hooks/use-product-type'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { BudgetCategoryRow } from '@/components/protected/personal/budget-category-row'
import { AffordCalculator } from '@/components/protected/personal/afford-calculator'
import {
  PiggyBank,
  ChevronLeft,
  ChevronRight,
  Wallet,
  TrendingDown,
  TrendingUp,
  Save,
  Loader2,
  DollarSign,
  BarChart3,
} from 'lucide-react'
import { toast } from 'sonner'

interface CategoryBreakdown {
  id: string
  name: string
  icon: string | null
  color: string | null
  budgeted: number
  spent: number
}

interface BudgetData {
  budget: {
    id: string
    totalIncome: string | null
    totalBudget: string | null
    savingsTarget: string | null
    aiSummary: string | null
  } | null
  totalSpent: number
  categoryBreakdown: CategoryBreakdown[]
  month: string
}

export default function BudgetPage() {
  const { t, lang, mounted } = useTranslation()
  const { isPersonal } = useProductType()
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [data, setData] = useState<BudgetData | null>(null)
  const [currency, setCurrency] = useState('PLN')
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7))

  // Form state
  const [totalIncome, setTotalIncome] = useState('')
  const [savingsTarget, setSavingsTarget] = useState('')

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

  const fetchBudget = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/personal/budget?month=${month}`)
      if (!res.ok) throw new Error()
      const d = await res.json()
      setData(d)
      if (d.budget) {
        setTotalIncome(d.budget.totalIncome || '')
        setSavingsTarget(d.budget.savingsTarget || '')
      } else {
        setTotalIncome('')
        setSavingsTarget('')
      }
    } catch {
      toast.error('Failed to load budget')
    } finally {
      setLoading(false)
    }
  }, [month])

  useEffect(() => {
    fetchBudget()
  }, [fetchBudget])

  function navigateMonth(delta: number) {
    const [y, m] = month.split('-').map(Number)
    const d = new Date(y, m - 1 + delta, 1)
    setMonth(d.toISOString().slice(0, 7))
  }

  async function handleSaveBudget() {
    setSaving(true)
    try {
      const res = await fetch('/api/personal/budget', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          month,
          totalIncome: totalIncome ? parseFloat(totalIncome) : null,
          savingsTarget: savingsTarget ? parseFloat(savingsTarget) : null,
        }),
      })
      if (!res.ok) throw new Error()
      toast.success(t('settings.saved'))
      fetchBudget()
    } catch {
      toast.error('Failed to save budget')
    } finally {
      setSaving(false)
    }
  }

  if (!mounted) return null

  const income = totalIncome ? parseFloat(totalIncome) : 0
  const totalSpent = data?.totalSpent || 0
  const savings = savingsTarget ? parseFloat(savingsTarget) : 0
  const remaining = income - totalSpent - savings
  const totalBudgeted = (data?.categoryBreakdown || []).reduce((sum, c) => sum + c.budgeted, 0)
  const unallocated = income - totalBudgeted - savings
  const savingsRate = income > 0 ? ((income - totalSpent) / income) * 100 : 0

  const monthLabel = (() => {
    const [y, m] = month.split('-').map(Number)
    const d = new Date(y, m - 1, 1)
    return d.toLocaleDateString(lang === 'pl' ? 'pl-PL' : 'en-US', { month: 'long', year: 'numeric' })
  })()

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
            <PiggyBank className="h-7 w-7 text-primary" />
            {t('budget.title')}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">{t('budget.subtitle')}</p>
        </div>
      </motion.div>

      {/* Month selector */}
      <motion.div custom={1} initial="hidden" animate="show" variants={fadeUp}>
        <div className="flex items-center justify-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigateMonth(-1)}
            className="min-h-[44px] min-w-[44px]"
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <h2 className="text-lg font-bold capitalize min-w-[200px] text-center">
            {monthLabel}
          </h2>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigateMonth(1)}
            className="min-h-[44px] min-w-[44px]"
          >
            <ChevronRight className="h-5 w-5" />
          </Button>
        </div>
      </motion.div>

      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      )}

      {!loading && (
        <>
          {/* Overview cards */}
          <motion.div custom={2} initial="hidden" animate="show" variants={fadeUp}>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                {
                  icon: Wallet,
                  label: t('budget.income'),
                  value: `${income.toLocaleString('pl-PL', { minimumFractionDigits: 2 })} ${currency}`,
                  color: 'text-emerald-600 dark:text-emerald-400',
                },
                {
                  icon: TrendingDown,
                  label: t('budget.expenses'),
                  value: `${totalSpent.toLocaleString('pl-PL', { minimumFractionDigits: 2 })} ${currency}`,
                  color: 'text-red-600 dark:text-red-400',
                },
                {
                  icon: PiggyBank,
                  label: t('budget.savings'),
                  value: `${savings.toLocaleString('pl-PL', { minimumFractionDigits: 2 })} ${currency}`,
                  color: 'text-blue-600 dark:text-blue-400',
                },
                {
                  icon: remaining >= 0 ? TrendingUp : TrendingDown,
                  label: t('budget.remaining'),
                  value: `${remaining.toLocaleString('pl-PL', { minimumFractionDigits: 2 })} ${currency}`,
                  color: remaining >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400',
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

          {/* Income & Savings setup */}
          <motion.div custom={3} initial="hidden" animate="show" variants={fadeUp}>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <DollarSign className="h-5 w-5 text-primary" />
                  {t('budget.setIncome')}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="budget-income">{t('budget.totalIncome')} ({currency})</Label>
                    <Input
                      id="budget-income"
                      type="number"
                      step="0.01"
                      min="0"
                      value={totalIncome}
                      onChange={e => setTotalIncome(e.target.value)}
                      placeholder="0.00"
                      className="min-h-[44px] text-lg font-semibold"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="budget-savings">{t('budget.savingsTarget')} ({currency})</Label>
                    <Input
                      id="budget-savings"
                      type="number"
                      step="0.01"
                      min="0"
                      value={savingsTarget}
                      onChange={e => setSavingsTarget(e.target.value)}
                      placeholder="0.00"
                      className="min-h-[44px] text-lg font-semibold"
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  {unallocated !== 0 && income > 0 && (
                    <p className={`text-xs ${unallocated < 0 ? 'text-red-500' : 'text-muted-foreground'}`}>
                      {t('budget.unallocated')}: {unallocated.toFixed(2)} {currency}
                    </p>
                  )}
                  <Button
                    onClick={handleSaveBudget}
                    disabled={saving}
                    className="min-h-[44px] ml-auto"
                  >
                    {saving ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4 mr-2" />
                    )}
                    {t('common.save')}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Category budgets */}
          <motion.div custom={4} initial="hidden" animate="show" variants={fadeUp}>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <BarChart3 className="h-5 w-5 text-primary" />
                  {t('budget.categoryBudgets')}
                </CardTitle>
                <CardDescription>
                  {t('budget.spent')}: {totalSpent.toFixed(2)} {currency} / {t('budget.budgeted')}: {totalBudgeted.toFixed(2)} {currency}
                </CardDescription>
                {/* Visual overview bar */}
                {income > 0 && (
                  <div className="mt-3 h-4 rounded-full bg-muted overflow-hidden flex">
                    <div
                      className="h-full bg-red-500/80 transition-all"
                      style={{ width: `${Math.min((totalSpent / income) * 100, 100)}%` }}
                      title={`${t('budget.expenses')}: ${totalSpent.toFixed(2)}`}
                    />
                    <div
                      className="h-full bg-blue-500/80 transition-all"
                      style={{ width: `${Math.min((savings / income) * 100, 100)}%` }}
                      title={`${t('budget.savings')}: ${savings.toFixed(2)}`}
                    />
                  </div>
                )}
              </CardHeader>
              <CardContent>
                {(data?.categoryBreakdown || []).length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-sm text-muted-foreground">{t('budget.noBudgetDesc')}</p>
                  </div>
                ) : (
                  <div>
                    {(data?.categoryBreakdown || [])
                      .filter(c => c.budgeted > 0 || c.spent > 0)
                      .sort((a, b) => b.spent - a.spent)
                      .map(cat => (
                        <BudgetCategoryRow
                          key={cat.id}
                          name={cat.name}
                          icon={cat.icon}
                          budgeted={cat.budgeted}
                          spent={cat.spent}
                          currency={currency}
                          color={cat.color || undefined}
                        />
                      ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>

          {/* Savings rate */}
          {income > 0 && (
            <motion.div custom={5} initial="hidden" animate="show" variants={fadeUp}>
              <Card className="border-emerald-500/20 bg-gradient-to-r from-emerald-500/5 to-transparent">
                <CardContent className="flex items-center justify-between py-4 px-5">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-emerald-500/15 flex items-center justify-center">
                      <TrendingUp className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">{t('budget.savingsRate')}</p>
                      <p className="text-xs text-muted-foreground">{monthLabel}</p>
                    </div>
                  </div>
                  <span className={`text-2xl font-extrabold ${savingsRate >= 20 ? 'text-emerald-600 dark:text-emerald-400' : savingsRate >= 0 ? 'text-amber-600' : 'text-red-600'}`}>
                    {savingsRate.toFixed(1)}%
                  </span>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* Can I afford this? */}
          <motion.div custom={6} initial="hidden" animate="show" variants={fadeUp}>
            <AffordCalculator currency={currency} lang={lang} month={month} />
          </motion.div>
        </>
      )}
    </div>
  )
}
