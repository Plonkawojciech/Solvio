'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTranslation } from '@/lib/i18n'
import { useProductType } from '@/hooks/use-product-type'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Repeat, CalendarClock, TrendingUp, ListChecks, AlertTriangle,
  Plus, Pencil, Pause, Play, Trash2, ChevronDown, History, Loader2,
} from 'lucide-react'

/* ── Typy ── */

interface PriceEntry {
  id: string
  amount: string
  effectiveFrom: string
}

interface ManagedSub {
  id: string
  name: string
  vendor: string | null
  amount: string
  currency: string
  interval: 'weekly' | 'monthly' | 'quarterly' | 'yearly'
  status: 'active' | 'paused'
  startDate: string | null
  nextDueDate: string | null
  notes: string | null
  emoji: string | null
  priceHistory: PriceEntry[]
}

interface DetectedSub {
  title: string
  vendor: string | null
  categoryName: string
  frequency: 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'annual' | 'irregular'
  occurrences: { date: string; amount: number }[]
  avgAmount: number
  nextExpectedDate: string | null
  confidence: number
  annualCost: number
}

const MONTHLY_FACTOR: Record<ManagedSub['interval'], number> = {
  weekly: 52 / 12,
  monthly: 1,
  quarterly: 1 / 3,
  yearly: 1 / 12,
}

const DETECTED_TO_INTERVAL: Record<DetectedSub['frequency'], ManagedSub['interval']> = {
  weekly: 'weekly',
  biweekly: 'monthly',
  monthly: 'monthly',
  quarterly: 'quarterly',
  annual: 'yearly',
  irregular: 'monthly',
}

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  show: (i: number) => ({
    opacity: 1, y: 0,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    transition: { duration: 0.45, delay: i * 0.07, ease: [0.22, 1, 0.36, 1] as any },
  }),
}

/* ── Dialog dodawania / edycji ── */

interface DialogState {
  open: boolean
  editing: ManagedSub | null
  prefill?: Partial<{ name: string; vendor: string | null; amount: number; interval: ManagedSub['interval'] }>
}

