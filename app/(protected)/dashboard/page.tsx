import { createClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Activity, CreditCard, DollarSign } from 'lucide-react'

import { RecentExpensesTable } from '@/components/protected/dashboard/recent-expenses-table'
import { SpendingChart } from '@/components/protected/dashboard/spending-chart'
import { SpendingByCategoryChart } from '@/components/protected/dashboard/spending-by-category-chart'
import { BudgetOverview } from '@/components/protected/dashboard/budget-overview'
import { AddExpenseTrigger } from '@/components/protected/dashboard/add-expense-trigger'

export default async function ProtectedPage() {
  const supabase = createClient()

  console.log('🔍 [Dashboard] Fetching expenses...')

  const { data: expenses, error } = await (
    await supabase
  )
    .from('expenses')
    .select(
      `
      id,
      title,
      amount,
      date,
      category_id,
      categories (name)
    `
    )
    .order('date', { ascending: false })
    .limit(30)

  if (error) {
    console.error('❌ Supabase error:', error)
  } else {
    console.log('✅ [Dashboard] Expenses loaded:', expenses)
  }

  const recentExpenses =
    expenses?.map((e) => ({
      id: e.id,
      description: e.title,
      category: e.categories?.name || 'Brak kategorii',
      amount: Number(e.amount),
      date: e.date,
    })) || []

  const totalSpent = recentExpenses.reduce((sum, e) => sum + e.amount, 0)
  const totalTransactions = recentExpenses.length
  const avgDaily = totalTransactions ? totalSpent / 30 : 0

  const categoryTotals: Record<string, number> = {}
  recentExpenses.forEach((e) => {
    categoryTotals[e.category] = (categoryTotals[e.category] || 0) + e.amount
  })

  const categorySpendingData = Object.entries(categoryTotals).map(
    ([name, total]) => ({
      name,
      total,
      fill: 'var(--color-primary)',
    })
  )

  const topCategory =
    Object.entries(categoryTotals).sort((a, b) => b[1] - a[1])[0]?.[0] || '—'

  const today = new Date()
  const dailySpendingData = Array.from({ length: 7 })
    .map((_, i) => {
      const d = new Date(today)
      d.setDate(today.getDate() - i)
      const dateStr = d.toISOString().split('T')[0]
      const total = recentExpenses
        .filter((r) => r.date?.startsWith(dateStr))
        .reduce((sum, r) => sum + r.amount, 0)
      return {
        date: d.toLocaleDateString('pl-PL', { month: 'short', day: 'numeric' }),
        total,
      }
    })
    .reverse()

  const budgetData = categorySpendingData.map((c) => ({
    id: c.name,
    name: c.name,
    spent: c.total,
    budget: c.total * 1.3,
  }))

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col sm:flex-row items-start sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Panel finansowy</h2>
          <p className="text-muted-foreground hidden sm:block pt-1">
            Podsumowanie Twoich ostatnich wydatków.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <Button variant="outline">Ostatnie 30 dni</Button>
          <AddExpenseTrigger />
        </div>
      </div>

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium min-h-10 flex items-center">
              Suma wydatków (30 dni)
            </CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {totalSpent.toFixed(2)} PLN
            </div>
            <p className="text-xs text-muted-foreground">
              Łącznie w ostatnich 30 dniach
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium min-h-10 flex items-center">
              Liczba transakcji
            </CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalTransactions}</div>
            <p className="text-xs text-muted-foreground">W tym miesiącu</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium min-h-10 flex items-center">
              Średni dzienny wydatek
            </CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{avgDaily.toFixed(2)} PLN</div>
            <p className="text-xs text-muted-foreground">Średnia dzienna</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium min-h-10 flex items-center">
              Najczęstsza kategoria
            </CardTitle>
            <span className="h-4 w-4 text-muted-foreground">🏷️</span>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{topCategory}</div>
            <p className="text-xs text-muted-foreground">
              Kategoria z najwyższymi wydatkami
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 grid-cols-1 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Ostatnie wydatki</CardTitle>
            <CardDescription>Twoje najnowsze transakcje.</CardDescription>
          </CardHeader>
          <CardContent>
            {recentExpenses.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                Brak wydatków dla Twojego konta.
              </p>
            ) : (
              <RecentExpensesTable data={recentExpenses} currency="PLN" />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Wydatki według kategorii</CardTitle>
            <CardDescription>Podział Twoich wydatków.</CardDescription>
          </CardHeader>
          <CardContent>
            <SpendingByCategoryChart
              data={categorySpendingData}
              currency="PLN"
            />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Budżet</CardTitle>
            <CardDescription>Kontrola miesięcznych budżetów.</CardDescription>
          </CardHeader>
          <CardContent>
            <BudgetOverview data={budgetData} currency="PLN" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Wydatki tygodniowe</CardTitle>
            <CardDescription>Twoje wydatki z ostatnich 7 dni.</CardDescription>
          </CardHeader>
          <CardContent className="pl-2">
            <SpendingChart data={dailySpendingData} currency="PLN" />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
