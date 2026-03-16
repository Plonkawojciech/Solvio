'use client'

import { Progress } from '@/components/ui/progress'
import { useTranslation } from '@/lib/i18n'

interface BudgetCategoryRowProps {
  name: string
  icon?: string | null
  budgeted: number
  spent: number
  currency: string
  color?: string
}

export function BudgetCategoryRow({ name, icon, budgeted, spent, currency, color }: BudgetCategoryRowProps) {
  const { t } = useTranslation()
  const remaining = budgeted - spent
  const percentage = budgeted > 0 ? Math.min((spent / budgeted) * 100, 100) : 0
  const isOverspent = spent > budgeted

  // Color based on spending level
  const progressColor = isOverspent
    ? 'bg-red-500'
    : percentage > 80
    ? 'bg-amber-500'
    : 'bg-emerald-500'

  const textColor = isOverspent
    ? 'text-red-600 dark:text-red-400'
    : percentage > 80
    ? 'text-amber-600 dark:text-amber-400'
    : 'text-emerald-600 dark:text-emerald-400'

  return (
    <div className="flex flex-col gap-2 py-3 border-b border-border/40 last:border-0">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {icon && <span className="text-base">{icon}</span>}
          <span className="text-sm font-medium truncate">{name}</span>
        </div>
        <div className="flex items-center gap-3 shrink-0 text-xs">
          <span className="text-muted-foreground">
            {spent.toFixed(2)} / {budgeted.toFixed(2)} {currency}
          </span>
          <span className={`font-semibold ${textColor}`}>
            {isOverspent ? '-' : ''}{Math.abs(remaining).toFixed(2)} {currency}
          </span>
        </div>
      </div>
      <div className="relative">
        <Progress value={percentage} className="h-2" />
        {/* Override the indicator color */}
        <div
          className={`absolute top-0 left-0 h-2 rounded-full transition-all ${progressColor}`}
          style={{ width: `${Math.min(percentage, 100)}%` }}
        />
      </div>
      {isOverspent && (
        <p className="text-[11px] text-red-500 font-medium">
          {t('budget.overspent')}: {(spent - budgeted).toFixed(2)} {currency}
        </p>
      )}
    </div>
  )
}
