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
}

const CATEGORY_ICONS: Record<string, string> = {
  Food: '🍽️',
  Groceries: '🛒',
  Health: '💊',
  Transport: '🚗',
  Shopping: '🛍️',
  Electronics: '💻',
  'Home & Garden': '🏡',
  Entertainment: '🎬',
  'Bills & Utilities': '📋',
  Other: '📦',
}

function CategoryBadge({
  categoryId,
  rawName,
  displayName,
}: {
  categoryId: string
  rawName: string
  displayName: string
}) {
  // Color is determined by the stable category ID so the same category always
  // receives the same color across every component in the app.
  const colorClass = getCategoryBadgeClass(categoryId)
  const icon = CATEGORY_ICONS[rawName] || '📦'
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${colorClass}`}
    >
      <span>{icon}</span>
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

  function formatAmount(amount: number) {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
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
          <TableHead className="hidden sm:table-cell" suppressHydrationWarning>
            {t('expenses.vendor') || 'Vendor'}
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
          // Derive the English raw name for icon lookup; fall back to display name
          const rawName =
            Object.keys(CATEGORY_ICONS).find((k) => k === displayCategory) || displayCategory
          // Use categoryId for stable color hashing; fall back to rawName so the
          // color is still deterministic even if categoryId is missing.
          const colorKey = expense.categoryId || rawName

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
                      rawName={rawName}
                      displayName={displayCategory}
                    />
                  </div>
                )}
              </TableCell>
              <TableCell className="hidden sm:table-cell">
                <span className="text-sm text-muted-foreground">
                  {expense.vendor || '—'}
                </span>
              </TableCell>
              <TableCell className="hidden md:table-cell">
                {displayCategory ? (
                  <CategoryBadge
                    categoryId={colorKey}
                    rawName={rawName}
                    displayName={displayCategory}
                  />
                ) : (
                  <span className="text-muted-foreground text-xs">—</span>
                )}
              </TableCell>
              <TableCell className="text-right">
                <span className="font-semibold tabular-nums text-sm">
                  {formatAmount(expense.amount)}
                </span>
              </TableCell>
            </motion.tr>
          )
        })}
      </TableBody>
    </Table>
  )
}
