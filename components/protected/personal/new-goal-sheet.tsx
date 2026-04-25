'use client'

import { useState } from 'react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useTranslation } from '@/lib/i18n'
import { Loader2, Sparkles } from 'lucide-react'
import { toast } from 'sonner'

const CATEGORY_EMOJIS: Record<string, string> = {
  electronics: '🎮',
  travel: '✈️',
  emergency: '🚨',
  education: '📚',
  car: '🚗',
  home: '🏠',
  custom: '🎁',
}

const GOAL_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#f43f5e',
  '#f97316', '#eab308', '#22c55e', '#06b6d4',
  '#3b82f6', '#a855f7',
]

interface NewGoalSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: () => void
  currency: string
}

export function NewGoalSheet({ open, onOpenChange, onCreated, currency }: NewGoalSheetProps) {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(false)

  const [name, setName] = useState('')
  const [targetAmount, setTargetAmount] = useState('')
  const [deadline, setDeadline] = useState('')
  const [priority, setPriority] = useState('medium')
  const [category, setCategory] = useState('custom')
  const [color, setColor] = useState('#6366f1')
  const [emoji, setEmoji] = useState('🎯')

  function handleCategoryChange(val: string) {
    setCategory(val)
    setEmoji(CATEGORY_EMOJIS[val] || '🎯')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !targetAmount) return

    setLoading(true)
    try {
      const res = await fetch('/api/personal/goals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          emoji,
          targetAmount: parseFloat(targetAmount),
          deadline: deadline || null,
          priority,
          color,
          category,
          currency,
        }),
      })

      if (!res.ok) throw new Error('Failed to create goal')

      toast.success(t('goals.newGoal'), { description: name })
      setName('')
      setTargetAmount('')
      setDeadline('')
      setPriority('medium')
      setCategory('custom')
      setColor('#6366f1')
      setEmoji('🎯')
      onOpenChange(false)
      onCreated()
    } catch {
      toast.error(t('errors.createGoal'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            {t('goals.newGoal')}
          </SheetTitle>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-5 mt-6">
          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="goal-name">{t('goals.goalName')}</Label>
            <Input
              id="goal-name"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder={t('goals.goalNamePlaceholder')}
              required
              className="min-h-[44px]"
            />
          </div>

          {/* Category */}
          <div className="space-y-2">
            <Label>{t('goals.category')}</Label>
            <div className="grid grid-cols-4 gap-2">
              {Object.entries(CATEGORY_EMOJIS).map(([key, emo]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => handleCategoryChange(key)}
                  className={`flex flex-col items-center gap-1 p-2.5 rounded-lg border transition-all min-h-[44px] ${
                    category === key
                      ? 'border-primary bg-primary/10 ring-2 ring-primary/20'
                      : 'border-border hover:border-primary/30 hover:bg-muted/50'
                  }`}
                >
                  <span className="text-xl">{emo}</span>
                  <span className="text-[10px] text-muted-foreground leading-tight">
                    {t(`goals.category.${key}` as Parameters<typeof t>[0])}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Target amount */}
          <div className="space-y-2">
            <Label htmlFor="goal-target">{t('goals.targetAmount')} ({currency})</Label>
            <Input
              id="goal-target"
              type="number"
              step="0.01"
              min="1"
              value={targetAmount}
              onChange={e => setTargetAmount(e.target.value)}
              placeholder="5000.00"
              required
              className="min-h-[44px] text-lg font-semibold"
            />
          </div>

          {/* Deadline */}
          <div className="space-y-2">
            <Label htmlFor="goal-deadline">{t('goals.deadline')}</Label>
            <Input
              id="goal-deadline"
              type="date"
              value={deadline}
              onChange={e => setDeadline(e.target.value)}
              min={new Date().toISOString().slice(0, 10)}
              className="min-h-[44px]"
            />
          </div>

          {/* Priority */}
          <div className="space-y-2">
            <Label>{t('goals.priority')}</Label>
            <Select value={priority} onValueChange={setPriority}>
              <SelectTrigger className="min-h-[44px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">{t('goals.priority.low')}</SelectItem>
                <SelectItem value="medium">{t('goals.priority.medium')}</SelectItem>
                <SelectItem value="high">{t('goals.priority.high')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Color */}
          <div className="space-y-2">
            <Label id="goal-color-label">{t('goals.color')}</Label>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-labelledby="goal-color-label">
              {GOAL_COLORS.map(c => (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={color === c}
                  aria-label={t('goals.colorAria').replace('{color}', c)}
                  onClick={() => setColor(c)}
                  className={`h-11 w-11 rounded-full transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-foreground ${
                    color === c ? 'ring-2 ring-offset-2 ring-primary scale-110' : 'hover:scale-105'
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          {/* Submit */}
          <Button type="submit" disabled={loading || !name.trim() || !targetAmount} className="min-h-[48px] text-base font-semibold">
            {loading ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" />{t('goals.creating')}</>
            ) : (
              <>{t('goals.newGoal')}</>
            )}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  )
}
