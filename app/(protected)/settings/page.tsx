import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { SettingsForm } from "@/components/protected/settings/settings-form"

export default async function SettingsPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  const [
    { data: categories, error: categoriesError },
    { data: settingsRow, error: settingsError },
    { data: budgetsRows, error: budgetsError },
    { data: currencies, error: currenciesError },
    { data: languages, error: languagesError },
  ] = await Promise.all([
    supabase.from("categories").select("id, name, icon").order("name"),
    supabase.from("user_settings").select("language_id, currency_id").eq("user_id", user.id).maybeSingle(),
    supabase.from("category_budgets").select("category_id, budget").eq("user_id", user.id),
    supabase.from("currencies").select("id, currency, currency_symbol, currency_before").order("currency"),
    supabase.from("languages").select("id, language, language_symbol").order("language"),
  ])

  if (categoriesError) console.error("[Settings] categories error:", categoriesError)
  if (settingsError) console.error("[Settings] user_settings error:", settingsError)
  if (budgetsError) console.error("[Settings] category_budgets error:", budgetsError)
  if (currenciesError) console.error("[Settings] currencies error:", currenciesError)
  if (languagesError) console.error("[Settings] languages error:", languagesError)

    console.log("settingsRow:", {
      categories,
      settingsRow,
      budgetsRows,
      currencies,
      languages,
    })

  // używamy kodów: PLN / USD, EN / PL
  const fallbackCurrency = "PLN"
  const fallbackLanguage = "EN"

  const initialCurrency = settingsRow?.currency_id ?? fallbackCurrency
  const initialLanguage = settingsRow?.language_id ?? fallbackLanguage

  const categoryBudgets =
    categories?.map((cat) => {
      const budget = budgetsRows?.find((b) => b.category_id === cat.id)
      return {
        categoryId: cat.id as string,
        categoryName: cat.name as string,
        icon: (cat as any).icon as string | null,
        amount: budget?.budget ?? 0,
        currency: initialCurrency,
      }
    }) ?? []

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Settings</h2>
        <p className="text-muted-foreground">Manage your preferences and category budgets.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>General</CardTitle>
          <CardDescription>Language and currency preferences.</CardDescription>
        </CardHeader>
        <CardContent>
          <SettingsForm
            initialCurrency={initialCurrency}
            initialLanguage={initialLanguage}
            categoryBudgets={categoryBudgets}
            currencies={currencies ?? []}
            languages={languages ?? []}
          />
        </CardContent>
      </Card>
    </div>
  )
}
