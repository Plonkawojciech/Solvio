'use client'

import { motion } from 'framer-motion'
import { useTranslation } from '@/lib/i18n'

type Budget = {
  id: string
  name: string
  spent: number
  budget: number
}

function formatCurrency(amount: number, currency: string, locale: string) {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

function BudgetProgressBar({ percentage }: { percentage: number }) {
  const clamped = Math.min(percentage, 100)
  const colorClass =
    percentage >= 100
      ? 'bg-red-500'
      : percentage >= 90
      ? 'bg-yellow-500'
      : percentage >= 70
      ? 'bg-amber-400'
      : 'bg-emerald-500'

  const trackClass =
    percentage >= 100
      ? 'bg-red-100 dark:bg-red-950/40'
      : percentage >= 90
      ? 'bg-yellow-100 dark:bg-yellow-950/40'
      : percentage >= 70
      ? 'bg-amber-100 dark:bg-amber-950/40'
      : 'bg-emerald-100 dark:bg-emerald-950/40'

  return (
    <div className={`relative h-3 w-full overflow-hidden rounded-full ${trackClass}`}>
      <motion.div
        className={`h-full rounded-full ${colorClass}`}
        initial={{ width: 0 }}
        animate={{ width: `${clamped}%` }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      />
    </div>
  )
}

export function BudgetOverview({ data, currency }: { data: Budget[]; currency: string }) {
  const { t, lang } = useTranslation()
  const locale = lang === 'pl' ? 'pl-PL' : 'en-US'

  const totalSpent = data.reduce((sum, item) => sum + item.spent, 0)
  const totalBudget = data.reduce((sum, item) => sum + item.budget, 0)
  const totalRemaining = totalBudget - totalSpent
  const totalProgress = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0

  const summaryProgressColor =
    totalProgress >= 100
      ? 'bg-red-500'
      : totalProgress >= 90
      ? 'bg-yellow-500'
      : totalProgress >= 70
      ? 'bg-amber-400'
      : 'bg-emerald-500'

  const summaryTrackColor =
    totalProgress >= 100
      ? 'bg-red-100 dark:bg-red-950/40'
      : totalProgress >= 90
      ? 'bg-yellow-100 dark:bg-yellow-950/40'
      : totalProgress >= 70
      ? 'bg-amber-100 dark:bg-amber-950/40'
      : 'bg-emerald-100 dark:bg-emerald-950/40'

  const summaryValueColor =
    totalRemaining >= 0
      ? 'text-emerald-600 dark:text-emerald-400'
      : 'text-red-600 dark:text-red-400'

  return (
    <div className="flex flex-col gap-5">
      {/* Total summary card */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        className="rounded-lg border bg-muted/40 p-4 space-y-3"
      >
        <p className="text-sm font-semibold">{t('budget.totalSummary')}</p>

        <div className="grid grid-cols-3 gap-3 text-center">
          <div>
            <p className="text-xs text-muted-foreground mb-0.5">{t('budget.totalSpent')}</p>
            <p className="text-sm font-bold tabular-nums">{formatCurrency(totalSpent, currency, locale)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-0.5">{t('budget.totalBudget')}</p>
            <p className="text-sm font-bold tabular-nums">{formatCurrency(totalBudget, currency, locale)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-0.5">
              {totalRemaining >= 0 ? t('budget.remaining') : t('budget.overTotal')}
            </p>
            <p className={`text-sm font-bold tabular-nums ${summaryValueColor}`}>
              {formatCurrency(Math.abs(totalRemaining), currency, locale)}
            </p>
          </div>
        </div>

        <div className="space-y-1.5">
          <div className={`relative h-2.5 w-full overflow-hidden rounded-full ${summaryTrackColor}`}>
            <motion.div
              className={`h-full rounded-full ${summaryProgressColor}`}
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(totalProgress, 100)}%` }}
              transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            />
          </div>
          <p className="text-xs text-muted-foreground text-right">
            {totalProgress.toFixed(1)}% {t('budget.used')}
          </p>
        </div>
      </motion.div>

      {/* Per-category rows */}
      {data.map((item, index) => {
        const spent = item.spent
        const budget = item.budget
        const percentage = budget > 0 ? (spent / budget) * 100 : 0

        const statusLabel =
          percentage >= 100
            ? `${t('budget.overBudget')} ${formatCurrency(spent - budget, currency, locale)}`
            : percentage >= 90
            ? t('budget.nearingLimit')
            : percentage >= 70
            ? t('budget.over70')
            : null

        const statusColor =
          percentage >= 100
            ? 'text-red-500'
            : percentage >= 90
            ? 'text-yellow-500'
            : percentage >= 70
            ? 'text-amber-500'
            : ''

        return (
          <motion.div
            key={item.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.05 + index * 0.06, ease: [0.22, 1, 0.36, 1] }}
            className="space-y-1.5"
          >
            <div className="flex justify-between items-baseline">
              <span className="font-medium text-sm">{item.name}</span>
              <span className="text-xs text-muted-foreground">
                {formatCurrency(spent, currency, locale)}{' '}
                <span className="text-muted-foreground/60">/</span>{' '}
                {formatCurrency(budget, currency, locale)}
              </span>
            </div>

            <BudgetProgressBar percentage={percentage} />

            <div className="flex items-center justify-between">
              {statusLabel ? (
                <p className={`text-xs font-medium ${statusColor}`}>{statusLabel}</p>
              ) : (
                <span />
              )}
              <p className="text-xs text-muted-foreground ml-auto">
                {percentage.toFixed(1)}%
              </p>
            </div>
          </motion.div>
        )
      })}
    </div>
  )
}
