'use client'

import { motion } from 'framer-motion'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowDownLeft, ArrowUpRight, Scale } from 'lucide-react'
import { useTranslation } from '@/lib/i18n'
import { cn } from '@/lib/utils'

interface VatSummaryCardProps {
  vatInput: number
  vatOutput: number
  currency: string
  locale: string
  index?: number
}

// i18n keys:
// 'vat.input' / 'vat.output' / 'vat.balance'
// 'vat.inputDesc' / 'vat.outputDesc'
// 'vat.toPay' / 'vat.toReturn'

export function VatSummaryCard({
  vatInput,
  vatOutput,
  currency,
  locale,
  index = 0,
}: VatSummaryCardProps) {
  const { t } = useTranslation()

  const balance = vatOutput - vatInput
  const isPositive = balance > 0 // positive = to pay

  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
    }).format(amount)
  }

  const fadeUp = {
    hidden: { opacity: 0, y: 24 },
    show: (i: number) => ({
      opacity: 1,
      y: 0,
      transition: { duration: 0.5, delay: i * 0.08, ease: [0.22, 1, 0.36, 1] as const },
    }),
  }

  return (
    <div className="grid gap-3 grid-cols-1 sm:grid-cols-3">
      {/* VAT Input */}
      <motion.div custom={index} initial="hidden" animate="show" variants={fadeUp}>
        <Card className="h-full">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2" suppressHydrationWarning>
              <div className="h-8 w-8 rounded-lg bg-emerald-100 dark:bg-emerald-950/60 flex items-center justify-center">
                <ArrowDownLeft className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              </div>
              {t('vat.input')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
              {formatAmount(vatInput)}
            </p>
            <p className="text-xs text-muted-foreground mt-1" suppressHydrationWarning>
              {t('vat.inputDesc')}
            </p>
          </CardContent>
        </Card>
      </motion.div>

      {/* VAT Output */}
      <motion.div custom={index + 1} initial="hidden" animate="show" variants={fadeUp}>
        <Card className="h-full">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2" suppressHydrationWarning>
              <div className="h-8 w-8 rounded-lg bg-blue-100 dark:bg-blue-950/60 flex items-center justify-center">
                <ArrowUpRight className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              </div>
              {t('vat.output')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold tabular-nums text-blue-600 dark:text-blue-400">
              {formatAmount(vatOutput)}
            </p>
            <p className="text-xs text-muted-foreground mt-1" suppressHydrationWarning>
              {t('vat.outputDesc')}
            </p>
          </CardContent>
        </Card>
      </motion.div>

      {/* VAT Balance */}
      <motion.div custom={index + 2} initial="hidden" animate="show" variants={fadeUp}>
        <Card className={cn(
          'h-full border-2',
          isPositive
            ? 'border-red-200 dark:border-red-900/60'
            : 'border-emerald-200 dark:border-emerald-900/60'
        )}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2" suppressHydrationWarning>
              <div className={cn(
                'h-8 w-8 rounded-lg flex items-center justify-center',
                isPositive
                  ? 'bg-red-100 dark:bg-red-950/60'
                  : 'bg-emerald-100 dark:bg-emerald-950/60'
              )}>
                <Scale className={cn(
                  'h-4 w-4',
                  isPositive
                    ? 'text-red-600 dark:text-red-400'
                    : 'text-emerald-600 dark:text-emerald-400'
                )} />
              </div>
              {t('vat.balance')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className={cn(
              'text-2xl font-bold tabular-nums',
              isPositive
                ? 'text-red-600 dark:text-red-400'
                : 'text-emerald-600 dark:text-emerald-400'
            )}>
              {formatAmount(Math.abs(balance))}
            </p>
            <p className={cn(
              'text-xs font-medium mt-1',
              isPositive
                ? 'text-red-600 dark:text-red-400'
                : 'text-emerald-600 dark:text-emerald-400'
            )} suppressHydrationWarning>
              {isPositive ? t('vat.toPay') : t('vat.toReturn')}
            </p>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  )
}
