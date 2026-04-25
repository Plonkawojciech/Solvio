'use client'

import { useState, useCallback } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Sparkles, Loader2, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react'
import { useTranslation } from '@/lib/i18n'

interface WeeklyDigestProps {
  currency: string
}

export function WeeklyDigest({ currency }: WeeklyDigestProps) {
  const { t, lang } = useTranslation()

  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [summary, setSummary] = useState<string | null>(null)
  const [errorType, setErrorType] = useState<string | null>(null)

  const handleGenerate = useCallback(async () => {
    setLoading(true)
    setErrorType(null)
    setSummary(null)
    try {
      const res = await fetch('/api/personal/weekly-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lang, currency }),
      })
      const data = await res.json()
      if (data?.error === 'no_data') {
        setErrorType('no_data')
      } else if (data?.summary?.aiSummary) {
        setSummary(data.summary.aiSummary)
      } else {
        setErrorType('error')
      }
    } catch {
      setErrorType('error')
    } finally {
      setLoading(false)
    }
  }, [lang, currency])

  return (
    <Card className="border border-primary/20 bg-gradient-to-r from-primary/5 via-background to-violet-500/5 overflow-hidden">
      <button
        className="w-full text-left"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
      >
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15">
                <Sparkles className="h-4 w-4 text-primary" />
              </div>
              <span suppressHydrationWarning>{t('dashboard.weeklyDigest')}</span>
            </CardTitle>
            {open
              ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
              : <ChevronDown className="h-4 w-4 text-muted-foreground" />
            }
          </div>
          <CardDescription suppressHydrationWarning>{t('dashboard.weeklyDigestDesc')}</CardDescription>
        </CardHeader>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="weekly-body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            style={{ overflow: 'hidden' }}
          >
            <CardContent className="pt-0 pb-5">
              {!summary && !loading && !errorType && (
                <div className="flex flex-col items-start gap-3">
                  <p className="text-sm text-muted-foreground" suppressHydrationWarning>
                    {t('dashboard.weeklyDigestDesc')}
                  </p>
                  <Button
                    variant="default"
                    size="sm"
                    className="gap-2 bg-primary/90 hover:bg-primary"
                    onClick={e => { e.stopPropagation(); handleGenerate() }}
                  >
                    <Sparkles className="h-4 w-4" />
                    <span suppressHydrationWarning>{t('dashboard.generateWeeklySummary')}</span>
                  </Button>
                </div>
              )}

              <AnimatePresence mode="wait">
                {loading && (
                  <motion.div
                    key="weekly-loading"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex items-center gap-3 py-2"
                  >
                    <Loader2 className="h-4 w-4 animate-spin text-primary flex-shrink-0" />
                    <p className="text-sm text-muted-foreground" suppressHydrationWarning>
                      {t('dashboard.weeklyGenerating')}
                    </p>
                  </motion.div>
                )}

                {!loading && errorType && (
                  <motion.div
                    key="weekly-error"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="flex flex-col gap-3"
                  >
                    <p className="text-sm text-muted-foreground" suppressHydrationWarning>
                      {errorType === 'no_data' ? t('dashboard.weeklyNoData') : t('dashboard.weeklyError')}
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2 self-start"
                      onClick={e => { e.stopPropagation(); handleGenerate() }}
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      <span suppressHydrationWarning>{t('dashboard.tryAgain')}</span>
                    </Button>
                  </motion.div>
                )}

                {!loading && summary && (
                  <motion.div
                    key="weekly-result"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="flex flex-col gap-4"
                  >
                    <div className="flex items-start gap-3 p-4 rounded-xl bg-primary/5 border border-primary/15">
                      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary mt-0.5">
                        <Sparkles className="h-3.5 w-3.5" />
                      </div>
                      <p className="text-sm leading-relaxed">{summary}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-2 self-start text-muted-foreground hover:text-foreground"
                      onClick={e => { e.stopPropagation(); handleGenerate() }}
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      <span suppressHydrationWarning>{t('analysis.refreshAi')}</span>
                    </Button>
                  </motion.div>
                )}
              </AnimatePresence>
            </CardContent>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  )
}
