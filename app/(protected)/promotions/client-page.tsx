'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTranslation } from '@/lib/i18n'
import { useProductType } from '@/hooks/use-product-type'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Tag, Sparkles, AlertCircle, RefreshCw, Loader2,
  PiggyBank, ShoppingCart,
  ArrowUpDown, Store, Info,
} from 'lucide-react'
import { toast } from 'sonner'
import { PromotionCard, type PromotionData } from '@/components/protected/personal/promotion-card'
import { WeeklySummaryCard, type WeeklySummaryData } from '@/components/protected/personal/weekly-summary-card'

/* ─── Store filter chips ─── */
const ALL_STORES = ['Biedronka', 'Lidl', 'Żabka', 'Kaufland', 'Aldi', 'Auchan', 'Carrefour', 'Rossmann'] as const

const STORE_CHIP_STYLES: Record<string, { bg: string; activeBg: string; text: string }> = {
  Biedronka: { bg: 'bg-red-500/10', activeBg: 'bg-red-500/25', text: 'text-red-700 dark:text-red-400' },
  Lidl: { bg: 'bg-yellow-500/10', activeBg: 'bg-yellow-500/25', text: 'text-yellow-700 dark:text-yellow-400' },
  Żabka: { bg: 'bg-green-500/10', activeBg: 'bg-green-500/25', text: 'text-green-700 dark:text-green-400' },
  Kaufland: { bg: 'bg-red-700/10', activeBg: 'bg-red-700/25', text: 'text-red-800 dark:text-red-300' },
  Aldi: { bg: 'bg-blue-500/10', activeBg: 'bg-blue-500/25', text: 'text-blue-700 dark:text-blue-400' },
  Auchan: { bg: 'bg-red-500/10', activeBg: 'bg-red-500/25', text: 'text-red-700 dark:text-red-400' },
  Carrefour: { bg: 'bg-blue-600/10', activeBg: 'bg-blue-600/25', text: 'text-blue-800 dark:text-blue-300' },
  Rossmann: { bg: 'bg-rose-500/10', activeBg: 'bg-rose-500/25', text: 'text-rose-700 dark:text-rose-400' },
}

type SortType = 'savings_amount' | 'savings_percent' | 'expiry'

/* ─── Loading messages ─── */
const LOADING_PL = [
  'Szukam promocji w Biedronce...',
  'Sprawdzam gazetkę Lidla...',
  'Przeglądam oferty Żabki...',
  'Analizuję gazetkę Kauflanda...',
  'Sprawdzam Aldi...',
  'Szukam najlepszych ofert...',
  'Porównuję z Twoimi zakupami...',
]
const LOADING_EN = [
  'Searching Biedronka promotions...',
  'Checking Lidl flyer...',
  'Browsing Żabka deals...',
  'Analyzing Kaufland flyer...',
  'Checking Aldi...',
  'Finding best offers...',
  'Matching with your purchases...',
]

