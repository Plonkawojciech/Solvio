'use client'

import { motion } from 'framer-motion'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { GoalProgressRing } from './goal-progress-ring'
import { useTranslation } from '@/lib/i18n'
import { Plus, Calendar, Trash2 } from 'lucide-react'

interface SavingsGoal {
  id: string
  name: string
  emoji: string | null
  targetAmount: string
  currentAmount: string
  currency: string | null
  deadline: string | null
  priority: string | null
  color: string | null
  category: string | null
  isCompleted: boolean
  completedAt: string | null
  aiTips: string[] | null
  createdAt: string
}

interface SavingsGoalCardProps {
  goal: SavingsGoal
  index: number
  onAddFunds: (goal: SavingsGoal) => void
  onDelete: (id: string) => void
  currency: string
}

export function SavingsGoalCard({ goal, index, onAddFunds, onDelete, currency }: SavingsGoalCardProps) {
  const { t } = useTranslation()
  const target = parseFloat(goal.targetAmount || '0')
  const current = parseFloat(goal.currentAmount || '0')
  const percentage = target > 0 ? Math.min((current / target) * 100, 100) : 0
  const color = goal.color || '#6366f1'
  const displayCurrency = goal.currency || currency

  // Calculate daily savings needed
  let dailyNeeded: number | null = null
  let daysLeft: number | null = null
  if (goal.deadline && !goal.isCompleted) {
    const deadlineDate = new Date(goal.deadline)
    const today = new Date()
    const diffMs = deadlineDate.getTime() - today.getTime()
    daysLeft = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)))
    const remaining = target - current
    if (daysLeft > 0 && remaining > 0) {
      dailyNeeded = remaining / daysLeft
    }
  }

  const priorityColors: Record<string, string> = {
    low: 'bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/20',
    medium: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/20',
    high: 'bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/20',
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.08, ease: [0.22, 1, 0.36, 1] }}
    >
      <Card className="h-full overflow-hidden hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 border-border/60 relative group">
        {/* Color accent bar */}
        <div className="absolute top-0 left-0 right-0 h-1 rounded-t-lg" style={{ backgroundColor: color }} />

        <CardContent className="p-4 pt-5 flex flex-col gap-3">
          {/* Header: emoji + name + priority */}
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <span className="text-2xl shrink-0">{goal.emoji || '🎯'}</span>
              <h3 className="font-bold text-sm leading-tight line-clamp-2">{goal.name}</h3>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {goal.priority && (
                <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${priorityColors[goal.priority] || ''}`}>
                  {t(`goals.priority.${goal.priority}` as Parameters<typeof t>[0])}
                </Badge>
              )}
              <button
                onClick={() => onDelete(goal.id)}
                className="md:opacity-0 md:group-hover:opacity-100 md:focus:opacity-100 transition-opacity p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                aria-label={t('goals.deleteSavingsGoal')}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Progress ring + amounts */}
          <div className="flex items-center gap-4">
            <GoalProgressRing
              percentage={percentage}
              size={72}
              strokeWidth={5}
              color={color}
            >
              <span className="text-xs font-bold">{Math.round(percentage)}%</span>
            </GoalProgressRing>

            <div className="flex-1 min-w-0">
              <p className="text-lg font-extrabold" style={{ color }}>
                {current.toLocaleString('pl-PL', { minimumFractionDigits: 2 })} {displayCurrency}
              </p>
              <p className="text-xs text-muted-foreground">
                / {target.toLocaleString('pl-PL', { minimumFractionDigits: 2 })} {displayCurrency}
              </p>

              {/* Deadline */}
              <div className="flex items-center gap-1 mt-1.5 text-xs text-muted-foreground">
                <Calendar className="h-3 w-3" />
                {daysLeft !== null ? (
                  <span>
                    {daysLeft} {t('goals.daysLeft')}
                  </span>
                ) : (
                  <span>{t('goals.noDeadline')}</span>
                )}
              </div>
            </div>
          </div>

          {/* Daily savings needed */}
          {dailyNeeded !== null && dailyNeeded > 0 && (
            <div className="flex items-center gap-2 bg-primary/5 border border-primary/10 rounded-lg px-3 py-2">
              <span className="text-xs font-semibold text-primary">
                {dailyNeeded.toFixed(2)} {displayCurrency} {t('goals.perDay')}
              </span>
            </div>
          )}

          {/* AI tips */}
          {goal.aiTips && goal.aiTips.length > 0 && (
            <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-2">
              {goal.aiTips[0]}
            </p>
          )}

          {/* Add funds button */}
          <Button
            onClick={() => onAddFunds(goal)}
            size="sm"
            className="w-full min-h-[44px] font-semibold"
            style={{ backgroundColor: color }}
          >
            <Plus className="h-4 w-4 mr-1.5" />
            {t('goals.addFunds')}
          </Button>
        </CardContent>
      </Card>
    </motion.div>
  )
}
