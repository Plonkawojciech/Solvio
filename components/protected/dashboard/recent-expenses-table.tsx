'use client'

import { motion } from 'framer-motion'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useTranslation } from '@/lib/i18n'
import { getCategoryBadgeClass } from '@/lib/category-colors'

type Expense = {
  id: string
  description: string
  category?: string | null
  categoryId?: string | null
  vendor?: string | null
  amount: number
  date: string
  currency?: string
}

function CategoryBadge({
  categoryId,
  displayName,
}: {
  categoryId: string
  displayName: string
}) {
  // Color is determined by the stable category ID so the same category always
  // receives the same color across every component in the app.
  const colorClass = getCategoryBadgeClass(categoryId)
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${colorClass}`}
    >
      <span>{displayName}</span>
    </span>
  )
}

export function RecentExpensesTable({
  data,
  currency,
}: {
  data: Expense[]
  currency: string
}) {
  const { t, lang } = useTranslation()
  const locale = lang === 'pl' ? 'pl-PL' : 'en-US'

  function formatAmount(amount: number, cur?: string) {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: cur || currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount)
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead suppressHydrationWarning>
            {t('expenses.titleCol') || 'Title'}
          </TableHead>
          <TableHead className="hidden md:table-cell" suppressHydrationWarning>
            {t('expenses.category') || 'Category'}
          </TableHead>
          <TableHead className="text-right" suppressHydrationWarning>
            {t('expenses.amount') || 'Amount'}
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map((expense, index) => {
          const displayCategory = expense.category || ''
          // Use categoryId for stable color hashing; fall back to the display
          // name so the color is still deterministic even without categoryId.
          const colorKey = expense.categoryId || displayCategory

          return (
            <motion.tr
              key={expense.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: index * 0.04, ease: 'easeOut' }}
              className="group hover:bg-muted/40 transition-colors border-b last:border-0"
            >
              <TableCell>
                <div className="font-medium leading-snug truncate max-w-[180px]">
                  {expense.description}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {new Date(expense.date).toLocaleDateString(locale, {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                </div>
                {/* Category badge shown on mobile only */}
                {displayCategory && (
                  <div className="mt-1 md:hidden">
                    <CategoryBadge
                      categoryId={colorKey}
                      displayName={displayCategory}
                    />
                  </div>
                )}
              </TableCell>
              <TableCell className="hidden md:table-cell">
                {displayCategory ? (
                  <CategoryBadge
                    categoryId={colorKey}
                    displayName={displayCategory}
                  />
                ) : (
                  <span className="text-muted-foreground text-xs">—</span>
                )}
              </TableCell>
              <TableCell className="text-right">
                <span className="font-semibold tabular-nums text-sm">
                  {formatAmount(expense.amount, expense.currency)}
                </span>
              </TableCell>
            </motion.tr>
          )
        })}
      </TableBody>
    </Table>
  )
}
