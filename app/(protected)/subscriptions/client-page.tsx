'use client'

import { useState, useEffect, useCallback, useMemo, Fragment } from 'react'
import { motion } from 'framer-motion'
import { useTranslation } from '@/lib/i18n'
import { useProductType } from '@/hooks/use-product-type'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
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
  Repeat, AlertTriangle,
  Plus, Pencil, Trash2, History, Loader2, ChevronLeft, ChevronRight, Pause,
} from 'lucide-react'
import { AppIcon, IconPicker } from '@/lib/app-icons'

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

/* ── Daty: następne wystąpienia płatności ── */

function addInterval(d: Date, interval: ManagedSub['interval']): Date {
  const n = new Date(d)
  if (interval === 'weekly') n.setDate(n.getDate() + 7)
  else if (interval === 'monthly') n.setMonth(n.getMonth() + 1)
  else if (interval === 'quarterly') n.setMonth(n.getMonth() + 3)
  else n.setFullYear(n.getFullYear() + 1)
  return n
}

function startOfToday(): Date {
  const t = new Date()
  t.setHours(0, 0, 0, 0)
  return t
}

/// Najbliższa płatność (≥ dziś); null gdy pauza albo brak daty
function nextOccurrence(sub: ManagedSub): Date | null {
  if (sub.status !== 'active' || !sub.nextDueDate) return null
  const today = startOfToday()
  let d = new Date(sub.nextDueDate + 'T00:00:00')
  let guard = 0
  while (d < today && guard++ < 400) d = addInterval(d, sub.interval)
  return d
}

/// Wszystkie płatności subskrypcji w danym miesiącu kalendarzowym
function occurrencesInMonth(sub: ManagedSub, year: number, month: number): Date[] {
  if (sub.status !== 'active' || !sub.nextDueDate) return []
  const monthStart = new Date(year, month, 1)
  const monthEnd = new Date(year, month + 1, 1)
  let d = new Date(sub.nextDueDate + 'T00:00:00')
  let guard = 0
  // cofnąć się nie możemy — bazą jest nextDueDate; roluj do przodu do początku miesiąca
  while (d < monthStart && guard++ < 400) d = addInterval(d, sub.interval)
  const out: Date[] = []
  while (d < monthEnd && guard++ < 450) {
    out.push(new Date(d))
    d = addInterval(d, sub.interval)
  }
  return out
}

/// Czy ostatnia zmiana ceny była podwyżką
function priceWentUp(sub: ManagedSub): boolean {
  if (sub.priceHistory.length < 2) return false
  return parseFloat(sub.priceHistory[0].amount) > parseFloat(sub.priceHistory[1].amount)
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
  const [emoji, setEmoji] = useState('repeat')
  const [amount, setAmount] = useState('')
  const [interval, setInterval] = useState<ManagedSub['interval']>('monthly')
  const [nextDueDate, setNextDueDate] = useState('')
  const [notes, setNotes] = useState('')
  const [amountChange, setAmountChange] = useState<'price_change' | 'correction'>('price_change')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!state.open) return
    setName(editing?.name ?? state.prefill?.name ?? '')
    setEmoji(editing?.emoji ?? 'repeat')
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
            <div className="space-y-1.5">
              <Label>{pl ? 'Ikona' : 'Icon'}</Label>
              <IconPicker value={emoji} onChange={setEmoji} pl={pl} />
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

/* ── Przełącznik aktywna/pauza w wierszu księgi ── */

