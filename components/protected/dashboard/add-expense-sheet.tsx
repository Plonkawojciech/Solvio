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
} from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { format } from 'date-fns'
import { cn } from '@/lib/utils'

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

const expenseFormSchema = z.object({
  amount: z
    .string()
    .min(1, { message: 'Amount is required.' })
    .regex(/^\d+(\.\d{1,2})?$/, {
      message: 'Enter a valid amount, e.g., 12.50.',
    }),
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

export function AddExpenseSheet({
  isOpen,
  onClose,
  onAction,
}: AddExpenseSheetProps) {
  const supabase = React.useMemo(() => createClient(), [])
  const [categories, setCategories] = React.useState<
    { id: string; name: string; icon?: string }[]
  >([])
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
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .order('name')
      if (error) console.error(error)
      else setCategories(data || [])
    }
    fetchCategories()
  }, [supabase])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files)
      setFiles((prev) => [...prev, ...Array.from(e.target.files)])
  }

  const removeFile = (i: number) =>
    setFiles((prev) => prev.filter((_, idx) => idx !== i))

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
    const dateISO = format(data.date, 'yyyy-MM-dd')

    try {
      let receiptId: string | null = null

      if (files.length > 0) {
        setIsUploading(true)
        const { data: receipt, error: receiptError } = await supabase
          .from('receipts')
          .insert([
            {
              user_id: user.id,
              vendor: data.vendor || null,
              notes: data.notes,
            },
          ])
          .select()
          .single()
        if (receiptError) throw receiptError
        receiptId = receipt.id

        for (const file of files) {
          const path = `${user.id}/${receiptId}/${file.name}`
          const { error: uploadError } = await supabase.storage
            .from('receipts')
            .upload(path, file, { upsert: true })
          if (uploadError) throw uploadError

          const { data: pub } = supabase.storage
            .from('receipts')
            .getPublicUrl(path)
          await supabase
            .from('receipt_images')
            .insert([{ receipt_id: receiptId, image_url: pub.publicUrl }])
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

      toast.success('Expense added', {
        description: 'Your expense has been saved.',
      })
      form.reset()
      setFiles([])
      onAction?.()
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
    form.reset()
    setFiles([])
    setFormError(null)
    onClose()
  }

  const isLoading = isSubmitting || isUploading

  return (
    <Sheet open={isOpen} onOpenChange={handleClose}>
      <SheetContent className="flex flex-col gap-0 p-0 sm:max-w-2xl">
        <SheetHeader className="p-6 border-b">
          <SheetTitle className="text-xl font-semibold">New Expense</SheetTitle>
          <SheetDescription>
            Add a new expense manually or with a receipt.
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
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="e.g., Lunch at restaurant"
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
                      <FormLabel>Amount (PLN)</FormLabel>
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
                        <FormLabel>Date</FormLabel>
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
                              {field.value ? format(field.value, "LLL dd, yyyy") : "Pick a date"}
                            </Button>
                          </PopoverTrigger>

                          {/* <-- szerokość = szerokość przycisku */}
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

                <FormField
                  control={form.control}
                  name="vendor"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Vendor</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Optional" />
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
                    <FormLabel>Notes</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Optional note..." />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* File upload */}
              <div className="space-y-2">
                <FormLabel>Attach receipt</FormLabel>
                <label
                  htmlFor="file-upload"
                  className={cn(
                    'relative flex w-full cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/20 bg-muted/30 p-8 transition-colors hover:bg-muted/50',
                    isLoading && 'cursor-not-allowed opacity-50'
                  )}
                >
                  <UploadCloud className="h-8 w-8 text-muted-foreground" />
                  <p className="mt-1 text-sm text-muted-foreground">
                    <span className="font-semibold text-primary">Upload</span>{' '}
                    or drag file
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
                    {files.map((file, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between rounded-md border bg-muted/50 px-3 py-2"
                      >
                        <div className="flex items-center gap-2 text-sm truncate">
                          <FileText className="h-4 w-4 text-muted-foreground" />
                          {file.name}
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => removeFile(index)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
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

        <SheetFooter className="mt-auto border-t p-6 flex justify-end gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={handleClose}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button type="submit" form="add-expense-form" disabled={isLoading}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isUploading
              ? 'Uploading...'
              : isSubmitting
                ? 'Saving...'
                : 'Save expense'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
