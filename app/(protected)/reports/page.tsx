'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from '@/lib/i18n'
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  RefreshCcw, FileDown, FileText, File, Loader2, FileBarChart2,
  AlertCircle, CalendarRange, CheckCircle2,
} from "lucide-react"
import { CustomReportForm } from "@/components/protected/reports/custom-report-form"
import {
  Tooltip, TooltipProvider, TooltipTrigger, TooltipContent,
} from "@/components/ui/tooltip"
import { toast } from "sonner"
import { motion, AnimatePresence } from "framer-motion"

type FileTriplet = { csv?: string; pdf?: string; docx?: string }

function ymKey(y: number, m: number) {
  return `${y}-${String(m).padStart(2, "0")}`
}

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  show: (i: number) => ({
    opacity: 1, y: 0,
    transition: { duration: 0.45, delay: i * 0.07, ease: [0.22, 1, 0.36, 1] as const },
  }),
}

export default function ReportsPage() {
  const { t, lang } = useTranslation()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [settings, setSettings] = useState<any>(null)
  const [yearBlocks, setYearBlocks] = useState<any[]>([])
  const [expensesByPeriod, setExpensesByPeriod] = useState<Record<string, number>>({})
  const [regenerating, setRegenerating] = useState<string | null>(null)
  const [reportUrls, setReportUrls] = useState<Record<string, FileTriplet>>({})

  const fetchData = useCallback(async (signal?: AbortSignal) => {
    setLoading(true)
    setError(null)
    try {
      const [settingsRes, expensesRes] = await Promise.all([
        fetch('/api/data/settings', { signal }).then(r => {
          if (!r.ok) throw new Error('Failed to load settings')
          return r.json()
        }),
        fetch('/api/data/expenses', { signal }).then(r => {
          if (!r.ok) throw new Error('Failed to load expenses')
          return r.json()
        }),
      ])

      setSettings(settingsRes.settings)

      const yearToMonths = new Map<number, Set<number>>()
      const counts: Record<string, number> = {}

      for (const e of (expensesRes.expenses || [])) {
        const d = new Date(e.date as string)
        const y = d.getUTCFullYear()
        const m = d.getUTCMonth() + 1
        if (!yearToMonths.has(y)) yearToMonths.set(y, new Set())
        yearToMonths.get(y)!.add(m)

        // Count for yearly and monthly
        const monthKey = `monthly-${ymKey(y, m)}`
        const yearKey = `yearly-${y}`
        counts[monthKey] = (counts[monthKey] || 0) + 1
        counts[yearKey] = (counts[yearKey] || 0) + 1
      }

      setExpensesByPeriod(counts)

      const years = Array.from(yearToMonths.keys()).sort((a, b) => b - a)
      const blocks = years.map((y) => ({
        year: y,
        months: Array.from(yearToMonths.get(y)!).sort((a, b) => b - a),
      }))
      setYearBlocks(blocks)
    } catch (err: any) {
      if (err.name === 'AbortError') return
      setError(t('reports.somethingWrong'))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    const controller = new AbortController()
    fetchData(controller.signal)
    return () => controller.abort()
  }, [fetchData])

  async function handleRegenerate(params: { type: 'yearly'; year: number } | { type: 'monthly'; ym: string }) {
    const key = params.type === 'yearly' ? `yearly-${params.year}` : `monthly-${params.ym}`
    setRegenerating(key)

    try {
      const body = new FormData()
      body.append('type', params.type)
      if (params.type === 'yearly') body.append('year', String(params.year))
      else body.append('ym', params.ym)

      const res = await fetch('/api/reports/generate', { method: 'POST', body })

      if (!res.ok) {
        const msg = await res.text()
        toast.error(t('reports.failedGenerateDesc'), { description: msg })
        return
      }

      const data = await res.json()
      const desc = params.type === 'yearly'
        ? t('reports.generatedYearly').replace('%s', String(params.year))
        : t('reports.generatedMonthly').replace('%s', params.ym)
      toast.success(t('reports.generated'), { description: desc })

      // Store public URLs from Vercel Blob response
      if (data.urls) {
        setReportUrls(prev => ({ ...prev, [key]: data.urls }))
      }
    } catch (err) {
      toast.error(t('reports.networkErrorGenerate'), { description: String(err) })
    } finally {
      setRegenerating(null)
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-4 sm:gap-6 md:gap-8">
        <div className="space-y-2">
          <div className="h-8 w-48 rounded-lg bg-muted animate-pulse" />
          <div className="h-4 w-72 rounded-md bg-muted animate-pulse" />
        </div>
        <div className="grid gap-3 sm:gap-4 grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3">
          {[0, 1, 2].map(i => (
            <div key={i} className="h-40 rounded-xl bg-muted animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col gap-4 sm:gap-6 md:gap-8">
        <div className="space-y-2">
          <div className="h-8 w-48 rounded-lg bg-muted animate-pulse" />
        </div>
        <div className="flex flex-col items-center justify-center py-20 gap-5 text-center">
          <div className="h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center">
            <AlertCircle className="h-8 w-8 text-destructive" />
          </div>
          <div className="space-y-1 max-w-xs">
            <h3 className="text-lg font-semibold">{t('reports.somethingWrong')}</h3>
            <p className="text-sm text-muted-foreground">{error}</p>
          </div>
          <Button onClick={() => fetchData()} variant="outline" className="gap-2">
            <RefreshCcw className="h-4 w-4" />
            {t('reports.tryAgain')}
          </Button>
        </div>
      </div>
    )
  }

  const currency = (settings?.currency || "PLN").toUpperCase()
  const locale = lang === "pl" ? "pl-PL" : "en-US"
  const hasExpenses = yearBlocks.length > 0
  const isGenerating = regenerating !== null

  return (
    <div className="flex flex-col gap-6 sm:gap-8">
      {/* Page header */}
      <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">{t('reports.title')}</h2>
        <p className="text-sm sm:text-base text-muted-foreground mt-1">{t('reports.description')}</p>
      </motion.div>

      {/* ── Section 1: Periodic Reports ── */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.05 }}
        className="flex flex-col gap-3"
      >
        {/* Section label */}
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
            <FileBarChart2 className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h3 className="text-base font-semibold leading-tight">{t('reports.periodicTitle')}</h3>
            <p className="text-xs text-muted-foreground">{t('reports.periodicDesc')}</p>
          </div>
        </div>

        <AnimatePresence mode="wait">
          {!hasExpenses ? (
            /* ── Empty state ── */
            <motion.div
              key="empty"
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4 }}
              className="flex flex-col items-center justify-center py-16 gap-5 text-center rounded-xl border border-dashed bg-muted/10"
            >
              <div className="relative">
                <div className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center">
                  <FileBarChart2 className="h-10 w-10 text-primary" />
                </div>
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 12, repeat: Infinity, ease: 'linear' }}
                  className="absolute inset-0 rounded-full border-2 border-dashed border-primary/25"
                />
              </div>
              <div className="space-y-1 max-w-xs">
                <h3 className="text-base font-semibold">{t('reports.noExpensesTitle')}</h3>
                <p className="text-sm text-muted-foreground">{t('reports.noExpensesDesc')}</p>
              </div>
            </motion.div>
          ) : (
            /* ── Report cards ── */
            <motion.div key="cards" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              {isGenerating && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mb-4 flex items-center gap-3 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm"
                >
                  <Loader2 className="h-4 w-4 animate-spin text-primary flex-shrink-0" />
                  <span>{t('reports.generatingBanner')}</span>
                </motion.div>
              )}

              <div className="max-h-[42vh] overflow-y-auto p-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                <div className="grid gap-3 sm:gap-4 grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 pr-1">
                  {yearBlocks.map(({ year, months }, idx) => {
                    const yearKey = `yearly-${year}`
                    const yFiles = reportUrls[yearKey] ?? {}
                    const isYearGenerating = regenerating === yearKey
                    const yearCount = expensesByPeriod[yearKey] || 0
                    const hasYearFiles = !!(yFiles.pdf || yFiles.csv || yFiles.docx)
                    return (
                      <motion.div key={year} custom={idx} variants={fadeUp} initial="hidden" animate="show">
                        <Card className="flex flex-col h-full">
                          <CardHeader className="pb-3">
                            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <CardTitle className="text-lg sm:text-xl">{year}</CardTitle>
                                  {hasYearFiles && (
                                    <Badge variant="secondary" className="gap-1 text-xs">
                                      <CheckCircle2 className="h-3 w-3 text-green-500" />
                                      {t('reports.ready')}
                                    </Badge>
                                  )}
                                </div>
                                <CardDescription className="text-xs sm:text-sm mt-0.5">
                                  {t('reports.yearlySummary')}
                                  {yearCount > 0 && (
                                    <span className="ml-1 text-muted-foreground/70">
                                      · {yearCount} {t('reports.expensesInPeriod')}
                                    </span>
                                  )}
                                </CardDescription>
                              </div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <DownloadButtons
                                  files={yFiles}
                                  disabled={isGenerating}
                                  tooltipGenerating={t('reports.tooltipGenerating')}
                                  tooltipClickRegenerate={t('reports.tooltipClickRegenerate')}
                                  onDownload={() => toast.success(t('reports.downloadStarted'), { description: t('reports.downloadStartedDesc') })}
                                />
                                <TooltipProvider delayDuration={200}>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        disabled={isGenerating}
                                        onClick={() => handleRegenerate({ type: 'yearly', year })}
                                      >
                                        {isYearGenerating
                                          ? <Loader2 className="h-4 w-4 animate-spin" />
                                          : <RefreshCcw className="h-4 w-4" />}
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>{t('reports.regenerate')}</TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              </div>
                            </div>
                          </CardHeader>

                          <CardContent className="pt-0">
                            <details className="group">
                              <summary className="cursor-pointer select-none rounded-md border bg-muted/10 px-3 py-2 text-sm font-medium hover:bg-muted/20 transition-colors">
                                {t('reports.showMonths')} ({months.length})
                              </summary>

                              <div className="mt-3 grid gap-2.5 grid-cols-1">
                                {months.map((m: number) => {
                                  const key = ymKey(year, m)
                                  const monthKey = `monthly-${key}`
                                  const files = reportUrls[monthKey] ?? {}
                                  const isMonthGenerating = regenerating === monthKey
                                  const hasMonthFiles = !!(files.pdf || files.csv || files.docx)
                                  const monthCount = expensesByPeriod[monthKey] || 0
                                  const label = new Date(year, m - 1, 1).toLocaleDateString(locale, {
                                    month: "long", year: "numeric",
                                  })
                                  return (
                                    <div key={key} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-0 rounded-md border bg-muted/5 p-3">
                                      <div className="min-w-0 flex items-center gap-2">
                                        <div>
                                          <div className="flex items-center gap-1.5">
                                            <span className="text-sm sm:text-base font-medium truncate">{label}</span>
                                            {hasMonthFiles && (
                                              <CheckCircle2 className="h-3.5 w-3.5 text-green-500 flex-shrink-0" />
                                            )}
                                          </div>
                                          <div className="text-xs text-muted-foreground">
                                            {currency}
                                            {monthCount > 0 && (
                                              <span className="ml-1">· {monthCount} {t('reports.expenses')}</span>
                                            )}
                                          </div>
                                        </div>
                                      </div>
                                      <div className="flex items-center gap-2 flex-shrink-0">
                                        <DownloadButtons
                                          files={files}
                                          compact
                                          disabled={isGenerating}
                                          tooltipGenerating={t('reports.tooltipGenerating')}
                                          tooltipClickRegenerate={t('reports.tooltipClickRegenerate')}
                                          onDownload={() => toast.success(t('reports.downloadStarted'), { description: t('reports.downloadStartedDesc') })}
                                        />
                                        <TooltipProvider delayDuration={200}>
                                          <Tooltip>
                                            <TooltipTrigger asChild>
                                              <Button
                                                variant="ghost"
                                                size="icon"
                                                disabled={isGenerating}
                                                onClick={() => handleRegenerate({ type: 'monthly', ym: key })}
                                              >
                                                {isMonthGenerating
                                                  ? <Loader2 className="h-4 w-4 animate-spin" />
                                                  : <RefreshCcw className="h-4 w-4" />}
                                              </Button>
                                            </TooltipTrigger>
                                            <TooltipContent>{t('reports.regenerate')}</TooltipContent>
                                          </Tooltip>
                                        </TooltipProvider>
                                      </div>
                                    </div>
                                  )
                                })}
                              </div>
                            </details>
                          </CardContent>
                        </Card>
                      </motion.div>
                    )
                  })}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* ── Divider ── */}
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t border-dashed" />
        </div>
        <div className="relative flex justify-center">
          <span className="bg-background px-3 text-xs text-muted-foreground uppercase tracking-widest">
            {t('common.or')}
          </span>
        </div>
      </div>

      {/* ── Section 2: Custom Report ── */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.15 }}
        className="flex flex-col gap-3"
      >
        {/* Section label */}
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
            <CalendarRange className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h3 className="text-base font-semibold leading-tight">{t('reports.customTitle')}</h3>
            <p className="text-xs text-muted-foreground">{t('reports.customDesc')}</p>
          </div>
        </div>

        <Card>
          <CardContent className="pt-6">
            <CustomReportForm currency={currency} />
          </CardContent>
        </Card>
      </motion.div>
    </div>
  )
}

