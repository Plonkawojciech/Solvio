'use client'

import * as React from 'react'
import { z } from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { UploadCloud, X, Loader2, AlertCircle, Calendar as CalendarIcon } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { format } from 'date-fns'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from '@/components/ui/sheet'
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormControl,
} from '@/components/ui/form'
import { cn } from '@/lib/utils'

// shadcn DatePicker bits
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'

const expenseFormSchema = z.object({
  amount: z
    .string()
    .min(1, { message: 'Amount is required.' })
    .regex(/^\d+(\.\d{1,2})?$/, { message: 'Enter a valid amount, e.g., 12.50.' }),
  description: z.string().min(1, { message: 'Description is required.' }),
  date: z.date({ required_error: 'Date is required.' }),
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

export function AddExpenseSheet({ isOpen, onClose, onAction }: AddExpenseSheetProps) {
  const supabase = React.useMemo(() => createClient(), [])
  const [categories, setCategories] = React.useState<{ id: string; name: string; icon?: string }[]>([])
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
    const fetchCategories = async () => {
      const { data, error } = await supabase.from('categories').select('*').order('name')
      if (error) console.error(error)
      else setCategories(data || [])
    }
    fetchCategories()
  }, [supabase])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) setFiles((prev) => [...prev, ...Array.from(e.target.files)])
  }

  const handleFileDrop = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.dataTransfer.files) setFiles((prev) => [...prev, ...Array.from(e.dataTransfer.files)])
  }

  const removeFile = (i: number) => setFiles((prev) => prev.filter((_, idx) => idx !== i))

  const onSubmit = async (data: ExpenseFormValues) => {
    setIsSubmitting(true)
    setFormError(null)

    const { data: userData } = await supabase.auth.getUser()
    const user = userData?.user
    if (!user) {
      setFormError('You must be logged in.')
      setIsSubmitting(false)
      return
    }

    const amount = Number(data.amount)
    const dateISO = format(data.date, 'yyyy-MM-dd') // DB expects date string

    try {
      let receiptId: string | null = null

      if (files.length > 0) {
        setIsUploading(true)
        const { data: receipt, error: receiptError } = await supabase
          .from('receipts')
          .insert([{ user_id: user.id, vendor: data.vendor || null, notes: data.notes }])
          .select()
          .single()
        if (receiptError) throw receiptError
        receiptId = receipt.id

        for (const file of files) {
          const path = `${user.id}/${receiptId}/${file.name}`
          const { error: uploadError } = await supabase.storage.from('receipts').upload(path, file, { upsert: true })
          if (uploadError) throw uploadError

          const { data: pub } = supabase.storage.from('receipts').getPublicUrl(path)
          const publicUrl = pub.publicUrl

          const { error: imgError } = await supabase.from('receipt_images').insert([{ receipt_id: receiptId, image_url: publicUrl }])
          if (imgError) throw imgError
        }
        setIsUploading(false)
      }

      const { error: expenseError } = await supabase.from('expenses').insert([
        {
          user_id: user.id,
          receipt_id: receiptId,
          category_id: data.category,
          title: data.description,
          amount,
          date: dateISO,
          notes: data.notes,
          source: files.length > 0 ? 'ocr' : 'manual',
        },
      ])
      if (expenseError) throw expenseError

      toast.success('Expense added', { description: 'Your expense has been saved.' })

      form.reset({ amount: '', description: '', date: new Date(), category: '', vendor: '', notes: '' })
      setFiles([])

      onAction?.()   // ⬅️ informujemy triggera: odśwież i zamknij
    } catch (error: any) {
      console.error(error)
      const msg = error?.message || 'Failed to save expense.'
      setFormError(msg)
      toast.error('Error', { description: msg })
    } finally {
      setIsSubmitting(false)
      setIsUploading(false)
    }
  }

  const handleClose = () => {
    form.reset({ amount: '', description: '', date: new Date(), category: '', vendor: '', notes: '' })
    setFiles([])
    setFormError(null)
    onClose()
  }

  const isLoading = isSubmitting || isUploading

  return (
    <Sheet open={isOpen} onOpenChange={handleClose}>
      <SheetContent className="flex flex-col gap-0 p-0 sm:max-w-lg">
        <SheetHeader className="p-6">
          <SheetTitle>New Expense</SheetTitle>
          <SheetDescription>Add a new expense manually or with a receipt.</SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          <Form {...form}>
            <form id="add-expense-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="e.g., Coffee at café" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Amount (PLN)</FormLabel>
                    <FormControl>
                      <Input {...field} inputMode="decimal" placeholder="e.g., 12.50" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="date"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Date</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn('justify-start text-left font-normal', !field.value && 'text-muted-foreground')}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {field.value ? format(field.value, 'LLL dd, yyyy') : <span>Pick a date</span>}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value}
                          onSelect={(d) => d && field.onChange(d)}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Category</FormLabel>
                    <FormControl>
                      <select
                        {...field}
                        className="w-full rounded-md border border-input bg-background p-2 text-sm"
                      >
                        <option value="">Select category</option>
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

              {/* Receipt upload */}
              <div className="space-y-2">
                <FormLabel>Receipt / photo</FormLabel>
                <label
                  htmlFor="file-upload"
                  className={cn(
                    'relative flex w-full cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/30 bg-muted/50 p-10 transition-colors hover:bg-muted/80',
                    isLoading && 'cursor-not-allowed opacity-50'
                  )}
                  onDrop={handleFileDrop}
                  onDragOver={(e) => e.preventDefault()}
                >
                  <UploadCloud className="h-10 w-10 text-muted-foreground" />
                  <p className="mt-2 text-sm text-muted-foreground">
                    <span className="font-semibold text-primary">Click to upload</span> or drag and drop
                  </p>
                  <Input
                    id="file-upload"
                    type="file"
                    multiple
                    accept="image/png, image/jpeg"
                    className="hidden"
                    onChange={handleFileChange}
                    disabled={isLoading}
                  />
                </label>

                {files.length > 0 && (
                  <div className="space-y-2 pt-2">
                    <p className="text-sm font-medium">Selected files:</p>
                    <div className="space-y-2">
                      {files.map((file, index) => (
                        <div key={index} className="flex items-center justify-between rounded-md border bg-muted/50 p-2">
                          <span className="truncate text-sm">{file.name}</span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => removeFile(index)}
                            disabled={isLoading}
                            aria-label={`Remove ${file.name}`}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {formError && (
                <div className="flex items-center gap-2 text-sm text-destructive">
                  <AlertCircle className="h-4 w-4" />
                  <span>{formError}</span>
                </div>
              )}
            </form>
          </Form>
        </div>

        <SheetFooter className="mt-auto border-t p-6">
          <Button type="button" variant="outline" onClick={handleClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button type="submit" form="add-expense-form" disabled={isLoading}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isUploading ? 'Uploading...' : isSubmitting ? 'Saving...' : 'Save expense'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
