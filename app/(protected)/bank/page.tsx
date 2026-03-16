'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTranslation } from '@/lib/i18n'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Landmark, Plus, RefreshCw, AlertCircle, Loader2, ArrowDownLeft,
  ArrowUpRight, Filter, Check, X, Link2, Search,
  Calendar, BarChart3, Sparkles, Clock,
} from 'lucide-react'
import { toast } from 'sonner'
import { BankAccountCard } from '@/components/protected/bank/bank-account-card'
import { BankTransactionRow } from '@/components/protected/bank/bank-transaction-row'
import { ConnectBankSheet } from '@/components/protected/bank/connect-bank-sheet'

/* ─── Types ─── */
interface BankAccount {
  id: string
  accountName: string | null
  accountNumber: string | null
  balance: string | null
  currency: string | null
  balanceUpdatedAt: string | null
  isActive: boolean
  connectionStatus: string
  lastSyncAt: string | null
  provider: string
}

interface BankTransaction {
  id: string
  date: string
  description: string | null
  counterpartyName: string | null
  amount: string
  currency: string | null
  category: string | null
  isMatched: boolean
  expenseId: string | null
  suggestedCategoryId: string | null
  suggestedCategoryName?: string
}

interface BankStats {
  totalSynced: number
  autoCategorizedPercent: number
  lastSyncTime: string | null
}

type TabType = 'unmatched' | 'history'
type MatchFilter = 'all' | 'matched' | 'unmatched'

/* ─── Skeleton ─── */
function BankSkeleton() {
  return (
    <div className="flex flex-col gap-6 animate-pulse">
      {/* Header skeleton */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-7 w-48 rounded bg-muted" />
          <div className="h-4 w-72 rounded bg-muted" />
        </div>
        <div className="h-10 w-40 rounded-md bg-muted" />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[0, 1, 2].map(i => (
          <div key={i} className="rounded-xl border bg-card p-4 space-y-2">
            <div className="h-3 w-20 rounded bg-muted" />
            <div className="h-7 w-16 rounded bg-muted" />
            <div className="h-3 w-24 rounded bg-muted" />
          </div>
        ))}
      </div>

      {/* Account cards */}
      <div className="grid md:grid-cols-2 gap-4">
        {[0, 1].map(i => (
          <div key={i} className="rounded-xl border bg-card p-5 space-y-4">
            <div className="flex items-center gap-3">
              <div className="h-11 w-11 rounded-xl bg-muted" />
              <div className="space-y-1.5 flex-1">
                <div className="h-4 w-24 rounded bg-muted" />
                <div className="h-3 w-32 rounded bg-muted" />
              </div>
            </div>
            <div className="h-8 w-36 rounded bg-muted" />
            <div className="h-3 w-48 rounded bg-muted" />
          </div>
        ))}
      </div>

      {/* Transactions skeleton */}
      <div className="rounded-xl border bg-card p-6 space-y-3">
        <div className="h-5 w-40 rounded bg-muted" />
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 py-3 border-b last:border-0">
            <div className="h-8 w-8 rounded-full bg-muted" />
            <div className="flex-1 space-y-1.5">
              <div className="h-4 w-40 rounded bg-muted" />
              <div className="h-3 w-24 rounded bg-muted" />
            </div>
            <div className="h-4 w-20 rounded bg-muted" />
          </div>
        ))}
      </div>
    </div>
  )
}

/* ─── Error State ─── */
function BankError({ onRetry, t }: { onRetry: () => void; t: (key: string) => string }) {
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
          <h3 className="text-lg font-semibold" suppressHydrationWarning>{t('bank.errorTitle')}</h3>
          <p className="text-sm text-muted-foreground" suppressHydrationWarning>{t('bank.errorDesc')}</p>
        </div>
        <Button onClick={onRetry} variant="outline" className="gap-2" suppressHydrationWarning>
          <RefreshCw className="h-4 w-4" />
          {t('dashboard.tryAgain')}
        </Button>
      </motion.div>
    </div>
  )
}

