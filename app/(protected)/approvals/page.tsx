'use client'

import { useEffect, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTranslation } from '@/lib/i18n'
import { useProductType } from '@/hooks/use-product-type'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  AlertCircle, RefreshCw, CheckCircle2, XCircle, Clock,
  Check, Loader2,
} from 'lucide-react'
import { toast } from 'sonner'
import { ApprovalCard, type Approval } from '@/components/protected/business/approval-card'
import { cn } from '@/lib/utils'

// i18n keys:
// 'approvals.title' / 'approvals.description'
// 'approvals.tab.pending' / 'approvals.tab.approved' / 'approvals.tab.rejected'
// 'approvals.bulkApprove' / 'approvals.bulkApproveCount' / 'approvals.bulkApproveSuccess'
// 'approvals.approveSuccess' / 'approvals.rejectSuccess' / 'approvals.actionError'
// 'approvals.empty.pending' / 'approvals.empty.pendingDesc'
// 'approvals.empty.approved' / 'approvals.empty.approvedDesc'
// 'approvals.empty.rejected' / 'approvals.empty.rejectedDesc'
// 'approvals.error.title' / 'approvals.error.desc' / 'approvals.error.retry'

interface Counts {
  pending: number
  approved: number
  rejected: number
}

// ---- Skeleton ----
function ApprovalsSkeleton() {
  return (
    <div className="flex flex-col gap-4 sm:gap-6" role="status" aria-busy="true" aria-live="polite">
      <div className="space-y-2">
        <Skeleton className="h-8 w-44" />
        <Skeleton className="h-4 w-64" />
      </div>
      <div className="flex gap-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-32 rounded-lg" />
        ))}
      </div>
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Skeleton className="h-5 w-5 rounded border" />
                <div className="space-y-1.5">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-44" />
                </div>
              </div>
              <Skeleton className="h-5 w-20" />
            </div>
            <div className="flex gap-2 pt-2 border-t">
              <Skeleton className="h-8 w-24" />
              <Skeleton className="h-8 w-24" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ---- Error ----
function ApprovalsError({ onRetry }: { onRetry: () => void }) {
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
          <h3 className="text-lg font-semibold" suppressHydrationWarning>{t('approvals.error.title')}</h3>
          <p className="text-sm text-muted-foreground" suppressHydrationWarning>{t('approvals.error.desc')}</p>
        </div>
        <Button onClick={onRetry} variant="outline" className="gap-2" suppressHydrationWarning>
          <RefreshCw className="h-4 w-4" />
          {t('approvals.error.retry')}
        </Button>
      </motion.div>
    </div>
  )
}

// ---- Empty per tab ----
function ApprovalsEmpty({ tab }: { tab: string }) {
  const { t } = useTranslation()

  const configs: Record<string, { icon: typeof Clock; iconColor: string; bgColor: string }> = {
    pending: { icon: Clock, iconColor: 'text-yellow-600 dark:text-yellow-400', bgColor: 'bg-yellow-100 dark:bg-yellow-950/60' },
    approved: { icon: CheckCircle2, iconColor: 'text-emerald-600 dark:text-emerald-400', bgColor: 'bg-emerald-100 dark:bg-emerald-950/60' },
    rejected: { icon: XCircle, iconColor: 'text-red-600 dark:text-red-400', bgColor: 'bg-red-100 dark:bg-red-950/60' },
  }

  const config = configs[tab] || configs.pending
  const Icon = config.icon

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="flex items-center justify-center min-h-[300px]"
    >
      <div className="flex flex-col items-center gap-4 text-center max-w-sm">
        <div className={cn('h-16 w-16 rounded-2xl flex items-center justify-center', config.bgColor)}>
          <Icon className={cn('h-8 w-8', config.iconColor)} />
        </div>
        <div className="space-y-1">
          <h3 className="text-lg font-semibold" suppressHydrationWarning>{t(`approvals.empty.${tab}`)}</h3>
          <p className="text-sm text-muted-foreground" suppressHydrationWarning>{t(`approvals.empty.${tab}Desc`)}</p>
        </div>
      </div>
    </motion.div>
  )
}

