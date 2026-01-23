'use client'

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Activity, TrendingUp, TrendingDown, Wallet, Target, Zap, ArrowUpRight } from 'lucide-react';
import { RecentExpensesTable } from '@/components/protected/dashboard/recent-expenses-table';
import { MonthlySpendingChart } from '@/components/protected/dashboard/monthly-spending-chart';
import { SpendingByCategoryChart } from '@/components/protected/dashboard/spending-by-category-chart';
import { BudgetOverview } from '@/components/protected/dashboard/budget-overview';
import { AddExpenseTrigger } from '@/components/protected/dashboard/add-expense-trigger';
import { ScanReceiptButton } from '@/components/protected/dashboard/scan-receipt-button';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import Link from 'next/link';
import { useTranslation } from '@/lib/i18n';

export default function ProtectedPage() {
  const router = useRouter();
  const supabase = createClient();
  const { t, lang, mounted } = useTranslation();
  
  // Funkcja do tłumaczenia nazw kategorii
  const translateCategoryName = (categoryName: string): string => {
    const categoryMap: Record<string, string> = {
      'Food': t('categories.food'),
      'Groceries': t('categories.groceries'),
      'Health': t('categories.health'),
      'Transport': t('categories.transport'),
      'Shopping': t('categories.shopping'),
      'Electronics': t('categories.electronics'),
      'Home & Garden': t('categories.homeGarden'),
      'Entertainment': t('categories.entertainment'),
      'Bills & Utilities': t('categories.billsUtilities'),
      'Other': t('categories.other'),
    }
    return categoryMap[categoryName] || categoryName
  }
  
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [categories, setCategories] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [receipts, setReceipts] = useState<any[]>([]);
  const [settings, setSettings] = useState<any>(null);
  const [budgets, setBudgets] = useState<any[]>([]);
  const [refreshKey, setRefreshKey] = useState(0); // Klucz do wymuszenia re-renderu wszystkich komponentów

  const fetchData = useCallback(async () => {
    console.log('[Dashboard] Refreshing data...');
    setLoading(true);
    
    const { data: { user: currentUser } } = await supabase.auth.getUser();
    if (!currentUser) {
      router.push('/login');
      return;
    }
    setUser(currentUser);

    // daty
    const today = new Date();
    const start30 = new Date(today);
    start30.setDate(today.getDate() - 29);
    
    // Poprzedni miesiąc (do porównania)
    const start60 = new Date(today);
    start60.setDate(today.getDate() - 59);
    const end30 = new Date(today);
    end30.setDate(today.getDate() - 30);

    // równoległe zapytania
    const [
      { data: categoriesData, error: categoriesError },
      { data: settingsRow, error: settingsError },
      { data: budgetsRows, error: budgetsError },
      { data: expensesData, error: expensesError },
      { data: receiptsData, error: receiptsError },
      { data: lastMonthExpenses },
      { data: lastMonthReceipts },
    ] = await Promise.all([
      supabase.from('categories').select('id, name, icon').order('name'),
      supabase
        .from('user_settings')
        .select('currency_id, language_id')
        .eq('user_id', currentUser.id)
        .maybeSingle(),
      supabase
        .from('category_budgets')
        .select('category_id, budget')
        .eq('user_id', currentUser.id),
      supabase
        .from('expenses')
        .select('id, title, amount, date, category_id, categories (name), receipt_id, vendor')
        .eq('user_id', currentUser.id)
        .gte('date', start30.toISOString().slice(0, 10))
        .order('date', { ascending: false })
        .limit(300),
      supabase
        .from('receipts')
        .select('id, notes, date, vendor, total')
        .eq('user_id', currentUser.id)
        .gte('date', start30.toISOString().slice(0, 10))
        .not('notes', 'is', null)
        .order('date', { ascending: false })
        .limit(100), // Zwiększony limit, aby pobrać wszystkie paragony z ostatnich 30 dni
      // Poprzedni miesiąc
      supabase
        .from('expenses')
        .select('amount, receipt_id')
        .eq('user_id', currentUser.id)
        .gte('date', start60.toISOString().slice(0, 10))
        .lt('date', end30.toISOString().slice(0, 10)),
      supabase
        .from('receipts')
        .select('notes')
        .eq('user_id', currentUser.id)
        .gte('date', start60.toISOString().slice(0, 10))
        .lt('date', end30.toISOString().slice(0, 10))
        .not('notes', 'is', null),
    ]);

    if (categoriesError || settingsError || budgetsError || expensesError) {
      console.error('[Dashboard] errors:', { categoriesError, settingsError, budgetsError, expensesError });
    }

    setCategories(categoriesData || []);
    setExpenses(expensesData || []);
    setReceipts(receiptsData || []);
    setSettings(settingsRow);
    setBudgets(budgetsRows || []);
    setLoading(false);
    setRefreshKey(prev => prev + 1); // Zwiększ klucz, aby wymusić re-render wszystkich komponentów
    
    console.log('[Dashboard] ✅ Data refreshed:', {
      expenses: expensesData?.length || 0,
      receipts: receiptsData?.length || 0,
      categories: categoriesData?.length || 0,
    });
  }, [supabase, router]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Odśwież dane gdy expenses się zmienią (np. po usunięciu paragonu)
  useEffect(() => {
    const handleExpensesUpdated = () => {
      console.log('[Dashboard] Expenses updated event received, refreshing data...');
      fetchData();
    };

    window.addEventListener('expensesUpdated', handleExpensesUpdated);

    return () => {
      window.removeEventListener('expensesUpdated', handleExpensesUpdated);
    };
  }, [fetchData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
          <p className="text-sm text-muted-foreground">Loading your financial data...</p>
        </div>
      </div>
    );
  }

  const today = new Date();
  const currency = (settings?.currency_id || 'PLN').toUpperCase();
  const locale = lang === 'pl' ? 'pl-PL' : 'en-US';
  const isPolish = lang === 'pl';

  // mapy pomocnicze
  const catById = new Map<
    string,
    { id: string; name: string; icon?: string | null }
  >(
    (categories ?? []).map((c) => [
      c.id as string,
      { id: c.id as string, name: c.name as string, icon: c.icon as string | null | undefined },
    ])
  );
  const budgetByCatId = new Map<string, number>(
    (budgets ?? []).map((b) => [
      b.category_id as string,
      Number(b.budget || 0),
    ])
  );

  // recentExpenses (dla tabeli)
  const recentExpenses = expenses.map((e) => ({
    id: e.id as string,
    description: e.title as string,
    categoryId: e.category_id as string | null,
    category: (e.categories as { name?: string } | null)?.name || 'No category',
    amount: Number(e.amount),
    date: e.date as string,
    receiptId: e.receipt_id as string | null,
    vendor: e.vendor as string | null,
  }));

  // UPROSZCZONE: Total = suma wszystkich expenses
  const totalSpent = recentExpenses.reduce((sum, e) => sum + e.amount, 0);
  console.log('[Dashboard] Total Spent:', totalSpent.toFixed(2), 'PLN', 'z', recentExpenses.length, 'transakcji');
  
  const totalTransactions = recentExpenses.length;
  const avgDaily = totalSpent / 30;

  // Total budget
  const totalBudget = Array.from(budgetByCatId.values()).reduce((sum, b) => sum + b, 0);
  const budgetRemaining = totalBudget - totalSpent;
  const budgetProgress = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0;

  // wydatki per kategoria - z receipt items (nie expenses!)
  const spentByCatId = new Map<string, number>();
  let otherTotal = 0; // Produkty bez kategorii
  
  // Pobierz kategorie z receipt items
  if (receipts) {
    for (const receipt of receipts) {
      if (!receipt.notes) continue;
      try {
        const receiptData = JSON.parse(receipt.notes as string);
        const items = receiptData.items || [];
        
        for (const item of items) {
          if (item.price) {
            if (item.category_id) {
              // Ma kategorię
              spentByCatId.set(
                item.category_id,
                (spentByCatId.get(item.category_id) || 0) + item.price
              );
            } else {
              // Brak kategorii -> "Other"
              otherTotal += item.price;
            }
          }
        }
      } catch (e) {
        continue;
      }
    }
  }
  
  // Dodaj "Other" do mapy jeśli są takie wydatki
  if (otherTotal > 0) {
    spentByCatId.set('other', otherTotal);
  }
  
  console.log('[Dashboard] Categories spending:', Array.from(spentByCatId.entries()));
  console.log('[Dashboard] Other total:', otherTotal.toFixed(2));

  // Dodatkowe metryki
  const mostExpensive = recentExpenses.length > 0
    ? Math.max(...recentExpenses.map(e => e.amount))
    : 0;
  const receiptsScanned = receipts.length;
  const avgTransaction = recentExpenses.length > 0
    ? totalSpent / recentExpenses.length
    : 0;

  // Top 5 kategorii
  const categorySpendingData = Array.from(spentByCatId.entries())
    .map(([catId, total]) => ({
      name: catId === 'other' ? 'Other' : (catById.get(catId)?.name || 'Other'),
      total,
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  const topCategory = categorySpendingData[0]?.name || '—';

  // Budget data per kategoria
  const budgetData = (categories ?? [])
    .map((cat) => {
      const id = cat.id as string;
      const name = cat.name as string;
      const spent = Number(spentByCatId.get(id) || 0);
      const budget = budgetByCatId.get(id) || 0;
      return { id, name, spent, budget };
    })
    .filter(item => item.budget > 0) // Tylko kategorie z budżetem
    .sort((a, b) => b.spent - a.spent); // Sortuj po wydatkach

  // Monthly chart (30 days) z kategoriami - z receipt items!
  const monthlySpendingData = Array.from({ length: 30 })
    .map((_, i) => {
      const d = new Date(today);
      d.setDate(today.getDate() - (29 - i)); // Od 30 dni temu do dziś
      const dateStr = d.toISOString().slice(0, 10);
      
      // Inicjalizuj obiekt danych dla tego dnia
      const dayData: any = {
        date: d.toLocaleDateString(locale, { day: 'numeric', month: 'short' }),
      };
      
      // Dla każdej kategorii, ustaw 0
      categorySpendingData.forEach(cat => {
        dayData[cat.name] = 0;
      });
      dayData['Other'] = 0;
      
      // Policz wydatki z receipt items tego dnia
      receipts
        .filter((receipt) => receipt.date?.startsWith(dateStr))
        .forEach((receipt) => {
          if (!receipt.notes) return;
          try {
            const receiptData = JSON.parse(receipt.notes as string);
            const items = receiptData.items || [];
            
            for (const item of items) {
              if (item.price) {
                const catName = item.category_id 
                  ? catById.get(item.category_id)?.name || 'Other'
                  : 'Other';
                
                if (!dayData[catName]) dayData[catName] = 0;
                dayData[catName] += item.price;
              }
            }
          } catch (e) {
            // ignore
          }
        });
      
      return dayData;
    });
  
  // Lista unikalnych kategorii dla wykresu
  const chartCategories = Array.from(
    new Set([
      ...categorySpendingData.map(c => c.name),
      'Other'
    ])
  ).filter(cat => {
    // Sprawdź czy ta kategoria ma jakiekolwiek wydatki
    return monthlySpendingData.some(day => (day[cat] || 0) > 0);
  });

  return (
    <div className="flex flex-col gap-6">
      {/* Hero Card - Main Overview - Responsive */}
      <Card className="border-2">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-2xl sm:text-3xl font-bold">{t('dashboard.thisMonth')}</CardTitle>
              <CardDescription className="hidden sm:block">
                {t('dashboard.spendingOverview')}
              </CardDescription>
            </div>
            <Wallet className="h-6 w-6 sm:h-8 sm:w-8 text-muted-foreground" />
          </div>
        </CardHeader>
        <CardContent className="space-y-4 sm:space-y-6">
          {/* Total Spent */}
          <div>
            <p className="text-sm text-muted-foreground mb-1">{t('dashboard.totalSpent')}</p>
            <div className="flex items-baseline gap-2 sm:gap-3">
              <span className="text-3xl sm:text-4xl font-bold">{totalSpent.toFixed(2)}</span>
              <span className="text-xl sm:text-2xl text-muted-foreground">{currency}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {totalTransactions} {t('dashboard.transactions')} · {avgDaily.toFixed(2)} {currency}/{isPolish ? 'dzień' : 'day'}
            </p>
          </div>

          {/* Budget Progress */}
          {totalBudget > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{t('dashboard.budgetProgress')}</span>
                <span className="font-medium">
                  {budgetRemaining >= 0 ? (
                    <span className="text-green-600">{budgetRemaining.toFixed(2)} {currency} {t('dashboard.left')}</span>
                  ) : (
                    <span className="text-red-600">{Math.abs(budgetRemaining).toFixed(2)} {currency} {t('dashboard.over')}</span>
                  )}
                </span>
              </div>
              <Progress 
                value={Math.min(budgetProgress, 100)} 
                className={budgetProgress > 100 ? 'bg-red-100' : ''}
              />
              <p className="text-xs text-muted-foreground">
                {budgetProgress.toFixed(1)}% {isPolish ? 'z' : 'of'} {totalBudget.toFixed(2)} {currency} {t('dashboard.budget')} {t('dashboard.used')}
              </p>
            </div>
          )}

          {/* Quick Actions - Responsive */}
          <div className="flex flex-col sm:flex-row gap-2 pt-2">
            <ScanReceiptButton onAction={fetchData} />
            <AddExpenseTrigger onAction={fetchData} />
            <Link href="/expenses" className="w-full sm:w-auto">
              <Button variant="outline" size="default" className="w-full sm:w-auto text-xs sm:text-sm">
                {t('dashboard.viewAllExpenses')}
                <ArrowUpRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>

      {/* Small Metrics Cards - Responsive */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t('dashboard.receiptsScanned')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{receiptsScanned}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {t('dashboard.aiProcessed')}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t('dashboard.biggestPurchase')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {mostExpensive.toFixed(2)} {currency}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {t('dashboard.largestTransaction')}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t('dashboard.avgTransaction')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {avgTransaction.toFixed(2)} {currency}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {t('dashboard.averagePerTransaction')}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t('dashboard.topCategory')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold truncate">{topCategory}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {t('dashboard.highestSpending')}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Grid - Responsive */}
      <div className="grid gap-4 sm:gap-6 grid-cols-1 lg:grid-cols-3">
        {/* Recent Activity - Takes 2 columns on large screens */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              {t('dashboard.recentActivity')}
            </CardTitle>
            <CardDescription>{t('dashboard.latestTransactions')}</CardDescription>
          </CardHeader>
          <CardContent>
            {recentExpenses.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-muted-foreground text-sm">{t('dashboard.noExpensesYet')}</p>
              </div>
            ) : (
              <RecentExpensesTable
                key={`recent-${refreshKey}-${recentExpenses.length}`}
                data={recentExpenses.slice(0, 10).map((e) => ({
                  id: e.id,
                  description: e.description,
                  vendor: e.vendor,
                  amount: e.amount,
                  date: e.date,
                }))}
                currency={currency}
              />
            )}
          </CardContent>
        </Card>

        {/* Top Categories - 1 column */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5" />
              {t('dashboard.topCategories')}
            </CardTitle>
            <CardDescription>{t('dashboard.whereMoneyGoes')}</CardDescription>
          </CardHeader>
          <CardContent>
            {categorySpendingData.length === 0 ? (
              <p className="text-muted-foreground text-sm text-center py-8">{isPolish ? 'Brak danych kategorii jeszcze.' : 'No category data yet.'}</p>
            ) : (
              <div className="space-y-4">
                <SpendingByCategoryChart
                  key={`category-${refreshKey}-${categorySpendingData.length}`}
                  data={categorySpendingData}
                  currency={currency}
                />
                <div className="space-y-2 pt-4 border-t">
                  {categorySpendingData.map((cat, idx) => (
                    <div key={idx} className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">{cat.name}</span>
                      <span className="font-medium">{cat.total.toFixed(2)} {currency}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Category Budgets - Full Width */}
      {budgetData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5" />
              {t('dashboard.categoryBudgets')}
            </CardTitle>
            <CardDescription>
              {t('dashboard.trackSpending')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <BudgetOverview 
              key={`budget-${refreshKey}-${budgetData.length}`}
              data={budgetData} 
              currency={currency} 
            />
          </CardContent>
        </Card>
      )}

      {/* Full Width - Monthly Spending Trend */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            {t('dashboard.monthlySpending')}
          </CardTitle>
          <CardDescription>
            {t('dashboard.dailyExpenses')}
          </CardDescription>
        </CardHeader>
        <CardContent className="pl-2">
          <MonthlySpendingChart 
            key={`monthly-${refreshKey}-${monthlySpendingData.length}`}
            data={monthlySpendingData} 
            currency={currency}
            categories={chartCategories}
          />
        </CardContent>
      </Card>
    </div>
  );
}