/* ─── Empty State ─── */
function BankEmpty({ onConnect, t }: { onConnect: () => void; t: (key: string) => string }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex flex-col items-center justify-center py-20 gap-6 text-center"
    >
      <div className="relative">
        <div className="h-24 w-24 rounded-full bg-primary/10 flex items-center justify-center">
          <Landmark className="h-12 w-12 text-primary" />
        </div>
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 12, repeat: Infinity, ease: 'linear' }}
          className="absolute inset-0 rounded-full border-2 border-dashed border-primary/30"
        />
      </div>
      <div className="space-y-2 max-w-sm">
        <h2 className="text-xl font-bold" suppressHydrationWarning>{t('bank.emptyTitle')}</h2>
        <p className="text-muted-foreground text-sm" suppressHydrationWarning>{t('bank.emptyDesc')}</p>
      </div>

      {/* Feature hints */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
        className="grid sm:grid-cols-3 gap-3 max-w-lg"
      >
        {[
          { icon: RefreshCw, labelKey: 'bank.featureAutoSync' },
          { icon: Sparkles, labelKey: 'bank.featureAiMatch' },
          { icon: BarChart3, labelKey: 'bank.featureAnalytics' },
        ].map(({ icon: Icon, labelKey }) => (
          <div key={labelKey} className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/40 rounded-lg px-3 py-2">
            <Icon className="h-3.5 w-3.5 text-primary shrink-0" />
            <span suppressHydrationWarning>{t(labelKey)}</span>
          </div>
        ))}
      </motion.div>

      <Button onClick={onConnect} size="lg" className="gap-2">
        <Plus className="h-4 w-4" />
        <span suppressHydrationWarning>{t('bank.connectPKO')}</span>
      </Button>
    </motion.div>
  )
}

