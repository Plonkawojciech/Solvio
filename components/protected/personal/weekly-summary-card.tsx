'use client'

import { motion } from 'framer-motion'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { TrendingUp, TrendingDown, Minus, Sparkles, PiggyBank, ShoppingBag } from 'lucide-react'
import { useTranslation } from '@/lib/i18n'

export interface WeeklySummaryData {
  id: string
  weekStart: string
  weekEnd: string
  totalSpent: string | null
  comparedToAvg: string | null
  topCategory: string | null
  savingsTips: Array<{
    product: string
    currentStore: string
    currentPrice: number
    alternativeStore: string
    alternativePrice: number
    saving: number
  }> | null
  aiSummary: string | null
}

export function WeeklySummaryCard({
  summary,
  currency,
}: {
  summary: WeeklySummaryData
  currency: string
}) {
  const { t, lang } = useTranslation()
  const locale = lang === 'pl' ? 'pl-PL' : 'en-US'

  const totalSpent = parseFloat(summary.totalSpent || '0')
  const comparedToAvg = parseFloat(summary.comparedToAvg || '0')
  const totalSavings = (summary.savingsTips || []).reduce((sum, tip) => sum + (tip.saving || 0), 0)

  const formatPrice = (price: number) =>
    new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
    }).format(price)

  const formatDateRange = () => {
    const start = new Date(summary.weekStart).toLocaleDateString(locale, { day: 'numeric', month: 'short' })
    const end = new Date(summary.weekEnd).toLocaleDateString(locale, { day: 'numeric', month: 'short' })
    return `${start} - ${end}`
  }

  const TrendIcon = comparedToAvg > 5 ? TrendingUp : comparedToAvg < -5 ? TrendingDown : Minus
  const trendColor = comparedToAvg > 5
    ? 'text-red-600 dark:text-red-400'
    : comparedToAvg < -5
    ? 'text-emerald-600 dark:text-emerald-400'
    : 'text-muted-foreground'

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] as const }}
    >
      <Card className="border-primary/20 bg-gradient-to-br from-primary/5 via-transparent to-emerald-500/5 overflow-hidden">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-5 w-5 text-primary" />
              <span suppressHydrationWarning>{t('weeklySummary.title')}</span>
            </CardTitle>
            <Badge variant="secondary" className="text-[10px]" suppressHydrationWarning>
              {formatDateRange()}
            </Badge>
          </div>
          {summary.aiSummary && (
            <CardDescription className="text-sm leading-relaxed mt-1">
              {summary.aiSummary}
            </CardDescription>
          )}
        </CardHeader>

        <CardContent className="space-y-4">
          {/* KPI row */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl bg-background/60 border p-3 text-center">
              <ShoppingBag className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
              <p className="text-lg font-bold tabular-nums">{formatPrice(totalSpent)}</p>
              <p className="text-[10px] text-muted-foreground" suppressHydrationWarning>
                {t('weeklySummary.spent')}
              </p>
            </div>
            <div className="rounded-xl bg-background/60 border p-3 text-center">
              <TrendIcon className={`h-4 w-4 mx-auto mb-1 ${trendColor}`} />
              <p className={`text-lg font-bold tabular-nums ${trendColor}`}>
                {comparedToAvg > 0 ? '+' : ''}{comparedToAvg.toFixed(0)}%
              </p>
              <p className="text-[10px] text-muted-foreground" suppressHydrationWarning>
                {t('weeklySummary.vsAverage')}
              </p>
            </div>
            <div className="rounded-xl bg-background/60 border p-3 text-center">
              <PiggyBank className="h-4 w-4 mx-auto mb-1 text-emerald-600 dark:text-emerald-400" />
              <p className="text-lg font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                {formatPrice(totalSavings)}
              </p>
              <p className="text-[10px] text-muted-foreground" suppressHydrationWarning>
                {t('weeklySummary.canSave')}
              </p>
            </div>
          </div>

          {/* Top category */}
          {summary.topCategory && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground" suppressHydrationWarning>
                {t('weeklySummary.topCategory')}:
              </span>
              <span className="font-medium">{summary.topCategory}</span>
            </div>
          )}

          {/* Savings tips */}
          {summary.savingsTips && summary.savingsTips.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide" suppressHydrationWarning>
                {t('weeklySummary.savingsTips')}
              </p>
              <div className="space-y-1.5">
                {summary.savingsTips.slice(0, 3).map((tip, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.3, delay: 0.2 + i * 0.06 }}
                    className="flex items-center justify-between text-xs p-2 rounded-lg bg-emerald-500/5 border border-emerald-500/10"
                  >
                    <div className="min-w-0 flex-1">
                      <span className="font-medium truncate block">{tip.product}</span>
                      <span className="text-muted-foreground">
                        {tip.currentStore} {formatPrice(tip.currentPrice)} → {tip.alternativeStore} {formatPrice(tip.alternativePrice)}
                      </span>
                    </div>
                    <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/20 text-[10px] shrink-0 ml-2">
                      -{formatPrice(tip.saving)}
                    </Badge>
                  </motion.div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  )
}
