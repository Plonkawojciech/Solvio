'use client'

import { useEffect, useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import { useTranslation } from '@/lib/i18n'
import { useProductType } from '@/hooks/use-product-type'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  AlertCircle, RefreshCw, FileDown, ChevronLeft, ChevronRight,
  ArrowDownLeft, ArrowUpRight, Scale, BarChart3, Loader2,
} from 'lucide-react'
import { toast } from 'sonner'
import { VatSummaryCard } from '@/components/protected/business/vat-summary-card'
import { cn } from '@/lib/utils'
import dynamic from 'next/dynamic'

const VatChart = dynamic(() => import('./vat-chart').then(m => ({ default: m.VatChart })), { ssr: false })

// i18n keys:
// 'vat.title' / 'vat.description'
// 'vat.periodLabel' / 'vat.exportJpk' / 'vat.exporting'
// 'vat.inputTable' / 'vat.outputTable'
// 'vat.table.document' / 'vat.table.counterparty' / 'vat.table.nip' / 'vat.table.net' / 'vat.table.vatRate' / 'vat.table.vatAmount' / 'vat.table.date'
// 'vat.splitPaymentBadge'
// 'vat.chartTitle' / 'vat.chartDesc'
// 'vat.empty.title' / 'vat.empty.desc'
// 'vat.error.title' / 'vat.error.desc' / 'vat.error.retry'
// 'vat.jpkSuccess' / 'vat.jpkError'

interface VatEntry {
  id: string
  type: string
  period: string
  netAmount: string
  vatAmount: string
  vatRate: string
  counterpartyName: string | null
  counterpartyNip: string | null
  documentNumber: string | null
  documentDate: string | null
  deductible: boolean | null
}

interface MonthlyData {
  period: string
  label: string
  input: number
  output: number
  balance: number
}

// ---- Skeleton ----
function VatSkeleton() {
  return (
    <div className="flex flex-col gap-4 sm:gap-6 animate-pulse">
      <div className="space-y-2">
        <div className="h-8 w-40 rounded bg-muted" />
        <div className="h-4 w-64 rounded bg-muted" />
      </div>
      <div className="grid gap-3 grid-cols-1 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-xl border bg-card p-4 space-y-3">
            <div className="h-3 w-24 rounded bg-muted" />
            <div className="h-8 w-32 rounded bg-muted" />
            <div className="h-3 w-40 rounded bg-muted" />
          </div>
        ))}
      </div>
      <div className="rounded-xl border bg-card p-6 space-y-3">
        <div className="h-5 w-36 rounded bg-muted" />
        <div className="h-64 rounded-lg bg-muted" />
      </div>
      <div className="rounded-xl border bg-card p-4 space-y-3">
        <div className="h-5 w-32 rounded bg-muted" />
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-10 rounded bg-muted" />
        ))}
      </div>
    </div>
  )
}

// ---- Error ----
function VatError({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation()
  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.35 }}
        className="flex flex-col items-center gap-4 text-center max-w-sm"
      >
        <div className="h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center">
          <AlertCircle className="h-8 w-8 text-destructive" />
        </div>
        <div className="space-y-1">
          <h3 className="text-lg font-semibold" suppressHydrationWarning>{t('vat.error.title')}</h3>
          <p className="text-sm text-muted-foreground" suppressHydrationWarning>{t('vat.error.desc')}</p>
        </div>
        <Button onClick={onRetry} variant="outline" className="gap-2" suppressHydrationWarning>
          <RefreshCw className="h-4 w-4" />
          {t('vat.error.retry')}
        </Button>
      </motion.div>
    </div>
  )
}

// ---- Empty ----
function VatEmpty() {
  const { t } = useTranslation()
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="flex items-center justify-center min-h-[300px]"
    >
      <div className="flex flex-col items-center gap-4 text-center max-w-sm">
        <div className="h-20 w-20 rounded-2xl bg-primary/10 flex items-center justify-center">
          <Scale className="h-10 w-10 text-primary" />
        </div>
        <div className="space-y-1">
          <h3 className="text-lg font-semibold" suppressHydrationWarning>{t('vat.empty.title')}</h3>
          <p className="text-sm text-muted-foreground" suppressHydrationWarning>{t('vat.empty.desc')}</p>
        </div>
      </div>
    </motion.div>
  )
}

