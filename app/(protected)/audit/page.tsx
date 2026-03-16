'use client'

import { useEffect, useState, useCallback } from 'react'
import { useTranslation } from '@/lib/i18n'
import { motion, AnimatePresence } from 'framer-motion'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  ShoppingCart, TrendingDown, TrendingUp, Loader2, RefreshCcw,
  Sparkles, Tag, AlertCircle, CheckCircle2, Store, ArrowRight,
  Lightbulb, Globe, PackageSearch, PiggyBank, Zap, Copy, Check,
  Clock,
} from 'lucide-react'

/* ─── Types ─── */
interface PriceComparison {
  product: string
  pricePaid: number
  prices: Record<string, number>
  cheapestStore: string
  cheapestPrice: number
  potentialSaving: number
  verdict: string
}

interface Promotion {
  product: string
  store: string
  originalPrice: number
  promoPrice: number
  saving: number
  validUntil: string
}

interface AuditData {
  period: { from: string; to: string }
  totalSpent: number
  transactionCount: number
  currency: string
  categoryBreakdown: Record<string, number>
  topStores: { store: string; amount: number }[]
  topProducts: { name: string; totalPaid: number; avgPrice: number; vendor: string }[]
  priceComparisons: PriceComparison[]
  currentPromotions: Promotion[]
  bestStore: string | null
  totalPotentialSaving: number
  personalMessage: string | null
  topTip: string | null
  aiSummary: string
  webSearchUsed: boolean
}

/* ─── Helpers ─── */
const STORE_COLORS: Record<string, string> = {
  Biedronka: 'bg-red-500',
  Lidl: 'bg-yellow-500',
  Kaufland: 'bg-red-700',
  Auchan: 'bg-orange-500',
}

function getStoreColor(store: string) {
  return STORE_COLORS[store] || 'bg-primary'
}

