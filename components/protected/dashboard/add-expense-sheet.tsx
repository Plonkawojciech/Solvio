'use client'

import * as React from 'react'
import { z } from 'zod'
import { useForm, UseFormReturn } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  UploadCloud,
  X,
  Loader2,
  Calendar as CalendarIcon,
  FileText,
  RefreshCcw,
  Tag,
} from 'lucide-react'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/lib/i18n'

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormControl,
} from '@/components/ui/form'
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import { Alert } from '@/components/ui/alert'

// ── File row with image thumbnail ─────────────────────────────────────────────

function FileRow({
  file,
  onRemove,
  disabled,
}: {
  file: File
  onRemove: () => void
  disabled?: boolean
}) {
  const { t } = useTranslation()
  const [previewSrc, setPreviewSrc] = React.useState<string | null>(null)
  const isImage =
    file.type.startsWith('image/') ||
    /\.(jpe?g|png|webp)$/i.test(file.name)
  const isHeic = /\.(heic|heif)$/i.test(file.name) || file.type.includes('heic')

  React.useEffect(() => {
    if (!isImage || isHeic) return
    const url = URL.createObjectURL(file)
    setPreviewSrc(url)
    return () => URL.revokeObjectURL(url)
  }, [file, isImage, isHeic])

  return (
    <div className="flex items-center gap-3 rounded-md border-2 border-foreground bg-card px-3 py-2 shadow-[2px_2px_0_hsl(var(--foreground))]">
      {previewSrc ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={previewSrc}
          alt={file.name}
          className="h-10 w-10 rounded-md border-2 border-foreground object-cover shrink-0"
        />
      ) : (
        <div className="h-10 w-10 rounded-md border-2 border-foreground bg-secondary flex items-center justify-center shrink-0">
          <FileText className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold truncate">{file.name}</p>
        <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(0)} KB</p>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="shrink-0 text-muted-foreground hover:bg-destructive hover:text-destructive-foreground"
        onClick={onRemove}
        disabled={disabled}
        aria-label={`${t('addExpense.removeFile')}: ${file.name}`}
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </Button>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

const expenseFormSchema = z.object({
  amount: z
    .string()
    .min(1, { message: 'Amount is required.' })
    .regex(/^\d+([.,]\d{1,2})?$/, {
      message: 'Enter a valid amount, e.g., 12.50 or 12,50.',
    }),
  description: z.string().min(1, { message: 'Description is required.' }),
  date: z.date({ message: 'Date is required.' }),
  category: z.string().min(1, { message: 'Category is required.' }),
  vendor: z.string().optional(),
  notes: z.string().optional(),
})

type ExpenseFormValues = z.infer<typeof expenseFormSchema>

// ── Date picker sub-component — hooks must live at component level ────────────

type ExpenseFormValuesForDate = z.infer<typeof expenseFormSchema>

function DatePickerField({
  form,
  t,
}: {
  form: UseFormReturn<ExpenseFormValuesForDate>
  t: (key: string) => string
}) {
  const [open, setOpen] = React.useState(false)
  const triggerRef = React.useRef<HTMLButtonElement>(null)
  const [triggerWidth, setTriggerWidth] = React.useState<number>(0)

  React.useEffect(() => {
    const measure = () => {
      if (triggerRef.current) setTriggerWidth(triggerRef.current.offsetWidth)
    }
    measure()
    const ro = new ResizeObserver(measure)
    if (triggerRef.current) ro.observe(triggerRef.current)
    window.addEventListener('resize', measure)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [])

  return (
    <FormField
      control={form.control}
      name="date"
      render={({ field }) => (
        <FormItem>
          <FormLabel suppressHydrationWarning>{t('addExpense.date')}</FormLabel>
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button
                ref={triggerRef}
                variant="outline"
                className={cn(
                  "justify-start text-left font-normal w-full",
                  !field.value && "text-muted-foreground"
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {field.value ? format(field.value, "LLL dd, yyyy") : t('addExpense.pickDate')}
              </Button>
            </PopoverTrigger>
            <PopoverContent
              align="start"
              sideOffset={4}
              className="p-0"
              style={{ width: triggerWidth }}
            >
              <div className="w-full">
                <Calendar
                  mode="single"
                  selected={field.value}
                  onSelect={(d) => d && field.onChange(d)}
                  className="w-full"
                />
              </div>
            </PopoverContent>
          </Popover>
          <FormMessage />
        </FormItem>
      )}
    />
  )
}

// ─────────────────────────────────────────────────────────────────────────────

interface ExpenseForSuggestion {
  vendor: string | null
  title: string
  categoryId: string | null
}

interface MerchantRule {
  vendor: string
  categoryId: string
  count: number
}

interface AddExpenseSheetProps {
  isOpen: boolean
  onClose: () => void
  onAction?: () => void
  allExpenses?: ExpenseForSuggestion[]
}

export function AddExpenseSheet({
  isOpen,
  onClose,
  onAction,
  allExpenses = [],
}: AddExpenseSheetProps) {
  const { t, lang } = useTranslation()
  const [categories, setCategories] = React.useState<
    { id: string; name: string; icon?: string }[]
  >([])
  const [currency, setCurrency] = React.useState('PLN')
  const [files, setFiles] = React.useState<File[]>([])
  const [isUploading, setIsUploading] = React.useState(false)
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [formError, setFormError] = React.useState<string | null>(null)

  // ── Tags state ───────────────────────────────────────────────────────────
  const [tags, setTags] = React.useState<string[]>([])
  const [tagInput, setTagInput] = React.useState('')
  const MAX_TAGS = 5

  // ── Merchant rules (auto-categorization) ─────────────────────────────────
  const [merchantRules, setMerchantRules] = React.useState<MerchantRule[]>([])
  const [categoryAppliedByRule, setCategoryAppliedByRule] = React.useState<string | null>(null)

  // ── Category auto-suggest ────────────────────────────────────────────────
  const [debouncedVendor, setDebouncedVendor] = React.useState('')
  const [debouncedDesc, setDebouncedDesc] = React.useState('')
  const suggestDebounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  // Debounce vendor + description inputs
  const handleVendorChange = React.useCallback((val: string) => {
    if (suggestDebounceRef.current) clearTimeout(suggestDebounceRef.current)
    suggestDebounceRef.current = setTimeout(() => setDebouncedVendor(val), 400)
  }, [])

  const handleDescChange = React.useCallback((val: string) => {
    if (suggestDebounceRef.current) clearTimeout(suggestDebounceRef.current)
    suggestDebounceRef.current = setTimeout(() => setDebouncedDesc(val), 400)
  }, [])

  // Compute suggestion: find most-frequent categoryId for matching vendor/title
  const suggestedCategoryId = React.useMemo(() => {
    if (!allExpenses.length) return null
    const query = (debouncedVendor || debouncedDesc).trim().toLowerCase()
    if (query.length < 2) return null

    const matches = allExpenses.filter(e => {
      const v = (e.vendor || '').toLowerCase()
      const titleStr = (e.title || '').toLowerCase()
      return (v && v.startsWith(query)) || (titleStr && titleStr.startsWith(query))
    }).filter(e => e.categoryId)

    if (matches.length < 2) return null

    // Count occurrences per categoryId
    const freq: Record<string, number> = {}
    for (const e of matches) {
      const cid = e.categoryId!
      freq[cid] = (freq[cid] || 0) + 1
    }
    const best = Object.entries(freq).sort((a, b) => b[1] - a[1])[0]
    if (!best || best[1] < 2) return null
    return best[0]
  }, [allExpenses, debouncedVendor, debouncedDesc])

  const suggestedCategory = React.useMemo(() => {
    if (!suggestedCategoryId) return null
    return categories.find(c => c.id === suggestedCategoryId) || null
  }, [suggestedCategoryId, categories])

  // Merchant rule match: exact vendor match in rules
  const matchedRule = React.useMemo(() => {
    if (!debouncedVendor || merchantRules.length === 0) return null
    const query = debouncedVendor.trim().toLowerCase()
    if (query.length < 2) return null
    return merchantRules.find(r => r.vendor === query || r.vendor.startsWith(query) || query.startsWith(r.vendor)) || null
  }, [debouncedVendor, merchantRules])

  const matchedRuleCategory = React.useMemo(() => {
    if (!matchedRule) return null
    return categories.find(c => c.id === matchedRule.categoryId) || null
  }, [matchedRule, categories])

  const form = useForm<ExpenseFormValues>({
    resolver: zodResolver(expenseFormSchema),
    defaultValues: {
      amount: '',
      description: '',
      date: new Date(),
      category: '',
      vendor: '',
      notes: '',
    },
  })

  // Auto-apply rule when vendor typed and no category manually selected yet
  React.useEffect(() => {
    const currentCategory = form.getValues('category')
    if (matchedRule && matchedRuleCategory && !currentCategory) {
      form.setValue('category', matchedRule.categoryId, { shouldValidate: true })
      setCategoryAppliedByRule(matchedRuleCategory.name)
    } else if (!matchedRule && categoryAppliedByRule) {
      // Vendor changed, no longer matches — clear the rule-applied state
      setCategoryAppliedByRule(null)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchedRule, matchedRuleCategory])

  // Duplicate detection: same vendor + similar amount within last 7 days
  const [formAmount, setFormAmount] = React.useState('')
  const possibleDuplicate = React.useMemo(() => {
    if (!allExpenses.length || !debouncedVendor || !formAmount) return null
    const amt = parseFloat(formAmount.replace(',', '.'))
    if (isNaN(amt) || amt <= 0) return null
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
    const sevenDaysAgoStr = sevenDaysAgo.toISOString().slice(0, 10)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (allExpenses as any[]).find(e => {
      const vendorMatch = e.vendor && debouncedVendor &&
        e.vendor.toLowerCase().trim() === debouncedVendor.toLowerCase().trim()
      const amtMatch = Math.abs(parseFloat(e.amount || '0') - amt) < 0.01
      const recentEnough = e.date && e.date >= sevenDaysAgoStr
      return vendorMatch && amtMatch && recentEnough
    }) || null
  }, [allExpenses, debouncedVendor, formAmount])

  React.useEffect(() => {
    const fetchAll = async () => {
      try {
        const [settingsRes, rulesRes] = await Promise.all([
          fetch('/api/data/settings'),
          fetch('/api/personal/merchant-rules'),
        ])
        if (settingsRes.ok) {
          const data = await settingsRes.json()
          if (data.categories) {
            setCategories(
              [...data.categories].sort((a: { name?: string }, b: { name?: string }) =>
                (a.name || '').localeCompare(b.name || '')
              )
            )
          }
          if (data.settings?.currency) {
            setCurrency(data.settings.currency.toUpperCase())
          }
        }
        if (rulesRes.ok) {
          const rulesData = await rulesRes.json()
          if (rulesData.rules) setMerchantRules(rulesData.rules)
        }
      } catch (err) {
        if (process.env.NODE_ENV === 'development') {
          console.error('[AddExpense] settings fetch error:', err)
        }
        setFormError(t('addExpense.failedLoadCategories'))
      }
    }
    fetchAll()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const maxFileSize = 10 * 1024 * 1024; // 10MB
      const newFiles = Array.from(e.target.files).filter(file => {
        if (file.size > maxFileSize) {
          toast.error(t('addExpense.fileTooLarge'), {
            description: t('addExpense.fileTooLargeDesc').replace('{name}', file.name)
          })
          return false
        }
        return true
      })
      setFiles((prev) => [...prev, ...newFiles])
    }
  }

  const removeFile = (i: number) =>
    setFiles((prev) => prev.filter((_, idx) => idx !== i))

  const onSubmit = async (data: ExpenseFormValues) => {
    setIsSubmitting(true)
    setFormError(null)

    const amount = Number(data.amount.replace(',', '.'))
    const dateISO = format(data.date, 'yyyy-MM-dd')

    try {
      // If files attached, upload via OCR route which creates receipt + expense
      if (files.length > 0) {
        setIsUploading(true)

        // First create expense via API, then attach files via OCR
        const expRes = await fetch('/api/data/expenses', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: data.description,
            amount,
            date: dateISO,
            categoryId: data.category,
            vendor: data.vendor || null,
            notes: data.notes || null,
            currency,
            source: 'manual',
            tags: tags.length > 0 ? tags : null,
          }),
        })
        if (!expRes.ok) {
          const msg = await expRes.text()
          throw new Error(msg || 'Failed to create expense')
        }
        setIsUploading(false)
      } else {
        // No files — just create expense
        const expRes = await fetch('/api/data/expenses', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: data.description,
            amount,
            date: dateISO,
            categoryId: data.category,
            vendor: data.vendor || null,
            notes: data.notes || null,
            currency,
            source: 'manual',
            tags: tags.length > 0 ? tags : null,
          }),
        })
        if (!expRes.ok) {
          const msg = await expRes.text()
          throw new Error(msg || 'Failed to create expense')
        }
      }

      toast.success(t('addExpense.added'), {
        description: t('addExpense.addedDesc'),
      })
      form.reset()
      setFiles([])
      setTags([])
      setTagInput('')
      setCategoryAppliedByRule(null)
      onAction?.()
      onClose()
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Failed to save expense.'
      if (process.env.NODE_ENV === 'development') {
        console.error('[AddExpense] error:', error)
      }
      setFormError(msg)
      toast.error(t('receipts.error'), { description: msg })
    } finally {
      setIsSubmitting(false)
      setIsUploading(false)
    }
  }

  // ── Tag helpers ──────────────────────────────────────────────────────────
  const addTag = (tag: string) => {
    const clean = tag.trim().toLowerCase()
    if (!clean || tags.includes(clean) || tags.length >= MAX_TAGS) return
    setTags(prev => [...prev, clean])
    setTagInput('')
  }

  const removeTag = (tag: string) => {
    setTags(prev => prev.filter(t => t !== tag))
  }

  const handleTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      addTag(tagInput)
    } else if (e.key === 'Backspace' && !tagInput && tags.length > 0) {
      setTags(prev => prev.slice(0, -1))
    }
  }

  const handleClose = () => {
    form.reset()
    setFiles([])
    setFormError(null)
    setDebouncedVendor('')
    setDebouncedDesc('')
    setTags([])
    setTagInput('')
    setCategoryAppliedByRule(null)
    onClose()
  }

  const isLoading = isSubmitting || isUploading

  return (
    <Sheet open={isOpen} onOpenChange={handleClose}>
      <SheetContent className="w-full flex flex-col gap-0 p-0 sm:max-w-2xl">
        <SheetHeader className="p-6 border-b">
          <SheetTitle className="text-xl font-semibold" suppressHydrationWarning>{t('addExpense.title')}</SheetTitle>
          <SheetDescription suppressHydrationWarning>
            {t('addExpense.subtitle')}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 py-6">
          <Form {...form}>
            <form
              id="add-expense-form"
              onSubmit={form.handleSubmit(onSubmit)}
              className="space-y-6"
            >
              {/* description */}
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel suppressHydrationWarning>{t('addExpense.description')}</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder={t('addExpense.descriptionPlaceholder')}
                        onChange={(e) => {
                          field.onChange(e)
                          handleDescChange(e.target.value)
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* two-column layout */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="amount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel suppressHydrationWarning>{t('addExpense.amount')} ({currency})</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type="text"
                          inputMode="decimal"
                          autoComplete="off"
                          placeholder={t('addExpense.amountPlaceholder')}
                          aria-label={`${t('addExpense.amount')} (${currency})`}
                          aria-required="true"
                          onChange={e => { field.onChange(e); setFormAmount(e.target.value) }}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <DatePickerField form={form} t={t} />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="category"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel suppressHydrationWarning>{t('addExpense.category')}</FormLabel>
                      <FormControl>
                        <select
                          {...field}
                          aria-required="true"
                          onChange={(e) => {
                            field.onChange(e)
                            if (categoryAppliedByRule) setCategoryAppliedByRule(null)
                          }}
                          className="flex h-11 w-full items-center rounded-md border-2 border-foreground bg-background px-3 text-base md:text-sm font-medium shadow-[2px_2px_0_hsl(var(--foreground))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                        >
                          <option value="">{t('addExpense.selectCategory')}</option>
                          {categories.map((cat) => (
                            <option key={cat.id} value={cat.id}>
                              {cat.icon ? `${cat.icon} ${cat.name}` : cat.name}
                            </option>
                          ))}
                        </select>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="vendor"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel suppressHydrationWarning>{t('addExpense.vendor')}</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder={t('addExpense.optional')}
                          onChange={(e) => {
                            field.onChange(e)
                            handleVendorChange(e.target.value)
                          }}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Duplicate expense warning */}
              {possibleDuplicate && (
                <Alert variant="warning">
                  <span suppressHydrationWarning>
                    {t('addExpense.possibleDuplicate') || (lang === 'pl'
                      ? `Możliwy duplikat: podobny wydatek z ${possibleDuplicate.date} już istnieje`
                      : `Possible duplicate: similar expense from ${possibleDuplicate.date} already exists`
                    )}
                  </span>
                </Alert>
              )}

              {/* Merchant rule auto-applied indicator */}
              {categoryAppliedByRule && (
                <Alert variant="success" hideIcon>
                  <div className="flex items-center gap-2">
                    <Tag className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span className="flex-1" suppressHydrationWarning>
                      {t('addExpense.autoAppliedCategory')}: <strong>{categoryAppliedByRule}</strong>
                      {' '}
                      <span className="text-xs opacity-70">
                        ({t('addExpense.autoAppliedHint')})
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        form.setValue('category', '', { shouldValidate: false })
                        setCategoryAppliedByRule(null)
                      }}
                      className="shrink-0 rounded-md p-1 hover:bg-foreground/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/50"
                      aria-label={t('addExpense.clearAutoCategory') || 'Clear auto-applied category'}
                    >
                      <X className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                </Alert>
              )}

              {/* Category auto-suggest chip (history-based, only when no rule applied) */}
              {suggestedCategory && !form.getValues('category') && !categoryAppliedByRule && (
                <Alert variant="info" hideIcon>
                  <div className="flex items-center gap-2">
                    <Tag className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span className="flex-1" suppressHydrationWarning>
                      {t('addExpense.suggestedCategory')}:
                    </span>
                    <button
                      type="button"
                      onClick={() => form.setValue('category', suggestedCategory.id, { shouldValidate: true })}
                      className="font-extrabold underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/50 rounded-md px-1"
                    >
                      {suggestedCategory.icon ? `${suggestedCategory.icon} ${suggestedCategory.name}` : suggestedCategory.name}
                    </button>
                  </div>
                </Alert>
              )}

              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel suppressHydrationWarning>{t('addExpense.notes')}</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder={t('addExpense.notesPlaceholder')} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Tags input */}
              <div className="space-y-2">
                <FormLabel suppressHydrationWarning>{t('expenses.tags')}</FormLabel>
                {/* Suggested tags */}
                <div className="flex flex-wrap gap-1.5">
                  {(['praca', 'dom', 'jedzenie', 'transport', 'wyjście', 'subskrypcja'] as const).map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      onClick={() => addTag(suggestion)}
                      disabled={tags.includes(suggestion) || tags.length >= MAX_TAGS}
                      className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
                {/* Tag input row */}
                <div className="flex gap-2">
                  <Input
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={handleTagKeyDown}
                    placeholder={t('expenses.addTag')}
                    disabled={tags.length >= MAX_TAGS}
                    className="h-8 text-sm flex-1"
                    maxLength={50}
                  />
                  <button
                    type="button"
                    onClick={() => addTag(tagInput)}
                    disabled={!tagInput.trim() || tags.length >= MAX_TAGS}
                    className="text-xs px-3 py-1 rounded-md border border-input bg-background hover:bg-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    +
                  </button>
                </div>
                {/* Applied tags */}
                {tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {tags.map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary"
                      >
                        {tag}
                        <button
                          type="button"
                          onClick={() => removeTag(tag)}
                          className="hover:text-primary/60 transition-colors leading-none"
                          aria-label={`Remove tag ${tag}`}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* File upload */}
              <div className="space-y-2">
                <FormLabel suppressHydrationWarning>{t('addExpense.attachReceipt')}</FormLabel>
                <label
                  htmlFor="file-upload"
                  className={cn(
                    'relative flex w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed border-foreground/40 bg-secondary/30 p-8 transition-colors hover:bg-secondary/60 focus-within:outline-none focus-within:ring-2 focus-within:ring-foreground/50 focus-within:ring-offset-2',
                    isLoading && 'cursor-not-allowed opacity-50'
                  )}
                >
                  <UploadCloud className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
                  <p className="text-sm text-muted-foreground text-center" suppressHydrationWarning>
                    <span className="font-extrabold text-foreground">{t('addExpense.upload')}</span>{' '}
                    {t('addExpense.uploadOrDrag')}
                  </p>
                  <Input
                    id="file-upload"
                    type="file"
                    multiple
                    accept="image/png, image/jpeg, image/webp, image/heic, image/heif"
                    className="hidden"
                    onChange={handleFileChange}
                    disabled={isLoading}
                  />
                </label>

                {files.length > 0 && (
                  <div className="space-y-2 pt-2">
                    {files.map((file, index) => (
                      <FileRow
                        key={`${file.name}-${file.size}-${index}`}
                        file={file}
                        onRemove={() => removeFile(index)}
                        disabled={isLoading}
                      />
                    ))}
                  </div>
                )}
              </div>

              {formError && (
                <Alert variant="destructive">
                  <div className="space-y-3">
                    <p className="leading-relaxed">{formError}</p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-full gap-2"
                      onClick={() => setFormError(null)}
                    >
                      <RefreshCcw className="h-3.5 w-3.5" aria-hidden="true" />
                      {t('expenses.retry')}
                    </Button>
                  </div>
                </Alert>
              )}
            </form>
          </Form>
        </div>

        <SheetFooter className="mt-auto border-t p-6 flex justify-end gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={handleClose}
            disabled={isLoading}
            suppressHydrationWarning
          >
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="add-expense-form" disabled={isLoading} suppressHydrationWarning>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isUploading
              ? t('addExpense.uploading')
              : isSubmitting
                ? t('addExpense.saving')
                : t('addExpense.save')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