// ---- Main Page ----
export default function VatPage() {
  const { t, lang, mounted } = useTranslation()
  const { isBusiness } = useProductType()
  const router = useRouter()

  const now = new Date()
  const [period, setPeriod] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [inputEntries, setInputEntries] = useState<VatEntry[]>([])
  const [outputEntries, setOutputEntries] = useState<VatEntry[]>([])
  const [summary, setSummary] = useState({ vatInput: 0, vatOutput: 0, balance: 0 })
  const [monthlyData, setMonthlyData] = useState<MonthlyData[]>([])
  const [exporting, setExporting] = useState(false)

  const currency = 'PLN'
  const locale = lang === 'pl' ? 'pl-PL' : 'en-US'

  useEffect(() => {
    if (mounted && !isBusiness) {
      router.replace('/dashboard')
    }
  }, [mounted, isBusiness, router])

  const fetchData = useCallback(async (signal?: AbortSignal) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/business/vat?period=${period}`, { signal })
      if (!res.ok) throw new Error(`Error ${res.status}`)
      const data = await res.json()

      setInputEntries(data.entries?.input || [])
      setOutputEntries(data.entries?.output || [])
      setSummary(data.summary || { vatInput: 0, vatOutput: 0, balance: 0 })
      setMonthlyData(data.monthly || [])
    } catch (err: any) {
      if (err.name === 'AbortError') return
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [period])

  useEffect(() => {
    if (!isBusiness) return
    const controller = new AbortController()
    fetchData(controller.signal)
    return () => controller.abort()
  }, [fetchData, isBusiness])

  const handleExportJpk = async () => {
    setExporting(true)
    try {
      const res = await fetch('/api/business/jpk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ period }),
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || 'Export failed')
      }

      // Download the XML file
      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `JPK_V7M_${period}.xml`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)

      toast.success(t('vat.jpkSuccess'))
    } catch (err: any) {
      toast.error(err.message || t('vat.jpkError'))
    } finally {
      setExporting(false)
    }
  }

  const navigatePeriod = (direction: -1 | 1) => {
    const [y, m] = period.split('-').map(Number)
    const d = new Date(y, m - 1 + direction, 1)
    setPeriod(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }

  const formatAmount = (amount: string | null | number) => {
    const val = typeof amount === 'number' ? amount : parseFloat(amount || '0')
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
    }).format(val)
  }

  const periodLabel = (() => {
    const [y, m] = period.split('-').map(Number)
    const d = new Date(y, m - 1, 1)
    return d.toLocaleDateString(locale, { month: 'long', year: 'numeric' })
  })()

  if (!isBusiness) return null
  if (loading) return <VatSkeleton />
  if (error) return <VatError onRetry={() => fetchData()} />

  const fadeUp = {
    hidden: { opacity: 0, y: 24 },
    show: (i: number) => ({
      opacity: 1, y: 0,
      transition: { duration: 0.5, delay: i * 0.08, ease: [0.22, 1, 0.36, 1] as const },
    }),
  }

  const hasData = inputEntries.length > 0 || outputEntries.length > 0

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.35 }} className="flex flex-col gap-4 sm:gap-6">
      {/* Header */}
      <motion.div custom={0} initial="hidden" animate="show" variants={fadeUp}>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight" suppressHydrationWarning>{t('vat.title')}</h1>
            <p className="text-sm text-muted-foreground mt-1" suppressHydrationWarning>{t('vat.description')}</p>
          </div>
          <Button
            variant="outline"
            className="gap-2"
            onClick={handleExportJpk}
            disabled={exporting || !hasData}
            suppressHydrationWarning
          >
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
            {exporting ? t('vat.exporting') : t('vat.exportJpk')}
          </Button>
        </div>
      </motion.div>

      {/* Period Selector */}
      <motion.div custom={1} initial="hidden" animate="show" variants={fadeUp}>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => navigatePeriod(-1)} className="h-9 w-9">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="px-4 py-2 rounded-lg border bg-card font-medium text-sm min-w-[180px] text-center capitalize">
            {periodLabel}
          </div>
          <Button variant="outline" size="icon" onClick={() => navigatePeriod(1)} className="h-9 w-9">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </motion.div>

      {/* VAT Summary */}
      <VatSummaryCard
        vatInput={summary.vatInput}
        vatOutput={summary.vatOutput}
        currency={currency}
        locale={locale}
        index={2}
      />

      {/* VAT Chart */}
      {monthlyData.length > 0 && (
        <motion.div custom={5} initial="hidden" animate="show" variants={fadeUp}>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2" suppressHydrationWarning>
                <BarChart3 className="h-5 w-5" />
                {t('vat.chartTitle')}
              </CardTitle>
              <CardDescription suppressHydrationWarning>{t('vat.chartDesc')}</CardDescription>
            </CardHeader>
            <CardContent>
              <VatChart data={monthlyData} currency={currency} />
            </CardContent>
          </Card>
        </motion.div>
      )}

      {!hasData ? (
        <VatEmpty />
      ) : (
        <>
          {/* VAT Input (Purchases) Table */}
          {inputEntries.length > 0 && (
            <motion.div custom={6} initial="hidden" animate="show" variants={fadeUp}>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2" suppressHydrationWarning>
                    <ArrowDownLeft className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                    {t('vat.inputTable')}
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead suppressHydrationWarning>{t('vat.table.document')}</TableHead>
                        <TableHead suppressHydrationWarning>{t('vat.table.counterparty')}</TableHead>
                        <TableHead suppressHydrationWarning>{t('vat.table.nip')}</TableHead>
                        <TableHead className="text-right" suppressHydrationWarning>{t('vat.table.net')}</TableHead>
                        <TableHead className="text-right" suppressHydrationWarning>{t('vat.table.vatRate')}</TableHead>
                        <TableHead className="text-right" suppressHydrationWarning>{t('vat.table.vatAmount')}</TableHead>
                        <TableHead suppressHydrationWarning>{t('vat.table.date')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {inputEntries.map((entry) => (
                        <TableRow key={entry.id}>
                          <TableCell className="font-medium text-sm">{entry.documentNumber || '—'}</TableCell>
                          <TableCell className="text-sm">{entry.counterpartyName || '—'}</TableCell>
                          <TableCell className="text-sm font-mono">{entry.counterpartyNip || '—'}</TableCell>
                          <TableCell className="text-right text-sm tabular-nums">{formatAmount(entry.netAmount)}</TableCell>
                          <TableCell className="text-right text-sm">{entry.vatRate}</TableCell>
                          <TableCell className="text-right text-sm tabular-nums font-medium">{formatAmount(entry.vatAmount)}</TableCell>
                          <TableCell className="text-sm tabular-nums">{entry.documentDate || '—'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* VAT Output (Sales) Table */}
          {outputEntries.length > 0 && (
            <motion.div custom={7} initial="hidden" animate="show" variants={fadeUp}>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2" suppressHydrationWarning>
                    <ArrowUpRight className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                    {t('vat.outputTable')}
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead suppressHydrationWarning>{t('vat.table.document')}</TableHead>
                        <TableHead suppressHydrationWarning>{t('vat.table.counterparty')}</TableHead>
                        <TableHead suppressHydrationWarning>{t('vat.table.nip')}</TableHead>
                        <TableHead className="text-right" suppressHydrationWarning>{t('vat.table.net')}</TableHead>
                        <TableHead className="text-right" suppressHydrationWarning>{t('vat.table.vatRate')}</TableHead>
                        <TableHead className="text-right" suppressHydrationWarning>{t('vat.table.vatAmount')}</TableHead>
                        <TableHead suppressHydrationWarning>{t('vat.table.date')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {outputEntries.map((entry) => (
                        <TableRow key={entry.id}>
                          <TableCell className="font-medium text-sm">{entry.documentNumber || '—'}</TableCell>
                          <TableCell className="text-sm">{entry.counterpartyName || '—'}</TableCell>
                          <TableCell className="text-sm font-mono">{entry.counterpartyNip || '—'}</TableCell>
                          <TableCell className="text-right text-sm tabular-nums">{formatAmount(entry.netAmount)}</TableCell>
                          <TableCell className="text-right text-sm">{entry.vatRate}</TableCell>
                          <TableCell className="text-right text-sm tabular-nums font-medium">{formatAmount(entry.vatAmount)}</TableCell>
                          <TableCell className="text-sm tabular-nums">{entry.documentDate || '—'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </>
      )}
    </motion.div>
  )
}