// ---- Main Page ----
export default function ApprovalsPage() {
  const { t, lang, mounted } = useTranslation()
  const { isBusiness } = useProductType()
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [approvals, setApprovals] = useState<Approval[]>([])
  const [counts, setCounts] = useState<Counts>({ pending: 0, approved: 0, rejected: 0 })
  const [activeTab, setActiveTab] = useState<'pending' | 'approved' | 'rejected'>('pending')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkLoading, setBulkLoading] = useState(false)

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
      const res = await fetch(`/api/business/approvals?status=${activeTab}`, { signal })
      if (!res.ok) throw new Error(`Error ${res.status}`)
      const data = await res.json()

      setApprovals(data.approvals || [])
      setCounts(data.counts || { pending: 0, approved: 0, rejected: 0 })
      setSelectedIds(new Set())
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      if (err.name === 'AbortError') return
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [activeTab])

  useEffect(() => {
    if (!isBusiness) return
    const controller = new AbortController()
    fetchData(controller.signal)
    return () => controller.abort()
  }, [fetchData, isBusiness])

  const handleApprove = async (id: string, notes: string) => {
    try {
      const res = await fetch(`/api/business/approvals/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve', notes }),
      })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || 'Failed')
      }
      toast.success(t('approvals.approveSuccess'))
      fetchData()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      toast.error(err.message || t('approvals.actionError'))
    }
  }

  const handleReject = async (id: string, notes: string) => {
    try {
      const res = await fetch(`/api/business/approvals/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reject', notes }),
      })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || 'Failed')
      }
      toast.success(t('approvals.rejectSuccess'))
      fetchData()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      toast.error(err.message || t('approvals.actionError'))
    }
  }

  const handleBulkApprove = async () => {
    if (selectedIds.size === 0) return
    setBulkLoading(true)
    try {
      const promises = Array.from(selectedIds).map(id =>
        fetch(`/api/business/approvals/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'approve', notes: '' }),
        })
      )
      await Promise.all(promises)
      toast.success(t('approvals.bulkApproveSuccess'))
      fetchData()
    } catch {
      toast.error(t('approvals.actionError'))
    } finally {
      setBulkLoading(false)
    }
  }

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  if (!isBusiness) return null
  if (loading) return <ApprovalsSkeleton />
  if (error) return <ApprovalsError onRetry={() => fetchData()} />

  const fadeUp = {
    hidden: { opacity: 0, y: 24 },
    show: (i: number) => ({
      opacity: 1, y: 0,
      transition: { duration: 0.5, delay: i * 0.08, ease: [0.22, 1, 0.36, 1] as const },
    }),
  }

  const tabs: Array<{ key: 'pending' | 'approved' | 'rejected'; icon: typeof Clock; color: string }> = [
    { key: 'pending', icon: Clock, color: 'text-yellow-600 dark:text-yellow-400' },
    { key: 'approved', icon: CheckCircle2, color: 'text-emerald-600 dark:text-emerald-400' },
    { key: 'rejected', icon: XCircle, color: 'text-red-600 dark:text-red-400' },
  ]

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.35 }} className="flex flex-col gap-4 sm:gap-6">
      {/* Header */}
      <motion.div custom={0} initial="hidden" animate="show" variants={fadeUp}>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight" suppressHydrationWarning>{t('approvals.title')}</h1>
            <p className="text-sm text-muted-foreground mt-1" suppressHydrationWarning>{t('approvals.description')}</p>
          </div>
          {activeTab === 'pending' && selectedIds.size > 0 && (
            <Button
              className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={handleBulkApprove}
              disabled={bulkLoading}
              suppressHydrationWarning
            >
              {bulkLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              {t('approvals.bulkApprove')} ({selectedIds.size})
            </Button>
          )}
        </div>
      </motion.div>

      {/* Tabs */}
      <motion.div custom={1} initial="hidden" animate="show" variants={fadeUp}>
        <div className="flex gap-1 p-1 bg-muted/50 rounded-lg w-fit">
          {tabs.map(tab => {
            const Icon = tab.icon
            const count = counts[tab.key]
            const isActive = activeTab === tab.key
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all',
                  isActive
                    ? 'bg-background shadow-sm text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                )}
                suppressHydrationWarning
              >
                <Icon className={cn('h-3.5 w-3.5', isActive ? tab.color : '')} />
                {t(`approvals.tab.${tab.key}`)}
                {count > 0 && (
                  <Badge
                    className={cn(
                      'text-[10px] px-1.5 py-0 min-w-[18px] h-[18px] flex items-center justify-center',
                      isActive
                        ? tab.key === 'pending'
                          ? 'bg-yellow-100 dark:bg-yellow-950/60 text-yellow-700 dark:text-yellow-400 border-yellow-200 dark:border-yellow-900'
                          : tab.key === 'approved'
                          ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900'
                          : 'bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-400 border-red-200 dark:border-red-900'
                        : 'bg-muted text-muted-foreground'
                    )}
                  >
                    {count}
                  </Badge>
                )}
              </button>
            )
          })}
        </div>
      </motion.div>

      {/* Approval Cards */}
      <AnimatePresence mode="wait">
        {approvals.length === 0 ? (
          <ApprovalsEmpty key={activeTab} tab={activeTab} />
        ) : (
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.3 }}
            className="space-y-3"
          >
            {approvals.map((approval, idx) => (
              <ApprovalCard
                key={approval.id}
                approval={approval}
                currency={currency}
                locale={locale}
                onApprove={activeTab === 'pending' ? handleApprove : undefined}
                onReject={activeTab === 'pending' ? handleReject : undefined}
                showActions={activeTab === 'pending'}
                selected={selectedIds.has(approval.id)}
                onSelect={activeTab === 'pending' ? toggleSelect : undefined}
                index={idx}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
