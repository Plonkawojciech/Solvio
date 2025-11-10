import { createClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Activity, CreditCard, DollarSign, Scan, Tag } from 'lucide-react'
import { RecentExpensesTable } from '@/components/protected/dashboard/recent-expenses-table'
import { SpendingChart } from '@/components/protected/dashboard/spending-chart'
import { SpendingByCategoryChart } from '@/components/protected/dashboard/spending-by-category-chart'
import { BudgetOverview } from '@/components/protected/dashboard/budget-overview'
import { AddExpenseTrigger } from '@/components/protected/dashboard/add-expense-trigger'
import { ScanReceiptButton } from '@/components/protected/dashboard/scan-receipt-button'
export default async function ProtectedPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  // daty
  const today = new Date()
  const start30 = new Date(today)
  start30.setDate(today.getDate() - 29) // włącznie z dziś => 30 dni

  // równoległe zapytania
  const [
    { data: categories, error: categoriesError },
    { data: settingsRow, error: settingsError },
    { data: budgetsRows, error: budgetsError },
    { data: expenses, error: expensesError },
  ] = await Promise.all([
    supabase.from('categories').select('id, name, icon').order('name'),
    supabase.from('user_settings').select('currency_id, language_id').eq('user_id', user.id).maybeSingle(),
    supabase.from('category_budgets').select('category_id, budget').eq('user_id', user.id),
    supabase
      .from('expenses')
      .select('id, title, amount, date, category_id, categories (name)')
      .eq('user_id', user.id)
      .gte('date', start30.toISOString().slice(0, 10))
      .order('date', { ascending: false })
      .limit(300),
  ])

  if (categoriesError) console.error('[Dashboard] categories error:', categoriesError)
  if (settingsError) console.error('[Dashboard] settings error:', settingsError)
  if (budgetsError) console.error('[Dashboard] budgets error:', budgetsError)
  if (expensesError) console.error('[Dashboard] expenses error:', expensesError)

  const currency = (settingsRow?.currency_id || 'PLN').toUpperCase()
  const lang = (settingsRow?.language_id || 'EN').toUpperCase()
  const locale = lang === 'PL' ? 'pl-PL' : 'en-US'

  // mapy pomocnicze
  const catById = new Map<string, { id: string; name: string; icon?: string | null }>(
    (categories ?? []).map((c) => [c.id as string, { id: c.id as string, name: c.name as string, icon: (c as any).icon }]),
  )
  const budgetByCatId = new Map<string, number>((budgetsRows ?? []).map((b) => [b.category_id as string, Number(b.budget || 0)]))

  // recentExpenses (dla tabeli)
  const recentExpenses =
    (expenses ?? []).map((e) => ({
      id: e.id as string,
      description: e.title as string,
      categoryId: e.category_id as string | null,
      category: e.categories?.name || 'No category',
      amount: Number(e.amount),
      date: e.date as string,
    })) || []

  // sumy
  const totalSpent = recentExpenses.reduce((sum, e) => sum + e.amount, 0)
  const totalTransactions = recentExpenses.length
  const avgDaily = totalTransactions ? totalSpent / 30 : 0

  // wydatki per kategoria (po id)
  const spentByCatId = new Map<string, number>()
  for (const e of recentExpenses) {
    if (!e.categoryId) continue
    spentByCatId.set(e.categoryId, (spentByCatId.get(e.categoryId) || 0) + e.amount)
  }

  // dane do wykresu kołowego: tylko kategorie z wydatkami
  const categorySpendingData = Array.from(spentByCatId.entries()).map(([catId, total]) => {
    const name = catById.get(catId)?.name || 'Other'
    return { name, total }
  })

  // top category po wydatkach
  const topCategory =
    categorySpendingData.sort((a, b) => b.total - a.total)[0]?.name || '—'

  // weekly chart 7 dni
  const dailySpendingData = Array.from({ length: 7 })
    .map((_, i) => {
      const d = new Date(today)
      d.setDate(today.getDate() - i)
      const dateStr = d.toISOString().slice(0, 10)
      const total = recentExpenses
        .filter((r) => r.date?.startsWith(dateStr))
        .reduce((sum, r) => sum + r.amount, 0)
      return { date: d.toLocaleDateString(locale, { month: 'short', day: 'numeric' }), total }
    })
    .reverse()

  // dane budżetowe:
  // - jeśli budżet istnieje w DB -> użyj
  // - jeśli brak i są wydatki -> fallback = 120% wydatków z 30 dni, zaokrąglone do 1 grosza
  // - jeśli brak i brak wydatków -> fallback = 0 (pusta kategoria)
  const budgetData = (categories ?? []).map((cat) => {
    const id = cat.id as string
    const name = cat.name as string
    const spent = Number(spentByCatId.get(id) || 0)
    const dbBudget = budgetByCatId.get(id)
    const autoBudget =
      spent > 0 ? Math.round(spent * 1.2 * 100) / 100 : 0 // fallback
    const budget = typeof dbBudget === 'number' ? dbBudget : autoBudget
    return { id, name, spent, budget }
  })

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col sm:flex-row items-start sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Financial Dashboard</h2>
          <p className="text-muted-foreground hidden sm:block pt-1">Summary of your recent expenses.</p>
        </div>
        <div className="flex items-center space-x-2">
          <ScanReceiptButton />
          <AddExpenseTrigger />
        </div>
      </div>

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium min-h-10 flex items-center">Total Expenses (30 days)</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {totalSpent.toFixed(2)} {currency}
            </div>
            <p className="text-xs text-muted-foreground">Total in the last 30 days</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium min-h-10 flex items-center">Number of Transactions</CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalTransactions}</div>
            <p className="text-xs text-muted-foreground">This month</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium min-h-10 flex items-center">Average Daily Spending</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {avgDaily.toFixed(2)} {currency}
            </div>
            <p className="text-xs text-muted-foreground">Daily average</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium min-h-10 flex items-center">Most Frequent Category</CardTitle>
            <Tag className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{topCategory}</div>
            <p className="text-xs text-muted-foreground">Category with the highest expenses</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 grid-cols-1 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Recent Expenses</CardTitle>
            <CardDescription>Your latest transactions.</CardDescription>
          </CardHeader>
          <CardContent>
            {recentExpenses.length === 0 ? (
              <p className="text-muted-foreground text-sm">No expenses found.</p>
            ) : (
              <RecentExpensesTable
                data={recentExpenses.map((e) => ({
                  id: e.id,
                  description: e.description,
                  category: e.category,
                  amount: e.amount,
                  date: e.date,
                }))}
                currency={currency}
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Expenses by Category</CardTitle>
            <CardDescription>Breakdown of your expenses.</CardDescription>
          </CardHeader>
          <CardContent>
            <SpendingByCategoryChart data={categorySpendingData} currency={currency} />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Budget</CardTitle>
            <CardDescription>Monthly budget tracking.</CardDescription>
          </CardHeader>
          <CardContent>
            <BudgetOverview data={budgetData} currency={currency} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Weekly Spending</CardTitle>
            <CardDescription>Your expenses from the last 7 days.</CardDescription>
          </CardHeader>
          <CardContent className="pl-2">
            <SpendingChart data={dailySpendingData} currency={currency} />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