function DownloadButtons({
  files,
  compact,
  disabled,
  tooltipGenerating,
  tooltipClickRegenerate,
  onDownload,
}: {
  files: FileTriplet
  compact?: boolean
  disabled?: boolean
  tooltipGenerating: string
  tooltipClickRegenerate: string
  onDownload?: () => void
}) {
  const IconBtn = ({
    url,
    label,
    Icon,
    colorClass,
  }: {
    url?: string
    label: string
    Icon: React.ComponentType<React.SVGProps<SVGSVGElement>>
    colorClass?: string
  }) => {
    const available = !!url && !disabled
    const btn = available ? (
      <Button
        asChild
        size={compact ? "icon" : "default"}
        variant="default"
        className={compact ? "" : "gap-2"}
        onClick={onDownload}
      >
        <a href={url} target="_blank" rel="noreferrer" aria-label={`Download ${label}`}>
          <Icon className="h-4 w-4" />
          {!compact && <span>{label}</span>}
        </a>
      </Button>
    ) : (
      <Button
        size={compact ? "icon" : "default"}
        variant="outline"
        disabled
        aria-label={`${label} not available`}
        className={compact ? "opacity-40" : "gap-2 opacity-40"}
      >
        <Icon className="h-4 w-4" />
        {!compact && <span>{label}</span>}
      </Button>
    )

    const tooltipText = disabled
      ? tooltipGenerating
      : url
        ? label
        : `${label} — ${tooltipClickRegenerate}`

    return (
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>{btn}</TooltipTrigger>
          <TooltipContent>
            <div className="flex items-center gap-1.5">
              {available && <Icon className="h-3 w-3" />}
              {tooltipText}
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }

  return (
    <div className="flex gap-1.5">
      <IconBtn url={files.pdf} label="PDF" Icon={FileDown} colorClass="text-red-500" />
      <IconBtn url={files.csv} label="CSV" Icon={FileText} colorClass="text-green-500" />
      <IconBtn url={files.docx} label="DOCX" Icon={File} colorClass="text-blue-500" />
    </div>
  )
}