/* ─── Loading Skeleton ─── */
function PromotionsSkeleton({ isPolish }: { isPolish: boolean }) {
  const messages = isPolish ? LOADING_PL : LOADING_EN
  const [msgIndex, setMsgIndex] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => setMsgIndex(i => (i + 1) % messages.length), 2200)
    return () => clearInterval(interval)
  }, [messages.length])

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col gap-6">
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
          <div className="flex-1 min-w-0">
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
            {ALL_STORES.slice(0, 4).map((s, i) => (
              <motion.div
                key={s}
                animate={{ opacity: [0.3, 1, 0.3] }}
                transition={{ duration: 1.8, repeat: Infinity, delay: i * 0.4 }}
              >
                <Badge variant="outline" className="text-[10px]">{s}</Badge>
              </motion.div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Card skeletons */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Card key={i} className="overflow-hidden">
            <CardContent className="p-4 space-y-3">
              <div className="h-4 w-32 rounded bg-muted animate-pulse" style={{ animationDelay: `${i * 60}ms` }} />
              <div className="h-3 w-16 rounded bg-muted/60 animate-pulse" />
              <div className="flex items-end gap-3">
                <div className="h-7 w-20 rounded bg-muted animate-pulse" />
                <div className="h-4 w-16 rounded bg-muted/50 animate-pulse" />
              </div>
              <div className="h-px bg-muted" />
              <div className="flex justify-between">
                <div className="h-4 w-16 rounded bg-muted animate-pulse" />
                <div className="h-3 w-12 rounded bg-muted/60 animate-pulse" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </motion.div>
  )
}

/* ─── Page ─── */
export default function PromotionsPage() {
  const { t, lang, mounted } = useTranslation()
  const { isBusiness } = useProductType()
  const router = useRouter()
  const isPolish = lang === 'pl'

  const [scanning, setScanning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [promotions, setPromotions] = useState<PromotionData[]>([])
  const [weeklySummary, setWeeklySummary] = useState<WeeklySummaryData | null>(null)
  const [personalizedDeals, setPersonalizedDeals] = useState<PromotionData[]>([])
  const [currency, setCurrency] = useState('PLN')

  // Filters
  const [storeFilter, setStoreFilter] = useState<string | null>(null)
  const [sortBy, setSortBy] = useState<SortType>('savings_percent')
  const [totalPotentialSavings, setTotalPotentialSavings] = useState(0)

  // Redirect business users
  useEffect(() => {
    if (mounted && isBusiness) {
      router.replace('/dashboard')
    }
  }, [mounted, isBusiness, router])

  // Fetch settings
  useEffect(() => {
    fetch('/api/data/settings')
      .then(r => r.json())
      .then(d => { if (d?.settings?.currency) setCurrency(d.settings.currency.toUpperCase()) })
      .catch((err) => console.error('Failed to fetch settings:', err))
  }, [])

  const scanPromotions = useCallback(async () => {
    setScanning(true)
    setError(null)
    try {
      const res = await fetch('/api/personal/promotions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lang, currency }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.error || `HTTP ${res.status}`)
      }
      const data = await res.json()
      setPromotions(data.promotions || [])
      setPersonalizedDeals(data.personalizedDeals || [])
      setTotalPotentialSavings(data.totalPotentialSavings || 0)
      if (data.weeklySummary) setWeeklySummary(data.weeklySummary)
      toast.success(t('promotions.updated'))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      toast.error(t('promotions.fetchFailed'))
    } finally {
      setScanning(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang, currency, isPolish])

  if (!mounted) return null
  if (isBusiness) return null

  const fadeUp = {
    hidden: { opacity: 0, y: 20 },
    show: (i: number) => ({
      opacity: 1, y: 0,
      transition: { duration: 0.45, delay: i * 0.07, ease: [0.22, 1, 0.36, 1] as const },
    }),
  }

  // Apply filters and sort
  const filteredPromotions = promotions
    .filter(p => !storeFilter || p.store === storeFilter)
    .sort((a, b) => {
      if (sortBy === 'savings_amount') {
        const savA = (a.regularPrice || 0) - a.promoPrice
        const savB = (b.regularPrice || 0) - b.promoPrice
        return savB - savA
      }
      if (sortBy === 'savings_percent') {
        const pctA = a.regularPrice ? ((a.regularPrice - a.promoPrice) / a.regularPrice) * 100 : 0
        const pctB = b.regularPrice ? ((b.regularPrice - b.promoPrice) / b.regularPrice) * 100 : 0
        return pctB - pctA
      }
      // expiry
      if (!a.validUntil) return 1
      if (!b.validUntil) return -1
      return new Date(a.validUntil).getTime() - new Date(b.validUntil).getTime()
    })

  // Group by store
  const groupedByStore = filteredPromotions.reduce<Record<string, PromotionData[]>>((acc, p) => {
    if (!acc[p.store]) acc[p.store] = []
    acc[p.store].push(p)
    return acc
  }, {})

  const locale = isPolish ? 'pl-PL' : 'en-US'
  const formatPrice = (price: number) =>
    new Intl.NumberFormat(locale, { style: 'currency', currency, minimumFractionDigits: 2 }).format(price)

  return (
    <div className="flex flex-col gap-6">
      {/* ── Header ── */}
      <motion.div custom={0} initial="hidden" animate="show" variants={fadeUp} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight flex items-center gap-2">
            <Tag className="h-7 w-7 text-primary" />
            <span suppressHydrationWarning>{t('promotions.title')}</span>
          </h1>
          <p className="text-muted-foreground text-sm mt-1 max-w-xl" suppressHydrationWarning>
            {t('promotions.subtitle')}
          </p>
        </div>
        <Button onClick={scanPromotions} disabled={scanning} className="gap-2 shrink-0">
          {scanning ? (
            <><Loader2 className="h-4 w-4 animate-spin" /><span suppressHydrationWarning>{t('promotions.scanning')}</span></>
          ) : promotions.length > 0 ? (
            <><RefreshCw className="h-4 w-4" /><span suppressHydrationWarning>{t('promotions.refresh')}</span></>
          ) : (
            <><Sparkles className="h-4 w-4" /><span suppressHydrationWarning>{t('promotions.scanButton')}</span></>
          )}
        </Button>
      </motion.div>

      <AnimatePresence mode="wait">
        {/* ── Scanning state ── */}
        {scanning && <PromotionsSkeleton key="scanning" isPolish={isPolish} />}

        {/* ── Error state ── */}
        {error && !scanning && (
          <motion.div key="error" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <Card className="border-destructive/30 bg-destructive/5">
              <CardContent className="flex items-center gap-3 pt-6 pb-6">
                <AlertCircle className="h-5 w-5 text-destructive shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-destructive" suppressHydrationWarning>
                    {t('promotions.errorTitle')}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5 break-all">{error}</p>
                </div>
                <Button size="sm" variant="outline" onClick={scanPromotions} className="shrink-0">
                  <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                  <span suppressHydrationWarning>{t('dashboard.tryAgain')}</span>
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* ── Empty / Ready State ── */}
        {!scanning && !error && promotions.length === 0 && (
          <motion.div
            key="empty"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center justify-center py-20 gap-6 text-center"
          >
            <div className="relative">
              <div className="h-24 w-24 rounded-full bg-primary/10 flex items-center justify-center">
                <Tag className="h-12 w-12 text-primary" />
              </div>
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 10, repeat: Infinity, ease: 'linear' }}
                className="absolute inset-0 rounded-full border-2 border-dashed border-primary/30"
              />
            </div>
            <div className="space-y-2 max-w-sm">
              <h2 className="text-xl font-bold" suppressHydrationWarning>{t('promotions.emptyTitle')}</h2>
              <p className="text-muted-foreground text-sm" suppressHydrationWarning>{t('promotions.emptyDesc')}</p>
            </div>

            {/* Store badges */}
            <div className="flex flex-wrap gap-2 justify-center">
              {ALL_STORES.map((s, i) => {
                const style = STORE_CHIP_STYLES[s] || { bg: 'bg-muted', text: 'text-muted-foreground' }
                return (
                  <motion.div
                    key={s}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 + i * 0.05 }}
                  >
                    <Badge variant="outline" className={`${style.bg} ${style.text} border-0 text-xs`}>{s}</Badge>
                  </motion.div>
                )
              })}
            </div>

            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
            >
              <Button onClick={scanPromotions} size="lg" className="gap-2">
                <Sparkles className="h-4 w-4" />
                <span suppressHydrationWarning>{t('promotions.scanButton')}</span>
              </Button>
            </motion.div>

            {/* Feature hints */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.65 }}
              className="grid sm:grid-cols-3 gap-3 max-w-lg"
            >
              {[
                { icon: Tag, labelKey: 'promotions.featureDeals' },
                { icon: ShoppingCart, labelKey: 'promotions.featurePersonal' },
                { icon: PiggyBank, labelKey: 'promotions.featureSavings' },
              ].map(({ icon: Icon, labelKey }) => (
                <div key={labelKey} className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/40 rounded-lg px-3 py-2">
                  <Icon className="h-3.5 w-3.5 text-primary shrink-0" />
                  <span suppressHydrationWarning>{t(labelKey)}</span>
                </div>
              ))}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Results ── */}
      {!scanning && promotions.length > 0 && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col gap-6">
          {/* AI disclaimer */}
          <div className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 px-3 py-2 rounded-lg">
            <Info className="h-3.5 w-3.5 shrink-0" />
            <span suppressHydrationWarning>{t('promotions.aiDisclaimer')}</span>
          </div>

          {/* Weekly Summary */}
          {weeklySummary && <WeeklySummaryCard summary={weeklySummary} currency={currency} />}

          {/* KPI Stats */}
          <motion.div custom={1} initial="hidden" animate="show" variants={fadeUp}>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                {
                  icon: PiggyBank,
                  label: t('promotions.totalSavings'),
                  value: formatPrice(totalPotentialSavings),
                  color: 'text-emerald-600 dark:text-emerald-400',
                  sub: t('promotions.potentialSavings'),
                },
                {
                  icon: Tag,
                  label: t('promotions.activeDeals'),
                  value: promotions.length.toString(),
                  sub: t('promotions.acrossStores'),
                },
                {
                  icon: ShoppingCart,
                  label: t('promotions.personalDeals'),
                  value: personalizedDeals.length.toString(),
                  color: 'text-primary',
                  sub: t('promotions.matchYourHistory'),
                },
                {
                  icon: Store,
                  label: t('promotions.storesScanned'),
                  value: new Set(promotions.map(p => p.store)).size.toString(),
                  sub: t('promotions.storesChecked'),
                },
              ].map((kpi, i) => (
                <Card key={i} className="hover:shadow-md transition-shadow">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                      <kpi.icon className="h-3.5 w-3.5" />
                      <span suppressHydrationWarning>{kpi.label}</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className={`text-xl font-bold ${kpi.color || ''}`}>{kpi.value}</div>
                    <p className="text-xs text-muted-foreground mt-0.5" suppressHydrationWarning>{kpi.sub}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </motion.div>

          {/* Personalized deals section */}
          {personalizedDeals.length > 0 && (
            <motion.div custom={2} initial="hidden" animate="show" variants={fadeUp}>
              <Card className="border-primary/20 bg-gradient-to-r from-primary/5 to-emerald-500/5">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Sparkles className="h-5 w-5 text-primary" />
                    <span suppressHydrationWarning>{t('promotions.personalizedTitle')}</span>
                  </CardTitle>
                  <CardDescription suppressHydrationWarning>
                    {t('promotions.personalizedDesc')}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {personalizedDeals.slice(0, 6).map((promo, i) => (
                      <PromotionCard key={promo.id} promo={promo} index={i} currency={currency} />
                    ))}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* Filters */}
          <motion.div custom={3} initial="hidden" animate="show" variants={fadeUp} className="flex flex-wrap items-center gap-2">
            {/* Store filter chips */}
            <Button
              variant={storeFilter === null ? 'default' : 'ghost'}
              size="sm"
              className="h-8 text-xs"
              onClick={() => setStoreFilter(null)}
              suppressHydrationWarning
            >
              {t('promotions.allStores')}
            </Button>
            {ALL_STORES.filter(s => promotions.some(p => p.store === s)).map(store => {
              const style = STORE_CHIP_STYLES[store]
              const isActive = storeFilter === store
              return (
                <Button
                  key={store}
                  variant="ghost"
                  size="sm"
                  className={`h-8 text-xs ${isActive ? style?.activeBg : style?.bg} ${style?.text}`}
                  onClick={() => setStoreFilter(isActive ? null : store)}
                >
                  {store}
                  <Badge variant="secondary" className="ml-1 text-[9px] px-1 py-0">
                    {promotions.filter(p => p.store === store).length}
                  </Badge>
                </Button>
              )
            })}

            {/* Sort */}
            <div className="ml-auto flex items-center gap-1 flex-wrap">
              <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />
              {([
                { key: 'savings_percent' as SortType, label: t('promotions.sortPercent') },
                { key: 'savings_amount' as SortType, label: t('promotions.sortAmount') },
                { key: 'expiry' as SortType, label: t('promotions.sortExpiry') },
              ]).map(({ key, label }) => (
                <Button
                  key={key}
                  variant={sortBy === key ? 'secondary' : 'ghost'}
                  size="sm"
                  className="h-7 text-[10px]"
                  onClick={() => setSortBy(key)}
                  suppressHydrationWarning
                >
                  {label}
                </Button>
              ))}
            </div>
          </motion.div>

          {/* Promotions grouped by store */}
          {Object.entries(groupedByStore).map(([storeName, storePromos], groupIdx) => {
            const style = STORE_CHIP_STYLES[storeName]
            return (
              <motion.div
                key={storeName}
                custom={4 + groupIdx}
                initial="hidden"
                animate="show"
                variants={fadeUp}
              >
                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={`${style?.bg || 'bg-muted'} ${style?.text || ''} border-0 text-xs font-semibold`}>
                        {storeName}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {storePromos.length} {isPolish ? 'ofert' : 'deals'}
                      </span>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                      {storePromos.map((promo, i) => (
                        <PromotionCard key={promo.id} promo={promo} index={i} currency={currency} />
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )
          })}

          {/* Bottom refresh */}
          <motion.div custom={10} initial="hidden" animate="show" variants={fadeUp} className="flex justify-center pb-4">
            <Button variant="outline" onClick={scanPromotions} disabled={scanning} className="gap-2">
              <RefreshCw className="h-4 w-4" />
              <span suppressHydrationWarning>{t('promotions.refresh')}</span>
            </Button>
          </motion.div>
        </motion.div>
      )}
    </div>
  )
}
