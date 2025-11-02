'use client'

import * as React from 'react'
import { z } from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { format } from 'date-fns'
import { enUS } from 'date-fns/locale'
import {
    CalendarIcon,
    UploadCloud,
    X,
    Loader2,
    AlertCircle,
} from 'lucide-react'

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
    FormControl,
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from '@/components/ui/form'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { MOCK_CATEGORIES, MOCK_PAYMENT_METHODS } from './mock/data'

// Zod: brak transformacji. amount jako string, konwersja w onSubmit.
// isRecurring jako WYMAGANE boolean, żeby pasowało do RHF.
const expenseFormSchema = z.object({
    amount: z
        .string()
        .min(1, { message: 'Amount is required.' })
        .regex(/^\d+(\.\d{1,2})?$/, {
            message: 'Please enter a valid amount (e.g., 12.50).',
        }),
    description: z.string().min(1, { message: 'Description is required.' }),
    date: z.date({ message: 'Date is required.' }),
    category: z.string().min(1, { message: 'Category is required.' }),
    vendor: z.string().optional(),
    paymentMethod: z.string().optional(),
    isRecurring: z.boolean(),
    notes: z.string().optional(),
})

type ExpenseFormValues = z.infer<typeof expenseFormSchema>

interface AddExpenseSheetProps {
    isOpen: boolean
    onClose: () => void
}