function SubscriptionDialog({
  state, onClose, onSaved, currency, pl,
}: {
  state: DialogState
  onClose: () => void
  onSaved: () => void
  currency: string
  pl: boolean
}) {
  const editing = state.editing
  const [name, setName] = useState('')
  const [emoji, setEmoji] = useState('🔁')
  const [amount, setAmount] = useState('')
  const [interval, setInterval] = useState<ManagedSub['interval']>('monthly')
  const [nextDueDate, setNextDueDate] = useState('')
  const [notes, setNotes] = useState('')
  const [amountChange, setAmountChange] = useState<'price_change' | 'correction'>('price_change')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!state.open) return
    setName(editing?.name ?? state.prefill?.name ?? '')
    setEmoji(editing?.emoji ?? '🔁')
    setAmount(editing ? editing.amount : state.prefill?.amount != null ? String(Math.round(state.prefill.amount * 100) / 100) : '')
    setInterval(editing?.interval ?? state.prefill?.interval ?? 'monthly')
    setNextDueDate(editing?.nextDueDate ?? '')
    setNotes(editing?.notes ?? '')
    setAmountChange('price_change')
  }, [state, editing])

  const amountChanged = editing && Math.abs(parseFloat(amount || '0') - parseFloat(editing.amount)) > 0.004

  async function save() {
    const num = parseFloat(amount.replace(',', '.'))
    if (!name.trim() || !num || num <= 0) {
      toast.error(pl ? 'Podaj nazwę i prawidłową kwotę.' : 'Enter a name and a valid amount.')
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/subscriptions', {
        method: editing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          editing
            ? { id: editing.id, name: name.trim(), emoji, amount: num, interval, nextDueDate: nextDueDate || null, notes: notes || null, amountChange }
            : { name: name.trim(), emoji, amount: num, interval, currency, vendor: state.prefill?.vendor ?? null, nextDueDate: nextDueDate || null, notes: notes || null }
        ),
      })
      if (!res.ok) throw new Error()
      toast.success(editing ? (pl ? 'Zapisano zmiany' : 'Changes saved') : (pl ? 'Subskrypcja dodana' : 'Subscription added'))
      onSaved()
      onClose()
    } catch {
      toast.error(pl ? 'Nie udało się zapisać.' : 'Save failed.')
    } finally {
      setSaving(false)
    }
  }

  const INTERVAL_OPTS: { v: ManagedSub['interval']; pl: string; en: string }[] = [
    { v: 'weekly', pl: 'Co tydzień', en: 'Weekly' },
    { v: 'monthly', pl: 'Co miesiąc', en: 'Monthly' },
    { v: 'quarterly', pl: 'Co kwartał', en: 'Quarterly' },
    { v: 'yearly', pl: 'Co rok', en: 'Yearly' },
  ]

  return (
    <Dialog open={state.open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {editing ? (pl ? 'Edytuj subskrypcję' : 'Edit subscription') : (pl ? 'Dodaj subskrypcję' : 'Add subscription')}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex gap-2">
            <div className="w-16 space-y-1.5">
              <Label>Emoji</Label>
              <Input value={emoji} onChange={(e) => setEmoji(e.target.value)} maxLength={4} className="text-center" />
            </div>
            <div className="flex-1 space-y-1.5">
              <Label>{pl ? 'Nazwa' : 'Name'}</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={pl ? 'np. iCloud, Netflix, siłownia' : 'e.g. iCloud, Netflix, gym'} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label>{pl ? 'Kwota' : 'Amount'} ({currency})</Label>
              <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="25.00" />
            </div>
            <div className="space-y-1.5">
              <Label>{pl ? 'Jak często' : 'How often'}</Label>
              <Select value={interval} onValueChange={(v) => setInterval(v as ManagedSub['interval'])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {INTERVAL_OPTS.map((o) => (
                    <SelectItem key={o.v} value={o.v}>{pl ? o.pl : o.en}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Zmiana kwoty przy edycji: podwyżka (do historii) czy korekta pomyłki */}
          {amountChanged && (
            <div className="rounded-xl border border-border bg-secondary/50 p-3 space-y-2">
              <p className="text-xs font-bold" suppressHydrationWarning>
                {pl ? `Kwota zmienia się z ${editing!.amount} na ${amount}. Co to jest?` : `Amount changes from ${editing!.amount} to ${amount}. What is this?`}
              </p>
              <label className="flex items-start gap-2 text-xs cursor-pointer">
                <input type="radio" checked={amountChange === 'price_change'} onChange={() => setAmountChange('price_change')} className="mt-0.5 accent-[hsl(var(--primary))]" />
                <span>
                  <b>{pl ? 'Zmiana ceny' : 'Price change'}</b> — {pl ? 'zapisz w historii (np. podwyżka iCloud)' : 'record in history (e.g. a price hike)'}
                </span>
              </label>
              <label className="flex items-start gap-2 text-xs cursor-pointer">
                <input type="radio" checked={amountChange === 'correction'} onChange={() => setAmountChange('correction')} className="mt-0.5 accent-[hsl(var(--primary))]" />
                <span>
                  <b>{pl ? 'Korekta pomyłki' : 'Fix a typo'}</b> — {pl ? 'popraw bez śladu w historii (wpisałem 150 zamiast 15)' : 'fix without a history entry (typed 150 instead of 15)'}
                </span>
              </label>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label>{pl ? 'Najbliższa płatność' : 'Next payment'}</Label>
              <Input type="date" value={nextDueDate} onChange={(e) => setNextDueDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>{pl ? 'Notatka' : 'Note'}</Label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={pl ? 'opcjonalna' : 'optional'} />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>{pl ? 'Anuluj' : 'Cancel'}</Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {editing ? (pl ? 'Zapisz' : 'Save') : (pl ? 'Dodaj' : 'Add')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ── Strona ── */

export default function SubscriptionsClient() {
  const { t, lang, mounted } = useTranslation()
  const { isPersonal } = useProductType()
  const router = useRouter()
  const pl = lang === 'pl'

  const [managed, setManaged] = useState<ManagedSub[]>([])
  const [totals, setTotals] = useState({ monthly: 0, yearly: 0 })
  const [detected, setDetected] = useState<DetectedSub[]>([])
  const [loading, setLoading] = useState(true)
  const [currency, setCurrency] = useState('PLN')
  const [dialog, setDialog] = useState<DialogState>({ open: false, editing: null })
  const [expandedHistory, setExpandedHistory] = useState<string | null>(null)

  useEffect(() => {
    if (mounted && !isPersonal) router.push('/dashboard')
  }, [mounted, isPersonal, router])

  useEffect(() => {
    fetch('/api/data/settings')
      .then(r => r.json())
      .then(d => { if (d?.settings?.currency) setCurrency(d.settings.currency.toUpperCase()) })
      .catch(() => {})
  }, [])

  const refresh = useCallback(async () => {
    try {
      const [mRes, dRes] = await Promise.all([
        fetch('/api/subscriptions'),
        fetch('/api/personal/subscriptions'),
      ])
      if (mRes.ok) {
        const m = await mRes.json()
        setManaged(m.subscriptions || [])
        setTotals({ monthly: m.monthlyTotal || 0, yearly: m.yearlyTotal || 0 })
      }
      if (dRes.ok) {
        const d = await dRes.json()
        setDetected(d.subscriptions || [])
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  if (!mounted) return null

  const fmt = (n: number) =>
    n.toLocaleString(pl ? 'pl-PL' : 'en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const fmtDate = (s: string | null) => (s ? new Date(s).toLocaleDateString(pl ? 'pl-PL' : 'en-US') : '—')

  const INTERVAL_LABEL: Record<ManagedSub['interval'], string> = {
    weekly: pl ? 'co tydzień' : 'weekly',
    monthly: pl ? 'co miesiąc' : 'monthly',
    quarterly: pl ? 'co kwartał' : 'quarterly',
    yearly: pl ? 'co rok' : 'yearly',
  }

  async function togglePause(sub: ManagedSub) {
    const next = sub.status === 'active' ? 'paused' : 'active'
    const res = await fetch('/api/subscriptions', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: sub.id, status: next }),
    })
    if (res.ok) {
      toast.success(next === 'paused' ? (pl ? 'Wstrzymano — nie liczy się do sum' : 'Paused — excluded from totals') : (pl ? 'Wznowiono' : 'Resumed'))
      refresh()
    }
  }

  async function remove(sub: ManagedSub) {
    if (!confirm(pl ? `Usunąć „${sub.name}" razem z historią cen? Zwykle lepiej wstrzymać.` : `Delete "${sub.name}" with its price history? Pausing is usually better.`)) return
    const res = await fetch('/api/subscriptions', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: sub.id }),
    })
    if (res.ok) { toast.success(pl ? 'Usunięto' : 'Deleted'); refresh() }
  }

  const activeCount = managed.filter(s => s.status === 'active').length
  const pausedCount = managed.length - activeCount
  const detectedNotAdded = detected.filter(
    d => !managed.some(m => m.name.toLowerCase() === d.title.toLowerCase() || (d.vendor && m.vendor?.toLowerCase() === d.vendor.toLowerCase()))
  )

  const kpis = [
    { icon: CalendarClock, label: pl ? 'Miesięcznie' : 'Monthly', value: `${fmt(totals.monthly)} ${currency}`, color: 'text-primary' },
    { icon: TrendingUp, label: pl ? 'Rocznie' : 'Yearly', value: `${fmt(totals.yearly)} ${currency}`, color: 'text-[#b3402c] dark:text-red-400' },
    { icon: ListChecks, label: pl ? 'Aktywne' : 'Active', value: pausedCount > 0 ? `${activeCount} (+${pausedCount} ⏸)` : String(activeCount), color: 'text-foreground' },
  ]

  return (
    <div className="flex flex-col gap-6">
      {/* Nagłówek */}
      <motion.div custom={0} initial="hidden" animate="show" variants={fadeUp} className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight flex items-center gap-2">
            <Repeat className="h-7 w-7 text-primary" />
            {t('subscriptions.title')}
          </h1>
          <p className="text-muted-foreground text-sm">{t('subscriptions.subtitle')}</p>
        </div>
        <Button className="gap-2" onClick={() => setDialog({ open: true, editing: null })}>
          <Plus className="h-4 w-4" />
          {pl ? 'Dodaj subskrypcję' : 'Add subscription'}
        </Button>
      </motion.div>

      {/* KPI */}
      <motion.div custom={1} initial="hidden" animate="show" variants={fadeUp}>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {kpis.map((kpi, i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <p className="text-xs font-bold text-muted-foreground flex items-center gap-1.5 uppercase tracking-wide">
                  <kpi.icon className="h-3.5 w-3.5" />
                  {kpi.label}
                </p>
                <div className={`mt-1 text-xl font-extrabold tabular-nums ${kpi.color}`}>{kpi.value}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      </motion.div>

      {/* Zarządzane subskrypcje */}
      <motion.div custom={2} initial="hidden" animate="show" variants={fadeUp} className="space-y-3">
        {!loading && managed.length === 0 && (
          <Card>
            <CardContent className="p-8 text-center text-sm text-muted-foreground">
              {pl
                ? 'Nie masz jeszcze żadnych subskrypcji. Dodaj pierwszą albo skorzystaj z wykrytych poniżej.'
                : 'No subscriptions yet. Add your first one or pick from the detected list below.'}
            </CardContent>
          </Card>
        )}

        {managed.map((sub) => {
          const monthlyEq = parseFloat(sub.amount) * MONTHLY_FACTOR[sub.interval]
          const paused = sub.status === 'paused'
          const historyOpen = expandedHistory === sub.id
          return (
            <Card key={sub.id} className={paused ? 'opacity-60' : ''}>
              <CardContent className="p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-xl shrink-0">{sub.emoji || '🔁'}</span>
                  <div className="flex-1 min-w-[140px]">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-extrabold leading-tight">{sub.name}</p>
                      {paused && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-muted text-muted-foreground">
                          {pl ? 'Wstrzymana' : 'Paused'}
                        </Badge>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      {INTERVAL_LABEL[sub.interval]}
                      {sub.nextDueDate ? ` · ${pl ? 'następna' : 'next'}: ${fmtDate(sub.nextDueDate)}` : ''}
                      {sub.notes ? ` · ${sub.notes}` : ''}
                    </p>
                  </div>

                  <div className="text-right shrink-0">
                    <p className="text-base font-extrabold tabular-nums">{fmt(parseFloat(sub.amount))} {sub.currency}</p>
                    {sub.interval !== 'monthly' && (
                      <p className="text-[11px] text-muted-foreground tabular-nums">≈ {fmt(monthlyEq)} {sub.currency}/{pl ? 'mies.' : 'mo'}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {sub.priceHistory.length > 1 && (
                      <Button variant="ghost" size="icon-sm" title={pl ? 'Historia cen' : 'Price history'}
                        onClick={() => setExpandedHistory(historyOpen ? null : sub.id)}>
                        <History className="h-4 w-4" />
                      </Button>
                    )}
                    <Button variant="ghost" size="icon-sm" title={pl ? 'Edytuj' : 'Edit'}
                      onClick={() => setDialog({ open: true, editing: sub })}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon-sm" title={paused ? (pl ? 'Wznów' : 'Resume') : (pl ? 'Wstrzymaj' : 'Pause')}
                      onClick={() => togglePause(sub)}>
                      {paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                    </Button>
                    <Button variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-destructive" title={pl ? 'Usuń' : 'Delete'}
                      onClick={() => remove(sub)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {/* Historia cen */}
                <AnimatePresence>
                  {historyOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="mt-3 pt-3 border-t border-dashed border-border space-y-1.5">
                        <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                          {pl ? 'Historia cen' : 'Price history'}
                        </p>
                        {sub.priceHistory.map((h, i) => {
                          const prev = sub.priceHistory[i + 1]
                          const diff = prev ? parseFloat(h.amount) - parseFloat(prev.amount) : 0
                          return (
                            <div key={h.id} className="flex items-center gap-3 text-xs tabular-nums">
                              <span className="text-muted-foreground w-24">{fmtDate(h.effectiveFrom)}</span>
                              <span className="font-bold">{fmt(parseFloat(h.amount))} {sub.currency}</span>
                              {prev && diff !== 0 && (
                                <span className={`font-extrabold ${diff > 0 ? 'text-[#b3402c] dark:text-red-400' : 'text-[#1e6b2f] dark:text-emerald-400'}`}>
                                  {diff > 0 ? '▲' : '▼'} {fmt(Math.abs(diff))}
                                </span>
                              )}
                              {i === 0 && (
                                <span className="text-[10px] text-muted-foreground">({pl ? 'obecna' : 'current'})</span>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </CardContent>
            </Card>
          )
        })}
      </motion.div>

      {/* Wykryte automatycznie */}
      {detectedNotAdded.length > 0 && (
        <motion.div custom={3} initial="hidden" animate="show" variants={fadeUp} className="space-y-3">
          <div className="pt-2">
            <h2 className="text-sm font-extrabold uppercase tracking-wide text-muted-foreground">
              {pl ? 'Wykryte w Twoich wydatkach' : 'Detected in your expenses'}
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {pl ? 'Wyglądają na cykliczne — dodaj jednym kliknięciem.' : 'These look recurring — add them with one click.'}
            </p>
          </div>
          {detectedNotAdded.map((sub, i) => (
            <Card key={i} className="border-dashed">
              <CardContent className="p-4 flex flex-wrap items-center gap-3">
                <div className="flex-1 min-w-[140px]">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold">{sub.title}</p>
                    {sub.confidence < 0.7 && (
                      <span className="flex items-center gap-0.5 text-[10px] text-[#93591a] dark:text-amber-400">
                        <AlertTriangle className="h-3 w-3" />
                        {t('subscriptions.lowConfidence')}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    {sub.vendor || sub.categoryName} · {sub.occurrences.length}× · ~{fmt(sub.avgAmount)} {currency}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => setDialog({
                    open: true,
                    editing: null,
                    prefill: {
                      name: sub.title,
                      vendor: sub.vendor,
                      amount: sub.avgAmount,
                      interval: DETECTED_TO_INTERVAL[sub.frequency],
                    },
                  })}
                >
                  <Plus className="h-3.5 w-3.5" />
                  {pl ? 'Dodaj do moich' : 'Add to mine'}
                </Button>
              </CardContent>
            </Card>
          ))}
        </motion.div>
      )}

      <SubscriptionDialog
        state={dialog}
        onClose={() => setDialog({ open: false, editing: null })}
        onSaved={refresh}
        currency={currency}
        pl={pl}
      />
    </div>
  )
}
