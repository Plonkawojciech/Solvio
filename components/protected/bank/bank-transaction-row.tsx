'use client'

import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Check, X, ArrowDownLeft, ArrowUpRight, Link2 } from 'lucide-react'
import { useTranslation } from '@/lib/i18n'

interface BankTransaction {
  id: string
  date: string
  description: string | null
  counterpartyName: string | null
  amount: string
  currency: string | null
  category: string | null // 'debit' | 'credit'
  isMatched: boolean
  expenseId: string | null
  suggestedCategoryId: string | null
  suggestedCategoryName?: string
}

export function BankTransactionRow({
  transaction,
  index,
  currency,
  onMatch,
  onIgnore,
  matching,
}: {
  transaction: BankTransaction
  index: number
  currency: string
  onMatch: (txId: string) => void
  onIgnore: (txId: string) => void
  matching: boolean
}) {
  const { t, lang } = useTranslation()
  const locale = lang === 'pl' ? 'pl-PL' : 'en-US'
  const amount = parseFloat(transaction.amount)
  const isDebit = transaction.category === 'debit' || amount < 0
  const displayAmount = Math.abs(amount)

  const formattedAmount = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: transaction.currency || currency,
    minimumFractionDigits: 2,
  }).format(displayAmount)

  const formattedDate = new Date(transaction.date).toLocaleDateString(locale, {
    day: 'numeric',
    month: 'short',
  })

  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, delay: index * 0.04, ease: [0.22, 1, 0.36, 1] as const }}
      className="flex items-center gap-3 py-3 border-b last:border-0 group hover:bg-muted/30 transition-colors px-2 -mx-2 rounded-lg"
    >
      {/* Direction icon */}
      <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${
        isDebit
          ? 'bg-red-500/10 text-red-600 dark:text-red-400'
          : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
      }`}>
        {isDebit ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownLeft className="h-4 w-4" />}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">
          {transaction.counterpartyName || transaction.description || t('bank.unknownTransaction')}
        </p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[11px] text-muted-foreground" suppressHydrationWarning>{formattedDate}</span>
          {transaction.description && transaction.counterpartyName && (
            <span className="text-[11px] text-muted-foreground truncate max-w-[150px]">
              {transaction.description}
            </span>
          )}
          {transaction.suggestedCategoryName && !transaction.isMatched && (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 shrink-0">
              {transaction.suggestedCategoryName}
            </Badge>
          )}
        </div>
      </div>

      {/* Amount */}
      <div className="text-right shrink-0">
        <p className={`text-sm font-semibold tabular-nums ${
          isDebit
            ? 'text-red-600 dark:text-red-400'
            : 'text-emerald-600 dark:text-emerald-400'
        }`}>
          {isDebit ? '-' : '+'}{formattedAmount}
        </p>
      </div>

      {/* Actions */}
      {!transaction.isMatched ? (
        <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-500/10"
            onClick={() => onMatch(transaction.id)}
            disabled={matching}
            title={t('bank.matchTransaction')}
          >
            <Check className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
            onClick={() => onIgnore(transaction.id)}
            disabled={matching}
            title={t('bank.ignoreTransaction')}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      ) : (
        <div className="shrink-0">
          <Badge variant="outline" className="text-[10px] gap-1 text-emerald-600 dark:text-emerald-400 border-emerald-500/30">
            <Link2 className="h-2.5 w-2.5" />
            {t('bank.matched')}
          </Badge>
        </div>
      )}
    </motion.div>
  )
}
