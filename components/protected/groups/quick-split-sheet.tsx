'use client'

import { useState, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import { useTranslation } from '@/lib/i18n'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Plus,
  Trash2,
  Loader2,
  Camera,
  DollarSign,
  ArrowRight,
  ArrowLeft,
  Check,
  Copy,
  Sparkles,
  Receipt,
} from 'lucide-react'
import { AiSplitSuggestion } from './ai-split-suggestion'

const MEMBER_COLORS = [
  '#6366f1', '#ec4899', '#f59e0b', '#10b981',
  '#3b82f6', '#8b5cf6', '#ef4444', '#14b8a6',
]

interface SplitPerson {
  id: string
  name: string
  customAmount?: number
}

interface ReceiptItem {
  name: string
  price: number
  assignedTo: string[]
}

interface QuickSplitSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

type SplitStep = 'people' | 'amount' | 'review'

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

const stepVariants = {
  enter: { x: 40, opacity: 0 },
  center: { x: 0, opacity: 1 },
  exit: { x: -40, opacity: 0 },
// eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any

export function QuickSplitSheet({ open, onOpenChange }: QuickSplitSheetProps) {
  const { t, lang } = useTranslation()

  // Steps
  const [step, setStep] = useState<SplitStep>('people')

  // People
  const [people, setPeople] = useState<SplitPerson[]>([
    { id: '1', name: '' },
    { id: '2', name: '' },
  ])

  // Amount mode
  const [mode, setMode] = useState<'manual' | 'receipt'>('manual')
  const [totalAmount, setTotalAmount] = useState('')
  const [splitType, setSplitType] = useState<'equal' | 'custom'>('equal')

  // Receipt mode
  const [receiptItems, setReceiptItems] = useState<ReceiptItem[]>([])
  const [scanning, setScanning] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // AI suggestions
  const [aiSuggestions, setAiSuggestions] = useState<{
    suggestions: Array<{ itemIndex: number; memberNames: string[]; reason: string }>
    summary: string
  } | null>(null)
  const [loadingAi, setLoadingAi] = useState(false)

  const validPeople = people.filter((p) => p.name.trim())
  const total = parseFloat(totalAmount) || 0
  const perPerson = validPeople.length > 0 ? total / validPeople.length : 0

  const addPerson = () => {
    setPeople((prev) => [...prev, { id: String(Date.now()), name: '' }])
  }

  const removePerson = (id: string) => {
    if (people.length <= 2) return
    setPeople((prev) => prev.filter((p) => p.id !== id))
  }

  const updatePersonName = (id: string, name: string) => {
    setPeople((prev) => prev.map((p) => (p.id === id ? { ...p, name } : p)))
  }

  const updatePersonAmount = (id: string, amount: number) => {
    setPeople((prev) => prev.map((p) => (p.id === id ? { ...p, customAmount: amount } : p)))
  }

  const handleScanReceipt = useCallback(async (file: File) => {
    setScanning(true)
    try {
      const formData = new FormData()
      formData.append('file', file)

      const res = await fetch('/api/v1/ocr-receipt', {
        method: 'POST',
        body: formData,
      })

      if (!res.ok) throw new Error('OCR failed')
      const data = await res.json()

      const items: ReceiptItem[] = (data.items || []).map(
        (item: { name: string; totalPrice?: number; unitPrice?: number; price?: number }) => ({
          name: item.name,
          price: item.totalPrice || item.unitPrice || item.price || 0,
          assignedTo: [],
        })
      )

      setReceiptItems(items)
      const receiptTotal = items.reduce((s: number, i: ReceiptItem) => s + i.price, 0)
      setTotalAmount(receiptTotal.toFixed(2))
      setMode('receipt')

      toast.success(t('groups.scanSuccess'))
    } catch {
      toast.error(t('groups.scanFailed'))
    } finally {
      setScanning(false)
    }
  }, [t])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleScanReceipt(file)
  }

  const fetchAiSuggestions = async () => {
    if (receiptItems.length === 0 || validPeople.length < 2) return
    setLoadingAi(true)
    try {
      const res = await fetch('/api/groups/ai-suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: receiptItems.map((i) => ({ name: i.name, price: i.price })),
          members: validPeople.map((p) => ({ name: p.name })),
          lang,
        }),
      })
      if (!res.ok) throw new Error('AI suggest failed')
      const data = await res.json()
      setAiSuggestions(data)
    } catch {
      // Silent fail - AI suggestions are optional
    } finally {
      setLoadingAi(false)
    }
  }

  const acceptAiSuggestions = () => {
    if (!aiSuggestions) return
    const updated = [...receiptItems]
    for (const suggestion of aiSuggestions.suggestions) {
      if (updated[suggestion.itemIndex]) {
        updated[suggestion.itemIndex].assignedTo = suggestion.memberNames
      }
    }
    setReceiptItems(updated)
    toast.success(t('groups.acceptSuggestion'))
  }

  const toggleItemAssignment = (itemIdx: number, personName: string) => {
    setReceiptItems((prev) => {
      const updated = [...prev]
      const item = { ...updated[itemIdx] }
      if (item.assignedTo.includes(personName)) {
        item.assignedTo = item.assignedTo.filter((n) => n !== personName)
      } else {
        item.assignedTo = [...item.assignedTo, personName]
      }
      updated[itemIdx] = item
      return updated
    })
  }

  // Compute final split summary
  const computeSplitResult = () => {
    if (mode === 'receipt' && receiptItems.length > 0) {
      // Per-item assignment
      const shares: Record<string, number> = {}
      for (const p of validPeople) shares[p.name] = 0

      for (const item of receiptItems) {
        if (item.assignedTo.length === 0) {
          // Unassigned: split equally
          const share = item.price / validPeople.length
          for (const p of validPeople) shares[p.name] += share
        } else {
          const share = item.price / item.assignedTo.length
          for (const name of item.assignedTo) {
            if (shares[name] !== undefined) shares[name] += share
          }
        }
      }
      return shares
    }

    // Manual mode
    if (splitType === 'custom') {
      const shares: Record<string, number> = {}
      for (const p of validPeople) shares[p.name] = p.customAmount || 0
      return shares
    }

    // Equal split
    const shares: Record<string, number> = {}
    for (const p of validPeople) shares[p.name] = perPerson
    return shares
  }

  const handleShareResult = () => {
    const result = computeSplitResult()
    const lines = Object.entries(result).map(
      ([name, amount]) => `${name}: ${amount.toFixed(2)} PLN`
    )
    const text = `${t('groups.splitSummary')}\n${lines.join('\n')}\n\n${t('groups.totalAmount')}: ${total.toFixed(2)} PLN`

    if (navigator.share) {
      navigator.share({ text }).catch(() => {
        navigator.clipboard.writeText(text)
        toast.success(t('expenses.linkCopied'))
      })
    } else {
      navigator.clipboard.writeText(text)
      toast.success(t('expenses.linkCopied'))
    }
  }

  const reset = () => {
    setStep('people')
    setPeople([
      { id: '1', name: '' },
      { id: '2', name: '' },
    ])
    setMode('manual')
    setTotalAmount('')
    setSplitType('equal')
    setReceiptItems([])
    setAiSuggestions(null)
  }

  const canGoNext = () => {
    if (step === 'people') return validPeople.length >= 2
    if (step === 'amount') return total > 0
    return true
  }

  const goNext = () => {
    if (step === 'people') {
      setStep('amount')
    } else if (step === 'amount') {
      if (mode === 'receipt' && receiptItems.length > 0 && !aiSuggestions && !loadingAi) {
        fetchAiSuggestions()
      }
      setStep('review')
    }
  }

  const goBack = () => {
    if (step === 'amount') setStep('people')
    if (step === 'review') setStep('amount')
  }

  const stepIndex = step === 'people' ? 1 : step === 'amount' ? 2 : 3
  const stepLabels = [t('groups.whoIsSplitting'), t('groups.howMuch'), t('groups.review')]

  return (
    <Sheet
      open={open}
      onOpenChange={(v) => {
        if (!v) reset()
        onOpenChange(v)
      }}
    >
      <SheetContent className="w-full sm:max-w-md overflow-y-auto flex flex-col gap-0 p-0">
        <SheetHeader className="p-6 pb-4 border-b">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
              <Sparkles className="h-5 w-5 text-primary" />
            </div>
            <div>
              <SheetTitle>{t('groups.quickSplit')}</SheetTitle>
              <SheetDescription className="text-sm text-muted-foreground mt-0.5">
                {t('groups.quickSplitDesc')}
              </SheetDescription>
            </div>
          </div>
          {/* Step indicator */}
          <div className="flex items-center gap-2 mt-4">
            {[1, 2, 3].map((s) => (
              <div key={s} className="flex items-center gap-2 flex-1">
                <div
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-all ${
                    s <= stepIndex
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {s < stepIndex ? <Check className="h-3.5 w-3.5" /> : s}
                </div>
                {s < 3 && (
                  <div
                    className={`h-0.5 flex-1 rounded-full transition-colors ${
                      s < stepIndex ? 'bg-primary' : 'bg-muted'
                    }`}
                  />
                )}
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-1.5">
            {t('groups.step')} {stepIndex} {t('groups.of')} 3 — {stepLabels[stepIndex - 1]}
          </p>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-6">
          <AnimatePresence mode="wait">
            {/* Step 1: People */}
            {step === 'people' && (
              <motion.div
                key="people"
                variants={stepVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.2 }}
                className="space-y-4"
              >
                <div className="flex items-center justify-between">
                  <Label className="text-base font-semibold">{t('groups.addPeople')}</Label>
                  <span className="text-xs text-muted-foreground">
                    {validPeople.length} {t('groups.people')}
                  </span>
                </div>

                <AnimatePresence initial={false}>
                  {people.map((person, idx) => (
                    <motion.div
                      key={person.id}
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.15 }}
                      className="flex items-center gap-2"
                    >
                      <div
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
                        style={{ backgroundColor: MEMBER_COLORS[idx % MEMBER_COLORS.length] }}
                      >
                        {person.name ? getInitials(person.name) : idx + 1}
                      </div>
                      <Input
                        placeholder={t('groups.personName')}
                        value={person.name}
                        onChange={(e) => updatePersonName(person.id, e.target.value)}
                        className="flex-1"
                        autoFocus={idx === 0}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive"
                        onClick={() => removePerson(person.id)}
                        disabled={people.length <= 2}
                        aria-label={t('groups.removePerson')}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    </motion.div>
                  ))}
                </AnimatePresence>

                <Button
                  variant="outline"
                  size="sm"
                  className="w-full border-dashed"
                  onClick={addPerson}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  {t('groups.addPersonQuick')}
                </Button>
              </motion.div>
            )}

            {/* Step 2: Amount */}
            {step === 'amount' && (
              <motion.div
                key="amount"
                variants={stepVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.2 }}
                className="space-y-5"
              >
                {/* Mode tabs */}
                <div className="grid grid-cols-2 gap-2">
                  <motion.button
                    type="button"
                    onClick={() => setMode('manual')}
                    whileTap={{ scale: 0.97 }}
                    className={`flex items-center justify-center gap-2 rounded-xl border-2 py-3 px-3 text-sm font-semibold transition-all ${
                      mode === 'manual'
                        ? 'border-primary bg-primary/5'
                        : 'border-border bg-muted/30 hover:bg-muted/60'
                    }`}
                  >
                    <DollarSign className="h-4 w-4" />
                    {t('groups.enterAmount')}
                  </motion.button>
                  <motion.button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    whileTap={{ scale: 0.97 }}
                    className={`flex items-center justify-center gap-2 rounded-xl border-2 py-3 px-3 text-sm font-semibold transition-all ${
                      mode === 'receipt'
                        ? 'border-primary bg-primary/5'
                        : 'border-border bg-muted/30 hover:bg-muted/60'
                    }`}
                  >
                    {scanning ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Camera className="h-4 w-4" />
                    )}
                    {t('groups.orScanReceipt')}
                  </motion.button>
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={handleFileChange}
                />

                {/* Manual amount input */}
                {mode === 'manual' && (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>{t('groups.totalAmount')}</Label>
                      <div className="relative">
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="0.00"
                          value={totalAmount}
                          onChange={(e) => setTotalAmount(e.target.value)}
                          className="text-2xl font-bold h-14 pl-4 pr-16"
                          autoFocus
                        />
                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground font-medium">
                          PLN
                        </span>
                      </div>
                    </div>

                    {/* Split type toggle */}
                    <div className="space-y-2">
                      <Label>{t('groups.splitMethod')}</Label>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setSplitType('equal')}
                          className={`rounded-lg border-2 py-2.5 text-sm font-medium transition-all ${
                            splitType === 'equal'
                              ? 'border-primary bg-primary/5 text-primary'
                              : 'border-border hover:bg-muted/50'
                          }`}
                        >
                          {t('groups.equalSplitMode')}
                        </button>
                        <button
                          type="button"
                          onClick={() => setSplitType('custom')}
                          className={`rounded-lg border-2 py-2.5 text-sm font-medium transition-all ${
                            splitType === 'custom'
                              ? 'border-primary bg-primary/5 text-primary'
                              : 'border-border hover:bg-muted/50'
                          }`}
                        >
                          {t('groups.customSplitMode')}
                        </button>
                      </div>
                    </div>

                    {/* Equal split preview */}
                    {splitType === 'equal' && total > 0 && (
                      <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="rounded-xl bg-muted/50 p-4 space-y-2"
                      >
                        <p className="text-xs font-medium text-muted-foreground">{t('groups.eachPays')}</p>
                        <p className="text-2xl font-bold tabular-nums">
                          {perPerson.toFixed(2)} <span className="text-base text-muted-foreground">PLN</span>
                        </p>
                        <div className="flex -space-x-2 mt-2">
                          {validPeople.map((p, idx) => (
                            <div
                              key={p.id}
                              title={p.name}
                              className="h-7 w-7 rounded-full border-2 border-background flex items-center justify-center text-[10px] font-semibold text-white"
                              style={{ backgroundColor: MEMBER_COLORS[idx % MEMBER_COLORS.length] }}
                            >
                              {getInitials(p.name)}
                            </div>
                          ))}
                        </div>
                      </motion.div>
                    )}

                    {/* Custom split inputs */}
                    {splitType === 'custom' && (
                      <div className="space-y-2">
                        {validPeople.map((p, idx) => (
                          <div key={p.id} className="flex items-center gap-2">
                            <div
                              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
                              style={{ backgroundColor: MEMBER_COLORS[idx % MEMBER_COLORS.length] }}
                            >
                              {getInitials(p.name)}
                            </div>
                            <span className="text-sm font-medium flex-1 truncate">{p.name}</span>
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              placeholder="0.00"
                              value={p.customAmount || ''}
                              onChange={(e) => updatePersonAmount(p.id, parseFloat(e.target.value) || 0)}
                              className="w-28 text-right"
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Receipt items */}
                {mode === 'receipt' && receiptItems.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Receipt className="h-4 w-4 text-muted-foreground" />
                      <Label>
                        {receiptItems.length} {t('groups.items')}
                      </Label>
                    </div>

                    {/* AI suggestion banner */}
                    {(loadingAi || aiSuggestions) && (
                      <AiSplitSuggestion
                        loading={loadingAi}
                        suggestions={aiSuggestions}
                        onAccept={acceptAiSuggestions}
                        onDismiss={() => setAiSuggestions(null)}
                      />
                    )}

                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {receiptItems.map((item, idx) => (
                        <div
                          key={idx}
                          className="rounded-lg border bg-card p-3 space-y-2"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium truncate flex-1">{item.name}</span>
                            <span className="text-sm font-bold tabular-nums ml-2">
                              {item.price.toFixed(2)}
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {validPeople.map((p, pIdx) => {
                              const isSelected = item.assignedTo.includes(p.name)
                              return (
                                <button
                                  key={p.id}
                                  type="button"
                                  onClick={() => toggleItemAssignment(idx, p.name)}
                                  className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium transition-all border ${
                                    isSelected
                                      ? 'border-primary bg-primary/10 text-primary'
                                      : 'border-border bg-muted/30 text-muted-foreground hover:bg-muted/60'
                                  }`}
                                >
                                  <div
                                    className="h-3.5 w-3.5 rounded-full flex items-center justify-center"
                                    style={{ backgroundColor: MEMBER_COLORS[pIdx % MEMBER_COLORS.length] }}
                                  >
                                    {isSelected && <Check className="h-2.5 w-2.5 text-white" />}
                                  </div>
                                  {p.name.split(' ')[0]}
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t">
                      <span className="text-sm font-medium">{t('groups.totalAmount')}</span>
                      <span className="text-lg font-bold tabular-nums">{total.toFixed(2)} PLN</span>
                    </div>
                  </div>
                )}
              </motion.div>
            )}

            {/* Step 3: Review */}
            {step === 'review' && (
              <motion.div
                key="review"
                variants={stepVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.2 }}
                className="space-y-5"
              >
                <div className="text-center space-y-2">
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', damping: 15, stiffness: 200, delay: 0.1 }}
                    className="flex h-16 w-16 mx-auto items-center justify-center rounded-2xl bg-emerald-100 dark:bg-emerald-900/20"
                  >
                    <Check className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
                  </motion.div>
                  <h3 className="text-lg font-bold">{t('groups.splitSummary')}</h3>
                </div>

                <div className="space-y-2">
                  {Object.entries(computeSplitResult()).map(([name, amount], idx) => (
                    <motion.div
                      key={name}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.05 }}
                      className="flex items-center justify-between rounded-xl border bg-card p-3.5"
                    >
                      <div className="flex items-center gap-2.5">
                        <div
                          className="flex h-9 w-9 items-center justify-center rounded-full text-xs font-semibold text-white"
                          style={{ backgroundColor: MEMBER_COLORS[idx % MEMBER_COLORS.length] }}
                        >
                          {getInitials(name)}
                        </div>
                        <span className="font-medium">{name}</span>
                      </div>
                      <span className="text-lg font-bold tabular-nums">
                        {amount.toFixed(2)} <span className="text-sm text-muted-foreground">PLN</span>
                      </span>
                    </motion.div>
                  ))}
                </div>

                <div className="rounded-xl bg-muted/50 p-4 flex items-center justify-between">
                  <span className="font-medium">{t('groups.totalAmount')}</span>
                  <span className="text-xl font-bold tabular-nums">{total.toFixed(2)} PLN</span>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-2">
                  <Button variant="outline" onClick={handleShareResult} className="gap-2">
                    <Copy className="h-4 w-4" />
                    {t('groups.shareResult')}
                  </Button>
                  <Button
                    onClick={() => {
                      reset()
                      onOpenChange(false)
                      toast.success(t('groups.done'))
                    }}
                    className="gap-2"
                  >
                    <Check className="h-4 w-4" />
                    {t('groups.done')}
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Navigation footer */}
        {step !== 'review' && (
          <div className="p-6 pt-4 border-t flex gap-3">
            {step !== 'people' && (
              <Button variant="outline" onClick={goBack} className="gap-2">
                <ArrowLeft className="h-4 w-4" />
                {t('groups.back')}
              </Button>
            )}
            <Button
              className="flex-1 gap-2"
              onClick={goNext}
              disabled={!canGoNext()}
            >
              {t('groups.next')}
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
