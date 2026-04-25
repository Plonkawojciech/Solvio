'use client'

import { motion } from 'framer-motion'
import { Card, CardContent } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Trash2, CreditCard } from 'lucide-react'
import { useTranslation } from '@/lib/i18n'

export interface LoyaltyCardData {
  id: string
  store: string
  cardNumber: string | null
  memberName: string | null
  isActive: boolean
  lastUsed: string | null
  promotionsCount?: number
}

const STORE_BRANDS: Record<string, {
  gradient: string
  text: string
  icon: string
  accent: string
}> = {
  biedronka: {
    gradient: 'from-red-600 to-red-800',
    text: 'Biedronka',
    icon: 'B',
    accent: 'bg-red-500/15 text-red-700 dark:text-red-400',
  },
  lidl: {
    gradient: 'from-blue-600 to-yellow-500',
    text: 'Lidl',
    icon: 'L',
    accent: 'bg-blue-500/15 text-blue-700 dark:text-blue-400',
  },
  zabka: {
    gradient: 'from-green-600 to-green-800',
    text: 'Żabka',
    icon: 'Ż',
    accent: 'bg-green-500/15 text-green-700 dark:text-green-400',
  },
  kaufland: {
    gradient: 'from-red-700 to-red-900',
    text: 'Kaufland',
    icon: 'K',
    accent: 'bg-red-700/15 text-red-800 dark:text-red-300',
  },
  aldi: {
    gradient: 'from-blue-500 to-orange-500',
    text: 'Aldi',
    icon: 'A',
    accent: 'bg-blue-500/15 text-blue-700 dark:text-blue-400',
  },
  auchan: {
    gradient: 'from-red-500 to-red-700',
    text: 'Auchan',
    icon: 'A',
    accent: 'bg-red-500/15 text-red-700 dark:text-red-400',
  },
  carrefour: {
    gradient: 'from-blue-600 to-blue-800',
    text: 'Carrefour',
    icon: 'C',
    accent: 'bg-blue-600/15 text-blue-800 dark:text-blue-300',
  },
  rossmann: {
    gradient: 'from-red-500 to-rose-700',
    text: 'Rossmann',
    icon: 'R',
    accent: 'bg-red-400/15 text-red-600 dark:text-red-400',
  },
}

function maskCardNumber(num: string | null): string {
  if (!num) return '----'
  const clean = num.replace(/\s/g, '')
  if (clean.length < 6) return clean
  return `${clean.slice(0, 3)}${'*'.repeat(clean.length - 6)}${clean.slice(-3)}`
}

export function LoyaltyCardComponent({
  card,
  index,
  onToggle,
  onDelete,
}: {
  card: LoyaltyCardData
  index: number
  onToggle: (id: string, active: boolean) => void
  onDelete: (id: string) => void
}) {
  const { t } = useTranslation()
  const brand = STORE_BRANDS[card.store] || {
    gradient: 'from-gray-600 to-gray-800',
    text: card.store,
    icon: card.store[0]?.toUpperCase() || '?',
    accent: 'bg-gray-500/15 text-gray-700 dark:text-gray-400',
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16, transition: { duration: 0.2 } }}
      transition={{ duration: 0.4, delay: index * 0.06, ease: [0.22, 1, 0.36, 1] as const }}
    >
      <Card className={`overflow-hidden hover:shadow-md transition-all duration-200 ${!card.isActive ? 'opacity-60' : ''}`}>
        {/* Color band */}
        <div className={`h-2 bg-gradient-to-r ${brand.gradient}`} />

        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-3">
            {/* Store brand icon */}
            <div className="flex items-center gap-3">
              <div className={`h-11 w-11 rounded-xl bg-gradient-to-br ${brand.gradient} flex items-center justify-center shrink-0 shadow-sm`}>
                <span className="text-white text-lg font-bold">{brand.icon}</span>
              </div>
              <div className="min-w-0">
                <h3 className="font-semibold text-sm">{brand.text}</h3>
                <p className="text-xs text-muted-foreground font-mono mt-0.5">
                  {maskCardNumber(card.cardNumber)}
                </p>
              </div>
            </div>

            {/* Toggle */}
            <Switch
              checked={card.isActive}
              onCheckedChange={(checked) => onToggle(card.id, checked)}
            />
          </div>

          {/* Member name */}
          {card.memberName && (
            <p className="text-xs text-muted-foreground mt-3 truncate">
              <CreditCard className="h-3 w-3 inline mr-1" />
              {card.memberName}
            </p>
          )}

          {/* Footer */}
          <div className="flex items-center justify-between mt-3 pt-3 border-t">
            {card.promotionsCount != null && card.promotionsCount > 0 ? (
              <Badge className={`text-[10px] ${brand.accent} border-0`} suppressHydrationWarning>
                {card.promotionsCount} {t('loyalty.promos')}
              </Badge>
            ) : (
              <span className="text-[10px] text-muted-foreground" suppressHydrationWarning>
                {t('loyalty.noPromos')}
              </span>
            )}

            <Button
              aria-label={t('loyalty.deleteCard')}
              variant="ghost"
              size="icon"
              className="h-9 w-9 min-h-[44px] min-w-[44px] text-muted-foreground hover:text-destructive"
              onClick={() => onDelete(card.id)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}

export { STORE_BRANDS }