function VerdictBadge({ verdict, isPolish }: { verdict: string; isPolish: boolean }) {
  const map: Record<string, { label: string; labelPl: string; color: string }> = {
    good_choice: { label: 'Good choice!', labelPl: 'Dobry wybór!', color: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' },
    dobry_wybor: { label: 'Good choice!', labelPl: 'Dobry wybór!', color: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' },
    could_be_cheaper: { label: 'Could save', labelPl: 'Można taniej', color: 'bg-amber-500/10 text-amber-600 border-amber-500/20' },
    mozna_taniej: { label: 'Could save', labelPl: 'Można taniej', color: 'bg-amber-500/10 text-amber-600 border-amber-500/20' },
    significant_saving: { label: 'Big savings!', labelPl: 'Duże oszczędności!', color: 'bg-red-500/10 text-red-600 border-red-500/20' },
    znaczna_oszczednosc: { label: 'Big savings!', labelPl: 'Duże oszczędności!', color: 'bg-red-500/10 text-red-600 border-red-500/20' },
  }
  const v = map[verdict] || map.could_be_cheaper
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${v.color}`}>
      {isPolish ? v.labelPl : v.label}
    </span>
  )
}

// Safe number helper — handles strings, null, undefined from AI responses
function n(v: unknown): number { return Number(v) || 0 }

function PriceBar({ store, price, maxPrice, currency }: { store: string; price: unknown; maxPrice: number; currency: string }) {
  const p = n(price)
  const pct = maxPrice > 0 ? (p / maxPrice) * 100 : 0
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-20 text-muted-foreground truncate">{store}</span>
      <div className="flex-1 bg-muted rounded-full h-2 overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.7, ease: 'easeOut' }}
          className={`h-2 rounded-full ${getStoreColor(store)}`}
        />
      </div>
      <span className="w-16 text-right font-medium">{p.toFixed(2)} {currency}</span>
    </div>
  )
}

/* ─── Copy to clipboard hook ─── */
function useCopyToClipboard() {
  const [copied, setCopied] = useState(false)
  const copy = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // fallback
    }
  }, [])
  return { copied, copy }
}

/* ─── Audit summary text builder ─── */
function buildAuditText(audit: AuditData, isPolish: boolean): string {
  const lines: string[] = []
  lines.push(isPolish ? '=== AUDYT ZAKUPÓW ===' : '=== SHOPPING AUDIT ===')
  lines.push('')
  lines.push(audit.aiSummary)
  if (audit.personalMessage) {
    lines.push('')
    lines.push(audit.personalMessage)
  }
  if (audit.topTip) {
    lines.push('')
    lines.push(isPolish ? `Wskazówka: ${audit.topTip}` : `Tip: ${audit.topTip}`)
  }
  lines.push('')
  lines.push(isPolish
    ? `Wydano łącznie: ${n(audit.totalSpent).toFixed(2)} ${audit.currency} (${audit.transactionCount} transakcji)`
    : `Total spent: ${n(audit.totalSpent).toFixed(2)} ${audit.currency} (${audit.transactionCount} transactions)`)
  if (n(audit.totalPotentialSaving) > 0) {
    lines.push(isPolish
      ? `Możliwe oszczędności: ${n(audit.totalPotentialSaving).toFixed(2)} ${audit.currency}`
      : `Potential savings: ${n(audit.totalPotentialSaving).toFixed(2)} ${audit.currency}`)
  }
  if (audit.bestStore) {
    lines.push(isPolish
      ? `Najtańszy sklep: ${audit.bestStore}`
      : `Cheapest store: ${audit.bestStore}`)
  }
  if (audit.priceComparisons.length > 0) {
    lines.push('')
    lines.push(isPolish ? '--- Porównanie cen ---' : '--- Price Comparisons ---')
    for (const pc of audit.priceComparisons) {
      lines.push(`${pc.product}: ${n(pc.pricePaid).toFixed(2)} ${audit.currency}`)
      if (pc.cheapestStore && n(pc.cheapestPrice) < n(pc.pricePaid)) {
        lines.push(isPolish
          ? `  Najtaniej w ${pc.cheapestStore}: ${n(pc.cheapestPrice).toFixed(2)} ${audit.currency} (oszczędność: ${n(pc.potentialSaving).toFixed(2)})`
          : `  Cheapest at ${pc.cheapestStore}: ${n(pc.cheapestPrice).toFixed(2)} ${audit.currency} (save: ${n(pc.potentialSaving).toFixed(2)})`)
      }
    }
  }
  if (audit.currentPromotions.length > 0) {
    lines.push('')
    lines.push(isPolish ? '--- Aktualne promocje ---' : '--- Current Promotions ---')
    for (const promo of audit.currentPromotions) {
      lines.push(`${promo.product} @ ${promo.store}: ${n(promo.promoPrice).toFixed(2)} ${audit.currency} (${isPolish ? 'do' : 'until'} ${promo.validUntil})`)
    }
  }
  return lines.join('\n')
}

/* ─── Loading skeleton ─── */
function AuditSkeleton({ isPolish }: { isPolish: boolean }) {
  return (
    <motion.div
      key="audit-skeleton"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex flex-col gap-6"
    >
      {/* Animated loading banner */}
      <Card className="border-primary/20 bg-gradient-to-r from-primary/5 to-violet-500/5">
        <CardContent className="p-5 flex items-center gap-4">
          <div className="relative h-10 w-10 shrink-0">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
              className="absolute inset-0 rounded-full border-4 border-primary/20 border-t-primary"
            />
            <div className="absolute inset-0 flex items-center justify-center">
              <Globe className="h-4 w-4 text-primary" />
            </div>
          </div>
          <div className="flex flex-col gap-1 flex-1">
            <p className="text-sm font-semibold">
              {isPolish ? 'AI przeszukuje internet i gazetki…' : 'AI is searching the internet and leaflets…'}
            </p>
            <p className="text-xs text-muted-foreground">
              {isPolish ? 'Może to potrwać 15–30 sekund' : 'This may take 15–30 seconds'}
            </p>
          </div>
          <div className="flex gap-1.5 shrink-0">
            {['Biedronka', 'Lidl', 'Kaufland', 'Auchan'].map((s, i) => (
              <motion.div
                key={s}
                animate={{ opacity: [0.3, 1, 0.3] }}
                transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.35 }}
                className="text-[10px] text-muted-foreground hidden sm:block"
              >
                {s}
              </motion.div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* KPI skeleton */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[0, 1, 2, 3].map(i => (
          <Card key={i} className="overflow-hidden">
            <CardHeader className="pb-2">
              <div className="h-3 w-24 rounded bg-muted animate-pulse" style={{ animationDelay: `${i * 100}ms` }} />
            </CardHeader>
            <CardContent>
              <div className="h-7 w-28 rounded bg-muted animate-pulse mb-2" style={{ animationDelay: `${i * 100 + 50}ms` }} />
              <div className="h-3 w-20 rounded bg-muted/60 animate-pulse" style={{ animationDelay: `${i * 100 + 80}ms` }} />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* AI summary skeleton */}
      <Card className="border-primary/20">
        <CardHeader>
          <div className="h-4 w-40 rounded bg-muted animate-pulse" />
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="h-4 w-full rounded bg-muted animate-pulse" />
          <div className="h-4 w-5/6 rounded bg-muted animate-pulse" />
          <div className="h-4 w-4/6 rounded bg-muted animate-pulse" />
        </CardContent>
      </Card>

      {/* Price comparisons skeleton */}
      <Card>
        <CardHeader>
          <div className="h-4 w-36 rounded bg-muted animate-pulse" />
        </CardHeader>
        <CardContent className="space-y-5">
          {[0, 1, 2].map(i => (
            <div key={i} className="space-y-2">
              <div className="h-4 w-32 rounded bg-muted animate-pulse" style={{ animationDelay: `${i * 120}ms` }} />
              {[0, 1, 2].map(j => (
                <div key={j} className="flex items-center gap-2">
                  <div className="h-3 w-20 rounded bg-muted/60 animate-pulse" />
                  <div className="flex-1 h-2 rounded-full bg-muted animate-pulse" />
                  <div className="h-3 w-16 rounded bg-muted/60 animate-pulse" />
                </div>
              ))}
            </div>
          ))}
        </CardContent>
      </Card>
    </motion.div>
  )
}

/* ─── Page ─── */
export default function AuditPage() {
  const { lang, mounted } = useTranslation()
  const isPolish = lang === 'pl'

  const [loading, setLoading] = useState(false)
  const [audit, setAudit] = useState<AuditData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [currency, setCurrency] = useState('PLN')
  const [auditTimestamp, setAuditTimestamp] = useState<Date | null>(null)

  const { copied, copy } = useCopyToClipboard()

  const t = useCallback((pl: string, en: string) => (isPolish ? pl : en), [isPolish])

  // Get currency from settings
  useEffect(() => {
    fetch('/api/data/settings')
      .then(r => r.json())
      .then(data => { if (data?.settings?.currency) setCurrency(data.settings.currency.toUpperCase()) })
      .catch(() => {})
  }, [])

  const generateAudit = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/audit/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lang, currency }),
      })
      if (!res.ok) {
        const errText = await res.text().catch(() => '')
        throw new Error(errText || `HTTP ${res.status}`)
      }
      const data = await res.json()
      if (data.error === 'no_data') {
        setError(data.message)
      } else {
        setAudit(data)
        setAuditTimestamp(new Date())
      }
    } catch (err) {
      setError(isPolish
        ? `Błąd generowania audytu: ${err instanceof Error ? err.message : String(err)}`
        : `Failed to generate audit: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setLoading(false)
    }
  }, [lang, currency, isPolish])

  if (!mounted) return null

  const fadeUp = {
    hidden: { opacity: 0, y: 20 },
    show: (i: number) => ({ opacity: 1, y: 0, transition: { duration: 0.45, delay: i * 0.07, ease: [0.22, 1, 0.36, 1] as const } }),
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <motion.div custom={0} initial="hidden" animate="show" variants={fadeUp} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight flex items-center gap-2">
            <ShoppingCart className="h-7 w-7 text-primary" />
            {t('Audyt zakupów', 'Shopping Audit')}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {t(
              'AI analizuje Twoje zakupy, porównuje ceny w sklepach i szuka oszczędności w aktualnych gazetkach.',
              'AI analyzes your purchases, compares prices across stores and finds savings in current promotional leaflets.',
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {audit && auditTimestamp && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {auditTimestamp.toLocaleTimeString(isPolish ? 'pl-PL' : 'en-US', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <Button onClick={generateAudit} disabled={loading}>
            {loading ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" />{t('Analizuję...', 'Analyzing...')}</>
            ) : audit ? (
              <><RefreshCcw className="h-4 w-4 mr-2" />{t('Odśwież audyt', 'Refresh audit')}</>
            ) : (
              <><Sparkles className="h-4 w-4 mr-2" />{t('Wygeneruj audyt', 'Generate audit')}</>
            )}
          </Button>
        </div>
      </motion.div>

      <AnimatePresence mode="wait">
        {/* ── Empty state ── */}
        {!audit && !loading && !error && (
          <motion.div
            key="empty"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center justify-center py-24 gap-6 text-center"
          >
            <div className="relative">
              <div className="h-24 w-24 rounded-full bg-primary/10 flex items-center justify-center">
                <PackageSearch className="h-12 w-12 text-primary" />
              </div>
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
                className="absolute inset-0 rounded-full border-2 border-dashed border-primary/30"
              />
              <motion.div
                animate={{ scale: [1, 1.15, 1] }}
                transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
                className="absolute inset-0 rounded-full bg-primary/5"
              />
            </div>
            <div className="space-y-2 max-w-sm">
              <h2 className="text-xl font-bold">{t('Gotowy na audyt?', 'Ready for your audit?')}</h2>
              <p className="text-muted-foreground text-sm">
                {t(
                  'AI przeszuka internet, gazetki Biedronki, Lidla i Kauflanda i powie Ci gdzie możesz oszczędzić na Twoich zakupach.',
                  "AI will search the internet, Biedronka, Lidl and Kaufland's leaflets and tell you where you can save on your purchases.",
                )}
              </p>
            </div>
            <div className="flex flex-wrap gap-2 justify-center">
              {['Biedronka', 'Lidl', 'Kaufland', 'Auchan'].map((s, i) => (
                <motion.span
                  key={s}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 + i * 0.07 }}
                  className="text-xs px-3 py-1 rounded-full border bg-background"
                >
                  <span className={`inline-block w-2 h-2 rounded-full mr-1.5 ${getStoreColor(s)}`} />
                  {s}
                </motion.span>
              ))}
            </div>
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
            >
              <Button onClick={generateAudit} size="lg">
                <Sparkles className="h-4 w-4 mr-2" />
                {t('Wygeneruj audyt AI', 'Generate AI audit')}
              </Button>
            </motion.div>
            {/* Feature hints */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6 }}
              className="grid sm:grid-cols-3 gap-3 max-w-lg mt-2"
            >
              {[
                { icon: TrendingDown, label: t('Porównanie cen', 'Price comparison') },
                { icon: Tag, label: t('Aktualne promocje', 'Live promotions') },
                { icon: PiggyBank, label: t('Możliwe oszczędności', 'Savings potential') },
              ].map(({ icon: Icon, label }) => (
                <div key={label} className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/40 rounded-lg px-3 py-2">
                  <Icon className="h-3.5 w-3.5 text-primary shrink-0" />
                  {label}
                </div>
              ))}
            </motion.div>
          </motion.div>
        )}

        {/* ── Loading skeleton ── */}
        {loading && <AuditSkeleton key="loading" isPolish={isPolish} />}

        {/* ── Error state ── */}
        {error && !loading && (
          <motion.div key="error" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <Card className="border-destructive/30 bg-destructive/5">
              <CardContent className="flex items-center gap-3 pt-6 pb-6">
                <AlertCircle className="h-5 w-5 text-destructive shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-destructive">
                    {t('Nie udało się wygenerować audytu', 'Failed to generate audit')}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">{error}</p>
                </div>
                <Button size="sm" variant="outline" onClick={generateAudit} className="shrink-0">
                  <RefreshCcw className="h-3.5 w-3.5 mr-1.5" />
                  {t('Spróbuj ponownie', 'Retry')}
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Audit results */}
      {audit && !loading && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col gap-6">
          {/* Web search badge */}
          {audit.webSearchUsed && (
            <motion.div custom={0} initial="hidden" animate="show" variants={fadeUp}
              className="flex items-center gap-2 text-xs text-emerald-600 bg-emerald-500/10 border border-emerald-500/20 px-3 py-2 rounded-lg w-fit">
              <Globe className="h-3.5 w-3.5" />
              {t('Dane z internetu i aktualnych gazetek', 'Data sourced from internet and current promotional leaflets')}
            </motion.div>
          )}

          {/* KPI row */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              {
                icon: ShoppingCart,
                label: t('Wydano łącznie', 'Total spent'),
                value: `${n(audit.totalSpent).toFixed(2)} ${audit.currency}`,
                sub: `${audit.transactionCount} ${t('transakcji', 'transactions')}`,
                color: 'text-foreground',
              },
              {
                icon: PiggyBank,
                label: t('Możliwe oszczędności', 'Potential savings'),
                value: `${n(audit.totalPotentialSaving).toFixed(2)} ${audit.currency}`,
                sub: t('gdybyś kupił taniej', 'if you shopped smarter'),
                color: audit.totalPotentialSaving > 0 ? 'text-emerald-600' : 'text-foreground',
              },
              {
                icon: Store,
                label: t('Najtańszy sklep', 'Cheapest store'),
                value: audit.bestStore || '—',
                sub: t('dla Twoich produktów', 'for your products'),
                color: 'text-primary',
              },
              {
                icon: Tag,
                label: t('Promocje znalezione', 'Promotions found'),
                value: String(audit.currentPromotions.length),
                sub: t('aktywne oferty', 'active offers'),
                color: 'text-amber-600',
              },
            ].map((kpi, i) => (
              <motion.div key={i} custom={i + 1} initial="hidden" animate="show" variants={fadeUp}>
                <Card className="h-full hover:shadow-md transition-shadow">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                      <kpi.icon className="h-3.5 w-3.5" />
                      {kpi.label}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className={`text-xl font-bold truncate ${kpi.color}`}>{kpi.value}</div>
                    <p className="text-xs text-muted-foreground mt-0.5">{kpi.sub}</p>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>

          {/* AI Summary */}
          <motion.div custom={5} initial="hidden" animate="show" variants={fadeUp}>
            <Card className="border-primary/20 bg-gradient-to-r from-primary/5 to-violet-500/5">
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Sparkles className="h-5 w-5 text-primary" />
                    {t('Twój personalny audyt', 'Your personal audit')}
                  </CardTitle>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copy(buildAuditText(audit, isPolish))}
                    className="text-xs h-8 gap-1.5 text-muted-foreground hover:text-foreground shrink-0"
                    title={t('Kopiuj do schowka', 'Copy to clipboard')}
                  >
                    {copied
                      ? <><Check className="h-3.5 w-3.5 text-emerald-500" />{t('Skopiowano!', 'Copied!')}</>
                      : <><Copy className="h-3.5 w-3.5" />{t('Kopiuj', 'Copy')}</>
                    }
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm leading-relaxed">{audit.aiSummary}</p>
                {audit.personalMessage && (
                  <p className="text-sm text-muted-foreground border-t pt-3">{audit.personalMessage}</p>
                )}
                {audit.topTip && (
                  <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 mt-2">
                    <Lightbulb className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                    <p className="text-xs">{audit.topTip}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>

          {/* Price comparisons */}
          {audit.priceComparisons.length > 0 && (
            <motion.div custom={6} initial="hidden" animate="show" variants={fadeUp}>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingDown className="h-5 w-5 text-primary" />
                    {t('Porównanie cen', 'Price comparisons')}
                  </CardTitle>
                  <CardDescription>
                    {t('Ile zapłaciłeś vs aktualne ceny w sklepach', 'What you paid vs current store prices')}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {audit.priceComparisons.map((pc, i) => {
                    const allPrices = Object.values(pc.prices || {}).map(p => n(p)).filter(p => p > 0)
                    const maxP = Math.max(n(pc.pricePaid), ...allPrices)
                    return (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.08 }}
                        className="space-y-2"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium text-sm truncate max-w-[200px]">{pc.product}</span>
                          <div className="flex items-center gap-2 shrink-0">
                            <VerdictBadge verdict={pc.verdict} isPolish={isPolish} />
                            {n(pc.potentialSaving) > 0 && (
                              <span className="text-xs font-semibold text-emerald-600">
                                -{n(pc.potentialSaving).toFixed(2)} {audit.currency}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          <PriceBar store={t('Ty zapłaciłeś', 'You paid')} price={pc.pricePaid} maxPrice={maxP} currency={audit.currency} />
                          {Object.entries(pc.prices || {}).filter(([, p]) => n(p) > 0).map(([store, price]) => (
                            <PriceBar key={store} store={store} price={price} maxPrice={maxP} currency={audit.currency} />
                          ))}
                        </div>
                        {pc.cheapestStore && n(pc.cheapestPrice) < n(pc.pricePaid) && (
                          <p className="text-xs text-muted-foreground flex items-center gap-1">
                            <ArrowRight className="h-3 w-3" />
                            {t(`Najtaniej w ${pc.cheapestStore}: ${n(pc.cheapestPrice).toFixed(2)} ${audit.currency}`,
                              `Cheapest at ${pc.cheapestStore}: ${n(pc.cheapestPrice).toFixed(2)} ${audit.currency}`)}
                          </p>
                        )}
                      </motion.div>
                    )
                  })}
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* Current promotions */}
          {audit.currentPromotions.length > 0 && (
            <motion.div custom={7} initial="hidden" animate="show" variants={fadeUp}>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Zap className="h-5 w-5 text-amber-500" />
                    {t('Aktualne promocje', 'Current promotions')}
                    <Badge className="ml-1 bg-amber-500/10 text-amber-600 border-amber-500/20">
                      {t('Ten tydzień', 'This week')}
                    </Badge>
                  </CardTitle>
                  <CardDescription>
                    {t('Produkty z Twoich zakupów dostępne taniej teraz', 'Products from your shopping available cheaper now')}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid sm:grid-cols-2 gap-3">
                    {audit.currentPromotions.map((promo, i) => (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: i * 0.08 }}
                        className="flex items-start gap-3 p-3 rounded-xl border border-amber-500/20 bg-amber-500/5 hover:bg-amber-500/10 transition-colors"
                      >
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/20">
                          <Tag className="h-4 w-4 text-amber-600" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-sm truncate">{promo.product}</p>
                          <p className="text-xs text-muted-foreground">{promo.store} · {promo.validUntil}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs line-through text-muted-foreground">{n(promo.originalPrice).toFixed(2)} {audit.currency}</span>
                            <span className="text-sm font-bold text-amber-600">{n(promo.promoPrice).toFixed(2)} {audit.currency}</span>
                            <span className="text-xs bg-emerald-500/10 text-emerald-600 px-1.5 py-0.5 rounded-full">
                              -{n(promo.saving).toFixed(2)} {audit.currency}
                            </span>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* Store breakdown */}
          {audit.topStores.length > 0 && (
            <motion.div custom={8} initial="hidden" animate="show" variants={fadeUp}>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Store className="h-5 w-5" />
                    {t('Twoje sklepy', 'Your stores')}
                  </CardTitle>
                  <CardDescription>{t('Gdzie wydajesz najwięcej', 'Where you spend the most')}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {audit.topStores.map((s, i) => {
                    const maxAmt = audit.topStores[0].amount
                    const pct = (s.amount / maxAmt) * 100
                    return (
                      <div key={i} className="flex items-center gap-3 text-sm">
                        <span className="w-24 truncate text-muted-foreground">{s.store}</span>
                        <div className="flex-1 bg-muted rounded-full h-2 overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${pct}%` }}
                            transition={{ duration: 0.8, delay: i * 0.1, ease: 'easeOut' }}
                            className={`h-2 rounded-full ${getStoreColor(s.store)}`}
                          />
                        </div>
                        <span className="w-28 text-right font-medium">{n(s.amount).toFixed(2)} {audit.currency}</span>
                      </div>
                    )
                  })}
                  {audit.bestStore && (
                    <div className="flex items-center gap-2 mt-2 pt-3 border-t text-xs text-emerald-600">
                      <CheckCircle2 className="h-4 w-4 shrink-0" />
                      {t(`Najtańszy dla Twoich produktów: ${audit.bestStore}`,
                        `Cheapest for your products overall: ${audit.bestStore}`)}
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* Category breakdown */}
          {Object.keys(audit.categoryBreakdown).length > 0 && (
            <motion.div custom={9} initial="hidden" animate="show" variants={fadeUp}>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5" />
                    {t('Wydatki per kategoria', 'Spending by category')}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2.5">
                  {Object.entries(audit.categoryBreakdown)
                    .sort((a, b) => b[1] - a[1])
                    .map(([cat, amt], i) => {
                      const max = Math.max(...Object.values(audit.categoryBreakdown))
                      return (
                        <div key={i} className="flex items-center gap-3 text-sm">
                          <span className="w-32 truncate text-muted-foreground">{cat}</span>
                          <div className="flex-1 bg-muted rounded-full h-2 overflow-hidden">
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${(amt / max) * 100}%` }}
                              transition={{ duration: 0.7, delay: i * 0.06 }}
                              className="h-2 bg-primary rounded-full"
                            />
                          </div>
                          <span className="w-28 text-right font-medium">{n(amt).toFixed(2)} {audit.currency}</span>
                        </div>
                      )
                    })}
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* Refresh button */}
          <motion.div custom={10} initial="hidden" animate="show" variants={fadeUp} className="flex justify-center pb-4">
            <Button variant="outline" onClick={generateAudit} disabled={loading}>
              <RefreshCcw className="h-4 w-4 mr-2" />
              {t('Odśwież audyt', 'Refresh audit')}
            </Button>
          </motion.div>
        </motion.div>
      )}
    </div>
  )
}
