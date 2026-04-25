'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { motion } from 'framer-motion'
import { useTranslation } from '@/lib/i18n'
import { useProductType } from '@/hooks/use-product-type'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter,
} from '@/components/ui/sheet'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  FileText, Search, Upload, AlertCircle, RefreshCw, FileUp, Calendar,
  CreditCard, Clock, AlertTriangle, Loader2, Receipt,
} from 'lucide-react'
import { toast } from 'sonner'
import { InvoiceCard, type Invoice } from '@/components/protected/business/invoice-card'
import { cn } from '@/lib/utils'
import dynamic from 'next/dynamic'
import Image from 'next/image'

const LazyVatPage = dynamic(() => import('../vat/page'), { ssr: false })

// i18n keys:
// 'invoices.title' / 'invoices.description'
// 'invoices.kpi.total' / 'invoices.kpi.unpaid' / 'invoices.kpi.overdue' / 'invoices.kpi.thisMonth'
// 'invoices.filter.all' / 'invoices.filter.pending' / 'invoices.filter.approved' / 'invoices.filter.rejected' / 'invoices.filter.paid'
// 'invoices.filter.search' / 'invoices.filter.dateFrom' / 'invoices.filter.dateTo'
// 'invoices.upload' / 'invoices.uploadTitle' / 'invoices.uploadDesc'
// 'invoices.empty.title' / 'invoices.empty.desc' / 'invoices.empty.cta'
// 'invoices.error.title' / 'invoices.error.desc' / 'invoices.error.retry'
// 'invoices.detail.title' / 'invoices.detail.items' / 'invoices.detail.ocrData'
// 'invoices.detail.approve' / 'invoices.detail.reject' / 'invoices.detail.markPaid'
// 'invoices.uploading' / 'invoices.uploadSuccess' / 'invoices.uploadError'
// 'invoices.table.invoiceNo' / 'invoices.table.vendor' / 'invoices.table.issueDate' / 'invoices.table.dueDate'
// 'invoices.table.net' / 'invoices.table.vat' / 'invoices.table.gross' / 'invoices.table.status'

interface KPI {
  totalInvoices: number
  unpaidAmount: number
  overdueCount: number
  thisMonthTotal: number
}

// ---- Loading Skeleton ----
function InvoicesSkeleton() {
  return (
    <div className="flex flex-col gap-4 sm:gap-6 animate-pulse">
      <div className="space-y-2">
        <div className="h-8 w-48 rounded bg-muted" />
        <div className="h-4 w-72 rounded bg-muted" />
      </div>
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border bg-card p-4 space-y-3">
            <div className="h-3 w-20 rounded bg-muted" />
            <div className="h-7 w-24 rounded bg-muted" />
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <div className="h-9 w-32 rounded bg-muted" />
        <div className="h-9 flex-1 rounded bg-muted" />
        <div className="h-9 w-36 rounded bg-muted" />
      </div>
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="rounded-xl border bg-card p-4 space-y-2">
            <div className="flex justify-between">
              <div className="space-y-1.5">
                <div className="h-4 w-36 rounded bg-muted" />
                <div className="h-3 w-48 rounded bg-muted" />
              </div>
              <div className="h-5 w-24 rounded bg-muted" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ---- Error State ----
function InvoicesError({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation()
  return (
    <div className="flex items-center justify-center min-h-[400px]" role="alert">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.35 }}
        className="flex flex-col items-center gap-4 text-center max-w-sm"
      >
        <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-destructive" suppressHydrationWarning>
          {'// '}{t('invoices.error.title')}
        </p>
        <div className="h-16 w-16 border-2 border-destructive bg-destructive/10 shadow-[3px_3px_0_hsl(var(--destructive))] rounded-md flex items-center justify-center">
          <AlertCircle className="h-8 w-8 text-destructive" />
        </div>
        <div className="space-y-1">
          <h3 className="text-lg font-semibold" suppressHydrationWarning>{t('invoices.error.title')}</h3>
          <p className="text-sm text-muted-foreground" suppressHydrationWarning>{t('invoices.error.desc')}</p>
        </div>
        <Button onClick={onRetry} variant="outline" className="gap-2" suppressHydrationWarning>
          <RefreshCw className="h-4 w-4" />
          {t('invoices.error.retry')}
        </Button>
      </motion.div>
    </div>
  )
}

// ---- Empty State ----
function InvoicesEmpty({ onUpload }: { onUpload: () => void }) {
  const { t } = useTranslation()
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="flex items-center justify-center min-h-[400px]"
    >
      <div className="flex flex-col items-center gap-4 text-center max-w-sm">
        <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground" suppressHydrationWarning>
          {'// '}{t('invoices.empty.title')}
        </p>
        <div className="h-20 w-20 border-2 border-foreground bg-secondary shadow-[3px_3px_0_hsl(var(--foreground))] rounded-md flex items-center justify-center">
          <FileText className="h-10 w-10 text-foreground" />
        </div>
        <div className="space-y-1">
          <h3 className="text-lg font-semibold" suppressHydrationWarning>{t('invoices.empty.title')}</h3>
          <p className="text-sm text-muted-foreground" suppressHydrationWarning>{t('invoices.empty.desc')}</p>
        </div>
        <Button onClick={onUpload} className="gap-2" suppressHydrationWarning>
          <Upload className="h-4 w-4" />
          {t('invoices.empty.cta')}
        </Button>
      </div>
    </motion.div>
  )
}

