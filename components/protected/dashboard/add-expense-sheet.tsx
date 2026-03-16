'use client'

import * as React from 'react'
import { z } from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  UploadCloud,
  X,
  Loader2,
  AlertCircle,
  Calendar as CalendarIcon,
  FileText,
  RefreshCcw,
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
    <div className="flex items-center gap-3 rounded-md border bg-muted/40 px-3 py-2">
      {previewSrc ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={previewSrc}
          alt={file.name}
          className="h-10 w-10 rounded border object-cover shrink-0"
        />
      ) : (
        <div className="h-10 w-10 rounded border bg-muted flex items-center justify-center shrink-0">
          <FileText className="h-4 w-4 text-muted-foreground" />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{file.name}</p>
        <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(0)} KB</p>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
        onClick={onRemove}
        disabled={disabled}
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

const expenseFormSchema = z.object({
  amount: z
    .string()
    .min(1, { message: 'Amount is required.' })
    .regex(/^\d+(\.\d{1,2})?$/, {
      message: 'Enter a valid amount, e.g., 12.50.',
    }),
  description: z.string().min(1, { message: 'Description is required.' }),
  date: z.date({ message: 'Date is required.' }),
  category: z.string().min(1, { message: 'Category is required.' }),
  vendor: z.string().optional(),
  notes: z.string().optional(),
})

type ExpenseFormValues = z.infer<typeof expenseFormSchema>

interface AddExpenseSheetProps {
  isOpen: boolean
  onClose: () => void
  onAction?: () => void
}

export function AddExpenseSheet({
  isOpen,
  onClose,
  onAction,
}: AddExpenseSheetProps) {
  const { t } = useTranslation()
  const [categories, setCategories] = React.useState<
    { id: string; name: string; icon?: string }[]
  >([])
  const [currency, setCurrency] = React.useState('PLN')
  const [files, setFiles] = React.useState<File[]>([])
  const [isUploading, setIsUploading] = React.useState(false)
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [formError, setFormError] = React.useState<string | null>(null)

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

  React.useEffect(() => {
    const fetchSettings = async () => {
      try {
        const res = await fetch('/api/data/settings')
        if (!res.ok) return
        const data = await res.json()
        if (data.categories) {
          setCategories(
            [...data.categories].sort((a: any, b: any) =>
              (a.name || '').localeCompare(b.name || '')
            )
          )
        }
        if (data.settings?.currency) {
          setCurrency(data.settings.currency.toUpperCase())
        }
      } catch (err) {
        if (process.env.NODE_ENV === 'development') {
          console.error('[AddExpense] settings fetch error:', err)
        }
        setFormError(t('addExpense.failedLoadCategories'))
      }
    }
    fetchSettings()
  }, [])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const maxFileSize = 10 * 1024 * 1024; // 10MB
      const newFiles = Array.from(e.target.files).filter(file => {
        if (file.size > maxFileSize) {
          toast.error(t('addExpense.fileTooLarge'), {
            description: `${file.name} exceeds the 10MB limit.`
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

    const amount = Number(data.amount)
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
            source: 'manual',
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
            source: 'manual',
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

  const handleClose = () => {
    form.reset()
    setFiles([])
    setFormError(null)
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
                          inputMode="decimal"
                          placeholder="e.g., 25.90"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="date"
                  render={({ field }) => {
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
                    )
                  }}
                />
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
                          className="w-full rounded-md border border-input bg-background p-2 text-sm"
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
                        <Input {...field} placeholder={t('addExpense.optional')} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

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

              {/* File upload */}
              <div className="space-y-2">
                <FormLabel suppressHydrationWarning>{t('addExpense.attachReceipt')}</FormLabel>
                <label
                  htmlFor="file-upload"
                  className={cn(
                    'relative flex w-full cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/20 bg-muted/30 p-8 transition-colors hover:bg-muted/50',
                    isLoading && 'cursor-not-allowed opacity-50'
                  )}
                >
                  <UploadCloud className="h-8 w-8 text-muted-foreground" />
                  <p className="mt-1 text-sm text-muted-foreground" suppressHydrationWarning>
                    <span className="font-semibold text-primary">{t('addExpense.upload')}</span>{' '}
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
                <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 space-y-3">
                  <div className="flex items-start gap-2 text-sm text-destructive">
                    <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                    <span className="leading-relaxed">{formError}</span>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full gap-2 border-destructive/40 text-destructive hover:bg-destructive/10"
                    onClick={() => setFormError(null)}
                  >
                    <RefreshCcw className="h-3.5 w-3.5" />
                    {t('expenses.retry')}
                  </Button>
                </div>
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