function PauseSwitch({ on, onToggle, pl }: { on: boolean; onToggle: () => void; pl: boolean }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      title={on ? (pl ? 'Wstrzymaj' : 'Pause') : (pl ? 'Wznów' : 'Resume')}
      onClick={onToggle}
      className={`relative h-[18px] w-[34px] rounded-full transition-colors ${on ? 'bg-[#3f9c74]' : 'bg-muted-foreground/30'}`}
    >
      <span className={`absolute top-[2px] h-[14px] w-[14px] rounded-full bg-white shadow transition-all ${on ? 'left-[18px]' : 'left-[2px]'}`} />
    </button>
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
  // Wyświetlany miesiąc kalendarza (rok, miesiąc 0-11)
  const [calMonth, setCalMonth] = useState(() => {
    const n = new Date()
    return { y: n.getFullYear(), m: n.getMonth() }
  })

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

  /* Pochodne: kalendarz, kolejka najbliższych, "zejdzie do końca miesiąca" */
  const derived = useMemo(() => {
    const today = startOfToday()

    // Płatności w wyświetlanym miesiącu (dzień → wpisy)
    const byDay = new Map<number, { sub: ManagedSub; date: Date }[]>()
    for (const sub of managed) {
      for (const d of occurrencesInMonth(sub, calMonth.y, calMonth.m)) {
        const arr = byDay.get(d.getDate()) || []
        arr.push({ sub, date: d })
        byDay.set(d.getDate(), arr)
      }
    }

    // Kolejka najbliższych (niezależnie od wyświetlanego miesiąca)
    const upcoming = managed
      .map((sub) => ({ sub, next: nextOccurrence(sub) }))
      .filter((x): x is { sub: ManagedSub; next: Date } => x.next !== null)
      .sort((a, b) => a.next.getTime() - b.next.getTime())

    // Ile jeszcze zejdzie do końca BIEŻĄCEGO miesiąca
    let remainingThisMonth = 0
    const now = new Date()
    for (const sub of managed) {
      for (const d of occurrencesInMonth(sub, now.getFullYear(), now.getMonth())) {
        if (d >= today) remainingThisMonth += parseFloat(sub.amount)
      }
    }

    const withoutDate = managed.filter((s) => s.status === 'active' && !s.nextDueDate).length

    return { byDay, upcoming, remainingThisMonth, withoutDate }
  }, [managed, calMonth])

  if (!mounted) return null

  const fmt = (n: number) =>
    n.toLocaleString(pl ? 'pl-PL' : 'en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const fmtDate = (d: Date | string | null) => {
    if (!d) return '—'
    const dt = typeof d === 'string' ? new Date(d) : d
    return dt.toLocaleDateString(pl ? 'pl-PL' : 'en-US', { day: 'numeric', month: 'short' })
  }

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

  /* Kalendarz wyświetlanego miesiąca */
  const daysInCal = new Date(calMonth.y, calMonth.m + 1, 0).getDate()
  const firstDow = (new Date(calMonth.y, calMonth.m, 1).getDay() + 6) % 7 // pon=0
  const isCurrentCalMonth = calMonth.y === new Date().getFullYear() && calMonth.m === new Date().getMonth()
  const todayDate = new Date().getDate()
  const calLabel = new Date(calMonth.y, calMonth.m, 1).toLocaleDateString(pl ? 'pl-PL' : 'en-US', { month: 'long', year: 'numeric' })
  const DOW = pl ? ['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So', 'Nd'] : ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']

  const daysUntil = (d: Date) => Math.round((d.getTime() - startOfToday().getTime()) / 86_400_000)
  const daysUntilLabel = (n: number) =>
    n === 0 ? (pl ? 'dziś' : 'today') : n === 1 ? (pl ? 'jutro' : 'tomorrow') : pl ? `za ${n} dni` : `in ${n} days`

  const sortedForLedger = [...managed].sort((a, b) => {
    if (a.status !== b.status) return a.status === 'active' ? -1 : 1
    return parseFloat(b.amount) * MONTHLY_FACTOR[b.interval] - parseFloat(a.amount) * MONTHLY_FACTOR[a.interval]
  })

  return (
    <div className="flex flex-col gap-5">
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
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Card>
            <CardContent className="p-4">
              <p className="nb-label">{pl ? 'Miesięcznie' : 'Monthly'}</p>
              <div className="mt-1 text-xl font-extrabold tabular-nums text-primary">{fmt(totals.monthly)} {currency}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="nb-label">{pl ? 'Rocznie' : 'Yearly'}</p>
              <div className="mt-1 text-xl font-extrabold tabular-nums text-[#b3402c] dark:text-red-400">{fmt(totals.yearly)} {currency}</div>
            </CardContent>
          </Card>
          <Card className="border-primary/40">
            <CardContent className="p-4">
              <p className="nb-label">{pl ? 'Do końca miesiąca zejdzie' : 'Left to pay this month'}</p>
              <div className="mt-1 text-xl font-extrabold tabular-nums">{fmt(derived.remainingThisMonth)} {currency}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="nb-label">{pl ? 'Aktywne' : 'Active'}</p>
              <div className="mt-1 text-xl font-extrabold tabular-nums">
                {activeCount}{pausedCount > 0 && <span className="inline-flex items-center gap-0.5 text-sm text-muted-foreground font-bold"> (+{pausedCount} <Pause className="h-3.5 w-3.5" aria-hidden="true" />)</span>}
              </div>
            </CardContent>
          </Card>
        </div>
      </motion.div>

      {/* Kalendarz + najbliższe płatności */}
      <motion.div custom={2} initial="hidden" animate="show" variants={fadeUp}>
        <div className="grid lg:grid-cols-[1.5fr_1fr] gap-4">
          {/* Kalendarz — ukryty na mobile */}
          <Card className="hidden md:block">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-1">
                  <button onClick={() => setCalMonth(({ y, m }) => (m === 0 ? { y: y - 1, m: 11 } : { y, m: m - 1 }))}
                    className="h-6 w-6 rounded-md flex items-center justify-center text-muted-foreground hover:bg-secondary" aria-label="previous month">
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <span className="text-sm font-extrabold capitalize min-w-[130px] text-center">{calLabel}</span>
                  <button onClick={() => setCalMonth(({ y, m }) => (m === 11 ? { y: y + 1, m: 0 } : { y, m: m + 1 }))}
                    className="h-6 w-6 rounded-md flex items-center justify-center text-muted-foreground hover:bg-secondary" aria-label="next month">
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
                <span className="text-[11px] text-muted-foreground">{pl ? 'kwoty = dni płatności' : 'amounts = payment days'}</span>
              </div>
              <div className="grid grid-cols-7 gap-1">
                {DOW.map((d) => (
                  <div key={d} className="text-center text-[10px] font-extrabold uppercase text-muted-foreground">{d}</div>
                ))}
                {Array.from({ length: firstDow }).map((_, i) => <div key={`b${i}`} />)}
                {Array.from({ length: daysInCal }).map((_, i) => {
                  const day = i + 1
                  const entries = derived.byDay.get(day) || []
                  const isToday = isCurrentCalMonth && day === todayDate
                  return (
                    <div key={day} className={`min-h-[52px] rounded-lg bg-muted/40 p-1 text-[10px] ${isToday ? 'ring-2 ring-foreground' : ''}`}>
                      <span className="font-extrabold text-muted-foreground">{day}</span>
                      {entries.slice(0, 2).map((e, j) => (
                        <div key={j} className="mt-0.5 truncate rounded-md bg-secondary px-1 py-px font-extrabold text-secondary-foreground tabular-nums" title={`${e.sub.name} — ${fmt(parseFloat(e.sub.amount))} ${e.sub.currency}`}>
                          {Math.round(parseFloat(e.sub.amount))}
                        </div>
                      ))}
                      {entries.length > 2 && <div className="text-[9px] text-muted-foreground">+{entries.length - 2}</div>}
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>

          {/* Najbliższe płatności */}
          <Card>
            <CardContent className="p-4 flex flex-col gap-2.5">
              <p className="nb-label">{pl ? 'Najbliższe płatności' : 'Upcoming payments'}</p>
              {derived.upcoming.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  {pl
                    ? 'Brak zaplanowanych płatności — ustaw „najbliższą płatność" w edycji subskrypcji.'
                    : 'No scheduled payments — set the "next payment" date when editing a subscription.'}
                </p>
              )}
              {derived.upcoming.slice(0, 6).map(({ sub, next }) => {
                const n = daysUntil(next)
                return (
                  <div key={sub.id} className="flex items-center gap-2.5 text-sm">
                    <span className={`w-[64px] shrink-0 text-[11px] font-extrabold ${n <= 3 ? 'text-[#93591a] dark:text-amber-400' : 'text-muted-foreground'}`}>
                      {daysUntilLabel(n)}
                    </span>
                    <AppIcon value={sub.emoji} fallback="repeat" size="sm" chipClassName="bg-secondary text-secondary-foreground" />
                    <span className="flex-1 truncate font-bold">{sub.name}</span>
                    <span className="tabular-nums font-extrabold">{fmt(parseFloat(sub.amount))}</span>
                  </div>
                )
              })}
              <div className="mt-auto border-t border-dashed border-border pt-2.5 text-xs text-muted-foreground">
                {pl ? 'Do końca miesiąca zejdzie jeszcze ' : 'Still leaving your account this month: '}
                <b className="text-foreground tabular-nums">{fmt(derived.remainingThisMonth)} {currency}</b>
                {derived.withoutDate > 0 && (
                  <span className="block mt-1">
                    {pl ? `${derived.withoutDate} subskrypcje bez daty — nie widać ich tutaj` : `${derived.withoutDate} subscriptions have no date and are not shown here`}
                  </span>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </motion.div>

      {/* Księga kosztów */}
      <motion.div custom={3} initial="hidden" animate="show" variants={fadeUp}>
        <Card className="overflow-hidden">
          {loading && (
            <CardContent className="p-8 text-center text-sm text-muted-foreground">…</CardContent>
          )}
          {!loading && managed.length === 0 && (
            <CardContent className="p-8 text-center text-sm text-muted-foreground">
              {pl
                ? 'Nie masz jeszcze żadnych subskrypcji. Dodaj pierwszą albo skorzystaj z wykrytych poniżej.'
                : 'No subscriptions yet. Add your first one or pick from the detected list below.'}
            </CardContent>
          )}
          {!loading && managed.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/40 text-left">
                    <th className="px-4 py-2.5 nb-label font-extrabold">{pl ? 'Nazwa' : 'Name'}</th>
                    <th className="px-3 py-2.5 nb-label font-extrabold">{pl ? 'Cykl' : 'Cycle'}</th>
                    <th className="px-3 py-2.5 nb-label font-extrabold text-right">{pl ? 'Kwota' : 'Amount'}</th>
                    <th className="px-3 py-2.5 nb-label font-extrabold text-right hidden sm:table-cell">/ {pl ? 'mies' : 'mo'}</th>
                    <th className="px-3 py-2.5 nb-label font-extrabold text-right hidden sm:table-cell">/ {pl ? 'rok' : 'yr'}</th>
                    <th className="px-3 py-2.5 nb-label font-extrabold hidden md:table-cell">{pl ? 'Następna' : 'Next'}</th>
                    <th className="px-3 py-2.5 nb-label font-extrabold">{pl ? 'Aktywna' : 'Active'}</th>
                    <th className="px-3 py-2.5"></th>
                  </tr>
                </thead>
                <tbody>
                  {sortedForLedger.map((sub) => {
                    const paused = sub.status === 'paused'
                    const monthlyEq = parseFloat(sub.amount) * MONTHLY_FACTOR[sub.interval]
                    const next = nextOccurrence(sub)
                    const historyOpen = expandedHistory === sub.id
                    return (
                      <Fragment key={sub.id}>
                        <tr className={`border-t border-border/60 ${paused ? 'opacity-50' : ''}`}>
                          <td className="px-4 py-2.5">
                            <span className="flex items-center gap-2 font-bold">
                              <AppIcon value={sub.emoji} fallback="repeat" size="sm" chipClassName="bg-secondary text-secondary-foreground" />
                              <span className="truncate max-w-[160px]">{sub.name}</span>
                              {priceWentUp(sub) && (
                                <span className="text-[10px] font-extrabold px-1.5 py-px rounded-full bg-[#fde3dc] text-[#b3402c] dark:bg-red-500/15 dark:text-red-400" title={pl ? 'Ostatnio podrożała' : 'Recently went up'}>▲</span>
                              )}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-muted-foreground">{INTERVAL_LABEL[sub.interval]}</td>
                          <td className="px-3 py-2.5 text-right font-extrabold tabular-nums">{fmt(parseFloat(sub.amount))}</td>
                          <td className="px-3 py-2.5 text-right text-muted-foreground tabular-nums hidden sm:table-cell">{paused ? '—' : fmt(monthlyEq)}</td>
                          <td className="px-3 py-2.5 text-right text-muted-foreground tabular-nums hidden sm:table-cell">{paused ? '—' : fmt(monthlyEq * 12)}</td>
                          <td className="px-3 py-2.5 text-muted-foreground hidden md:table-cell">{paused ? <Pause className="h-3.5 w-3.5" aria-hidden="true" /> : fmtDate(next)}</td>
                          <td className="px-3 py-2.5"><PauseSwitch on={!paused} onToggle={() => togglePause(sub)} pl={pl} /></td>
                          <td className="px-3 py-2.5">
                            <span className="flex items-center gap-0.5 justify-end">
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
                              <Button variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-destructive" title={pl ? 'Usuń' : 'Delete'}
                                onClick={() => remove(sub)}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </span>
                          </td>
                        </tr>
                        {historyOpen && (
                          <tr className="border-t border-dashed border-border/60 bg-muted/20">
                            <td colSpan={8} className="px-4 py-3">
                              <p className="nb-label mb-1.5">{pl ? 'Historia cen' : 'Price history'}</p>
                              <div className="space-y-1">
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
                                      {i === 0 && <span className="text-[10px] text-muted-foreground">({pl ? 'obecna' : 'current'})</span>}
                                    </div>
                                  )
                                })}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-border bg-muted/40 font-extrabold">
                    <td className="px-4 py-2.5">{activeCount} {pl ? 'aktywnych' : 'active'}</td>
                    <td></td>
                    <td></td>
                    <td className="px-3 py-2.5 text-right tabular-nums hidden sm:table-cell">{fmt(totals.monthly)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums hidden sm:table-cell">{fmt(totals.yearly)}</td>
                    <td colSpan={3} className="px-3 py-2.5 text-muted-foreground font-semibold">{currency}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </Card>
      </motion.div>

      {/* Wykryte automatycznie */}
      {detectedNotAdded.length > 0 && (
        <motion.div custom={4} initial="hidden" animate="show" variants={fadeUp} className="space-y-3">
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
