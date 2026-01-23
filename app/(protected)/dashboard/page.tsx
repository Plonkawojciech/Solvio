'use client'

import { useEffect, useState, useCallback, useMemo } from 'react';
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

interface Category {
  id: string;
  name: string;
  icon?: string | null;
}

interface ReceiptItem {
  name: string;
  quantity?: number | null;
  price?: number | null;
  category_id?: string | null;
}

interface ReceiptData {
  items?: ReceiptItem[];
}

interface Expense {
  id: string;
  title: string;
  amount: number;
  date: string;
  category_id: string | null;
  receipt_id: string | null;
  vendor: string | null;
  categories?: { name: string } | null;
}

interface Receipt {
  id: string;
  notes: string | null;
  date: string | null;
  vendor: string | null;
  total: number | null;
}

export default function ProtectedPage() {
  const router = useRouter();
  const supabase = createClient();
  const { t, lang, mounted } = useTranslation();
  
  // Funkcja do tłumaczenia nazw kategorii
  const translateCategoryName = useCallback((categoryName: string): string => {
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
  }, [t]);
  
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [settings, setSettings] = useState<any>(null);
  const [budgets, setBudgets] = useState<any[]>([]);
  const [lastUpdate, setLastUpdate] = useState<number>(Date.now());

  // Główna funkcja pobierania danych
  const fetchData = useCallback(async () => {
    console.log('[Dashboard] 🔄 Refreshing all data...');
    setLoading(true);
    
    try {
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (!currentUser) {
        router.push('/login');
        return;
      }
      setUser(currentUser);

      // Daty dla ostatnich 30 dni
      const today = new Date();
      const start30 = new Date(today);
      start30.setDate(today.getDate() - 29);
      
      // Poprzedni miesiąc (do porównania)
      const start60 = new Date(today);
      start60.setDate(today.getDate() - 59);
      const end30 = new Date(today);
      end30.setDate(today.getDate() - 30);

      // Równoległe zapytania do bazy
      const [
        { data: categoriesData, error: categoriesError },
        { data: settingsRow, error: settingsError },
        { data: budgetsRows, error: budgetsError },
        { data: expensesData, error: expensesError },
        { data: receiptsData, error: receiptsError },
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
          .limit(500),
        supabase
          .from('receipts')
          .select('id, notes, date, vendor, total')
          .eq('user_id', currentUser.id)
          .gte('date', start30.toISOString().slice(0, 10))
          .not('notes', 'is', null)
          .order('date', { ascending: false })
          .limit(200),
      ]);

      if (categoriesError || settingsError || budgetsError || expensesError || receiptsError) {
        console.error('[Dashboard] ❌ Errors:', { 
          categoriesError, 
          settingsError, 
          budgetsError, 
          expensesError,
          receiptsError 
        });
      }

      setCategories(categoriesData || []);
      setExpenses(expensesData || []);
      setReceipts(receiptsData || []);
      setSettings(settingsRow);
      setBudgets(budgetsRows || []);
      setLastUpdate(Date.now()); // Aktualizuj timestamp
      
      console.log('[Dashboard] ✅ Data refreshed:', {
        expenses: expensesData?.length || 0,
        receipts: receiptsData?.length || 0,
        categories: categoriesData?.length || 0,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('[Dashboard] ❌ Fetch error:', error);
    } finally {
      setLoading(false);
    }
  }, [supabase, router]);

  // Pobierz dane przy mount
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Nasłuchuj eventów aktualizacji
  useEffect(() => {
    const handleExpensesUpdated = () => {
      console.log('[Dashboard] 📢 Expenses updated event received');
      fetchData();
    };

    window.addEventListener('expensesUpdated', handleExpensesUpdated);

    return () => {
      window.removeEventListener('expensesUpdated', handleExpensesUpdated);
    };
  }, [fetchData]);

  // Obliczenia danych - używamy useMemo dla wydajności
  const calculatedData = useMemo(() => {
    if (loading || !categories.length) {
      return null;
    }

    const today = new Date();
    const currency = (settings?.currency_id || 'PLN').toUpperCase();
    const locale = lang === 'pl' ? 'pl-PL' : 'en-US';
    const isPolish = lang === 'pl';

    // Mapy pomocnicze
    const catById = new Map<string, Category>(
      categories.map((c) => [c.id, c])
    );
    
    const budgetByCatId = new Map<string, number>(
      budgets.map((b) => [b.category_id as string, Number(b.budget || 0)])
    );

    // Recent expenses dla tabeli
    const recentExpenses = expenses.map((e) => ({
      id: e.id,
      description: e.title,
      categoryId: e.category_id,
      category: e.categories?.name ? translateCategoryName(e.categories.name) : t('expenses.noCategory'),
      amount: Number(e.amount),
      date: e.date,
      receiptId: e.receipt_id,
      vendor: e.vendor,
    }));

    // Total spent - suma wszystkich expenses
    const totalSpent = recentExpenses.reduce((sum, e) => sum + e.amount, 0);
    const totalTransactions = recentExpenses.length;
    const avgDaily = totalSpent / 30;
    const avgTransaction = totalTransactions > 0 ? totalSpent / totalTransactions : 0;
    const mostExpensive = recentExpenses.length > 0
      ? Math.max(...recentExpenses.map(e => e.amount))
      : 0;

    // Wydatki per kategoria - z receipt items (tylko z aktywnych expenses!)
    const spentByCatId = new Map<string, number>();
    let otherTotal = 0;

    // Utwórz set aktywnych receipt_id z expenses
    const activeReceiptIds = new Set(
      expenses
        .filter(e => e.receipt_id)
        .map(e => e.receipt_id as string)
    );

    console.log('[Dashboard] 📊 Calculating category data:', {
      totalExpenses: expenses.length,
      totalReceipts: receipts.length,
      activeReceiptIds: activeReceiptIds.size,
    });

    // Przetwarzaj TYLKO receipt items z aktywnych expenses
    receipts.forEach((receipt) => {
      // WAŻNE: Tylko przetwarzaj receipts które mają aktywny expense!
      if (!receipt.id || !activeReceiptIds.has(receipt.id)) {
        return;
      }
      
      if (!receipt.notes) return;
      
      try {
        const receiptData: ReceiptData = JSON.parse(receipt.notes);
        const items = receiptData.items || [];
        
        items.forEach((item) => {
          if (item.price && item.price > 0) {
            if (item.category_id) {
              const current = spentByCatId.get(item.category_id) || 0;
              spentByCatId.set(item.category_id, current + item.price);
            } else {
              otherTotal += item.price;
            }
          }
        });
      } catch (e) {
        console.warn('[Dashboard] Failed to parse receipt notes:', e);
      }
    });

    // Dodaj "Other" jeśli są wydatki bez kategorii
    if (otherTotal > 0) {
      spentByCatId.set('other', otherTotal);
    }

    // Top 5 kategorii z tłumaczeniami
    const categorySpendingData = Array.from(spentByCatId.entries())
      .map(([catId, total]) => {
        const rawName = catId === 'other' 
          ? 'Other' 
          : (catById.get(catId)?.name || 'Other');
        return {
          name: translateCategoryName(rawName),
          total,
          rawName, // Zachowaj dla wykresów
        };
      })
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);

    console.log('[Dashboard] 📈 Category spending data:', {
      categoriesFound: categorySpendingData.length,
      totalSpent: Array.from(spentByCatId.values()).reduce((sum, v) => sum + v, 0),
      otherTotal,
    });

    const topCategory = categorySpendingData[0]?.name || '—';

    // Budget data per kategoria
    const budgetData = categories
      .map((cat) => {
        const spent = Number(spentByCatId.get(cat.id) || 0);
        const budget = budgetByCatId.get(cat.id) || 0;
        return { 
          id: cat.id, 
          name: translateCategoryName(cat.name), 
          spent, 
          budget 
        };
      })
      .filter(item => item.budget > 0)
      .sort((a, b) => b.spent - a.spent);

    // Total budget
    const totalBudget = Array.from(budgetByCatId.values()).reduce((sum, b) => sum + b, 0);
    const budgetRemaining = totalBudget - totalSpent;
    const budgetProgress = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0;

    // Monthly chart (30 days) z kategoriami - z receipt items
    const monthlySpendingData = Array.from({ length: 30 })
      .map((_, i) => {
        const d = new Date(today);
        d.setDate(today.getDate() - (29 - i));
        const dateStr = d.toISOString().slice(0, 10);
        
        const dayData: any = {
          date: d.toLocaleDateString(locale, { day: 'numeric', month: 'short' }),
        };
        
        // Inicjalizuj wszystkie kategorie na 0
        categorySpendingData.forEach(cat => {
          dayData[cat.rawName] = 0;
        });
        dayData['Other'] = 0;
        
        // Policz wydatki z receipt items tego dnia (TYLKO z aktywnych expenses!)
        receipts
          .filter((receipt) => {
            // Tylko aktywne receipts (z powiązanym expense)
            return receipt.id && activeReceiptIds.has(receipt.id) && receipt.date?.startsWith(dateStr);
          })
          .forEach((receipt) => {
            if (!receipt.notes) return;
            try {
              const receiptData: ReceiptData = JSON.parse(receipt.notes);
              const items = receiptData.items || [];
              
              items.forEach((item) => {
                if (item.price && item.price > 0) {
                  const catName = item.category_id 
                    ? (catById.get(item.category_id)?.name || 'Other')
                    : 'Other';
                  
                  if (!dayData[catName]) dayData[catName] = 0;
                  dayData[catName] += item.price;
                }
              });
            } catch (e) {
              // ignore
            }
          });
        
        return dayData;
      });
  
    // Lista unikalnych kategorii dla wykresu
    const chartCategories = Array.from(
      new Set([
        ...categorySpendingData.map(c => c.rawName),
        'Other'
      ])
    ).filter(cat => {
      return monthlySpendingData.some(day => (day[cat] || 0) > 0);
    });

    return {
      currency,
      locale,
      isPolish,
      recentExpenses,
      totalSpent,
      totalTransactions,
      avgDaily,
      avgTransaction,
      mostExpensive,
      receiptsScanned: receipts.length,
      categorySpendingData,
      topCategory,
      budgetData,
      totalBudget,
      budgetRemaining,
      budgetProgress,
      monthlySpendingData,
      chartCategories,
      catById,
    };
  }, [loading, categories, expenses, receipts, settings, budgets, lang, t, translateCategoryName]);

  if (loading || !calculatedData) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
          <p className="text-sm text-muted-foreground">{t('dashboard.loading') || 'Loading your financial data...'}</p>
        </div>
      </div>
    );
  }

  const {
    currency,
    recentExpenses,
    totalSpent,
    totalTransactions,
    avgDaily,
    avgTransaction,
    mostExpensive,
    receiptsScanned,
    categorySpendingData,
    topCategory,
    budgetData,
    totalBudget,
    budgetRemaining,
    budgetProgress,
    monthlySpendingData,
    chartCategories,
    isPolish,
  } = calculatedData;

  return (
    <div className="flex flex-col gap-4 sm:gap-6 p-4 sm:p-6 lg:p-10">
      {/* Hero Section - Total Spent */}
      <Card className="border-2">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-2xl sm:text-3xl font-bold">
                {t('dashboard.totalSpent') || 'Total Spent'}
              </CardTitle>
              <CardDescription className="hidden sm:block">
                {t('dashboard.spendingOverview') || 'Your spending overview'}
              </CardDescription>
            </div>
            <Wallet className="h-6 w-6 sm:h-8 sm:w-8 text-muted-foreground" />
          </div>
        </CardHeader>
        <CardContent className="space-y-4 sm:space-y-6">
          {/* Total Spent */}
          <div>
            <p className="text-sm text-muted-foreground mb-1">{t('dashboard.totalSpent') || 'Total Spent'}</p>
            <div className="flex items-baseline gap-2 sm:gap-3">
              <span className="text-3xl sm:text-4xl font-bold">{totalSpent.toFixed(2)}</span>
              <span className="text-xl sm:text-2xl text-muted-foreground">{currency}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {totalTransactions} {t('dashboard.transactions') || 'transactions'} · {avgDaily.toFixed(2)} {currency}/{isPolish ? 'dzień' : 'day'}
            </p>
          </div>

          {/* Budget Progress */}
          {totalBudget > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{t('dashboard.budgetProgress') || 'Budget Progress'}</span>
                <span className="font-medium">
                  {budgetRemaining >= 0 ? (
                    <span className="text-green-600">{budgetRemaining.toFixed(2)} {currency} {t('dashboard.left') || 'left'}</span>
                  ) : (
                    <span className="text-red-600">{Math.abs(budgetRemaining).toFixed(2)} {currency} {t('dashboard.over') || 'over'}</span>
                  )}
                </span>
              </div>
              <Progress 
                value={Math.min(budgetProgress, 100)} 
                className={budgetProgress > 100 ? 'bg-red-100' : ''}
              />
              <p className="text-xs text-muted-foreground">
                {budgetProgress.toFixed(1)}% {isPolish ? 'z' : 'of'} {totalBudget.toFixed(2)} {currency} {t('dashboard.budget') || 'budget'} {t('dashboard.used') || 'used'}
              </p>
            </div>
          )}

          {/* Quick Actions */}
          <div className="flex flex-col sm:flex-row gap-2 pt-2">
            <ScanReceiptButton onAction={fetchData} />
            <AddExpenseTrigger onAction={fetchData} />
            <Link href="/expenses" className="w-full sm:w-auto">
              <Button variant="outline" size="default" className="w-full sm:w-auto text-xs sm:text-sm">
                {t('dashboard.viewAllExpenses') || 'View All Expenses'}
                <ArrowUpRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>

      {/* Small Metrics Cards */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t('dashboard.receiptsScanned') || 'Receipts Scanned'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{receiptsScanned}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {t('dashboard.aiProcessed') || 'AI processed'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t('dashboard.biggestPurchase') || 'Biggest Purchase'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {mostExpensive.toFixed(2)} {currency}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {t('dashboard.largestTransaction') || 'Largest transaction'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t('dashboard.avgTransaction') || 'Avg Transaction'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {avgTransaction.toFixed(2)} {currency}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {t('dashboard.averagePerTransaction') || 'Average per transaction'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t('dashboard.topCategory') || 'Top Category'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold truncate">{topCategory}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {t('dashboard.highestSpending') || 'Highest spending'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Grid */}
      <div className="grid gap-4 sm:gap-6 grid-cols-1 lg:grid-cols-3">
        {/* Recent Activity */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              {t('dashboard.recentActivity') || 'Recent Activity'}
            </CardTitle>
            <CardDescription>{t('dashboard.latestTransactions') || 'Latest transactions'}</CardDescription>
          </CardHeader>
          <CardContent>
            {recentExpenses.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-muted-foreground text-sm">{t('dashboard.noExpensesYet') || 'No expenses yet'}</p>
              </div>
            ) : (
              <RecentExpensesTable
                key={`recent-${lastUpdate}`}
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

        {/* Top Categories */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5" />
              {t('dashboard.topCategories') || 'Top Categories'}
            </CardTitle>
            <CardDescription>{t('dashboard.whereMoneyGoes') || 'Where your money goes'}</CardDescription>
          </CardHeader>
          <CardContent>
            {categorySpendingData.length === 0 ? (
              <p className="text-muted-foreground text-sm text-center py-8">
                {isPolish ? 'Brak danych kategorii jeszcze.' : 'No category data yet.'}
              </p>
            ) : (
              <div className="space-y-4">
                <SpendingByCategoryChart
                  key={`category-${lastUpdate}-${categorySpendingData.length}-${categorySpendingData.reduce((sum, c) => sum + c.total, 0).toFixed(2)}`}
                  data={categorySpendingData.map(c => ({ name: c.name, total: c.total }))}
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

      {/* Category Budgets */}
      {budgetData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5" />
              {t('dashboard.categoryBudgets') || 'Category Budgets'}
            </CardTitle>
            <CardDescription>
              {t('dashboard.trackSpending') || 'Track your spending by category'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <BudgetOverview 
              key={`budget-${lastUpdate}`}
              data={budgetData} 
              currency={currency} 
            />
          </CardContent>
        </Card>
      )}

      {/* Monthly Spending Trend */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            {t('dashboard.monthlySpending') || 'Monthly Spending'}
          </CardTitle>
          <CardDescription>
            {t('dashboard.dailyExpenses') || 'Daily expenses over the last 30 days'}
          </CardDescription>
        </CardHeader>
        <CardContent className="pl-2">
          <MonthlySpendingChart 
            key={`monthly-${lastUpdate}-${monthlySpendingData.reduce((sum, d) => sum + Object.values(d).reduce((s: number, v: any) => typeof v === 'number' ? s + v : s, 0), 0).toFixed(2)}`}
            data={monthlySpendingData} 
            currency={currency}
            categories={chartCategories}
          />
        </CardContent>
      </Card>
    </div>
  );
}
