"use client"

import * as React from "react"
import { z } from "zod"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"

import { Button } from "@/components/ui/button"
import { Form, FormField, FormItem, FormLabel, FormMessage, FormControl } from "@/components/ui/form"
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"

type CategoryBudget = {
  categoryId: string
  categoryName: string
  icon?: string | null
  amount: number
  currency: string
}

type CurrencyRow = {
  id: number
  currency: string | null            // pełna nazwa, np. "Polski Złoty"
  currency_symbol: string | null     // kod, np. "PLN"
  currency_before: boolean | null
}

type LanguageRow = {
  id: number
  language: string | null            // pełna nazwa, np. "English"
  language_symbol: string | null     // kod, np. "EN"
}

const settingsSchema = z.object({
  currency: z.string().min(1), // przechowujemy kody: PLN / USD
  language: z.string().min(1), // przechowujemy kody: EN / PL
  budgets: z.array(z.object({
    categoryId: z.string(),
    categoryName: z.string(),
    amount: z.string(),
  })),
})

type SettingsFormValues = z.infer<typeof settingsSchema>

interface SettingsFormProps {
  initialCurrency: string
  initialLanguage: string
  categoryBudgets: CategoryBudget[]
  currencies: CurrencyRow[]
  languages: LanguageRow[]
}

export function SettingsForm({
  initialCurrency,
  initialLanguage,
  categoryBudgets,
  currencies,
  languages,
}: SettingsFormProps) {
  const supabase = React.useMemo(() => createClient(), [])

  const form = useForm<SettingsFormValues>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      currency: (initialCurrency || "PLN").toUpperCase(),
      language: (initialLanguage || "EN").toUpperCase(),
      budgets: categoryBudgets.map((b) => ({
        categoryId: b.categoryId,
        categoryName: b.categoryName,
        amount: b.amount ? b.amount.toString() : "0",
      })),
    },
  })

  const [isSaving, setIsSaving] = React.useState(false)

  const onSubmit = async (values: SettingsFormValues) => {
    setIsSaving(true)
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      if (userError) throw userError
      if (!user) throw new Error("User not found")

      // user_settings: zapisujemy kody
      const { error: settingsError } = await supabase
        .from("user_settings")
        .upsert(
          { user_id: user.id, currency_id: values.currency, language_id: values.language },
          { onConflict: "user_id" },
        )
      if (settingsError) throw settingsError

      // category_budgets: tylko budget
      const payload = values.budgets.map((b) => ({
        user_id: user.id,
        category_id: b.categoryId,
        budget: Number(b.amount || 0),
      }))
      const { error: budgetsError } = await supabase
        .from("category_budgets")
        .upsert(payload, { onConflict: "user_id,category_id" })
      if (budgetsError) throw budgetsError

      toast.success("Settings saved", { description: "Your preferences and budgets have been updated." })
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Unexpected error."
      if (process.env.NODE_ENV === 'development') {
        console.error('[SettingsForm] error:', err)
      }
      toast.error("Failed to save settings", { description: errorMessage })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        {/* General */}
        <div className="flex flex-wrap gap-4">
          <FormField
            control={form.control}
            name="currency"
            render={({ field }) => (
              <FormItem className="w-full sm:w-auto sm:min-w-[220px] max-w-xs space-y-2">
                <FormLabel>Default currency</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select currency" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {currencies.map((cur) => {
                      const code = (cur.currency_symbol ?? "").toUpperCase()
                      const name = cur.currency ?? code
                      return (
                        <SelectItem key={cur.id} value={code}>
                          {code} — {name}
                        </SelectItem>
                      )
                    })}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="language"
            render={({ field }) => (
              <FormItem className="w-full sm:w-auto sm:min-w-[220px] max-w-xs space-y-2">
                <FormLabel>Language</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select language" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {languages.map((lang) => {
                      const code = (lang.language_symbol ?? "").toUpperCase()
                      const name = lang.language ?? code
                      return (
                        <SelectItem key={lang.id} value={code}>
                          {code} — {name}
                        </SelectItem>
                      )
                    })}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <Separator />

        {/* Budgets per category */}
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold">Category budgets</h3>
            <p className="text-sm text-muted-foreground">Set monthly budget for each category.</p>
          </div>

          <div className="grid gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
            {form.watch("budgets").length === 0 ? (
              <p className="text-sm text-muted-foreground">No categories available.</p>
            ) : (
              form.watch("budgets").map((budget, index) => (
                <FormField
                  key={budget.categoryId}
                  control={form.control}
                  name={`budgets.${index}.amount`}
                  render={({ field }) => (
                    <FormItem className="flex flex-col gap-2 rounded-lg border bg-muted/20 p-3 sm:p-4">
                      <div className="flex flex-col">
                        <FormLabel className="flex items-center gap-2">
                          {categoryBudgets[index]?.icon && <span>{categoryBudgets[index]?.icon}</span>}
                          {budget.categoryName}
                        </FormLabel>
                      </div>

                      <div className="mt-1 flex justify-end">
                        <FormControl>
                          <div className="flex items-center gap-2">
                            <Input {...field} inputMode="decimal" placeholder="0.00" className="w-[110px] sm:w-[130px] text-right" />
                            <span className="text-sm text-muted-foreground">{form.getValues("currency")}</span>
                          </div>
                        </FormControl>
                      </div>

                      <FormMessage />
                    </FormItem>
                  )}
                />
              ))
            )}
          </div>
        </div>

        <div className="flex justify-end">
          <Button type="submit" disabled={isSaving}>
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save changes
          </Button>
        </div>
      </form>
    </Form>
  )
}
