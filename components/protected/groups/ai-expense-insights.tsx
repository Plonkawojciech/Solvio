'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTranslation } from '@/lib/i18n'
import { Button } from '@/components/ui/button'
import {
  Sparkles,
  X,
  RefreshCw,
  Loader2,
  TrendingUp,
  AlertTriangle,
  Lightbulb,
  DollarSign,
} from 'lucide-react'

interface Insight {
  type: 'spending' | 'balance' | 'tip' | 'warning'
  icon: string
  title: string
  description: string
  priority: 'high' | 'medium' | 'low'
}

interface AiExpenseInsightsProps {
  groupId: string
}

const TYPE_STYLES: Record<string, { bg: string; border: string; text: string; icon: React.ElementType }> = {
  spending: {
    bg: 'bg-blue-50/50 dark:bg-blue-900/10',
    border: 'border-blue-200 dark:border-blue-800',
    text: 'text-blue-700 dark:text-blue-300',
    icon: TrendingUp,
  },
  balance: {
    bg: 'bg-amber-50/50 dark:bg-amber-900/10',
    border: 'border-amber-200 dark:border-amber-800',
    text: 'text-amber-700 dark:text-amber-300',
    icon: DollarSign,
  },
  tip: {
    bg: 'bg-emerald-50/50 dark:bg-emerald-900/10',
    border: 'border-emerald-200 dark:border-emerald-800',
    text: 'text-emerald-700 dark:text-emerald-300',
    icon: Lightbulb,
  },
  warning: {
    bg: 'bg-red-50/50 dark:bg-red-900/10',
    border: 'border-red-200 dark:border-red-800',
    text: 'text-red-700 dark:text-red-300',
    icon: AlertTriangle,
  },
}

export function AiExpenseInsights({ groupId }: AiExpenseInsightsProps) {
  const { t } = useTranslation()
  const [insights, setInsights] = useState<Insight[]>([])
  const [summary, setSummary] = useState('')
  const [loading, setLoading] = useState(false)
  const [dismissed, setDismissed] = useState<Set<number>>(new Set())
  const [fetched, setFetched] = useState(false)

  const fetchInsights = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/groups/${groupId}/ai-insights`)
      if (!res.ok) throw new Error('Failed')
      const data = await res.json()
      setInsights(data.insights || [])
      setSummary(data.summary || '')
      setFetched(true)
      setDismissed(new Set())
    } catch {
      // Silent fail — insights are a nice-to-have
    } finally {
      setLoading(false)
    }
  }, [groupId])

  useEffect(() => {
    if (!fetched) fetchInsights()
  }, [fetched, fetchInsights])

  const dismissInsight = (idx: number) => {
    setDismissed((prev) => new Set(prev).add(idx))
  }

  const visibleInsights = insights.filter((_, idx) => !dismissed.has(idx))

  if (loading) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-dashed p-4">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        <span className="text-sm text-muted-foreground">{t('groups.loadingInsights')}</span>
      </div>
    )
  }

  if (!fetched || visibleInsights.length === 0) return null

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-violet-500" />
          <h3 className="text-sm font-semibold">{t('groups.insights')}</h3>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={fetchInsights}
          disabled={loading}
          className="h-7 text-xs gap-1.5"
        >
          <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
          {t('groups.refreshInsights')}
        </Button>
      </div>

      {summary && (
        <p className="text-xs text-muted-foreground leading-relaxed">{summary}</p>
      )}

      <AnimatePresence>
        {visibleInsights.map((insight, idx) => {
          const originalIdx = insights.indexOf(insight)
          const style = TYPE_STYLES[insight.type] || TYPE_STYLES.tip
          const Icon = style.icon

          return (
            <motion.div
              key={originalIdx}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: -20, height: 0, marginBottom: 0 }}
              transition={{ duration: 0.2, delay: idx * 0.05 }}
              className={`rounded-xl border ${style.border} ${style.bg} p-3.5`}
            >
              <div className="flex items-start gap-2.5">
                <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${style.bg}`}>
                  {insight.icon ? (
                    <span className="text-base">{insight.icon}</span>
                  ) : (
                    <Icon className={`h-4 w-4 ${style.text}`} />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-semibold ${style.text}`}>{insight.title}</p>
                  <p className={`text-xs mt-0.5 leading-relaxed opacity-80 ${style.text}`}>
                    {insight.description}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => dismissInsight(originalIdx)}
                  aria-label={`Dismiss insight: ${insight.title}`}
                  className={`p-1 rounded-md hover:bg-black/5 dark:hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-1 ${style.text} opacity-50 hover:opacity-100 transition-opacity shrink-0`}
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}
