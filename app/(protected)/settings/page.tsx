'use client'

import { useEffect, useState } from 'react'
import { createClient } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { SettingsForm } from "@/components/protected/settings/settings-form"
import { CategoriesManager } from "@/components/protected/settings/categories-manager"
import { getLanguage, t } from '@/lib/i18n'

export default function SettingsPage() {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [categories, setCategories] = useState<any[]>([])
  const [settings, setSettings] = useState<any>(null)
  const [budgets, setBudgets] = useState<any[]>([])
  const [currencies, setCurrencies] = useState<any[]>([])
  const [languages, setLanguages] = useState<any[]>([])
  
  useEffect(() => {
    const fetchData = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      
      if (!user) {
        router.push('/login')
        return
      }
      
      const [
        { data: categoriesData },
        { data: settingsRow },
        { data: budgetsRows },
        { data: currenciesData },
        { data: languagesData },
      ] = await Promise.all([
        supabase.from("categories").select("id, name, icon").order("name"),
        supabase.from("user_settings").select("language_id, currency_id").eq("user_id", user.id).maybeSingle(),
        supabase.from("category_budgets").select("category_id, budget").eq("user_id", user.id),
        supabase.from("currencies").select("id, currency, currency_symbol, currency_before").order("currency"),
        supabase.from("languages").select("id, language, language_symbol").order("language"),
      ])
      
      setCategories(categoriesData || [])
      setSettings(settingsRow)
      setBudgets(budgetsRows || [])
      setCurrencies(currenciesData || [])
      setLanguages(languagesData || [])
      setLoading(false)
    }
    
    fetchData()
  }, [])
  
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
      </div>
    )
  }

  // używamy kodów: PLN / USD, EN / PL
  const fallbackCurrency = "PLN"
  const fallbackLanguage = "EN"

  const initialCurrency = settings?.currency_id ?? fallbackCurrency
  const initialLanguage = settings?.language_id ?? fallbackLanguage

  const categoryBudgets =
    categories.map((cat) => {
      const budget = budgets.find((b) => b.category_id === cat.id)
      return {
        categoryId: cat.id as string,
        categoryName: cat.name as string,
        icon: cat.icon as string | null | undefined,
        amount: budget?.budget ?? 0,
        currency: initialCurrency,
      }
    })

  return (
    <div className="flex flex-col gap-4 sm:gap-6 md:gap-8">
      <div>
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">{t('settings.title')}</h2>
        <p className="text-muted-foreground">{t('settings.managePreferences')}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('settings.general')}</CardTitle>
          <CardDescription>{t('settings.languageCurrency')}</CardDescription>
        </CardHeader>
        <CardContent>
          <SettingsForm
            initialCurrency={initialCurrency}
            initialLanguage={initialLanguage}
            categoryBudgets={categoryBudgets}
            currencies={currencies}
            languages={languages}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('settings.categories')}</CardTitle>
          <CardDescription>
            {t('settings.categoriesDesc')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CategoriesManager 
            initialCategories={categories.map(c => ({
              id: c.id as string,
              name: c.name as string,
              icon: c.icon as string | null,
            }))} 
          />
        </CardContent>
      </Card>
    </div>
  )
}
