"use client"

import * as React from "react"
import { z } from "zod"
import { useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Loader2, DollarSign, Globe, Wallet } from "lucide-react"
import { toast } from "sonner"
import { motion } from "framer-motion"

import { Button } from "@/components/ui/button"
import { Form, FormField, FormItem, FormLabel, FormMessage, FormControl } from "@/components/ui/form"
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { useTranslation, setLanguage, type Language } from "@/lib/i18n"

const CURRENCIES = [
  { code: 'PLN', name: 'Polski Złoty', symbol: 'zł' },
  { code: 'USD', name: 'US Dollar', symbol: '$' },
  { code: 'EUR', name: 'Euro', symbol: '€' },
  { code: 'GBP', name: 'British Pound', symbol: '£' },
  { code: 'CHF', name: 'Swiss Franc', symbol: 'Fr' },
  { code: 'CZK', name: 'Czech Koruna', symbol: 'Kč' },
]

const LANGUAGES = [
  { code: 'EN', name: 'English', flag: '🇬🇧' },
  { code: 'PL', name: 'Polski', flag: '🇵🇱' },
]

type CategoryBudget = {
  categoryId: string
  categoryName: string
  icon?: string | null
  amount: number
  currency: string
}

const settingsSchema = z.object({
  currency: z.string().min(1),
  language: z.string().min(1),
  budgets: z.array(z.object({
    categoryId: z.string(),
    categoryName: z.string(),
    amount: z.string()
      .refine((val) => val === '' || val === '0' || /^\d+(\.\d{0,2})?$/.test(val), {
        message: 'Must be a valid positive number',
      })
      .refine((val) => {
        const num = parseFloat(val)
        return val === '' || val === '0' || (!isNaN(num) && num >= 0)
      }, { message: 'Budget must be 0 or a positive number' }),
  })),
})

type SettingsFormValues = z.infer<typeof settingsSchema>

interface SettingsFormProps {
  initialCurrency: string
  initialLanguage: string
  categoryBudgets: CategoryBudget[]
}

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06 } },
// eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any

const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3 } },
// eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any

