'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import { useTranslation } from '@/lib/i18n'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Loader2, SplitSquareVertical, DivideSquare } from 'lucide-react'

const MEMBER_COLORS = [
  '#6366f1', '#ec4899', '#f59e0b', '#10b981',
  '#3b82f6', '#8b5cf6', '#ef4444', '#14b8a6',
]

interface GroupMember {
  id: string
  name: string
  email?: string | null
}

interface Expense {
  id: string
  title: string
  amount: number | string
  vendor?: string | null
}

interface SplitExpenseSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  groupId: string
  currency: string
  members: GroupMember[]
  onCreated: () => void
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

export function SplitExpenseSheet({
  open,
  onOpenChange,
  groupId,
  currency,
  members,
  onCreated,
}: SplitExpenseSheetProps) {
  const { t } = useTranslation()

  const [description, setDescription] = useState('')
  const [totalAmount, setTotalAmount] = useState('')
  const [paidByMemberId, setPaidByMemberId] = useState<string>(members[0]?.id ?? '')
  const [splitMethod, setSplitMethod] = useState<'equal' | 'custom'>('equal')
  const [customAmounts, setCustomAmounts] = useState<Record<string, string>>({})
  const [linkedExpenseId, setLinkedExpenseId] = useState<string>('')
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [loading, setLoading] = useState(false)

  const total = parseFloat(totalAmount) || 0
  const perPerson = members.length > 0 ? total / members.length : 0

  // Fetch user expenses for linking
  useEffect(() => {
    if (!open) return
    fetch('/api/data/expenses')
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setExpenses(data.slice(0, 50))
        else if (Array.isArray(data?.expenses)) setExpenses(data.expenses.slice(0, 50))
      })
      .catch(() => {})
  }, [open])

  // Reset on open
  useEffect(() => {
    if (open) {
      setDescription('')
      setTotalAmount('')
      setPaidByMemberId(members[0]?.id ?? '')
      setSplitMethod('equal')
      setCustomAmounts({})
      setLinkedExpenseId('')
    }
  }, [open, members])

  const updateCustomAmount = (memberId: string, value: string) => {
    setCustomAmounts((prev) => ({ ...prev, [memberId]: value }))
  }

  const customSum = Object.values(customAmounts).reduce(
    (acc, v) => acc + (parseFloat(v) || 0),
    0
  )
  const sumMismatch =
    splitMethod === 'custom' && total > 0 && Math.abs(customSum - total) > 0.01

  const handleSave = async () => {
    if (!description.trim()) {
      toast.error(t('groups.description'))
      return
    }
    if (total <= 0) {
      toast.error(t('groups.totalAmount'))
      return
    }
    if (!paidByMemberId) {
      toast.error(t('groups.paidBy'))
      return
    }
    if (sumMismatch) {
      toast.error(t('groups.sumMismatch'))
      return
    }

    const splits = members.map((m, idx) => ({
      memberId: m.id,
      amount:
        splitMethod === 'equal'
          ? parseFloat(perPerson.toFixed(2))
          : parseFloat(customAmounts[m.id] || '0'),
      settled: false,
    }))

    setLoading(true)
    try {
      const res = await fetch('/api/groups/splits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          groupId,
          description: description.trim(),
          totalAmount: total,
          paidByMemberId,
          splitMethod,
          splits,
          expenseId: linkedExpenseId || null,
        }),
      })
      if (!res.ok) throw new Error('Failed to create split')
      toast.success(t('groups.splitCreated'), { description: t('groups.splitCreatedDesc') })
      onOpenChange(false)
      onCreated()
    } catch {
      toast.error(t('groups.failedSplit'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto flex flex-col gap-0 p-0">
        <SheetHeader className="p-6 pb-4 border-b">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
              <DivideSquare className="h-5 w-5 text-primary" />
            </div>
            <div>
              <SheetTitle>{t('groups.splitExpense')}</SheetTitle>
              <SheetDescription className="text-sm text-muted-foreground mt-0.5">
                {t('groups.addSplit')}
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Description */}
          <div className="space-y-2">
            <Label>{t('groups.description')}</Label>
            <Input
              placeholder={t('groups.descriptionPlaceholder')}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          {/* Total amount */}
          <div className="space-y-2">
            <Label>{t('groups.totalAmount')}</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground font-medium">
                {currency}
              </span>
              <Input
                type="number"
                min="0"
                step="0.01"
                className="pl-12"
                placeholder="0.00"
                value={totalAmount}
                onChange={(e) => setTotalAmount(e.target.value)}
              />
            </div>
          </div>

          {/* Paid by */}
          <div className="space-y-2">
            <Label>{t('groups.paidBy')}</Label>
            <Select value={paidByMemberId} onValueChange={setPaidByMemberId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {members.map((m, idx) => (
                  <SelectItem key={m.id} value={m.id}>
                    <div className="flex items-center gap-2">
                      <div
                        className="h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                        style={{ backgroundColor: MEMBER_COLORS[idx % MEMBER_COLORS.length] }}
                      >
                        {getInitials(m.name)}
                      </div>
                      {m.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Split method */}
          <div className="space-y-2">
            <Label>{t('groups.splitMethod')}</Label>
            <div className="grid grid-cols-2 gap-2">
              {(['equal', 'custom'] as const).map((method) => (
                <button
                  key={method}
                  type="button"
                  onClick={() => setSplitMethod(method)}
                  className={`flex items-center justify-center gap-2 rounded-lg border-2 py-2.5 px-3 text-sm font-medium transition-all ${
                    splitMethod === method
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border bg-muted/50 text-muted-foreground hover:bg-muted'
                  }`}
                >
                  <SplitSquareVertical className="h-4 w-4" />
                  {method === 'equal' ? t('groups.equalSplit') : t('groups.customSplit')}
                </button>
              ))}
            </div>
          </div>

          {/* Members split breakdown */}
          <div className="space-y-2">
            <div className="rounded-xl border bg-muted/30 divide-y">
              {members.map((m, idx) => (
                <motion.div
                  key={m.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex items-center gap-3 px-4 py-3"
                >
                  <div
                    className="h-8 w-8 shrink-0 rounded-full flex items-center justify-center text-xs font-semibold text-white"
                    style={{ backgroundColor: MEMBER_COLORS[idx % MEMBER_COLORS.length] }}
                  >
                    {getInitials(m.name)}
                  </div>
                  <span className="flex-1 text-sm font-medium truncate">{m.name}</span>
                  {splitMethod === 'equal' ? (
                    <span className="text-sm font-semibold tabular-nums">
                      {perPerson > 0
                        ? `${currency} ${perPerson.toFixed(2)}`
                        : `${currency} 0.00`}
                    </span>
                  ) : (
                    <div className="relative w-28">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                        {currency}
                      </span>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        className="pl-8 h-8 text-sm text-right"
                        placeholder="0.00"
                        value={customAmounts[m.id] ?? ''}
                        onChange={(e) => updateCustomAmount(m.id, e.target.value)}
                      />
                    </div>
                  )}
                </motion.div>
              ))}
            </div>

            {splitMethod === 'custom' && (
              <div className={`flex justify-between text-xs px-1 ${sumMismatch ? 'text-destructive' : 'text-muted-foreground'}`}>
                <span>Total</span>
                <span>
                  {currency} {customSum.toFixed(2)} / {currency} {total.toFixed(2)}
                </span>
              </div>
            )}
            {sumMismatch && (
              <p className="text-xs text-destructive px-1">{t('groups.sumMismatch')}</p>
            )}
          </div>

          {/* Link to expense */}
          {expenses.length > 0 && (
            <div className="space-y-2">
              <Label>{t('groups.linkExpense')}</Label>
              <Select
                value={linkedExpenseId}
                onValueChange={setLinkedExpenseId}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('groups.selectExpense')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">— {t('groups.selectExpense')} —</SelectItem>
                  {expenses.map((exp) => (
                    <SelectItem key={exp.id} value={exp.id}>
                      <span className="truncate">
                        {exp.title || exp.vendor || exp.id} — {currency}{' '}
                        {Number(exp.amount).toFixed(2)}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <SheetFooter className="p-6 pt-4 border-t">
          <Button
            className="w-full"
            onClick={handleSave}
            disabled={loading || !description.trim() || total <= 0 || sumMismatch}
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {t('groups.saving')}
              </>
            ) : (
              <>
                <DivideSquare className="h-4 w-4 mr-2" />
                {t('groups.saveSplit')}
              </>
            )}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
