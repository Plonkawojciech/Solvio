'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTranslation } from '@/lib/i18n'
import { useProductType } from '@/hooks/use-product-type'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from '@/components/ui/sheet'
import {
  CreditCard, Plus, AlertCircle, RefreshCw, Loader2,
} from 'lucide-react'
import { toast } from 'sonner'
import { LoyaltyCardComponent, STORE_BRANDS, type LoyaltyCardData } from '@/components/protected/personal/loyalty-card'

/* ─── Store list for Add Card ─── */
const STORES = [
  { key: 'biedronka', name: 'Biedronka' },
  { key: 'lidl', name: 'Lidl' },
  { key: 'zabka', name: 'Żabka' },
  { key: 'kaufland', name: 'Kaufland' },
  { key: 'aldi', name: 'Aldi' },
  { key: 'auchan', name: 'Auchan' },
  { key: 'carrefour', name: 'Carrefour' },
  { key: 'rossmann', name: 'Rossmann' },
] as const

/* ─── Skeleton ─── */
function LoyaltySkeleton() {
  return (
    <div className="flex flex-col gap-6 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-7 w-44 rounded bg-muted" />
          <div className="h-4 w-64 rounded bg-muted" />
        </div>
        <div className="h-10 w-32 rounded-md bg-muted" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-xl border bg-card overflow-hidden">
            <div className="h-2 bg-muted" />
            <div className="p-4 space-y-3">
              <div className="flex items-center gap-3">
                <div className="h-11 w-11 rounded-xl bg-muted" />
                <div className="space-y-1.5 flex-1">
                  <div className="h-4 w-20 rounded bg-muted" />
                  <div className="h-3 w-28 rounded bg-muted" />
                </div>
              </div>
              <div className="h-4 w-full rounded bg-muted" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ─── Error State ─── */
function LoyaltyError({ onRetry, t }: { onRetry: () => void; t: (key: string) => string }) {
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
          <h3 className="text-lg font-semibold" suppressHydrationWarning>{t('loyalty.errorTitle')}</h3>
          <p className="text-sm text-muted-foreground" suppressHydrationWarning>{t('loyalty.errorDesc')}</p>
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
function LoyaltyEmpty({ onAdd, t }: { onAdd: () => void; t: (key: string) => string }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex flex-col items-center justify-center py-20 gap-6 text-center"
    >
      <div className="font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
        {'// '}{t('loyalty.emptyTitle')}
      </div>
      <div className="flex h-16 w-16 items-center justify-center rounded-md border-2 border-foreground bg-card text-foreground shadow-[3px_3px_0_hsl(var(--foreground))]">
        <CreditCard className="h-7 w-7" aria-hidden="true" />
      </div>
      <div className="space-y-2 max-w-sm">
        <h2 className="text-xl font-extrabold tracking-tight" suppressHydrationWarning>{t('loyalty.emptyTitle')}</h2>
        <p className="text-muted-foreground text-sm leading-snug" suppressHydrationWarning>{t('loyalty.emptyDesc')}</p>
      </div>

      {/* Store previews */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
        className="flex flex-wrap justify-center gap-2"
      >
        {STORES.map(({ key, name }, i) => {
          const brand = STORE_BRANDS[key]
          return (
            <motion.div
              key={key}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + i * 0.05 }}
            >
              <div className={`h-8 w-8 rounded-lg bg-gradient-to-br ${brand?.gradient || 'from-gray-600 to-gray-800'} flex items-center justify-center shadow-sm`}>
                <span className="text-white text-xs font-bold">{brand?.icon || name[0]}</span>
              </div>
            </motion.div>
          )
        })}
      </motion.div>

      <Button onClick={onAdd} size="lg" className="gap-2">
        <Plus className="h-4 w-4" />
        <span suppressHydrationWarning>{t('loyalty.addCard')}</span>
      </Button>
    </motion.div>
  )
}

/* ─── Page ─── */
export default function LoyaltyPage() {
  const { t, mounted } = useTranslation()
  const { isBusiness } = useProductType()
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [cards, setCards] = useState<LoyaltyCardData[]>([])
  const [sheetOpen, setSheetOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  // Add card form
  const [selectedStore, setSelectedStore] = useState<string | null>(null)
  const [cardNumber, setCardNumber] = useState('')
  const [memberName, setMemberName] = useState('')

  // Redirect business users
  useEffect(() => {
    if (mounted && isBusiness) {
      router.replace('/dashboard')
    }
  }, [mounted, isBusiness, router])

  const fetchCards = useCallback(async (signal?: AbortSignal) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/personal/loyalty', { signal })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setCards(data.cards || [])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      if (err.name === 'AbortError') return
      setError(err.message || 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    fetchCards(controller.signal)
    return () => controller.abort()
  }, [fetchCards])

  const handleAdd = async () => {
    if (!selectedStore || !cardNumber.trim()) {
      toast.error(t('loyalty.fillRequired'))
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/personal/loyalty', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          store: selectedStore,
          cardNumber: cardNumber.trim(),
          memberName: memberName.trim() || null,
        }),
      })
      if (!res.ok) throw new Error('Failed')
      const data = await res.json()
      setCards(prev => [...prev, data.card])
      setSheetOpen(false)
      setSelectedStore(null)
      setCardNumber('')
      setMemberName('')
      toast.success(t('loyalty.cardAdded'))
    } catch {
      toast.error(t('loyalty.addFailed'))
    } finally {
      setSaving(false)
    }
  }

  const handleToggle = async (id: string, active: boolean) => {
    setCards(prev => prev.map(c => c.id === id ? { ...c, isActive: active } : c))
    try {
      await fetch('/api/personal/loyalty', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action: 'toggle', isActive: active }),
      })
    } catch {
      setCards(prev => prev.map(c => c.id === id ? { ...c, isActive: !active } : c))
      toast.error(t('loyalty.toggleFailed'))
    }
  }

  const handleDelete = async (id: string) => {
    const prev = cards
    setCards(c => c.filter(card => card.id !== id))
    try {
      const res = await fetch('/api/personal/loyalty', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      if (!res.ok) throw new Error('Failed')
      toast.success(t('loyalty.cardRemoved'))
    } catch {
      setCards(prev)
      toast.error(t('loyalty.deleteFailed'))
    }
  }

  if (!mounted) return null
  if (isBusiness) return null

  if (loading) return <LoyaltySkeleton />
  if (error) return <LoyaltyError onRetry={() => fetchCards()} t={t} />

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
      <motion.div custom={0} initial="hidden" animate="show" variants={fadeUp} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight flex items-center gap-2">
            <CreditCard className="h-7 w-7 text-primary" />
            <span suppressHydrationWarning>{t('loyalty.title')}</span>
          </h1>
          <p className="text-muted-foreground text-sm mt-1" suppressHydrationWarning>{t('loyalty.subtitle')}</p>
        </div>
        <Button onClick={() => setSheetOpen(true)} className="gap-2 shrink-0">
          <Plus className="h-4 w-4" />
          <span suppressHydrationWarning>{t('loyalty.addCard')}</span>
        </Button>
      </motion.div>

      {/* ── Cards Grid ── */}
      {cards.length === 0 ? (
        <LoyaltyEmpty onAdd={() => setSheetOpen(true)} t={t} />
      ) : (
        <motion.div custom={1} initial="hidden" animate="show" variants={fadeUp}>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            <AnimatePresence>
              {cards.map((card, i) => (
                <LoyaltyCardComponent
                  key={card.id}
                  card={card}
                  index={i}
                  onToggle={handleToggle}
                  onDelete={handleDelete}
                />
              ))}
            </AnimatePresence>
          </div>
        </motion.div>
      )}

      {/* ── Add Card Sheet ── */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md">
          <SheetHeader className="pb-2">
            <SheetTitle className="flex items-center gap-2" suppressHydrationWarning>
              <CreditCard className="h-5 w-5 text-primary" />
              {t('loyalty.addCardTitle')}
            </SheetTitle>
            <SheetDescription suppressHydrationWarning>
              {t('loyalty.addCardDesc')}
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6">
            {/* Store selection */}
            <div className="space-y-2">
              <Label suppressHydrationWarning>{t('loyalty.selectStore')}</Label>
              <div className="grid grid-cols-2 gap-2">
                {STORES.map(({ key, name }) => {
                  const brand = STORE_BRANDS[key]
                  const isSelected = selectedStore === key
                  return (
                    <motion.button
                      key={key}
                      whileTap={{ scale: 0.97 }}
                      onClick={() => setSelectedStore(key)}
                      className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${
                        isSelected
                          ? 'border-primary bg-primary/5 shadow-sm'
                          : 'border-border/60 hover:border-primary/30 hover:bg-muted/50'
                      }`}
                    >
                      <div className={`h-9 w-9 rounded-lg bg-gradient-to-br ${brand?.gradient || 'from-gray-600 to-gray-800'} flex items-center justify-center shrink-0`}>
                        <span className="text-white text-sm font-bold">{brand?.icon || name[0]}</span>
                      </div>
                      <span className="text-sm font-medium">{brand?.text || name}</span>
                    </motion.button>
                  )
                })}
              </div>
            </div>

            {/* Card number */}
            <div className="space-y-2">
              <Label htmlFor="cardNumber" suppressHydrationWarning>{t('loyalty.cardNumber')}</Label>
              <Input
                id="cardNumber"
                placeholder={t('loyalty.cardNumberPlaceholder')}
                value={cardNumber}
                onChange={(e) => setCardNumber(e.target.value)}
              />
            </div>

            {/* Member name */}
            <div className="space-y-2">
              <Label htmlFor="memberName" suppressHydrationWarning>
                {t('loyalty.memberName')}
                <span className="text-muted-foreground text-xs ml-1" suppressHydrationWarning>({t('loyalty.optional')})</span>
              </Label>
              <Input
                id="memberName"
                placeholder={t('loyalty.memberNamePlaceholder')}
                value={memberName}
                onChange={(e) => setMemberName(e.target.value)}
              />
            </div>
          </div>

          {/* Footer */}
          <div className="p-4 border-t">
            <Button
              onClick={handleAdd}
              disabled={saving || !selectedStore || !cardNumber.trim()}
              className="w-full gap-2"
              size="lg"
            >
              {saving ? (
                <><Loader2 className="h-4 w-4 animate-spin" /><span suppressHydrationWarning>{t('common.loading')}</span></>
              ) : (
                <><Plus className="h-4 w-4" /><span suppressHydrationWarning>{t('loyalty.addCard')}</span></>
              )}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}
