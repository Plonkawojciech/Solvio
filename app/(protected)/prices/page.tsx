'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTranslation } from '@/lib/i18n'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import Link from 'next/link'
import {
  Tag,
  TrendingDown,
  Loader2,
  RefreshCcw,
  Sparkles,
  AlertCircle,
  CheckCircle2,
  Clock,
  ShoppingBag,
  PiggyBank,
  Store,
  ArrowRight,
  Lightbulb,
  Zap,
  Receipt,
} from 'lucide-react'

/* ─── Types ─── */
interface StorePrice {
  store: string
  price: number
  promotion?: string
  validUntil?: string
}

interface PriceComparison {
  productName: string
  userLastPrice: number
  userLastStore: string
  bestPrice: number
  bestStore: string
  bestDeal: string
  allPrices: StorePrice[]
  savingsAmount: number
  savingsPercent: number
  recommendation: string
  buyNow: boolean
}

interface PriceData {
  comparisons: PriceComparison[]
  totalPotentialSavings: number
  summary: string
  bestStoreOverall: string
  tip: string
  productsAnalyzed: number
}

// Safe number helper — handles strings, null, undefined from AI responses
function n(v: unknown): number { return Number(v) || 0 }

/* ─── Store badge colors ─── */
const STORE_STYLES: Record<string, { bg: string; text: string }> = {
  Lidl:      { bg: 'bg-yellow-400/20', text: 'text-yellow-700 dark:text-yellow-400' },
  Biedronka: { bg: 'bg-red-500/15',    text: 'text-red-700 dark:text-red-400' },
  Żabka:     { bg: 'bg-green-500/15',  text: 'text-green-700 dark:text-green-400' },
  Aldi:      { bg: 'bg-blue-500/15',   text: 'text-blue-700 dark:text-blue-400' },
  Kaufland:  { bg: 'bg-red-700/15',    text: 'text-red-800 dark:text-red-300' },
  Carrefour: { bg: 'bg-blue-600/15',   text: 'text-blue-800 dark:text-blue-300' },
  Rossmann:  { bg: 'bg-red-400/15',    text: 'text-red-600 dark:text-red-400' },
}

function StoreBadge({ store, size = 'sm' }: { store: string; size?: 'xs' | 'sm' }) {
  const style = STORE_STYLES[store] || { bg: 'bg-muted', text: 'text-muted-foreground' }
  return (
    <span className={`inline-flex items-center rounded-full font-semibold ${style.bg} ${style.text} ${size === 'xs' ? 'text-[10px] px-1.5 py-0' : 'text-xs px-2 py-0.5'}`}>
      {store}
    </span>
  )
}

