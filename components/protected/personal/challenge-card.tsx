'use client'

import { motion } from 'framer-motion'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { useTranslation } from '@/lib/i18n'
import { CheckCircle2, Flame, Trash2, Calendar } from 'lucide-react'

interface Challenge {
  id: string
  name: string
  emoji: string | null
  type: string
  targetCategory: string | null
  targetAmount: string | null
  startDate: string
  endDate: string
  isActive: boolean
  isCompleted: boolean | null
  currentProgress: string | null
  createdAt: string
}

interface ChallengeCardProps {
  challenge: Challenge
  index: number
  onCheckIn: (id: string) => void
  onDelete: (id: string) => void
  currency: string
}

export function ChallengeCard({ challenge, index, onCheckIn, onDelete, currency }: ChallengeCardProps) {
  const { t } = useTranslation()

  const start = new Date(challenge.startDate)
  const end = new Date(challenge.endDate)
  const today = new Date()
  const totalDays = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)))
  const daysPassed = Math.max(0, Math.ceil((today.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)))
  const daysLeft = Math.max(0, totalDays - daysPassed)
  const progressPct = Math.min((daysPassed / totalDays) * 100, 100)
  const progress = parseFloat(challenge.currentProgress || '0')
  const targetAmt = parseFloat(challenge.targetAmount || '0')

  const typeColors: Record<string, string> = {
    no_spend: 'bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/20',
    limit: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/20',
    save: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/20',
    custom: 'bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/20',
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.08, ease: [0.22, 1, 0.36, 1] }}
    >
      <Card className="h-full overflow-hidden hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 border-border/60 relative group">
        <CardContent className="p-4 flex flex-col gap-3">
          {/* Header */}
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <span className="text-2xl shrink-0">{challenge.emoji || '💪'}</span>
              <div className="min-w-0">
                <h3 className="font-bold text-sm leading-tight line-clamp-2">{challenge.name}</h3>
                <div className="flex items-center gap-1.5 mt-1">
                  <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${typeColors[challenge.type] || typeColors.custom}`}>
                    {t(`challenges.type.${challenge.type}` as any)}
                  </Badge>
                  {challenge.targetCategory && (
                    <span className="text-[10px] text-muted-foreground">{challenge.targetCategory}</span>
                  )}
                </div>
              </div>
            </div>
            <button
              onClick={() => onDelete(challenge.id)}
              className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Progress bar */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">
                {daysPassed} {t('challenges.of')} {totalDays} {t('challenges.daysCompleted').toLowerCase()}
              </span>
              <span className="flex items-center gap-1 font-semibold">
                {daysPassed > 0 && !challenge.isCompleted && (
                  <Flame className="h-3.5 w-3.5 text-orange-500" />
                )}
                {daysLeft} {t('challenges.daysLeft')}
              </span>
            </div>
            <Progress value={progressPct} className="h-2.5" />
          </div>

          {/* Stats */}
          {(challenge.type === 'save' || challenge.type === 'limit') && targetAmt > 0 && (
            <div className="flex items-center justify-between bg-muted/30 rounded-lg px-3 py-2">
              <span className="text-xs text-muted-foreground">{t('challenges.savedSoFar')}</span>
              <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                {progress.toFixed(2)} {currency}
                {targetAmt > 0 && (
                  <span className="text-muted-foreground font-normal"> / {targetAmt.toFixed(2)}</span>
                )}
              </span>
            </div>
          )}

          {/* Date range */}
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Calendar className="h-3 w-3" />
            <span>{challenge.startDate} — {challenge.endDate}</span>
          </div>

          {/* Check in button */}
          {challenge.isActive && !challenge.isCompleted && (
            <Button
              onClick={() => onCheckIn(challenge.id)}
              size="sm"
              variant="outline"
              className="w-full min-h-[44px] font-semibold border-emerald-500/30 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/10"
            >
              <CheckCircle2 className="h-4 w-4 mr-1.5" />
              {t('challenges.checkIn')}
            </Button>
          )}

          {challenge.isCompleted && (
            <div className="flex items-center justify-center gap-2 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                {t('challenges.completed')}
              </span>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  )
}
