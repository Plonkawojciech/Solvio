'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { Loader2, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { ApiKeys } from '@/components/protected/settings/api-keys'
import { CrmConnection } from '@/components/protected/settings/crm-connection'

const SettingsForm = dynamic(
  () => import('@/components/protected/settings/settings-form').then((m) => ({ default: m.SettingsForm })),
  { ssr: false },
)
const CategoriesManager = dynamic(
  () => import('@/components/protected/settings/categories-manager').then((m) => ({ default: m.CategoriesManager })),
  { ssr: false },
)

interface MerchantRule {
  id: string
  vendor: string
  categoryId: string
  count: number
}

interface CategoryBudget {
  categoryId: string
  categoryName: string
  icon?: string | null
  amount: number
  currency: string
}

interface Category {
  id: string
  name: string
  icon?: string | null
  color?: string | null
  isDefault?: boolean
}

export default function SettingsPage() {
  const [loading, setLoading] = useState(true)
  const [categories, setCategories] = useState<Category[]>([])
  const [settings, setSettings] = useState<{ currency?: string; language?: string } | null>(null)
  // Surowe wiersze z bazy: `{categoryId, amount, period}` — bez nazwy i ikony,
  // bo tabela ich nie trzyma. Nazwę dokłada `budgetRows` z listy kategorii.
  const [budgets, setBudgets] = useState<{ categoryId: string; amount: string | number }[]>([])
  const [merchantRules, setMerchantRules] = useState<MerchantRule[]>([])
  const [ruleToDelete, setRuleToDelete] = useState<string | null>(null)
  const [deletingRule, setDeletingRule] = useState<string | null>(null)

  // Wiersze limitów budujemy z KATEGORII, nie z zapisanych budżetów: inaczej
  // kategoria bez limitu nie miała gdzie go dostać i sekcja mówiła „najpierw
  // dodaj kategorie", mając je tuż obok na ekranie.
  const budgetRows: CategoryBudget[] = categories.map((category) => ({
    categoryId: category.id,
    categoryName: category.name,
    icon: category.icon ?? null,
    amount: Number(
      budgets.find((b) => b.categoryId === category.id)?.amount ?? 0
    ),
    currency: settings?.currency ?? 'PLN',
  }))

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [catRes, setRes, ruleRes] = await Promise.all([
          fetch('/api/data/categories'),
          fetch('/api/data/settings'),
          fetch('/api/personal/merchant-rules'),
        ])
        if (cancelled) return
        if (catRes.ok) setCategories((await catRes.json()).categories ?? [])
        if (setRes.ok) {
          const data = await setRes.json()
          setSettings(data.settings ?? null)
          // Endpoint zwraca `budgets`, nie `categoryBudgets` — przez tę
          // literówkę limity nigdy się nie wczytywały.
          setBudgets(data.budgets ?? [])
        }
        if (ruleRes.ok) setMerchantRules((await ruleRes.json()).rules ?? [])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [])

  async function deleteRule(id: string) {
    setDeletingRule(id)
    try {
      const res = await fetch(`/api/personal/merchant-rules?id=${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      setMerchantRules((rules) => rules.filter((r) => r.id !== id))
      toast.success('Reguła usunięta')
    } catch {
      toast.error('Nie udało się usunąć reguły')
    } finally {
      setDeletingRule(null)
      setRuleToDelete(null)
    }
  }

  return (
    <main className="min-h-screen w-full p-2 sm:p-4 md:p-6 lg:p-10">
      <div className="flex flex-col gap-4 sm:gap-6 md:gap-8">
        <div>
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight">Ustawienia</h1>
          <p className="text-muted-foreground">Waluta, kategorie i wpięcie w CRM Programo.</p>
        </div>

        {loading ? (
          <div className="space-y-6">
            <Skeleton className="h-64 w-full rounded-lg" />
            <Skeleton className="h-64 w-full rounded-lg" />
          </div>
        ) : (
          <>
            <SettingsForm
              initialCurrency={settings?.currency ?? 'PLN'}
              initialLanguage={settings?.language ?? 'pl'}
              categoryBudgets={budgetRows}
            />

            <CategoriesManager initialCategories={categories} />

            <CrmConnection />

            <ApiKeys />

            {merchantRules.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Nauczone sklepy</CardTitle>
                  <CardDescription>
                    Sprzedawca → kategoria. Reguła powstaje, gdy poprawisz kategorię wydatku.
                  </CardDescription>
                </CardHeader>
                <CardContent className="divide-y divide-border">
                  {merchantRules.map((rule) => (
                    <div key={rule.id} className="flex items-center justify-between gap-3 py-2.5">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{rule.vendor}</p>
                        <p className="text-xs text-muted-foreground">
                          {categories.find((c) => c.id === rule.categoryId)?.name ?? 'Bez kategorii'}
                          {' · '}{rule.count}×
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setRuleToDelete(rule.id)}
                        disabled={deletingRule === rule.id}
                        aria-label="Usuń regułę"
                      >
                        {deletingRule === rule.id
                          ? <Loader2 className="h-4 w-4 animate-spin" />
                          : <Trash2 className="h-4 w-4" />}
                      </Button>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>

      <ConfirmDialog
        open={ruleToDelete !== null}
        onOpenChange={(open) => !open && setRuleToDelete(null)}
        title="Usunąć regułę?"
        description="Kolejne wydatki od tego sprzedawcy będą kategoryzowane od nowa."
        confirmLabel="Usuń"
        onConfirm={() => { if (ruleToDelete) void deleteRule(ruleToDelete) }}
      />
    </main>
  )
}