export function AddExpenseSheet({ isOpen, onClose }: AddExpenseSheetProps) {
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
            paymentMethod: '',
            isRecurring: false, // wymagane pole ma domyślną wartość w RHF
            notes: '',
        },
    })

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            setFormError(null)
            const newFiles = Array.from(e.target.files)
            setFiles((prev) => [...prev, ...newFiles])
        }
    }

    const handleFileDrop = (e: React.DragEvent<HTMLLabelElement>) => {
        e.preventDefault()
        e.stopPropagation()
        if (e.dataTransfer.files) {
            setFormError(null)
            const newFiles = Array.from(e.dataTransfer.files)
            setFiles((prev) => [...prev, ...newFiles])
        }
    }

    const removeFile = (indexToRemove: number) => {
        setFiles((prev) => prev.filter((_, i) => i !== indexToRemove))
    }

    // onSubmit bez SubmitHandler<>, RHF poprawnie dopasuje typ z useForm<>
    const onSubmit = async (data: ExpenseFormValues) => {
        setIsSubmitting(true)
        setFormError(null)

        // Konwersja amount -> number dopiero tutaj
        const payload = {
            ...data,
            amount: Number(data.amount),
        }
        console.log('Form Data (parsed):', payload)

        let uploadedFileUrls: string[] = []
        if (files.length > 0) {
            setIsUploading(true)
            try {
                await new Promise((r) => setTimeout(r, 1500))
                uploadedFileUrls = files.map((f) => `/uploads/${f.name}`)
                console.log('Uploaded files:', uploadedFileUrls)
                setFiles([])
            } catch (error) {
                console.error('File upload error:', error)
                setFormError('Failed to upload attachments. Please try again.')
                setIsSubmitting(false)
                setIsUploading(false)
                return
            }
            setIsUploading(false)
        }

        try {
            await new Promise((r) => setTimeout(r, 1000))
            console.log('Expense saved to database!')
            form.reset()
            setFiles([])
            onClose()
        } catch (error) {
            console.error('Save expense error:', error)
            setFormError('Failed to save expense. Please try again.')
        } finally {
            setIsSubmitting(false)
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
            <SheetContent className="flex flex-col gap-0 p-0 sm:max-w-lg">
                <SheetHeader className="p-6">
                    <SheetTitle>New Expense</SheetTitle>
                    <SheetDescription>
                        Enter the transaction details. More data means better analysis.
                    </SheetDescription>
                </SheetHeader>

                <div className="flex-1 overflow-y-auto px-6 py-4">
                    <Form {...form}>
                        <form
                            id="add-expense-form"
                            onSubmit={form.handleSubmit(onSubmit)}
                            className="space-y-6"
                        >
                            <FormField
                                control={form.control}
                                name="description"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Description *</FormLabel>
                                        <FormControl>
                                            <Input placeholder="Coffee at Starbucks..." {...field} />
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
                                        <FormLabel>Amount *</FormLabel>
                                        <FormControl>
                                            <div className="relative">
                                                <Input
                                                    type="number"
                                                    step="0.01"
                                                    placeholder="0.00"
                                                    className="pr-12"
                                                    value={field.value ?? ''}
                                                    onChange={(e) => field.onChange(e.target.value)}
                                                />
                                                <span className="absolute inset-y-0 right-0 flex items-center pr-4 text-muted-foreground">
                                                    USD
                                                </span>
                                            </div>
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            {/* DATA + KATEGORIA w jednej linii */}
                            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                                {/* Transaction Date */}
                                <FormField
                                    control={form.control}
                                    name="date"
                                    render={({ field }) => (
                                        <FormItem className="flex flex-col col-span-3">
                                            <FormLabel>Transaction Date *</FormLabel>
                                            <Popover>
                                                <PopoverTrigger asChild>
                                                    <FormControl>
                                                        <Button
                                                            variant="outline"
                                                            className={cn(
                                                                'w-full justify-start text-left font-normal',
                                                                !field.value && 'text-muted-foreground',
                                                            )}
                                                        >
                                                            <CalendarIcon className="mr-2 h-4 w-4" />
                                                            {field.value ? format(field.value, 'PPP', { locale: enUS }) : <span>Pick a date</span>}
                                                        </Button>
                                                    </FormControl>
                                                </PopoverTrigger>

                                                <PopoverContent
                                                    align="start"
                                                    side="bottom"
                                                    className="min-w-0 w-[var(--radix-popover-trigger-width)] px-2 py-0"
                                                >
                                                    <Calendar
                                                        mode="single"
                                                        selected={field.value}
                                                        onSelect={field.onChange}
                                                        initialFocus
                                                    />
                                                </PopoverContent>
                                            </Popover>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                {/* Category */}
                                <FormField
                                    control={form.control}
                                    name="category"
                                    render={({ field }) => (
                                        <FormItem
                                            className="flex flex-col col-span-2"
                                        >
                                            <FormLabel>Category *</FormLabel>
                                            <Select onValueChange={field.onChange} value={field.value || undefined}>
                                                <FormControl>
                                                    {/* pełna szerokość w kolumnie = 50% rzędu */}
                                                    <SelectTrigger className="w-full">
                                                        <SelectValue placeholder="Select a category..." />
                                                    </SelectTrigger>
                                                </FormControl>

                                                {/* usuń domyślne min-width i dopasuj do triggera */}
                                                <SelectContent className="min-w-0 w-[var(--radix-select-trigger-width)]">
                                                    {MOCK_CATEGORIES.map((cat) => (
                                                        <SelectItem key={cat.value} value={cat.value}>
                                                            <span className="mr-2">{cat.icon}</span> {cat.label}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </div>


                            <div className="grid grid-cols-2 gap-4">
                                <FormField
                                    control={form.control}
                                    name="vendor"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Vendor (optional)</FormLabel>
                                            <FormControl>
                                                <Input
                                                    placeholder="e.g., Amazon"
                                                    {...field}
                                                    value={field.value ?? ''}
                                                />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={form.control}
                                    name="paymentMethod"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Payment Method</FormLabel>
                                            <Select onValueChange={field.onChange} value={field.value || undefined}>
                                                <FormControl>
                                                    <SelectTrigger className="w-full">
                                                        <SelectValue placeholder="Select..." />
                                                    </SelectTrigger>
                                                </FormControl>

                                                <SelectContent className="min-w-0 w-[var(--radix-select-trigger-width)]">
                                                    {MOCK_PAYMENT_METHODS.map((method) => (
                                                        <SelectItem key={method.value} value={method.value}>
                                                            {method.label}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
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
                                        <FormLabel>Notes (optional)</FormLabel>
                                        <FormControl>
                                            <Textarea
                                                placeholder="e.g., bought as a birthday gift for mom..."
                                                {...field}
                                                value={field.value ?? ''}
                                            />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <FormField
                                control={form.control}
                                name="isRecurring"
                                render={({ field }) => (
                                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                                        <div className="space-y-0.5">
                                            <FormLabel>Recurring Expense</FormLabel>
                                            <FormDescription>
                                                Check if this is a regular charge (e.g., subscription).
                                            </FormDescription>
                                        </div>
                                        <FormControl>
                                            <Switch
                                                checked={field.value}
                                                onCheckedChange={field.onChange}
                                            />
                                        </FormControl>
                                    </FormItem>
                                )}
                            />

                            <div className="space-y-2">
                                <FormLabel>Attachments (receipt, photos)</FormLabel>
                                <label
                                    htmlFor="file-upload"
                                    className={cn(
                                        'relative flex w-full cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/30 bg-muted/50 p-10 transition-colors hover:bg-muted/80',
                                        isLoading && 'cursor-not-allowed opacity-50',
                                    )}
                                    onDrop={handleFileDrop}
                                    onDragOver={(e) => e.preventDefault()}
                                >
                                    <UploadCloud className="h-10 w-10 text-muted-foreground" />
                                    <p className="mt-2 text-sm text-muted-foreground">
                                        <span className="font-semibold text-primary">Click to upload</span>{' '}
                                        or drag and drop
                                    </p>
                                    <p className="text-xs text-muted-foreground">PNG, JPG (max 5MB)</p>
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
                                        <p className="text-sm font-medium">Uploaded files:</p>
                                        <div className="space-y-2">
                                            {files.map((file, index) => (
                                                <div
                                                    key={index}
                                                    className="flex items-center justify-between rounded-md border bg-muted/50 p-2"
                                                >
                                                    <span className="truncate text-sm">{file.name}</span>
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-6 w-6"
                                                        onClick={() => removeFile(index)}
                                                        disabled={isLoading}
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
                        {isUploading ? 'Uploading files...' : isSubmitting ? 'Saving...' : 'Save Expense'}
                    </Button>
                </SheetFooter>
            </SheetContent>
        </Sheet>
    )
}