/* ─── Page ─── */
export default function BankPage() {
  const { t, lang, mounted } = useTranslation()
  const isPolish = lang === 'pl'

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [accounts, setAccounts] = useState<BankAccount[]>([])
  const [transactions, setTransactions] = useState<BankTransaction[]>([])
  const [stats, setStats] = useState<BankStats>({ totalSynced: 0, autoCategorizedPercent: 0, lastSyncTime: null })
  const [currency, setCurrency] = useState('PLN')
  const [sheetOpen, setSheetOpen] = useState(false)
  const [syncingId, setSyncingId] = useState<string | null>(null)
  const [matchingId, setMatchingId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<TabType>('unmatched')
  const [matchFilter, setMatchFilter] = useState<MatchFilter>('all')
  const [searchQuery, setSearchQuery] = useState('')

  const fetchData = useCallback(async (signal?: AbortSignal) => {
    setLoading(true)
    setError(null)
    try {
      const [bankRes, settingsRes] = await Promise.all([
        fetch('/api/bank/data', { signal }),
        fetch('/api/data/settings', { signal }),
      ])
      if (!bankRes.ok) throw new Error(`HTTP ${bankRes.status}`)
      const bankData = await bankRes.json()
      const settingsData = await settingsRes.json().catch(() => ({}))

      setAccounts(bankData.accounts || [])
      setTransactions(bankData.transactions || [])
      setStats(bankData.stats || { totalSynced: 0, autoCategorizedPercent: 0, lastSyncTime: null })
      if (settingsData?.settings?.currency) setCurrency(settingsData.settings.currency.toUpperCase())
    } catch (err: any) {
      if (err.name === 'AbortError') return
      // If no bank data endpoint yet, treat as empty (no accounts connected)
      if (err.message?.includes('404') || err.message?.includes('500')) {
        setAccounts([])
        setTransactions([])
      } else {
        setError(err.message || 'Unknown error')
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    fetchData(controller.signal)
    return () => controller.abort()
  }, [fetchData])

  const handleSync = async (accountId: string) => {
    setSyncingId(accountId)
    try {
      const res = await fetch('/api/bank/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId }),
      })
      if (!res.ok) throw new Error('Sync failed')
      toast.success(t('bank.syncSuccess'))
      fetchData()
    } catch {
      toast.error(t('bank.syncFailed'))
    } finally {
      setSyncingId(null)
    }
  }

  const handleMatch = async (txId: string) => {
    setMatchingId(txId)
    try {
      const res = await fetch('/api/bank/match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactionId: txId }),
      })
      if (!res.ok) throw new Error('Match failed')
      toast.success(t('bank.matchSuccess'))
      setTransactions(prev => prev.map(tx => tx.id === txId ? { ...tx, isMatched: true } : tx))
    } catch {
      toast.error(t('bank.matchFailed'))
    } finally {
      setMatchingId(null)
    }
  }

  const handleIgnore = async (txId: string) => {
    setTransactions(prev => prev.filter(tx => tx.id !== txId))
    toast.success(t('bank.transactionIgnored'))
  }

  if (!mounted) return null

  if (loading) return <BankSkeleton />
  if (error) return <BankError onRetry={() => fetchData()} t={t} />

  const fadeUp = {
    hidden: { opacity: 0, y: 20 },
    show: (i: number) => ({
      opacity: 1, y: 0,
      transition: { duration: 0.45, delay: i * 0.07, ease: [0.22, 1, 0.36, 1] as const },
    }),
  }

  const unmatchedTransactions = transactions.filter(tx => !tx.isMatched && (tx.category === 'debit' || parseFloat(tx.amount) < 0))

  const filteredTransactions = transactions.filter(tx => {
    if (activeTab === 'unmatched') return !tx.isMatched
    // history tab filters
    if (matchFilter === 'matched' && !tx.isMatched) return false
    if (matchFilter === 'unmatched' && tx.isMatched) return false
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      return (
        tx.description?.toLowerCase().includes(q) ||
        tx.counterpartyName?.toLowerCase().includes(q) ||
        tx.amount.includes(q)
      )
    }
    return true
  })

  // Empty state if no accounts connected
  if (accounts.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <motion.div custom={0} initial="hidden" animate="show" variants={fadeUp}>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight flex items-center gap-2">
                <Landmark className="h-7 w-7 text-primary" />
                <span suppressHydrationWarning>{t('bank.title')}</span>
              </h1>
              <p className="text-muted-foreground text-sm mt-1" suppressHydrationWarning>{t('bank.subtitle')}</p>
            </div>
          </div>
        </motion.div>
        <BankEmpty onConnect={() => setSheetOpen(true)} t={t} />
        <ConnectBankSheet open={sheetOpen} onOpenChange={setSheetOpen} />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {/* ── Header ── */}
      <motion.div custom={0} initial="hidden" animate="show" variants={fadeUp} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight flex items-center gap-2">
            <Landmark className="h-7 w-7 text-primary" />
            <span suppressHydrationWarning>{t('bank.title')}</span>
          </h1>
          <p className="text-muted-foreground text-sm mt-1" suppressHydrationWarning>{t('bank.subtitle')}</p>
        </div>
        <Button onClick={() => setSheetOpen(true)} className="gap-2 shrink-0">
          <Plus className="h-4 w-4" />
          <span suppressHydrationWarning>{t('bank.addAccount')}</span>
        </Button>
      </motion.div>

      {/* ── Stats ── */}
      <motion.div custom={1} initial="hidden" animate="show" variants={fadeUp}>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          {[
            {
              icon: BarChart3,
              label: t('bank.totalSynced'),
              value: stats.totalSynced.toString(),
              sub: t('bank.transactions'),
            },
            {
              icon: Sparkles,
              label: t('bank.autoCategorized'),
              value: `${stats.autoCategorizedPercent}%`,
              sub: t('bank.byAI'),
              color: 'text-primary',
            },
            {
              icon: Clock,
              label: t('bank.lastSync'),
              value: stats.lastSyncTime
                ? new Date(stats.lastSyncTime).toLocaleTimeString(isPolish ? 'pl-PL' : 'en-US', { hour: '2-digit', minute: '2-digit' })
                : '---',
              sub: stats.lastSyncTime
                ? new Date(stats.lastSyncTime).toLocaleDateString(isPolish ? 'pl-PL' : 'en-US', { day: 'numeric', month: 'short' })
                : t('bank.neverSynced'),
            },
          ].map((stat, i) => (
            <Card key={i} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                  <stat.icon className="h-3.5 w-3.5" />
                  <span suppressHydrationWarning>{stat.label}</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className={`text-xl font-bold ${stat.color || ''}`}>{stat.value}</div>
                <p className="text-xs text-muted-foreground mt-0.5" suppressHydrationWarning>{stat.sub}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </motion.div>

      {/* ── Connected Accounts ── */}
      <motion.div custom={2} initial="hidden" animate="show" variants={fadeUp}>
        <div className="grid md:grid-cols-2 gap-4">
          {accounts.map((account, i) => (
            <BankAccountCard
              key={account.id}
              account={account}
              index={i}
              onSync={handleSync}
              syncing={syncingId === account.id}
            />
          ))}
        </div>
      </motion.div>

      {/* ── Transaction Tabs ── */}
      <motion.div custom={3} initial="hidden" animate="show" variants={fadeUp}>
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2">
                  {activeTab === 'unmatched' ? (
                    <AlertCircle className="h-5 w-5 text-amber-500" />
                  ) : (
                    <Calendar className="h-5 w-5" />
                  )}
                  <span suppressHydrationWarning>
                    {activeTab === 'unmatched' ? t('bank.unmatchedTitle') : t('bank.historyTitle')}
                  </span>
                  {activeTab === 'unmatched' && unmatchedTransactions.length > 0 && (
                    <Badge variant="secondary" className="text-[10px]">
                      {unmatchedTransactions.length}
                    </Badge>
                  )}
                </CardTitle>
                <CardDescription suppressHydrationWarning>
                  {activeTab === 'unmatched' ? t('bank.unmatchedDesc') : t('bank.historyDesc')}
                </CardDescription>
              </div>

              {/* Tab buttons */}
              <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
                {(['unmatched', 'history'] as const).map(tab => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                      activeTab === tab
                        ? 'bg-background shadow-sm text-foreground'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                    suppressHydrationWarning
                  >
                    {tab === 'unmatched' ? t('bank.tabUnmatched') : t('bank.tabHistory')}
                  </button>
                ))}
              </div>
            </div>

            {/* History filters */}
            {activeTab === 'history' && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="flex flex-wrap items-center gap-2 pt-3"
              >
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder={t('bank.searchPlaceholder')}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9 h-8 text-sm"
                  />
                </div>
                <div className="flex items-center gap-1 flex-wrap">
                  {(['all', 'matched', 'unmatched'] as const).map(filter => (
                    <Button
                      key={filter}
                      variant={matchFilter === filter ? 'default' : 'ghost'}
                      size="sm"
                      className="h-8 text-xs"
                      onClick={() => setMatchFilter(filter)}
                      suppressHydrationWarning
                    >
                      {filter === 'all' ? t('bank.filterAll') : filter === 'matched' ? t('bank.filterMatched') : t('bank.filterUnmatched')}
                    </Button>
                  ))}
                </div>
              </motion.div>
            )}
          </CardHeader>

          <CardContent>
            <AnimatePresence mode="wait">
              {filteredTransactions.length === 0 ? (
                <motion.div
                  key="empty-tx"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="text-center py-12"
                >
                  <div className="h-12 w-12 rounded-full bg-muted/60 flex items-center justify-center mx-auto mb-3">
                    <Check className="h-6 w-6 text-emerald-500" />
                  </div>
                  <p className="text-sm font-medium" suppressHydrationWarning>
                    {activeTab === 'unmatched' ? t('bank.allMatched') : t('bank.noTransactions')}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1" suppressHydrationWarning>
                    {activeTab === 'unmatched' ? t('bank.allMatchedDesc') : t('bank.noTransactionsDesc')}
                  </p>
                </motion.div>
              ) : (
                <motion.div key="tx-list" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  {filteredTransactions.slice(0, 20).map((tx, i) => (
                    <BankTransactionRow
                      key={tx.id}
                      transaction={tx}
                      index={i}
                      currency={currency}
                      onMatch={handleMatch}
                      onIgnore={handleIgnore}
                      matching={matchingId === tx.id}
                    />
                  ))}
                  {filteredTransactions.length > 20 && (
                    <p className="text-xs text-muted-foreground text-center pt-4" suppressHydrationWarning>
                      {t('bank.showingOf').replace('%d', '20').replace('%t', String(filteredTransactions.length))}
                    </p>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </CardContent>
        </Card>
      </motion.div>

      <ConnectBankSheet open={sheetOpen} onOpenChange={setSheetOpen} />
    </div>
  )
}
