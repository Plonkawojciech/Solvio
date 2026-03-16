'use client'

import { motion } from 'framer-motion'
import { useTranslation } from '@/lib/i18n'
import { Button } from '@/components/ui/button'
import { Sparkles, Check, X, Loader2 } from 'lucide-react'

interface AiSplitSuggestionProps {
  loading: boolean
  suggestions: {
    suggestions: Array<{ itemIndex: number; memberNames: string[]; reason: string }>
    summary: string
  } | null
  onAccept: () => void
  onDismiss: () => void
}

export function AiSplitSuggestion({
  loading,
  suggestions,
  onAccept,
  onDismiss,
}: AiSplitSuggestionProps) {
  const { t } = useTranslation()

  if (loading) {
    return (
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-3 rounded-xl border border-violet-200 dark:border-violet-800 bg-violet-50/50 dark:bg-violet-900/10 p-3"
      >
        <Loader2 className="h-4 w-4 animate-spin text-violet-600 dark:text-violet-400 shrink-0" />
        <span className="text-sm font-medium text-violet-700 dark:text-violet-300">
          {t('groups.aiAnalyzing')}
        </span>
      </motion.div>
    )
  }

  if (!suggestions) return null

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="rounded-xl border border-violet-200 dark:border-violet-800 bg-violet-50/50 dark:bg-violet-900/10 p-3 space-y-2.5"
    >
      <div className="flex items-start gap-2">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-violet-100 dark:bg-violet-800/30">
          <Sparkles className="h-3.5 w-3.5 text-violet-600 dark:text-violet-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-violet-800 dark:text-violet-200">
            {t('groups.aiSuggestSplit')}
          </p>
          <p className="text-xs text-violet-600 dark:text-violet-400 mt-0.5 leading-relaxed">
            {suggestions.summary}
          </p>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="p-1 rounded-md hover:bg-violet-200 dark:hover:bg-violet-800/40 text-violet-500 transition-colors shrink-0"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Show a few suggestion reasons */}
      {suggestions.suggestions.slice(0, 3).map((s, idx) => (
        <div
          key={idx}
          className="flex items-start gap-2 pl-9 text-xs text-violet-600 dark:text-violet-400"
        >
          <span className="shrink-0 mt-0.5">{'>'}</span>
          <span>{s.reason}</span>
        </div>
      ))}

      <div className="flex gap-2 pl-9">
        <Button
          size="sm"
          variant="outline"
          onClick={onAccept}
          className="h-7 text-xs border-violet-300 dark:border-violet-700 text-violet-700 dark:text-violet-300 hover:bg-violet-100 dark:hover:bg-violet-800/30"
        >
          <Check className="h-3 w-3 mr-1" />
          {t('groups.acceptSuggestion')}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={onDismiss}
          className="h-7 text-xs text-violet-600 dark:text-violet-400 hover:bg-violet-100 dark:hover:bg-violet-800/30"
        >
          {t('groups.customizeSplit')}
        </Button>
      </div>
    </motion.div>
  )
}