export function SettingsForm({ initialCurrency, initialLanguage, categoryBudgets }: SettingsFormProps) {
  const { t, lang } = useTranslation()

  const form = useForm<SettingsFormValues>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      currency: (initialCurrency || "PLN").toUpperCase(),
      language: (initialLanguage || "EN").toUpperCase(),
      budgets: categoryBudgets.map(b => ({
        categoryId: b.categoryId,
        categoryName: b.categoryName,
        amount: b.amount ? b.amount.toString() : "0",
      })),
    },
  })

  const [isSaving, setIsSaving] = React.useState(false)

  // Reactively watch the selected currency so budget inputs update live
  const watchedCurrency = useWatch({ control: form.control, name: 'currency' })
  const currencySymbol = CURRENCIES.find(c => c.code === watchedCurrency)?.symbol ?? watchedCurrency

  const onSubmit = async (values: SettingsFormValues) => {
    setIsSaving(true)
    try {
      // Save general settings
      const settingsRes = await fetch('/api/data/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'settings',
          data: {
            currency: values.currency,
            language: values.language.toLowerCase(),
          },
        }),
      })
      if (!settingsRes.ok) throw new Error('Failed to save settings')

      // Save budgets in parallel — only include budgets with valid positive amounts
      const budgetSaveResults = await Promise.allSettled(
        values.budgets.map(b => {
          const amount = parseFloat(b.amount || '0')
          // Always upsert even when 0 so server can reset budgets
          return fetch('/api/data/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'budget',
              data: { categoryId: b.categoryId, amount: isNaN(amount) ? 0 : amount },
            }),
          })
        })
      )

      const budgetErrors = budgetSaveResults.filter(r => r.status === 'rejected')
      if (budgetErrors.length > 0) {
        toast.warning(
          t('settings.partiallySaved'),
          { description: `${budgetErrors.length} ${t('settings.budgetSaveFailed')}` }
        )
      } else {
        toast.success(t('settings.saved'), { description: t('settings.savedDesc') })
      }

      // Apply language change client-side without full page reload if possible
      const newLang = values.language.toLowerCase() as Language
      setLanguage(newLang)
      if (newLang !== lang) {
        // Brief delay so toast is visible, then reload to apply translations
        setTimeout(() => window.location.reload(), 1200)
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t('settings.unexpectedError')
      toast.error(t('settings.saveFailed'), { description: msg })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        {/* Language + Currency selectors */}
        <div className="flex flex-wrap gap-4 sm:gap-6">
          <FormField
            control={form.control}
            name="currency"
            render={({ field }) => (
              <FormItem className="w-full sm:w-auto sm:min-w-[220px] max-w-xs space-y-2">
                <FormLabel className="flex items-center gap-1.5">
                  <DollarSign className="h-3.5 w-3.5 text-muted-foreground" />
                  {t('settings.currency')}
                </FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder={lang === 'pl' ? 'Wybierz walutę' : 'Select currency'} />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {CURRENCIES.map(cur => (
                      <SelectItem key={cur.code} value={cur.code}>
                        <span className="font-mono text-xs text-muted-foreground mr-1">{cur.symbol}</span>
                        {cur.code} — {cur.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">{t('settings.currencySubtitle')}</p>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="language"
            render={({ field }) => (
              <FormItem className="w-full sm:w-auto sm:min-w-[220px] max-w-xs space-y-2">
                <FormLabel className="flex items-center gap-1.5">
                  <Globe className="h-3.5 w-3.5 text-muted-foreground" />
                  {t('settings.language')}
                </FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder={lang === 'pl' ? 'Wybierz język' : 'Select language'} />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {LANGUAGES.map(l => (
                      <SelectItem key={l.code} value={l.code}>
                        <span className="mr-1">{l.flag}</span>
                        {l.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <Separator />

        {/* Category budgets */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Wallet className="h-4 w-4 text-muted-foreground" />
            <div>
              <h3 className="text-base font-semibold leading-none">
                {lang === 'pl' ? 'Budżety miesięczne' : 'Monthly budgets'}
              </h3>
              <p className="text-sm text-muted-foreground mt-0.5">
                {lang === 'pl'
                  ? 'Ustaw miesięczny limit dla każdej kategorii wydatków.'
                  : 'Set a monthly spending limit for each expense category.'}
              </p>
            </div>
          </div>

          {form.watch("budgets").length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center border rounded-lg bg-muted/20">
              {t('settings.noCategoriesForBudget')}
            </p>
          ) : (
            <motion.div
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              className="grid gap-3 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3"
            >
              {form.watch("budgets").map((budget, index) => (
                <motion.div key={budget.categoryId} variants={itemVariants}>
                  <FormField
                    control={form.control}
                    name={`budgets.${index}.amount`}
                    render={({ field }) => (
                      <FormItem className="flex flex-col gap-2 rounded-lg border bg-muted/20 hover:bg-muted/30 transition-colors p-3 sm:p-4">
                        <FormLabel className="flex items-center gap-2 font-medium text-sm">
                          {categoryBudgets[index]?.icon && (
                            <span className="text-lg leading-none">{categoryBudgets[index].icon}</span>
                          )}
                          <span className="truncate">{budget.categoryName}</span>
                        </FormLabel>
                        <FormControl>
                          <div className="flex items-center gap-2">
                            <div className="relative flex-1">
                              <Input
                                {...field}
                                type="text"
                                inputMode="decimal"
                                placeholder="0.00"
                                className="pr-12 text-right tabular-nums"
                                onChange={(e) => {
                                  // Only allow digits and a single decimal point
                                  const val = e.target.value
                                  if (val === '' || /^\d*\.?\d{0,2}$/.test(val)) {
                                    field.onChange(val)
                                  }
                                }}
                              />
                              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none font-mono">
                                {currencySymbol}
                              </span>
                            </div>
                          </div>
                        </FormControl>
                        <FormMessage className="text-xs" />
                      </FormItem>
                    )}
                  />
                </motion.div>
              ))}
            </motion.div>
          )}
        </div>

        <div className="flex justify-end pt-2">
          <Button type="submit" disabled={isSaving} className="min-w-[140px]">
            {isSaving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {lang === 'pl' ? 'Zapisywanie...' : 'Saving...'}
              </>
            ) : (
              t('common.save')
            )}
          </Button>
        </div>
      </form>
    </Form>
  )
}
