'use client'

import { motion } from 'framer-motion'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { FileText, Calendar, Building2, CreditCard } from 'lucide-react'
import { useTranslation } from '@/lib/i18n'
import { cn } from '@/lib/utils'

export interface Invoice {
  id: string
  invoiceNumber: string | null
  vendorName: string | null
  vendorNip: string | null
  buyerName: string | null
  buyerNip: string | null
  issueDate: string | null
  dueDate: string | null
  paymentDate: string | null
  netAmount: string | null
  vatAmount: string | null
  grossAmount: string | null
  vatRate: string | null
  currency: string | null
  status: string | null
  splitPayment: boolean | null
  deductibility: string | null
  imageUrl: string | null
  items: Array<{
    name: string
    quantity: number
    unit: string
    unitPrice: number
    netAmount: number
    vatRate: string
    vatAmount: number
    grossAmount: number
  }> | null
  notes: string | null
  createdAt: string
}

interface InvoiceCardProps {
  invoice: Invoice
  currency: string
  locale: string
  onClick?: () => void
  index?: number
}

// i18n keys:
// 'invoice.status.pending' / 'invoice.status.approved' / 'invoice.status.rejected' / 'invoice.status.paid'
// 'invoice.net' / 'invoice.vat' / 'invoice.gross'
// 'invoice.due' / 'invoice.splitPayment' / 'invoice.noInvoiceNumber'

const statusConfig: Record<string, { color: string; bgColor: string }> = {
  pending: { color: 'text-yellow-700 dark:text-yellow-400', bgColor: 'bg-yellow-100 dark:bg-yellow-950/60 border-yellow-200 dark:border-yellow-900' },
  approved: { color: 'text-emerald-700 dark:text-emerald-400', bgColor: 'bg-emerald-100 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-900' },
  rejected: { color: 'text-red-700 dark:text-red-400', bgColor: 'bg-red-100 dark:bg-red-950/60 border-red-200 dark:border-red-900' },
  paid: { color: 'text-blue-700 dark:text-blue-400', bgColor: 'bg-blue-100 dark:bg-blue-950/60 border-blue-200 dark:border-blue-900' },
}

export function InvoiceCard({ invoice, currency, locale, onClick, index = 0 }: InvoiceCardProps) {
  const { t } = useTranslation()

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
      month: 'short',
      year: 'numeric',
    })
  }

  const status = invoice.status || 'pending'
  const config = statusConfig[status] || statusConfig.pending

  const isOverdue = status === 'pending' && invoice.dueDate && new Date(invoice.dueDate) < new Date()

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.05, ease: [0.22, 1, 0.36, 1] as any }}
    >
      <Card
        className={cn(
          'cursor-pointer hover:shadow-md transition-all duration-200 hover:border-primary/30',
          isOverdue && 'border-red-300 dark:border-red-800'
        )}
        onClick={onClick}
      >
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0 flex-1">
              <div className="h-10 w-10 shrink-0 rounded-lg bg-primary/10 flex items-center justify-center">
                <FileText className="h-5 w-5 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-semibold text-sm truncate" suppressHydrationWarning>
                    {invoice.invoiceNumber || t('invoice.noInvoiceNumber')}
                  </p>
                  <Badge className={cn('text-[10px] px-1.5 py-0', config.bgColor, config.color)} suppressHydrationWarning>
                    {t(`invoice.status.${status}`)}
                  </Badge>
                  {isOverdue && (
                    <Badge className="text-[10px] px-1.5 py-0 bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-400 border-red-200 dark:border-red-900" suppressHydrationWarning>
                      {t('invoice.overdue')}
                    </Badge>
                  )}
                  {invoice.splitPayment && (
                    <Badge className="text-[10px] px-1.5 py-0 bg-violet-100 dark:bg-violet-950/60 text-violet-700 dark:text-violet-400 border-violet-200 dark:border-violet-900" suppressHydrationWarning>
                      {t('invoice.splitPayment')}
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1 truncate">
                    <Building2 className="h-3 w-3 shrink-0" />
                    {invoice.vendorName || '—'}
                  </span>
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3 w-3 shrink-0" />
                    {formatDate(invoice.issueDate)}
                  </span>
                </div>
              </div>
            </div>
            <div className="text-right shrink-0">
              <p className="font-bold text-sm tabular-nums">{formatAmount(invoice.grossAmount)}</p>
              <div className="text-[11px] text-muted-foreground mt-0.5 space-y-0.5">
                <p className="tabular-nums" suppressHydrationWarning>
                  {t('invoice.net')}: {formatAmount(invoice.netAmount)}
                </p>
                <p className="tabular-nums" suppressHydrationWarning>
                  {t('invoice.vat')}: {formatAmount(invoice.vatAmount)}
                </p>
              </div>
            </div>
          </div>
          {invoice.dueDate && (
            <div className="mt-2 pt-2 border-t flex items-center justify-between text-xs text-muted-foreground">
              <span className="flex items-center gap-1" suppressHydrationWarning>
                <CreditCard className="h-3 w-3" />
                {t('invoice.due')}: {formatDate(invoice.dueDate)}
              </span>
              {invoice.vatRate && (
                <span className="tabular-nums">VAT {invoice.vatRate}</span>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  )
}
