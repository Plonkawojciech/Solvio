'use client'

import { motion } from 'framer-motion'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Clock, ShoppingCart } from 'lucide-react'
import { useTranslation } from '@/lib/i18n'

export interface PromotionData {
  id: string
  store: string
  productName: string
  regularPrice: number | null
  promoPrice: number
  discount: string | null
  currency: string
  validFrom: string | null
  validUntil: string | null
  category: string | null
  matchesPurchases?: boolean
}

const STORE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  Biedronka: { bg: 'bg-red-500/10', text: 'text-red-700 dark:text-red-400', border: 'border-red-500/20' },
  Lidl: { bg: 'bg-yellow-500/10', text: 'text-yellow-700 dark:text-yellow-400', border: 'border-yellow-500/20' },
  Żabka: { bg: 'bg-green-500/10', text: 'text-green-700 dark:text-green-400', border: 'border-green-500/20' },
  Kaufland: { bg: 'bg-red-700/10', text: 'text-red-800 dark:text-red-300', border: 'border-red-700/20' },
  Aldi: { bg: 'bg-blue-500/10', text: 'text-blue-700 dark:text-blue-400', border: 'border-blue-500/20' },
  Auchan: { bg: 'bg-red-500/10', text: 'text-red-700 dark:text-red-400', border: 'border-red-500/20' },
  Carrefour: { bg: 'bg-blue-600/10', text: 'text-blue-800 dark:text-blue-300', border: 'border-blue-600/20' },
  Rossmann: { bg: 'bg-rose-500/10', text: 'text-rose-700 dark:text-rose-400', border: 'border-rose-500/20' },
}

function calcSavingsPercent(regular: number | null, promo: number): number {
  if (!regular || regular <= 0) return 0
  return Math.round(((regular - promo) / regular) * 100)
}

export function PromotionCard({
  promo,
  index,
  currency,
}: {
  promo: PromotionData
  index: number
  currency: string
}) {
  const { t, lang } = useTranslation()
  const locale = lang === 'pl' ? 'pl-PL' : 'en-US'
  const storeStyle = STORE_COLORS[promo.store] || { bg: 'bg-muted', text: 'text-muted-foreground', border: 'border-border' }
  const savingsPercent = calcSavingsPercent(promo.regularPrice, promo.promoPrice)

  const formatPrice = (price: number) =>
    new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: promo.currency || currency,
      minimumFractionDigits: 2,
    }).format(price)

  const daysLeft = promo.validUntil
    ? Math.max(0, Math.ceil((new Date(promo.validUntil).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : null

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.05, ease: [0.22, 1, 0.36, 1] as const }}
    >
      <Card className="overflow-hidden hover:shadow-md transition-shadow duration-200 h-full flex flex-col">
        <CardContent className="p-4 flex flex-col gap-3 flex-1">
          {/* Header */}
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold leading-tight line-clamp-2">
                {promo.productName}
              </p>
              {promo.category && (
                <span className="text-[10px] text-muted-foreground">{promo.category}</span>
              )}
            </div>
            {promo.matchesPurchases && (
              <Badge className="shrink-0 bg-primary/10 text-primary border-primary/20 text-[10px] gap-1">
                <ShoppingCart className="h-2.5 w-2.5" />
                {t('promotions.matchesPurchases')}
              </Badge>
            )}
          </div>

          {/* Prices */}
          <div className="flex items-end gap-3">
            <div>
              <p className="text-xs text-muted-foreground" suppressHydrationWarning>{t('promotions.promoPrice')}</p>
              <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                {formatPrice(promo.promoPrice)}
              </p>
            </div>
            {promo.regularPrice && (
              <div>
                <p className="text-xs text-muted-foreground" suppressHydrationWarning>{t('promotions.regularPrice')}</p>
                <p className="text-sm text-muted-foreground line-through tabular-nums">
                  {formatPrice(promo.regularPrice)}
                </p>
              </div>
            )}
            {savingsPercent > 0 && (
              <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/20 text-xs font-bold ml-auto">
                -{savingsPercent}%
              </Badge>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between mt-auto pt-2 border-t">
            <Badge variant="outline" className={`text-[10px] ${storeStyle.text} ${storeStyle.border}`}>
              {promo.store}
            </Badge>
            {daysLeft !== null && (
              <span className={`text-[10px] flex items-center gap-1 ${
                daysLeft <= 2
                  ? 'text-red-600 dark:text-red-400 font-semibold'
                  : 'text-muted-foreground'
              }`}>
                <Clock className="h-3 w-3" />
                {daysLeft === 0
                  ? (lang === 'pl' ? 'Ostatni dzień!' : 'Last day!')
                  : `${daysLeft} ${lang === 'pl' ? (daysLeft === 1 ? 'dzień' : 'dni') : (daysLeft === 1 ? 'day' : 'days')}`
                }
              </span>
            )}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}
