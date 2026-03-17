'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTranslation } from '@/lib/i18n'
import { useProductType } from '@/hooks/use-product-type'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { ChallengeCard } from '@/components/protected/personal/challenge-card'
import {
  Trophy,
  Plus,
  Loader2,
  Flame,
  PiggyBank,
  Award,
  Zap,
  Pizza,
  Coffee,
  ShoppingCart,
  Wallet,
  Ban,
  Footprints,
  Sparkles,
} from 'lucide-react'
import { toast } from 'sonner'

interface Challenge {
  id: string
  name: string
  emoji: string | null
  type: string
  targetCategory: string | null
  targetAmount: string | null
  startDate: string
  endDate: string
  isActive: boolean
  isCompleted: boolean | null
  currentProgress: string | null
  createdAt: string
}

interface ChallengeTemplate {
  key: string
  emoji: string
  type: string
  defaultDays: number
  targetAmount?: number
  icon: any
}

const TEMPLATES: ChallengeTemplate[] = [
  { key: 'noEatingOut', emoji: '🍕', type: 'no_spend', defaultDays: 7, icon: Pizza },
  { key: 'noCoffee', emoji: '☕', type: 'no_spend', defaultDays: 7, icon: Coffee },
  { key: 'groceryBudget', emoji: '🛒', type: 'limit', defaultDays: 7, targetAmount: 300, icon: ShoppingCart },
  { key: 'saveFifty', emoji: '💰', type: 'save', defaultDays: 30, targetAmount: 1500, icon: Wallet },
  { key: 'noImpulse', emoji: '🚫', type: 'no_spend', defaultDays: 14, icon: Ban },
  { key: 'walkMore', emoji: '🚶', type: 'custom', defaultDays: 7, icon: Footprints },
]

