'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Check, X, User, Calendar, Tag, Receipt, Loader2, ChevronDown, ChevronUp } from 'lucide-react'
import { useTranslation } from '@/lib/i18n'
import { cn } from '@/lib/utils'

export interface Approval {
  id: string
  expenseId: string
  submittedBy: string
  submittedByName?: string
  submittedByEmail?: string
  reviewedBy: string | null
  status: string
  notes: string | null
  submittedAt: string
  reviewedAt: string | null
  // Expense details
  expenseTitle?: string
  expenseAmount?: string
  expenseDate?: string
  expenseVendor?: string | null
  expenseCategoryName?: string | null
  receiptImageUrl?: string | null
}

interface ApprovalCardProps {
  approval: Approval
  currency: string
  locale: string
  onApprove?: (id: string, notes: string) => Promise<void>
  onReject?: (id: string, notes: string) => Promise<void>
  index?: number
  showActions?: boolean
  selected?: boolean
  onSelect?: (id: string) => void
}

// i18n keys:
// 'approval.approve' / 'approval.reject' / 'approval.notesPlaceholder'
// 'approval.submittedBy' / 'approval.submittedAt' / 'approval.reviewedBy' / 'approval.reviewedAt'
// 'approval.status.pending' / 'approval.status.approved' / 'approval.status.rejected'
// 'approval.addNotes' / 'approval.hideNotes'

const statusConfig: Record<string, { color: string; bgColor: string }> = {
  pending: { color: 'text-yellow-700 dark:text-yellow-400', bgColor: 'bg-yellow-100 dark:bg-yellow-950/60 border-yellow-200 dark:border-yellow-900' },
  approved: { color: 'text-emerald-700 dark:text-emerald-400', bgColor: 'bg-emerald-100 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-900' },
  rejected: { color: 'text-red-700 dark:text-red-400', bgColor: 'bg-red-100 dark:bg-red-950/60 border-red-200 dark:border-red-900' },
}

export function ApprovalCard({
  approval,
  currency,
  locale,
  onApprove,
  onReject,
  index = 0,
  showActions = true,
  selected = false,
  onSelect,
}: ApprovalCardProps) {
  const { t } = useTranslation()
  const [notes, setNotes] = useState('')
  const [showNotes, setShowNotes] = useState(false)
  const [loading, setLoading] = useState<'approve' | 'reject' | null>(null)

  const formatAmount = (amount: string | undefined) => {
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

  const status = approval.status || 'pending'
  const config = statusConfig[status] || statusConfig.pending

  const handleApprove = async () => {
    if (!onApprove) return
    setLoading('approve')
    try {
      await onApprove(approval.id, notes)
    } finally {
      setLoading(null)
    }
  }

  const handleReject = async () => {
    if (!onReject) return
    setLoading('reject')
    try {
      await onReject(approval.id, notes)
    } finally {
      setLoading(null)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.05, ease: [0.22, 1, 0.36, 1] as any }}
    >
      <Card className={cn(
        'transition-all duration-200 hover:shadow-md',
        selected && 'border-primary ring-1 ring-primary/20',
      )}>
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0 flex-1">
              {/* Selectable checkbox area */}
              {onSelect && (
                <button
                  onClick={() => onSelect(approval.id)}
                  className={cn(
                    'h-5 w-5 shrink-0 mt-0.5 rounded border-2 flex items-center justify-center transition-colors',
                    selected ? 'bg-primary border-primary text-primary-foreground' : 'border-muted-foreground/30 hover:border-primary'
                  )}
                >
                  {selected && <Check className="h-3 w-3" />}
                </button>
              )}

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-semibold text-sm" suppressHydrationWarning>
                    {approval.expenseTitle || '—'}
                  </p>
                  <Badge className={cn('text-[10px] px-1.5 py-0', config.bgColor, config.color)} suppressHydrationWarning>
                    {t(`approval.status.${status}`)}
                  </Badge>
                </div>

                <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground flex-wrap">
                  <span className="flex items-center gap-1">
                    <User className="h-3 w-3 shrink-0" />
                    {approval.submittedByName || approval.submittedByEmail || approval.submittedBy}
                  </span>
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3 w-3 shrink-0" />
                    {formatDate(approval.expenseDate || null)}
                  </span>
                  {approval.expenseCategoryName && (
                    <span className="flex items-center gap-1">
                      <Tag className="h-3 w-3 shrink-0" />
                      {approval.expenseCategoryName}
                    </span>
                  )}
                  {approval.expenseVendor && (
                    <span className="truncate max-w-[120px]">{approval.expenseVendor}</span>
                  )}
                </div>

                {/* Receipt thumbnail */}
                {approval.receiptImageUrl && (
                  <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                    <Receipt className="h-3 w-3" />
                    <a
                      href={approval.receiptImageUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:underline text-primary"
                      suppressHydrationWarning
                    >
                      {t('approval.viewReceipt')}
                    </a>
                  </div>
                )}

                {/* Review info for approved/rejected */}
                {(status === 'approved' || status === 'rejected') && (
                  <div className="mt-2 pt-2 border-t text-xs text-muted-foreground space-y-0.5">
                    {approval.reviewedBy && (
                      <p suppressHydrationWarning>{t('approval.reviewedBy')}: {approval.reviewedBy}</p>
                    )}
                    {approval.reviewedAt && (
                      <p suppressHydrationWarning>{t('approval.reviewedAt')}: {formatDate(approval.reviewedAt)}</p>
                    )}
                    {approval.notes && (
                      <p className="italic">&quot;{approval.notes}&quot;</p>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="text-right shrink-0">
              <p className="font-bold text-base tabular-nums">{formatAmount(approval.expenseAmount)}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5" suppressHydrationWarning>
                {formatDate(approval.submittedAt)}
              </p>
            </div>
          </div>

          {/* Action buttons for pending approvals */}
          {showActions && status === 'pending' && (
            <div className="mt-3 pt-3 border-t space-y-2">
              <button
                onClick={() => setShowNotes(!showNotes)}
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
                suppressHydrationWarning
              >
                {showNotes ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                {showNotes ? t('approval.hideNotes') : t('approval.addNotes')}
              </button>

              {showNotes && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  transition={{ duration: 0.2 }}
                >
                  <Textarea
                    placeholder={t('approval.notesPlaceholder')}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={2}
                    className="text-sm"
                  />
                </motion.div>
              )}

              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  onClick={handleApprove}
                  disabled={loading !== null}
                  className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                  suppressHydrationWarning
                >
                  {loading === 'approve' ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Check className="h-3.5 w-3.5" />
                  )}
                  {t('approval.approve')}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleReject}
                  disabled={loading !== null}
                  className="gap-1.5 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/20"
                  suppressHydrationWarning
                >
                  {loading === 'reject' ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <X className="h-3.5 w-3.5" />
                  )}
                  {t('approval.reject')}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  )
}
