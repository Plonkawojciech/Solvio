'use client'

import { useState } from 'react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useTranslation } from '@/lib/i18n'
import { GoalProgressRing } from './goal-progress-ring'
import { Loader2, Plus } from 'lucide-react'
import { toast } from 'sonner'

interface GoalInfo {
  id: string
  name: string
  emoji: string | null
  targetAmount: string
  currentAmount: string
  color: string | null
  currency: string | null
}

interface AddFundsSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  goal: GoalInfo | null
  onDeposited: () => void
  currency: string
}

const QUICK_AMOUNTS = [50, 100, 200, 500]

export function AddFundsSheet({ open, onOpenChange, goal, onDeposited, currency }: AddFundsSheetProps) {
  const { t } = useTranslation()
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(false)

  if (!goal) return null

  const g = goal // TypeScript narrows this to non-null

  const target = parseFloat(g.targetAmount || '0')
  const current = parseFloat(g.currentAmount || '0')
  const depositAmount = parseFloat(amount || '0')
  const newAmount = current + depositAmount
  const currentPct = target > 0 ? (current / target) * 100 : 0
  const previewPct = target > 0 ? Math.min((newAmount / target) * 100, 100) : 0
  const displayCurrency = g.currency || currency
  const color = g.color || '#6366f1'

  async function handleDeposit(e: React.FormEvent) {
    e.preventDefault()
    if (!amount || depositAmount <= 0) return

    setLoading(true)
    try {
      const res = await fetch(`/api/personal/goals/${g.id}/deposit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: depositAmount, note: note.trim() || null }),
      })

      if (!res.ok) throw new Error('Failed to deposit')

      const data = await res.json()
      if (data.completed) {
        toast.success(t('goals.celebration'), { description: g.name })
      } else {
        toast.success(t('goals.addFunds'), {
          description: `+${depositAmount.toFixed(2)} ${displayCurrency}`,
        })
      }

      setAmount('')
      setNote('')
      onOpenChange(false)
      onDeposited()
    } catch {
      toast.error('Error depositing funds')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <span className="text-2xl">{g.emoji || '🎯'}</span>
            {g.name}
          </SheetTitle>
        </SheetHeader>

        <form onSubmit={handleDeposit} className="flex flex-col gap-5 mt-6">
          {/* Progress preview */}
          <div className="flex flex-col items-center gap-3 py-4 bg-muted/30 rounded-xl border border-border/40">
            <GoalProgressRing
              percentage={depositAmount > 0 ? previewPct : currentPct}
              size={100}
              strokeWidth={7}
              color={color}
            >
              <span className="text-sm font-bold">{Math.round(depositAmount > 0 ? previewPct : currentPct)}%</span>
            </GoalProgressRing>
            <div className="text-center">
              <p className="text-sm font-semibold">
                {(depositAmount > 0 ? newAmount : current).toLocaleString('pl-PL', { minimumFractionDigits: 2 })} {displayCurrency}
              </p>
              <p className="text-xs text-muted-foreground">
                / {target.toLocaleString('pl-PL', { minimumFractionDigits: 2 })} {displayCurrency}
              </p>
            </div>
            {depositAmount > 0 && (
              <p className="text-xs font-semibold text-primary">
                +{depositAmount.toFixed(2)} {displayCurrency}
              </p>
            )}
          </div>

          {/* Amount input */}
          <div className="space-y-2">
            <Label htmlFor="deposit-amount">{t('goals.depositAmount')} ({displayCurrency})</Label>
            <Input
              id="deposit-amount"
              type="number"
              step="0.01"
              min="0.01"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder="0.00"
              required
              className="min-h-[48px] text-xl font-bold text-center"
              autoFocus
            />
          </div>

          {/* Quick amounts */}
          <div className="space-y-2">
            <Label>{t('goals.quickAmounts')}</Label>
            <div className="grid grid-cols-4 gap-2">
              {QUICK_AMOUNTS.map(qa => (
                <Button
                  key={qa}
                  type="button"
                  variant="outline"
                  onClick={() => setAmount(String(qa))}
                  className={`min-h-[48px] text-base font-bold ${
                    amount === String(qa) ? 'border-primary bg-primary/10' : ''
                  }`}
                >
                  +{qa}
                </Button>
              ))}
            </div>
          </div>

          {/* Note */}
          <div className="space-y-2">
            <Label htmlFor="deposit-note">{t('goals.depositNote')}</Label>
            <Input
              id="deposit-note"
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="..."
              className="min-h-[44px]"
            />
          </div>

          {/* Submit */}
          <Button
            type="submit"
            disabled={loading || !amount || depositAmount <= 0}
            className="min-h-[48px] text-base font-semibold"
            style={{ backgroundColor: color }}
          >
            {loading ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" />{t('goals.depositing')}</>
            ) : (
              <><Plus className="h-4 w-4 mr-1.5" />{t('goals.addFunds')} {depositAmount > 0 ? `+${depositAmount.toFixed(2)} ${displayCurrency}` : ''}</>
            )}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  )
}