/* ─── Count-up animation ─── */
function CountUp({ target, currency, duration = 1500 }: { target: number; currency: string; duration?: number }) {
  const [value, setValue] = useState(0)
  const frameRef = useRef<number | null>(null)

  useEffect(() => {
    const start = performance.now()
    const animate = (now: number) => {
      const elapsed = now - start
      const progress = Math.min(elapsed / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setValue(target * eased)
      if (progress < 1) frameRef.current = requestAnimationFrame(animate)
    }
    frameRef.current = requestAnimationFrame(animate)
    return () => { if (frameRef.current) cancelAnimationFrame(frameRef.current) }
  }, [target, duration])

  return <>{value.toFixed(2)} {currency}</>
}

/* ─── Loading messages ─── */
const LOADING_MESSAGES_PL = [
  'Przeszukuję Lidl…',
  'Sprawdzam Biedronkę…',
  'Sprawdzam Żabkę…',
  'Sprawdzam Aldi…',
  'Sprawdzam Kaufland…',
  'Analizuję oferty…',
  'Obliczam oszczędności…',
]
const LOADING_MESSAGES_EN = [
  'Searching Lidl…',
  'Checking Biedronka…',
  'Checking Żabka…',
  'Checking Aldi…',
  'Checking Kaufland…',
  'Analyzing deals…',
  'Calculating savings…',
]

function LoadingSkeleton({ isPolish }: { isPolish: boolean }) {
  const messages = isPolish ? LOADING_MESSAGES_PL : LOADING_MESSAGES_EN
  const [msgIndex, setMsgIndex] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => {
      setMsgIndex(i => (i + 1) % messages.length)
    }, 2000)
    return () => clearInterval(interval)
  }, [messages.length])

  return (
    <motion.div
      key="skeleton"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex flex-col gap-6"
    >
      {/* Loading banner */}
      <Card className="border-primary/20 bg-gradient-to-r from-primary/5 to-emerald-500/5">
        <CardContent className="p-5 flex items-center gap-4">
          <div className="relative h-10 w-10 shrink-0">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
              className="absolute inset-0 rounded-full border-4 border-primary/20 border-t-primary"
            />
            <div className="absolute inset-0 flex items-center justify-center">
              <Tag className="h-4 w-4 text-primary" />
            </div>
          </div>
          <div className="flex flex-col gap-1 flex-1 min-w-0">
            <AnimatePresence mode="wait">
              <motion.p
                key={msgIndex}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.35 }}
                className="text-sm font-semibold"
              >
                {messages[msgIndex]}
              </motion.p>
            </AnimatePresence>
            <p className="text-xs text-muted-foreground">
              {isPolish ? 'Może to potrwać kilka sekund' : 'This may take a few seconds'}
            </p>
          </div>
          <div className="hidden sm:flex gap-2 shrink-0">
            {['Lidl', 'Biedronka', 'Żabka', 'Aldi'].map((s, i) => (
              <motion.div
                key={s}
                animate={{ opacity: [0.3, 1, 0.3] }}
                transition={{ duration: 1.8, repeat: Infinity, delay: i * 0.4 }}
              >
                <StoreBadge store={s} size="xs" />
              </motion.div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* KPI skeletons */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[0, 1, 2, 3].map(i => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <div className="h-3 w-24 rounded bg-muted animate-pulse" style={{ animationDelay: `${i * 80}ms` }} />
            </CardHeader>
            <CardContent>
              <div className="h-7 w-28 rounded bg-muted animate-pulse mb-1.5" style={{ animationDelay: `${i * 80 + 40}ms` }} />
              <div className="h-3 w-20 rounded bg-muted/60 animate-pulse" style={{ animationDelay: `${i * 80 + 70}ms` }} />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Card skeletons */}
      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
        {[0, 1, 2, 3, 4, 5].map(i => (
          <Card key={i} className="overflow-hidden">
            <CardHeader className="pb-3">
              <div className="h-4 w-32 rounded bg-muted animate-pulse" style={{ animationDelay: `${i * 60}ms` }} />
              <div className="h-3 w-20 rounded bg-muted/60 animate-pulse mt-1.5" style={{ animationDelay: `${i * 60 + 30}ms` }} />
            </CardHeader>
            <CardContent className="space-y-3">
              {[0, 1, 2].map(j => (
                <div key={j} className="flex items-center justify-between">
                  <div className="h-3 w-20 rounded bg-muted/70 animate-pulse" />
                  <div className="h-4 w-16 rounded bg-muted animate-pulse" />
                </div>
              ))}
              <div className="h-px bg-muted rounded" />
              <div className="h-3 w-full rounded bg-muted/50 animate-pulse" />
              <div className="h-3 w-4/5 rounded bg-muted/50 animate-pulse" />
            </CardContent>
          </Card>
        ))}
      </div>
    </motion.div>
  )
}

/* ─── Comparison card ─── */
function ComparisonCard({ item, currency, index, isPolish }: {
  item: PriceComparison
  currency: string
  index: number
  isPolish: boolean
}) {
  const savingsPct = n(item.savingsPercent)
  const hasSavings = n(item.savingsAmount) > 0.01

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.08, ease: [0.22, 1, 0.36, 1] }}
    >
      <Card className="h-full flex flex-col overflow-hidden hover:shadow-md transition-shadow border-border/60">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="text-sm font-bold leading-tight line-clamp-2 flex-1">
              {item.productName}
            </CardTitle>
            {item.buyNow && (
              <Badge className="shrink-0 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/20 text-[10px]">
                <Zap className="h-2.5 w-2.5 mr-1" />
                {isPolish ? 'Kup teraz' : 'Buy now'}
              </Badge>
            )}
          </div>
        </CardHeader>

        <CardContent className="flex flex-col gap-3 flex-1">
          {/* You paid vs best price */}
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg bg-muted/50 px-2.5 py-2">
              <p className="text-[10px] text-muted-foreground mb-0.5">{isPolish ? 'Ty zapłaciłeś' : 'You paid'}</p>
              <p className="text-sm font-semibold">{n(item.userLastPrice).toFixed(2)} {currency}</p>
              {item.userLastStore && (
                <StoreBadge store={item.userLastStore} size="xs" />
              )}
            </div>
            <div className={`rounded-lg px-2.5 py-2 ${hasSavings ? 'bg-emerald-500/10 border border-emerald-500/20' : 'bg-muted/50'}`}>
              <p className="text-[10px] text-muted-foreground mb-0.5">{isPolish ? 'Najlepsza cena' : 'Best price'}</p>
              <p className={`text-sm font-semibold ${hasSavings ? 'text-emerald-700 dark:text-emerald-400' : ''}`}>
                {n(item.bestPrice).toFixed(2)} {currency}
              </p>
              {item.bestStore && <StoreBadge store={item.bestStore} size="xs" />}
            </div>
          </div>

          {/* Savings badge */}
          {hasSavings && (
            <div className="flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-2.5 py-1.5">
              <PiggyBank className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                {isPolish ? 'Oszczędź' : 'Save'} {n(item.savingsAmount).toFixed(2)} {currency}
              </span>
              <span className="ml-auto text-[10px] bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 font-bold px-1.5 py-0.5 rounded-full">
                -{savingsPct.toFixed(0)}%
              </span>
            </div>
          )}

          {/* All prices table */}
          {item.allPrices && item.allPrices.length > 0 && (
            <div className="space-y-1">
              <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">
                {isPolish ? 'Wszystkie ceny' : 'All prices'}
              </p>
              <div className="divide-y divide-border/40 rounded-lg border border-border/40 overflow-hidden">
                {item.allPrices.slice(0, 5).map((sp, i) => (
                  <div key={i} className="flex items-center gap-2 px-2.5 py-1.5 text-xs bg-background/50 hover:bg-muted/30 transition-colors">
                    <StoreBadge store={sp.store} size="xs" />
                    <span className="flex-1 min-w-0">
                      {sp.promotion && (
                        <span className="text-amber-600 dark:text-amber-400 text-[10px] truncate block">
                          {sp.promotion}
                        </span>
                      )}
                      {sp.validUntil && (
                        <span className="text-muted-foreground text-[10px] truncate block">
                          {isPolish ? 'do' : 'until'} {sp.validUntil}
                        </span>
                      )}
                    </span>
                    <span className={`font-semibold shrink-0 ${n(sp.price) === n(item.bestPrice) ? 'text-emerald-600 dark:text-emerald-400' : ''}`}>
                      {n(sp.price).toFixed(2)} {currency}
                    </span>
                    {n(sp.price) === n(item.bestPrice) && (
                      <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0" />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* AI recommendation */}
          {item.recommendation && (
            <div className="flex items-start gap-2 rounded-lg bg-primary/5 border border-primary/10 px-2.5 py-2 mt-auto">
              <Lightbulb className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
              <p className="text-[11px] text-muted-foreground leading-relaxed">{item.recommendation}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  )
}

/* ─── Summary banner ─── */
function SummaryBanner({ data, currency, isPolish }: { data: PriceData; currency: string; isPolish: boolean }) {
  const fadeUp = {
    hidden: { opacity: 0, y: 16 },
    show: (i: number) => ({
      opacity: 1,
      y: 0,
      transition: { duration: 0.4, delay: i * 0.07, ease: [0.22, 1, 0.36, 1] as const },
    }),
  }

  return (
    <div className="flex flex-col gap-4">
      {/* KPI grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          {
            icon: PiggyBank,
            label: isPolish ? 'Łączne możliwe oszczędności' : 'Total potential savings',
            value: <CountUp target={n(data.totalPotentialSavings)} currency={currency} />,
            color: n(data.totalPotentialSavings) > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-foreground',
            sub: isPolish ? 'na Twoich zakupach' : 'on your purchases',
          },
          {
            icon: ShoppingBag,
            label: isPolish ? 'Produktów przeanalizowano' : 'Products analyzed',
            value: <>{data.productsAnalyzed}</>,
            color: 'text-foreground',
            sub: isPolish ? 'z Twoich paragonów' : 'from your receipts',
          },
          {
            icon: Store,
            label: isPolish ? 'Najlepszy sklep ogólnie' : 'Overall best store',
            value: <>{data.bestStoreOverall || '—'}</>,
            color: 'text-primary',
            sub: isPolish ? 'dla Twoich produktów' : 'for your products',
          },
          {
            icon: TrendingDown,
            label: isPolish ? 'Oferty "kup teraz"' : '"Buy now" deals',
            value: <>{data.comparisons.filter(c => c.buyNow).length}</>,
            color: 'text-amber-600 dark:text-amber-400',
            sub: isPolish ? 'aktywne promocje' : 'active promotions',
          },
        ].map((kpi, i) => (
          <motion.div key={i} custom={i} initial="hidden" animate="show" variants={fadeUp}>
            <Card className="h-full hover:shadow-md transition-shadow">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                  <kpi.icon className="h-3.5 w-3.5" />
                  {kpi.label}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className={`text-xl font-bold ${kpi.color}`}>{kpi.value}</div>
                <p className="text-xs text-muted-foreground mt-0.5">{kpi.sub}</p>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* AI summary + tip */}
      <motion.div custom={4} initial="hidden" animate="show" variants={fadeUp}>
        <Card className="border-primary/20 bg-gradient-to-r from-primary/5 to-emerald-500/5">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-5 w-5 text-primary" />
              {isPolish ? 'Podsumowanie AI' : 'AI Summary'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.summary && (
              <p className="text-sm leading-relaxed">{data.summary}</p>
            )}
            {data.tip && (
              <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
                <Lightbulb className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                <p className="text-xs leading-relaxed">{data.tip}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  )
}

/* ─── Page ─── */
export default function PricesPage() {
  const { lang, mounted } = useTranslation()
  const isPolish = lang === 'pl'

  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<PriceData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [currency, setCurrency] = useState('PLN')
  const [lastChecked, setLastChecked] = useState<Date | null>(null)
  const [noReceipts, setNoReceipts] = useState(false)

  // Fetch currency from settings
  useEffect(() => {
    fetch('/api/data/settings')
      .then(r => r.json())
      .then(d => { if (d?.settings?.currency) setCurrency(d.settings.currency.toUpperCase()) })
      .catch(() => {})
  }, [])

  const checkPrices = useCallback(async () => {
    setLoading(true)
    setError(null)
    setNoReceipts(false)
    try {
      const res = await fetch('/api/prices/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lang, currency }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        if (body?.error === 'no_data' || body?.error === 'no_receipts') {
          setNoReceipts(true)
          return
        }
        throw new Error(body?.message || `HTTP ${res.status}`)
      }
      const json = await res.json()
      if (json?.error === 'no_data' || json?.error === 'no_receipts') {
        setNoReceipts(true)
        return
      }
      setData(json)
      setLastChecked(new Date())
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [lang, currency])

  if (!mounted) return null

  const fadeUp = {
    hidden: { opacity: 0, y: 20 },
    show: (i: number) => ({
      opacity: 1, y: 0,
      transition: { duration: 0.45, delay: i * 0.07, ease: [0.22, 1, 0.36, 1] as const },
    }),
  }

  return (
    <div className="flex flex-col gap-6">
      {/* ── Header ── */}
      <motion.div
        custom={0}
        initial="hidden"
        animate="show"
        variants={fadeUp}
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4"
      >
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight flex items-center gap-2">
            <Tag className="h-7 w-7 text-primary" />
            {isPolish ? 'Alerty cenowe' : 'Price Alerts'}
          </h1>
          <p className="text-muted-foreground text-sm mt-1 max-w-xl">
            {isPolish
              ? 'AI analizuje historię zakupów i znajduje lepsze oferty w Lidlu, Biedronce, Żabce, Aldim i innych.'
              : 'AI analyzes your purchase history and finds better deals at Lidl, Biedronka, Żabka, Aldi and more.'}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {data && lastChecked && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {lastChecked.toLocaleTimeString(isPolish ? 'pl-PL' : 'en-US', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <Button onClick={checkPrices} disabled={loading}>
            {loading ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" />{isPolish ? 'Sprawdzam...' : 'Checking...'}</>
            ) : data ? (
              <><RefreshCcw className="h-4 w-4 mr-2" />{isPolish ? 'Odśwież ceny' : 'Refresh prices'}</>
            ) : (
              <><Sparkles className="h-4 w-4 mr-2" />{isPolish ? 'Sprawdź ceny' : 'Check Prices'}</>
            )}
          </Button>
        </div>
      </motion.div>

      <AnimatePresence mode="wait">
        {/* ── Empty / ready state ── */}
        {!data && !loading && !error && !noReceipts && (
          <motion.div
            key="empty"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center justify-center py-20 gap-6 text-center"
          >
            <div className="relative">
              <div className="h-24 w-24 rounded-full bg-primary/10 flex items-center justify-center">
                <TrendingDown className="h-12 w-12 text-primary" />
              </div>
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 10, repeat: Infinity, ease: 'linear' }}
                className="absolute inset-0 rounded-full border-2 border-dashed border-primary/30"
              />
            </div>
            <div className="space-y-2 max-w-sm">
              <h2 className="text-xl font-bold">
                {isPolish ? 'Gotowy na porównanie cen?' : 'Ready to compare prices?'}
              </h2>
              <p className="text-muted-foreground text-sm">
                {isPolish
                  ? 'AI sprawdzi Twoje ostatnie zakupy i znajdzie lepsze ceny w Lidlu, Biedronce, Żabce i innych sklepach.'
                  : "AI will check your recent purchases and find better prices at Lidl, Biedronka, Żabka and other stores."}
              </p>
            </div>
            {/* Store badges */}
            <div className="flex flex-wrap gap-2 justify-center">
              {['Lidl', 'Biedronka', 'Żabka', 'Aldi', 'Kaufland', 'Carrefour', 'Rossmann'].map((s, i) => (
                <motion.div
                  key={s}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 + i * 0.06 }}
                >
                  <StoreBadge store={s} />
                </motion.div>
              ))}
            </div>
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.55 }}
            >
              <Button onClick={checkPrices} size="lg">
                <Sparkles className="h-4 w-4 mr-2" />
                {isPolish ? 'Sprawdź ceny' : 'Check Prices'}
              </Button>
            </motion.div>
            {/* Feature hints */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.7 }}
              className="grid sm:grid-cols-3 gap-3 max-w-lg"
            >
              {[
                { icon: TrendingDown, label: isPolish ? 'Porównanie cen' : 'Price comparison' },
                { icon: Tag,          label: isPolish ? 'Aktualne promocje' : 'Live promotions' },
                { icon: PiggyBank,    label: isPolish ? 'Możliwe oszczędności' : 'Savings potential' },
              ].map(({ icon: Icon, label }) => (
                <div key={label} className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/40 rounded-lg px-3 py-2">
                  <Icon className="h-3.5 w-3.5 text-primary shrink-0" />
                  {label}
                </div>
              ))}
            </motion.div>
          </motion.div>
        )}

        {/* ── No receipts state ── */}
        {noReceipts && !loading && (
          <motion.div
            key="no-receipts"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center justify-center py-20 gap-6 text-center"
          >
            <div className="relative">
              <div className="h-24 w-24 rounded-full bg-muted flex items-center justify-center">
                <Receipt className="h-12 w-12 text-muted-foreground" />
              </div>
              <motion.div
                animate={{ scale: [1, 1.08, 1] }}
                transition={{ duration: 2.5, repeat: Infinity }}
                className="absolute -top-1 -right-1 h-7 w-7 rounded-full bg-amber-500/20 flex items-center justify-center border border-amber-500/30"
              >
                <AlertCircle className="h-4 w-4 text-amber-500" />
              </motion.div>
            </div>
            <div className="space-y-2 max-w-sm">
              <h2 className="text-xl font-bold">{isPolish ? 'Brak paragonów' : 'No receipts yet'}</h2>
              <p className="text-muted-foreground text-sm">
                {isPolish
                  ? 'Najpierw zeskanuj paragony, aby włączyć porównywanie cen.'
                  : 'Scan your receipts first to enable price comparison.'}
              </p>
            </div>
            <Button asChild>
              <Link href="/dashboard">
                <ArrowRight className="h-4 w-4 mr-2" />
                {isPolish ? 'Idź do panelu i zeskanuj paragon' : 'Go to dashboard and scan a receipt'}
              </Link>
            </Button>
          </motion.div>
        )}

        {/* ── Loading skeleton ── */}
        {loading && <LoadingSkeleton key="loading" isPolish={isPolish} />}

        {/* ── Error state ── */}
        {error && !loading && (
          <motion.div
            key="error"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            <Card className="border-destructive/30 bg-destructive/5">
              <CardContent className="flex items-center gap-3 pt-6 pb-6">
                <AlertCircle className="h-5 w-5 text-destructive shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-destructive">
                    {isPolish ? 'Nie udało się pobrać cen' : 'Failed to fetch prices'}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5 break-all">{error}</p>
                </div>
                <Button size="sm" variant="outline" onClick={checkPrices} className="shrink-0">
                  <RefreshCcw className="h-3.5 w-3.5 mr-1.5" />
                  {isPolish ? 'Spróbuj ponownie' : 'Retry'}
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Results ── */}
      {data && !loading && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col gap-6"
        >
          {/* Summary banner */}
          <SummaryBanner data={data} currency={currency} isPolish={isPolish} />

          {/* Comparisons grid */}
          {data.comparisons && data.comparisons.length > 0 && (
            <motion.div custom={5} initial="hidden" animate="show" variants={fadeUp}>
              <Card>
                <CardHeader className="pb-4">
                  <CardTitle className="flex items-center gap-2">
                    <TrendingDown className="h-5 w-5 text-primary" />
                    {isPolish ? 'Porównanie cen' : 'Price Comparisons'}
                  </CardTitle>
                  <CardDescription>
                    {isPolish
                      ? 'Ile zapłaciłeś vs najlepsze dostępne ceny'
                      : 'What you paid vs best available prices'}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {data.comparisons.map((item, i) => (
                      <ComparisonCard
                        key={`${item.productName}-${i}`}
                        item={item}
                        currency={currency}
                        index={i}
                        isPolish={isPolish}
                      />
                    ))}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* Bottom refresh */}
          <motion.div
            custom={6}
            initial="hidden"
            animate="show"
            variants={fadeUp}
            className="flex justify-center pb-4"
          >
            <Button variant="outline" onClick={checkPrices} disabled={loading}>
              <RefreshCcw className="h-4 w-4 mr-2" />
              {isPolish ? 'Odśwież ceny' : 'Refresh prices'}
            </Button>
          </motion.div>
        </motion.div>
      )}
    </div>
  )
}