// ---- Invoice Detail Sheet ----
function InvoiceDetailSheet({
  invoice,
  open,
  onClose,
  currency,
  locale,
  onAction,
}: {
  invoice: Invoice | null
  open: boolean
  onClose: () => void
  currency: string
  locale: string
  onAction: () => void
}) {
  const { t } = useTranslation()
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  if (!invoice) return null

  const formatAmount = (amount: string | null) => {
    if (!amount) return '—'
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
    }).format(parseFloat(amount))
  }

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '—'
    return new Date(dateStr).toLocaleDateString(locale, {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
  }

  const handleAction = async (action: 'approve' | 'reject' | 'paid') => {
    setActionLoading(action)
    try {
      // For paid status, we update the invoice directly
      // For approve/reject, same approach (simplified - in production you'd have separate endpoints)
      const res = await fetch(`/api/business/invoices`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...invoice,
          status: action === 'paid' ? 'paid' : action === 'approve' ? 'approved' : 'rejected',
        }),
      })
      if (res.ok) {
        toast.success(t(`invoices.detail.${action}Success`))
        onAction()
        onClose()
      }
    } catch {
      toast.error(t('invoices.error.title'))
    } finally {
      setActionLoading(null)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2" suppressHydrationWarning>
            <FileText className="h-5 w-5" />
            {invoice.invoiceNumber || t('invoice.noInvoiceNumber')}
          </SheetTitle>
          <SheetDescription suppressHydrationWarning>
            {t('invoices.detail.title')}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-6 py-4 px-4">
          {/* Invoice image */}
          {invoice.imageUrl && (
            <div className="rounded-lg border overflow-hidden">
              <Image
                src={invoice.imageUrl}
                alt="Invoice"
                className="w-full h-auto max-h-64 object-contain bg-muted"
                width={800}
                height={256}
                style={{ width: '100%', height: 'auto', maxHeight: '16rem' }}
              />
            </div>
          )}

          {/* Amounts */}
          <div className="grid grid-cols-3 gap-3">
            <div className="text-center p-3 rounded-lg bg-muted/50">
              <p className="text-xs text-muted-foreground" suppressHydrationWarning>{t('invoice.net')}</p>
              <p className="text-lg font-bold tabular-nums">{formatAmount(invoice.netAmount)}</p>
            </div>
            <div className="text-center p-3 rounded-lg bg-muted/50">
              <p className="text-xs text-muted-foreground" suppressHydrationWarning>{t('invoice.vat')}</p>
              <p className="text-lg font-bold tabular-nums">{formatAmount(invoice.vatAmount)}</p>
            </div>
            <div className="text-center p-3 rounded-lg bg-primary/10">
              <p className="text-xs text-muted-foreground" suppressHydrationWarning>{t('invoice.gross')}</p>
              <p className="text-lg font-bold tabular-nums text-primary">{formatAmount(invoice.grossAmount)}</p>
            </div>
          </div>

          {/* Details */}
          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground" suppressHydrationWarning>{t('invoices.table.vendor')}</span>
              <span className="font-medium">{invoice.vendorName || '—'}</span>
            </div>
            {invoice.vendorNip && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">NIP</span>
                <span className="font-mono text-xs">{invoice.vendorNip}</span>
              </div>
            )}
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground" suppressHydrationWarning>{t('invoices.table.issueDate')}</span>
              <span>{formatDate(invoice.issueDate)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground" suppressHydrationWarning>{t('invoices.table.dueDate')}</span>
              <span>{formatDate(invoice.dueDate)}</span>
            </div>
            {invoice.vatRate && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">VAT</span>
                <span>{invoice.vatRate}</span>
              </div>
            )}
            {invoice.splitPayment && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground" suppressHydrationWarning>{t('invoice.splitPayment')}</span>
                <Badge className="bg-violet-100 dark:bg-violet-950/60 text-violet-700 dark:text-violet-400 border-violet-200 dark:border-violet-900 text-[10px]">MPP</Badge>
              </div>
            )}
          </div>

          {/* Items */}
          {invoice.items && invoice.items.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold mb-2" suppressHydrationWarning>{t('invoices.detail.items')}</h4>
              <div className="rounded-lg border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Nazwa</TableHead>
                      <TableHead className="text-xs text-right">Ilość</TableHead>
                      <TableHead className="text-xs text-right">Netto</TableHead>
                      <TableHead className="text-xs text-right">VAT</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invoice.items.map((item, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="text-xs">{item.name}</TableCell>
                        <TableCell className="text-xs text-right tabular-nums">
                          {item.quantity} {item.unit}
                        </TableCell>
                        <TableCell className="text-xs text-right tabular-nums">
                          {formatAmount(String(item.netAmount))}
                        </TableCell>
                        <TableCell className="text-xs text-right tabular-nums">
                          {formatAmount(String(item.vatAmount))}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          {/* Notes */}
          {invoice.notes && (
            <div>
              <h4 className="text-sm font-semibold mb-1">Notatki</h4>
              <p className="text-sm text-muted-foreground">{invoice.notes}</p>
            </div>
          )}
        </div>

        {/* Actions */}
        {invoice.status === 'pending' && (
          <SheetFooter className="flex-row gap-2 border-t pt-4">
            <Button
              onClick={() => handleAction('approve')}
              disabled={actionLoading !== null}
              className="flex-1 gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
              suppressHydrationWarning
            >
              {actionLoading === 'approve' && <Loader2 className="h-4 w-4 animate-spin" />}
              {t('invoices.detail.approve')}
            </Button>
            <Button
              variant="outline"
              onClick={() => handleAction('reject')}
              disabled={actionLoading !== null}
              className="flex-1 gap-1.5 text-destructive"
              suppressHydrationWarning
            >
              {actionLoading === 'reject' && <Loader2 className="h-4 w-4 animate-spin" />}
              {t('invoices.detail.reject')}
            </Button>
          </SheetFooter>
        )}
        {invoice.status === 'approved' && (
          <SheetFooter className="border-t pt-4">
            <Button
              onClick={() => handleAction('paid')}
              disabled={actionLoading !== null}
              className="w-full gap-1.5"
              suppressHydrationWarning
            >
              {actionLoading === 'paid' && <Loader2 className="h-4 w-4 animate-spin" />}
              <CreditCard className="h-4 w-4" />
              {t('invoices.detail.markPaid')}
            </Button>
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  )
}

// ---- Main Page ----
export default function InvoicesPage() {
  const { t, lang, mounted } = useTranslation()
  const { isBusiness } = useProductType()
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [invoicesList, setInvoicesList] = useState<Invoice[]>([])
  const [kpi, setKpi] = useState<KPI>({ totalInvoices: 0, unpaidAmount: 0, overdueCount: 0, thisMonthTotal: 0 })

  // Filters
  const [statusFilter, setStatusFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  // Detail
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)

  // Upload
  const [uploadOpen, setUploadOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Main tabs: Invoices | VAT
  const [activeMainTab, setActiveMainTab] = useState<'invoices' | 'vat'>('invoices')

  const currency = 'PLN'
  const locale = lang === 'pl' ? 'pl-PL' : 'en-US'

  // Redirect non-business users
  useEffect(() => {
    if (mounted && !isBusiness) {
      router.replace('/dashboard')
    }
  }, [mounted, isBusiness, router])

  const fetchData = useCallback(async (signal?: AbortSignal) => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (statusFilter !== 'all') params.set('status', statusFilter)
      if (search) params.set('search', search)
      if (dateFrom) params.set('dateFrom', dateFrom)
      if (dateTo) params.set('dateTo', dateTo)

      const res = await fetch(`/api/business/invoices?${params}`, { signal })
      if (!res.ok) throw new Error(`Error ${res.status}`)
      const data = await res.json()

      setInvoicesList(data.invoices || [])
      setKpi(data.kpi || { totalInvoices: 0, unpaidAmount: 0, overdueCount: 0, thisMonthTotal: 0 })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      if (err.name === 'AbortError') return
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [statusFilter, search, dateFrom, dateTo])

  useEffect(() => {
    if (!isBusiness) return
    const controller = new AbortController()
    fetchData(controller.signal)
    return () => controller.abort()
  }, [fetchData, isBusiness])

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setUploading(true)

    try {
      for (const file of Array.from(files)) {
        const formData = new FormData()
        formData.append('file', file)

        const res = await fetch('/api/v1/ocr-invoice', {
          method: 'POST',
          body: formData,
        })

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}))
          throw new Error(errData.error || `Upload failed: ${res.status}`)
        }

        toast.success(t('invoices.uploadSuccess'))
      }

      fetchData()
      setUploadOpen(false)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      toast.error(err.message || t('invoices.uploadError'))
    } finally {
      setUploading(false)
    }
  }

  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
    }).format(amount)
  }

  if (!isBusiness) return null

  // VAT tab — render standalone
  if (activeMainTab === 'vat') {
    return (
      <div className="flex flex-col gap-4 sm:gap-6">
        {/* Tab bar */}
        <div className="flex gap-1 p-1 bg-muted/50 rounded-lg w-fit">
          <button
            onClick={() => setActiveMainTab('invoices')}
            className="flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-all text-muted-foreground hover:text-foreground"
            suppressHydrationWarning
          >
            <FileText className="h-4 w-4" />
            {t('invoices.tab.invoices')}
          </button>
          <button
            onClick={() => setActiveMainTab('vat')}
            className="flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-all bg-background shadow-sm text-foreground"
            suppressHydrationWarning
          >
            <Receipt className="h-4 w-4" />
            {t('invoices.tab.vat')}
          </button>
        </div>
        <LazyVatPage />
      </div>
    )
  }

  if (loading) return <InvoicesSkeleton />
  if (error) return <InvoicesError onRetry={() => fetchData()} />

  const fadeUp = {
    hidden: { opacity: 0, y: 24 },
    show: (i: number) => ({
      opacity: 1, y: 0,
      transition: { duration: 0.5, delay: i * 0.08, ease: [0.22, 1, 0.36, 1] as const },
    }),
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.35 }} className="flex flex-col gap-4 sm:gap-6">
      {/* Tab bar */}
      <motion.div custom={0} initial="hidden" animate="show" variants={fadeUp}>
        <div className="flex gap-1 p-1 bg-muted/50 rounded-lg w-fit">
          <button
            onClick={() => setActiveMainTab('invoices')}
            className="flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-all bg-background shadow-sm text-foreground"
            suppressHydrationWarning
          >
            <FileText className="h-4 w-4" />
            {t('invoices.tab.invoices')}
          </button>
          <button
            onClick={() => setActiveMainTab('vat')}
            className="flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-all text-muted-foreground hover:text-foreground"
            suppressHydrationWarning
          >
            <Receipt className="h-4 w-4" />
            {t('invoices.tab.vat')}
          </button>
        </div>
      </motion.div>

      {/* Header */}
      <motion.div custom={1} initial="hidden" animate="show" variants={fadeUp}>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight" suppressHydrationWarning>{t('invoices.title')}</h1>
            <p className="text-sm text-muted-foreground mt-1" suppressHydrationWarning>{t('invoices.description')}</p>
          </div>
          <Button className="gap-2" onClick={() => setUploadOpen(true)} suppressHydrationWarning>
            <Upload className="h-4 w-4" />
            {t('invoices.upload')}
          </Button>
        </div>
      </motion.div>

      {/* KPI Cards */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        {[
          { label: t('invoices.kpi.total'), value: kpi.totalInvoices, icon: FileText, color: 'text-primary' },
          { label: t('invoices.kpi.unpaid'), value: formatAmount(kpi.unpaidAmount), icon: Clock, color: 'text-yellow-600 dark:text-yellow-400' },
          { label: t('invoices.kpi.overdue'), value: kpi.overdueCount, icon: AlertTriangle, color: 'text-red-600 dark:text-red-400' },
          { label: t('invoices.kpi.thisMonth'), value: formatAmount(kpi.thisMonthTotal), icon: Calendar, color: 'text-blue-600 dark:text-blue-400' },
        ].map((card, i) => {
          const Icon = card.icon
          return (
            <motion.div key={i} custom={i + 1} initial="hidden" animate="show" variants={fadeUp}>
              <Card className="h-full hover:shadow-md transition-shadow duration-200">
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5" suppressHydrationWarning>
                    <Icon className={cn('h-3.5 w-3.5', card.color)} />
                    {card.label}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-xl sm:text-2xl font-bold tabular-nums">{card.value}</div>
                </CardContent>
              </Card>
            </motion.div>
          )
        })}
      </div>

      {/* Filter Bar */}
      <motion.div custom={5} initial="hidden" animate="show" variants={fadeUp} className="flex flex-wrap gap-2">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" suppressHydrationWarning>{t('invoices.filter.all')}</SelectItem>
            <SelectItem value="pending" suppressHydrationWarning>{t('invoices.filter.pending')}</SelectItem>
            <SelectItem value="approved" suppressHydrationWarning>{t('invoices.filter.approved')}</SelectItem>
            <SelectItem value="rejected" suppressHydrationWarning>{t('invoices.filter.rejected')}</SelectItem>
            <SelectItem value="paid" suppressHydrationWarning>{t('invoices.filter.paid')}</SelectItem>
          </SelectContent>
        </Select>

        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t('invoices.filter.search')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <Input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          placeholder={t('invoices.filter.dateFrom')}
          className="w-[150px]"
        />
        <Input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          placeholder={t('invoices.filter.dateTo')}
          className="w-[150px]"
        />
      </motion.div>

      {/* Invoice List */}
      {invoicesList.length === 0 ? (
        <InvoicesEmpty onUpload={() => setUploadOpen(true)} />
      ) : (
        <motion.div custom={6} initial="hidden" animate="show" variants={fadeUp}>
          {/* Desktop table view */}
          <div className="hidden lg:block">
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead suppressHydrationWarning>{t('invoices.table.invoiceNo')}</TableHead>
                      <TableHead suppressHydrationWarning>{t('invoices.table.vendor')}</TableHead>
                      <TableHead suppressHydrationWarning>{t('invoices.table.issueDate')}</TableHead>
                      <TableHead suppressHydrationWarning>{t('invoices.table.dueDate')}</TableHead>
                      <TableHead className="text-right" suppressHydrationWarning>{t('invoices.table.net')}</TableHead>
                      <TableHead className="text-right" suppressHydrationWarning>{t('invoices.table.vat')}</TableHead>
                      <TableHead className="text-right" suppressHydrationWarning>{t('invoices.table.gross')}</TableHead>
                      <TableHead suppressHydrationWarning>{t('invoices.table.status')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invoicesList.map((inv) => {
                      const isOverdue = (inv.status === 'pending' || inv.status === 'approved') && inv.dueDate && new Date(inv.dueDate) < new Date()
                      return (
                        <TableRow
                          key={inv.id}
                          className="cursor-pointer"
                          onClick={() => { setSelectedInvoice(inv); setDetailOpen(true) }}
                        >
                          <TableCell className="font-medium text-sm">{inv.invoiceNumber || '—'}</TableCell>
                          <TableCell className="text-sm">{inv.vendorName || '—'}</TableCell>
                          <TableCell className="text-sm tabular-nums">{inv.issueDate || '—'}</TableCell>
                          <TableCell className={cn('text-sm tabular-nums', isOverdue && 'text-red-600 dark:text-red-400 font-medium')}>
                            {inv.dueDate || '—'}
                          </TableCell>
                          <TableCell className="text-right text-sm tabular-nums">
                            {inv.netAmount ? formatAmount(parseFloat(inv.netAmount)) : '—'}
                          </TableCell>
                          <TableCell className="text-right text-sm tabular-nums">
                            {inv.vatAmount ? formatAmount(parseFloat(inv.vatAmount)) : '—'}
                          </TableCell>
                          <TableCell className="text-right text-sm font-semibold tabular-nums">
                            {inv.grossAmount ? formatAmount(parseFloat(inv.grossAmount)) : '—'}
                          </TableCell>
                          <TableCell>
                            <InvoiceStatusBadge status={inv.status || 'pending'} isOverdue={!!isOverdue} />
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>

          {/* Mobile card view */}
          <div className="lg:hidden space-y-3">
            {invoicesList.map((inv, idx) => (
              <InvoiceCard
                key={inv.id}
                invoice={inv}
                currency={currency}
                locale={locale}
                onClick={() => { setSelectedInvoice(inv); setDetailOpen(true) }}
                index={idx}
              />
            ))}
          </div>
        </motion.div>
      )}

      {/* Invoice Detail Sheet */}
      <InvoiceDetailSheet
        invoice={selectedInvoice}
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        currency={currency}
        locale={locale}
        onAction={() => fetchData()}
      />

      {/* Upload Sheet */}
      <Sheet open={uploadOpen} onOpenChange={setUploadOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2" suppressHydrationWarning>
              <FileUp className="h-5 w-5" />
              {t('invoices.uploadTitle')}
            </SheetTitle>
            <SheetDescription suppressHydrationWarning>
              {t('invoices.uploadDesc')}
            </SheetDescription>
          </SheetHeader>

          <div className="py-6 px-4">
            <div
              className={cn(
                'border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors',
                uploading ? 'border-primary/50 bg-primary/5' : 'border-muted-foreground/20 hover:border-primary/50 hover:bg-muted/50'
              )}
              onClick={() => !uploading && fileInputRef.current?.click()}
            >
              {uploading ? (
                <div className="flex flex-col items-center gap-3">
                  <Loader2 className="h-10 w-10 text-primary animate-spin" />
                  <p className="text-sm font-medium" suppressHydrationWarning>{t('invoices.uploading')}</p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3">
                  <div className="h-14 w-14 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Upload className="h-7 w-7 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium" suppressHydrationWarning>{t('invoices.uploadTitle')}</p>
                    <p className="text-xs text-muted-foreground mt-1">PDF, JPG, PNG (max 10MB)</p>
                  </div>
                </div>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,application/pdf"
              multiple
              className="hidden"
              onChange={(e) => handleUpload(e.target.files)}
            />
          </div>
        </SheetContent>
      </Sheet>
    </motion.div>
  )
}

// ---- Status Badge Helper ----
function InvoiceStatusBadge({ status, isOverdue }: { status: string; isOverdue: boolean }) {
  const { t } = useTranslation()
  const configs: Record<string, string> = {
    pending: 'bg-yellow-100 dark:bg-yellow-950/60 text-yellow-700 dark:text-yellow-400 border-yellow-200 dark:border-yellow-900',
    approved: 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900',
    rejected: 'bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-400 border-red-200 dark:border-red-900',
    paid: 'bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-900',
  }
  return (
    <div className="flex items-center gap-1">
      <Badge className={cn('text-[10px] px-1.5 py-0', configs[status] || configs.pending)} suppressHydrationWarning>
        {t(`invoice.status.${status}`)}
      </Badge>
      {isOverdue && (
        <Badge className="text-[10px] px-1.5 py-0 bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-400 border-red-200 dark:border-red-900" suppressHydrationWarning>
          {t('invoice.overdue')}
        </Badge>
      )}
    </div>
  )
}