export default function ChallengesPage() {
  const { t, lang, mounted } = useTranslation()
  const { isPersonal } = useProductType()
  const router = useRouter()

  const [challenges, setChallenges] = useState<Challenge[]>([])
  const [loading, setLoading] = useState(true)
  const [currency, setCurrency] = useState('PLN')
  const [newOpen, setNewOpen] = useState(false)

  // Form state
  const [formName, setFormName] = useState('')
  const [formEmoji, setFormEmoji] = useState('💪')
  const [formType, setFormType] = useState('no_spend')
  const [formTargetCategory, setFormTargetCategory] = useState('')
  const [formTargetAmount, setFormTargetAmount] = useState('')
  const [formStartDate, setFormStartDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [formEndDate, setFormEndDate] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() + 7)
    return d.toISOString().slice(0, 10)
  })
  const [creating, setCreating] = useState(false)

  // Redirect business users
  useEffect(() => {
    if (mounted && !isPersonal) {
      router.push('/dashboard')
    }
  }, [mounted, isPersonal, router])

  // Fetch currency
  useEffect(() => {
    fetch('/api/data/settings')
      .then(r => r.json())
      .then(d => { if (d?.settings?.currency) setCurrency(d.settings.currency.toUpperCase()) })
      .catch(() => {})
  }, [])

  const fetchChallenges = useCallback(async () => {
    try {
      const res = await fetch('/api/personal/challenges')
      if (!res.ok) throw new Error()
      const data = await res.json()
      setChallenges(data.challenges || [])
    } catch {
      toast.error('Failed to load challenges')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchChallenges()
  }, [fetchChallenges])

  function applyTemplate(tmpl: ChallengeTemplate) {
    setFormName(t(`challenges.templates.${tmpl.key}` as any))
    setFormEmoji(tmpl.emoji)
    setFormType(tmpl.type)
    if (tmpl.targetAmount) setFormTargetAmount(String(tmpl.targetAmount))
    else setFormTargetAmount('')
    const start = new Date().toISOString().slice(0, 10)
    const end = new Date()
    end.setDate(end.getDate() + tmpl.defaultDays)
    setFormStartDate(start)
    setFormEndDate(end.toISOString().slice(0, 10))
    setNewOpen(true)
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!formName.trim() || !formStartDate || !formEndDate) return

    setCreating(true)
    try {
      const res = await fetch('/api/personal/challenges', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formName.trim(),
          emoji: formEmoji,
          type: formType,
          targetCategory: formTargetCategory || null,
          targetAmount: formTargetAmount ? parseFloat(formTargetAmount) : null,
          startDate: formStartDate,
          endDate: formEndDate,
        }),
      })

      if (!res.ok) throw new Error()
      toast.success(t('challenges.newChallenge'), { description: formName })
      setFormName('')
      setFormEmoji('💪')
      setFormType('no_spend')
      setFormTargetCategory('')
      setFormTargetAmount('')
      setNewOpen(false)
      fetchChallenges()
    } catch {
      toast.error('Failed to create challenge')
    } finally {
      setCreating(false)
    }
  }

  async function handleCheckIn(id: string) {
    const challenge = challenges.find(c => c.id === id)
    if (!challenge) return

    const newProgress = parseFloat(challenge.currentProgress || '0') + (parseFloat(challenge.targetAmount || '0') / Math.max(1, Math.ceil((new Date(challenge.endDate).getTime() - new Date(challenge.startDate).getTime()) / (1000 * 60 * 60 * 24))))

    try {
      const targetAmt = parseFloat(challenge.targetAmount || '0')
      const isNowCompleted = targetAmt > 0 && newProgress >= targetAmt
      const today = new Date()
      const endDate = new Date(challenge.endDate)
      const timeComplete = today >= endDate

      await fetch(`/api/personal/challenges/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentProgress: newProgress,
          isCompleted: isNowCompleted || timeComplete,
        }),
      })

      toast.success(t('challenges.checkIn'))
      fetchChallenges()
    } catch {
      toast.error('Failed to check in')
    }
  }

  async function handleDelete(id: string) {
    if (!confirm(t('challenges.deleteConfirm'))) return
    try {
      await fetch(`/api/personal/challenges/${id}`, { method: 'DELETE' })
      setChallenges(prev => prev.filter(c => c.id !== id))
      toast.success(t('common.delete'))
    } catch {
      toast.error('Failed to delete')
    }
  }

  if (!mounted) return null

  const activeChallenges = challenges.filter(c => c.isActive && !c.isCompleted)
  const completedChallenges = challenges.filter(c => c.isCompleted)
  const totalSaved = challenges.reduce((sum, c) => sum + parseFloat(c.currentProgress || '0'), 0)

  // Calculate current streak (consecutive days with active challenges)
  const currentStreak = activeChallenges.length > 0
    ? activeChallenges.reduce((max, c) => {
        const daysPassed = Math.max(0, Math.ceil((Date.now() - new Date(c.startDate).getTime()) / (1000 * 60 * 60 * 24)))
        return Math.max(max, daysPassed)
      }, 0)
    : 0

  const fadeUp = {
    hidden: { opacity: 0, y: 20 },
    show: (i: number) => ({
      opacity: 1, y: 0,
      transition: { duration: 0.45, delay: i * 0.07, ease: [0.22, 1, 0.36, 1] as any },
    }),
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <motion.div
        custom={0}
        initial="hidden"
        animate="show"
        variants={fadeUp}
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4"
      >
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight flex items-center gap-2">
            <Trophy className="h-7 w-7 text-primary" />
            {t('challenges.title')}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">{t('challenges.subtitle')}</p>
        </div>
        <Button onClick={() => setNewOpen(true)} className="min-h-[44px] shrink-0">
          <Plus className="h-4 w-4 mr-1.5" />
          {t('challenges.newChallenge')}
        </Button>
      </motion.div>

      {/* Stats */}
      <motion.div custom={1} initial="hidden" animate="show" variants={fadeUp}>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            {
              icon: PiggyBank,
              label: t('challenges.totalSaved'),
              value: `${totalSaved.toFixed(2)} ${currency}`,
              color: 'text-emerald-600 dark:text-emerald-400',
            },
            {
              icon: Award,
              label: t('challenges.challengesCompleted'),
              value: String(completedChallenges.length),
              color: 'text-purple-600 dark:text-purple-400',
            },
            {
              icon: Flame,
              label: t('challenges.currentStreak'),
              value: `${currentStreak} ${t('challenges.day')}`,
              color: 'text-orange-600 dark:text-orange-400',
            },
            {
              icon: Zap,
              label: t('challenges.active'),
              value: String(activeChallenges.length),
              color: 'text-primary',
            },
          ].map((kpi, i) => (
            <Card key={i} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                  <kpi.icon className="h-3.5 w-3.5" />
                  {kpi.label}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className={`text-xl font-bold ${kpi.color}`}>{kpi.value}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      </motion.div>

      {/* Challenge templates */}
      <motion.div custom={2} initial="hidden" animate="show" variants={fadeUp}>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-5 w-5 text-primary" />
              {lang === 'pl' ? 'Szablony wyzwań' : 'Challenge templates'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
              {TEMPLATES.map(tmpl => {
                const Icon = tmpl.icon
                return (
                  <button
                    key={tmpl.key}
                    onClick={() => applyTemplate(tmpl)}
                    className="flex flex-col items-center gap-2 p-3 rounded-xl border border-border/40 hover:border-primary/30 hover:bg-primary/5 transition-all min-h-[80px]"
                  >
                    <span className="text-2xl">{tmpl.emoji}</span>
                    <span className="text-[11px] text-center font-medium leading-tight">
                      {t(`challenges.templates.${tmpl.key}` as any)}
                    </span>
                  </button>
                )
              })}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      )}

      {/* Empty state */}
      {!loading && challenges.length === 0 && (
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center justify-center py-16 gap-6 text-center"
        >
          <div className="relative">
            <div className="h-24 w-24 rounded-full bg-primary/10 flex items-center justify-center">
              <Trophy className="h-12 w-12 text-primary" />
            </div>
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 10, repeat: Infinity, ease: 'linear' }}
              className="absolute inset-0 rounded-full border-2 border-dashed border-primary/30"
            />
          </div>
          <div className="space-y-2 max-w-sm">
            <h2 className="text-xl font-bold">{t('challenges.emptyTitle')}</h2>
            <p className="text-muted-foreground text-sm">{t('challenges.emptyDesc')}</p>
          </div>
        </motion.div>
      )}

      {/* Active challenges */}
      {!loading && activeChallenges.length > 0 && (
        <motion.div custom={3} initial="hidden" animate="show" variants={fadeUp}>
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-1.5">
            <Flame className="h-4 w-4 text-orange-500" />
            {t('challenges.active')} ({activeChallenges.length})
          </h3>
          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {activeChallenges.map((c, i) => (
              <ChallengeCard
                key={c.id}
                challenge={c}
                index={i}
                onCheckIn={handleCheckIn}
                onDelete={handleDelete}
                currency={currency}
              />
            ))}
          </div>
        </motion.div>
      )}

      {/* Completed challenges */}
      {!loading && completedChallenges.length > 0 && (
        <motion.div custom={4} initial="hidden" animate="show" variants={fadeUp}>
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-1.5">
            <Award className="h-4 w-4 text-purple-500" />
            {t('challenges.completed')} ({completedChallenges.length})
          </h3>
          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {completedChallenges.map((c, i) => (
              <ChallengeCard
                key={c.id}
                challenge={c}
                index={i}
                onCheckIn={() => {}}
                onDelete={handleDelete}
                currency={currency}
              />
            ))}
          </div>
        </motion.div>
      )}

      {/* New challenge sheet */}
      <Sheet open={newOpen} onOpenChange={setNewOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Trophy className="h-5 w-5 text-primary" />
              {t('challenges.newChallenge')}
            </SheetTitle>
          </SheetHeader>

          <form onSubmit={handleCreate} className="flex flex-col gap-5 mt-6">
            {/* Name */}
            <div className="space-y-2">
              <Label htmlFor="ch-name">{t('challenges.challengeName')}</Label>
              <Input
                id="ch-name"
                value={formName}
                onChange={e => setFormName(e.target.value)}
                placeholder={lang === 'pl' ? 'Np. Bez jedzenia na mieście...' : 'e.g. No eating out...'}
                required
                className="min-h-[44px]"
              />
            </div>

            {/* Type */}
            <div className="space-y-2">
              <Label>{t('challenges.type')}</Label>
              <Select value={formType} onValueChange={setFormType}>
                <SelectTrigger className="min-h-[44px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="no_spend">{t('challenges.type.no_spend')}</SelectItem>
                  <SelectItem value="limit">{t('challenges.type.limit')}</SelectItem>
                  <SelectItem value="save">{t('challenges.type.save')}</SelectItem>
                  <SelectItem value="custom">{t('challenges.type.custom')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Target amount */}
            {(formType === 'limit' || formType === 'save') && (
              <div className="space-y-2">
                <Label htmlFor="ch-target">{t('challenges.targetAmount')} ({currency})</Label>
                <Input
                  id="ch-target"
                  type="number"
                  step="0.01"
                  min="1"
                  value={formTargetAmount}
                  onChange={e => setFormTargetAmount(e.target.value)}
                  placeholder="0.00"
                  className="min-h-[44px]"
                />
              </div>
            )}

            {/* Target category */}
            {formType === 'no_spend' && (
              <div className="space-y-2">
                <Label htmlFor="ch-cat">{t('challenges.targetCategory')}</Label>
                <Input
                  id="ch-cat"
                  value={formTargetCategory}
                  onChange={e => setFormTargetCategory(e.target.value)}
                  placeholder={lang === 'pl' ? 'Np. Restauracje' : 'e.g. Restaurants'}
                  className="min-h-[44px]"
                />
              </div>
            )}

            {/* Dates */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="ch-start">{t('challenges.startDate')}</Label>
                <Input
                  id="ch-start"
                  type="date"
                  value={formStartDate}
                  onChange={e => setFormStartDate(e.target.value)}
                  className="min-h-[44px]"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ch-end">{t('challenges.endDate')}</Label>
                <Input
                  id="ch-end"
                  type="date"
                  value={formEndDate}
                  onChange={e => setFormEndDate(e.target.value)}
                  min={formStartDate}
                  className="min-h-[44px]"
                  required
                />
              </div>
            </div>

            {/* Submit */}
            <Button type="submit" disabled={creating || !formName.trim()} className="min-h-[48px] text-base font-semibold">
              {creating ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />{t('challenges.creating')}</>
              ) : (
                <><Plus className="h-4 w-4 mr-1.5" />{t('challenges.newChallenge')}</>
              )}
            </Button>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  )
}
