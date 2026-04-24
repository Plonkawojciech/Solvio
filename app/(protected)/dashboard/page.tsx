'use client'

import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/components/ui/card';
import { Activity, TrendingUp, TrendingDown, Wallet, Target, ArrowUpRight, AlertCircle, RefreshCw, CheckCircle2, Camera, BarChart3, Settings, Sparkles, ShieldCheck, Gauge, PiggyBank } from 'lucide-react';
import dynamic from 'next/dynamic';
/* Heavy components — lazy-loaded to reduce initial bundle */
const ChartSkeleton = () => <div className="h-[300px] w-full animate-shimmer rounded-lg border-2 border-foreground shadow-[4px_4px_0_hsl(var(--foreground))]" />;
const ComponentSkeleton = () => <div className="h-[200px] w-full animate-shimmer rounded-lg border-2 border-foreground shadow-[4px_4px_0_hsl(var(--foreground))]" />;
const SpendingByCategoryChart = dynamic(() => import('@/components/protected/dashboard/spending-by-category-chart').then(m => ({ default: m.SpendingByCategoryChart })), { ssr: false, loading: ChartSkeleton });
const CategoryTrendChart = dynamic(() => import('@/components/protected/dashboard/category-trend-chart').then(m => ({ default: m.CategoryTrendChart })), { ssr: false, loading: ChartSkeleton });
const WellnessScore = dynamic(() => import('@/components/protected/dashboard/wellness-score').then(m => ({ default: m.WellnessScore })), { ssr: false });
const RecentExpensesTable = dynamic(() => import('@/components/protected/dashboard/recent-expenses-table').then(m => ({ default: m.RecentExpensesTable })), { ssr: false, loading: ComponentSkeleton });
const BudgetOverview = dynamic(() => import('@/components/protected/dashboard/budget-overview').then(m => ({ default: m.BudgetOverview })), { ssr: false, loading: ComponentSkeleton });
const WeeklyDigest = dynamic(() => import('@/components/protected/dashboard/weekly-digest').then(m => ({ default: m.WeeklyDigest })), { ssr: false });
import { AddExpenseTrigger } from '@/components/protected/dashboard/add-expense-trigger';
import { ScanReceiptButton } from '@/components/protected/dashboard/scan-receipt-button';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { useTranslation } from '@/lib/i18n';

interface Category {
  id: string;
  name: string;
  icon?: string | null;
}

interface Expense {
  id: string;
  title: string;
  amount: number | string;
  date: string;
  categoryId: string | null;
  receiptId: string | null;
  vendor: string | null;
  currency?: string;
  exchangeRate?: string | null;
}

interface Budget {
  categoryId: string;
  amount: number | string;
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────
function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      {/* Hero card */}
      <div className="rounded-lg border-2 border-foreground bg-card shadow-[4px_4px_0_hsl(var(--foreground))] p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <div className="h-4 w-32 rounded animate-shimmer" />
            <div className="h-3 w-48 rounded animate-shimmer" />
          </div>
          <div className="h-9 w-9 rounded border-2 border-foreground animate-shimmer" />
        </div>
        <div className="h-9 w-48 rounded animate-shimmer" />
        <div className="h-3 w-56 rounded animate-shimmer" />
        <div className="flex gap-2">
          <div className="h-10 w-36 rounded-md border-2 border-foreground animate-shimmer" />
          <div className="h-10 w-32 rounded-md border-2 border-foreground animate-shimmer" />
          <div className="h-10 w-36 rounded-md border-2 border-foreground animate-shimmer" />
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-lg border-2 border-foreground bg-card shadow-[4px_4px_0_hsl(var(--foreground))] p-6 space-y-3">
            <div className="h-3 w-24 rounded animate-shimmer" />
            <div className="h-6 w-28 rounded animate-shimmer" />
            <div className="h-2.5 w-20 rounded animate-shimmer" />
          </div>
        ))}
      </div>

      {/* Main grid */}
      <div className="grid gap-4 grid-cols-1 lg:grid-cols-3">
        <div className="lg:col-span-2 rounded-lg border-2 border-foreground bg-card shadow-[4px_4px_0_hsl(var(--foreground))] p-6 space-y-3">
          <div className="h-4 w-36 rounded animate-shimmer" />
          <div className="h-3 w-48 rounded animate-shimmer" />
          <div className="space-y-2 pt-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between py-2 border-b border-dashed border-foreground/20 last:border-0">
                <div className="space-y-1.5">
                  <div className="h-4 w-32 rounded animate-shimmer" />
                  <div className="h-3 w-20 rounded animate-shimmer" />
                </div>
                <div className="h-4 w-20 rounded animate-shimmer" />
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-lg border-2 border-foreground bg-card shadow-[4px_4px_0_hsl(var(--foreground))] p-6 space-y-3">
          <div className="h-4 w-32 rounded animate-shimmer" />
          <div className="h-3 w-44 rounded animate-shimmer" />
          <div className="mx-auto mt-4 h-48 w-48 rounded-full border-2 border-foreground animate-shimmer" />
        </div>
      </div>

      {/* Chart */}
      <div className="rounded-lg border-2 border-foreground bg-card shadow-[4px_4px_0_hsl(var(--foreground))] p-6 space-y-3">
        <div className="h-4 w-40 rounded animate-shimmer" />
        <div className="h-3 w-52 rounded animate-shimmer" />
        <div className="mt-4 h-64 rounded-lg border-2 border-foreground animate-shimmer" />
      </div>
    </div>
  );
}

// ─── Error state ─────────────────────────────────────────────────────────────
function DashboardError({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation()
  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="flex flex-col items-center gap-4 text-center max-w-sm">
        <div className="h-14 w-14 rounded-full bg-destructive/10 flex items-center justify-center">
          <AlertCircle className="h-7 w-7 text-destructive" />
        </div>
        <div className="space-y-1">
          <h3 className="text-sm font-semibold" suppressHydrationWarning>
            {t('dashboard.failedLoad')}
          </h3>
          <p className="text-sm text-muted-foreground" suppressHydrationWarning>
            {t('dashboard.failedLoadDesc')}
          </p>
        </div>
        <Button onClick={onRetry} variant="outline" size="sm" className="gap-2" suppressHydrationWarning>
          <RefreshCw className="h-4 w-4" />
          {t('dashboard.tryAgain')}
        </Button>
      </div>
    </div>
  );
}

// ─── Empty state / Onboarding ─────────────────────────────────────────────────
function DashboardEmpty({
  onAction,
  fetchData,
}: {
  onAction: () => void;
  fetchData: () => void;
}) {
  const { t } = useTranslation()

  const steps = [
    {
      badge: t('onboarding.step1.badge'),
      icon: CheckCircle2,
      iconClass: 'text-emerald-600 dark:text-emerald-400',
      ringClass: 'bg-emerald-100 dark:bg-emerald-950/60',
      badgeClass: 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300',
      title: t('onboarding.step1.title'),
      desc: t('onboarding.step1.desc'),
      completed: true,
      action: (
        <Link href="/settings">
          <Button variant="ghost" size="sm" className="gap-1.5 text-emerald-700 dark:text-emerald-400 hover:text-emerald-800 dark:hover:text-emerald-300 px-3">
            <Settings className="h-3.5 w-3.5" />
            <span suppressHydrationWarning>{t('onboarding.step1.action')}</span>
            <ArrowUpRight className="h-3 w-3 opacity-60" />
          </Button>
        </Link>
      ),
    },
    {
      badge: t('onboarding.step2.badge'),
      icon: Camera,
      iconClass: 'text-primary',
      ringClass: 'bg-primary/10',
      badgeClass: 'bg-primary/10 text-primary',
      title: t('onboarding.step2.title'),
      desc: t('onboarding.step2.desc'),
      completed: false,
      action: (
        <div className="flex flex-wrap gap-2">
          <ScanReceiptButton onAction={() => { onAction(); fetchData(); }} />
          <AddExpenseTrigger onAction={() => { onAction(); fetchData(); }} />
        </div>
      ),
    },
    {
      badge: t('onboarding.step3.badge'),
      icon: BarChart3,
      iconClass: 'text-muted-foreground',
      ringClass: 'bg-muted',
      badgeClass: 'bg-muted text-muted-foreground',
      title: t('onboarding.step3.title'),
      desc: t('onboarding.step3.desc'),
      completed: false,
      action: (
        <Link href="/analysis">
          <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground px-3 opacity-50 cursor-not-allowed pointer-events-none">
            <Sparkles className="h-3.5 w-3.5" />
            <span suppressHydrationWarning>{t('onboarding.step3.action')}</span>
          </Button>
        </Link>
      ),
    },
  ]

  return (
    <div className="w-full max-w-2xl mx-auto py-8 px-4 flex flex-col gap-8">
      {/* Header */}
      <div className="text-center space-y-3">
        <div className="flex items-center justify-center gap-2 mb-4">
          <div className="h-12 w-12 rounded-lg bg-muted flex items-center justify-center">
            <Wallet className="h-6 w-6 text-muted-foreground" />
          </div>
        </div>
        <h1 className="text-lg font-semibold tracking-tight" suppressHydrationWarning>
          {t('onboarding.title')}
        </h1>
        <p className="text-sm text-muted-foreground max-w-sm mx-auto" suppressHydrationWarning>
          {t('onboarding.subtitle')}
        </p>
      </div>

      {/* Step cards */}
      <div className="flex flex-col gap-4">
        {steps.map((step, idx) => {
          const Icon = step.icon
          return (
            <div key={idx} className={`relative rounded-lg border bg-card p-5 ${step.completed ? 'border-emerald-200 dark:border-emerald-900/60' : ''}`}>
              {/* Completion stripe */}
              {step.completed && (
                <div className="absolute left-0 top-0 bottom-0 w-0.5 rounded-l-lg bg-emerald-500" />
              )}

              <div className="flex items-start gap-4">
                {/* Step icon */}
                <div className={`shrink-0 h-10 w-10 rounded-lg flex items-center justify-center ${step.ringClass}`}>
                  <Icon className={`h-5 w-5 ${step.iconClass}`} />
                </div>

                <div className="flex-1 min-w-0 space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${step.badgeClass}`} suppressHydrationWarning>
                      {step.badge}
                    </span>
                    {step.completed && (
                      <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400 flex items-center gap-1" suppressHydrationWarning>
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        {t('onboarding.categoriesReady')}
                      </span>
                    )}
                  </div>

                  <div>
                    <h3 className="text-sm font-medium" suppressHydrationWarning>
                      {step.title}
                    </h3>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed" suppressHydrationWarning>
                      {step.desc}
                    </p>
                  </div>

                  {/* Action */}
                  <div className="pt-1">
                    {step.action}
                  </div>
                </div>

                {/* Step number */}
                <div className={`shrink-0 h-7 w-7 rounded-full flex items-center justify-center text-xs font-medium border ${step.completed ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40' : 'border-border text-muted-foreground'}`}>
                  {idx + 1}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
        <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
        <span suppressHydrationWarning>{t('onboarding.privacy')}</span>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function ProtectedPage() {
  const { t, lang } = useTranslation();

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
    };
    return categoryMap[categoryName] || categoryName;
  }, [t]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [prevExpenses, setPrevExpenses] = useState<Expense[]>([]);
  const [serverPrevTotal, setServerPrevTotal] = useState<number | null>(null);
  const [serverPrevByCategory, setServerPrevByCategory] = useState<Record<string, number> | null>(null);
  const [receiptsCount, setReceiptsCount] = useState<number>(0);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [settings, setSettings] = useState<any>(null);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [monthIncome, setMonthIncome] = useState<number | null>(null);
  const [lastUpdate, setLastUpdate] = useState<number>(Date.now());

  const fetchData = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/data/dashboard?since=all', { signal });
      if (!res.ok) {
        const msg = res.status === 401
          ? 'Unauthorized'
          : `Server error ${res.status}`;
        throw new Error(msg);
      }
      const data = await res.json();
      setCategories(data.categories || []);
      setExpenses(data.expenses || []);
      setPrevExpenses(data.prevExpenses || []);
      setServerPrevTotal(data.prevTotal ?? null);
      setServerPrevByCategory(data.prevByCategory ?? null);
      setReceiptsCount(data.receiptsCount ?? 0);
      setSettings(data.settings || null);
      setBudgets(data.budgets || []);
      setMonthIncome(data.monthIncome ?? null);
      setLastUpdate(Date.now());
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetchData(controller.signal);
    return () => controller.abort();
  }, [fetchData]);

  useEffect(() => {
    const handler = () => fetchData();
    window.addEventListener('expensesUpdated', handler);
    return () => window.removeEventListener('expensesUpdated', handler);
  }, [fetchData]);

  // ── Derived data ────────────────────────────────────────────────────────────
  const calculatedData = useMemo(() => {
    if (loading) return null;

    const today = new Date();
    const currency = (settings?.currency || 'PLN').toUpperCase();
    const locale = lang === 'pl' ? 'pl-PL' : 'en-US';

    const catById = new Map<string, Category>(categories.map(c => [c.id, c]));
    const budgetByCatId = new Map<string, number>(
      budgets.map(b => [b.categoryId, Number(b.amount || 0)])
    );

    const recentExpenses = expenses.map(e => {
      const rawAmount = Number(e.amount);
      const expCurrency = (e.currency || currency).toUpperCase();
      const isForeign = expCurrency !== currency;
      const rate = e.exchangeRate ? parseFloat(e.exchangeRate) : null;
      // Convert foreign-currency amounts to account currency
      const convertedAmount = isForeign && rate ? rawAmount * rate : rawAmount;

      return {
        id: e.id,
        description: e.title,
        categoryId: e.categoryId,
        categoryRaw: e.categoryId ? (catById.get(e.categoryId)?.name || 'Other') : '',
        category: e.categoryId
          ? translateCategoryName(catById.get(e.categoryId)?.name || 'Other')
          : '',
        amount: rawAmount,
        // Amount in account currency (converted if foreign)
        amountConverted: convertedAmount,
        date: e.date,
        receiptId: e.receiptId,
        vendor: e.vendor,
        currency: e.currency,
        isForeign,
        hasRate: !!rate,
      };
    });

    // Sum all expenses in account currency (foreign ones converted via exchangeRate)
    // Foreign expenses without exchange rate are still included at face value
    const totalSpent = recentExpenses.reduce((sum, e) => sum + e.amountConverted, 0);
    const totalTransactions = recentExpenses.length;
    // Dynamic date range: compute actual days span from earliest expense
    const dates = recentExpenses.map(e => new Date(e.date).getTime()).filter(d => !isNaN(d));
    const daySpan = dates.length > 0
      ? Math.max(1, Math.ceil((Date.now() - Math.min(...dates)) / 86_400_000))
      : 30;
    const avgDaily = totalSpent / daySpan;
    const avgTransaction = totalTransactions > 0 ? totalSpent / totalTransactions : 0;
    const mostExpensive = recentExpenses.length > 0
      ? Math.max(...recentExpenses.map(e => e.amountConverted))
      : 0;

    const spentByCatId = new Map<string, number>();
    for (const e of recentExpenses) {
      const key = e.categoryId || 'other';
      spentByCatId.set(key, (spentByCatId.get(key) || 0) + e.amountConverted);
    }

    const categorySpendingData = Array.from(spentByCatId.entries())
      .map(([catId, total]) => {
        const rawName = catId === 'other' ? 'Other' : (catById.get(catId)?.name || 'Other');
        return { name: translateCategoryName(rawName), total, rawName };
      })
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);

    const topCategory = categorySpendingData[0]?.name || '—';

    const budgetData = categories
      .map(cat => ({
        id: cat.id,
        name: translateCategoryName(cat.name),
        spent: Number(spentByCatId.get(cat.id) || 0),
        budget: budgetByCatId.get(cat.id) || 0,
      }))
      .filter(item => item.budget > 0)
      .sort((a, b) => b.spent - a.spent);

    const totalBudget = Array.from(budgetByCatId.values()).reduce((sum, b) => sum + b, 0);
    const budgetRemaining = totalBudget - totalSpent;
    const budgetProgress = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0;

    // Previous period — prefer server-side aggregation, fallback to client-side
    const prevSpentByCatId = new Map<string, number>();
    let prevTotalSpent = 0;
    if (serverPrevTotal !== null && serverPrevByCategory) {
      prevTotalSpent = serverPrevTotal;
      for (const [k, v] of Object.entries(serverPrevByCategory)) {
        prevSpentByCatId.set(k, v);
      }
    } else {
      for (const e of prevExpenses) {
        const rawAmt = Number(e.amount || 0);
        const eCurrency = (e.currency || currency).toUpperCase();
        const isForeign = eCurrency !== currency;
        const rate = e.exchangeRate ? parseFloat(e.exchangeRate) : null;
        const converted = isForeign && rate ? rawAmt * rate : rawAmt;
        const key = e.categoryId || 'other';
        prevSpentByCatId.set(key, (prevSpentByCatId.get(key) || 0) + converted);
      }
      prevTotalSpent = Array.from(prevSpentByCatId.values()).reduce((s, v) => s + v, 0);
    }

    // MoM change
    const momChange = prevTotalSpent > 0
      ? Math.round(((totalSpent - prevTotalSpent) / prevTotalSpent) * 100)
      : null;

    // Monthly forecast (linear from day-of-month progress)
    const dayOfMonth = today.getDate();
    const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    const monthProgress = dayOfMonth / daysInMonth;
    const monthlyForecast = monthProgress > 0 ? totalSpent / monthProgress : null;

    // This week spending (Mon–today)
    const weekStartDate = new Date(today);
    weekStartDate.setDate(today.getDate() - ((today.getDay() + 6) % 7));
    const weekStartStr = weekStartDate.toISOString().slice(0, 10);
    const thisWeekSpent = recentExpenses
      .filter(e => e.date && e.date >= weekStartStr)
      .reduce((sum, e) => sum + e.amountConverted, 0);

    // Over-budget categories (≥80% used)
    const overBudgetCategories = budgets
      .map(b => {
        const spent = spentByCatId.get(b.categoryId) || 0;
        const budgetAmt = Number(b.amount || 0);
        const cat = catById.get(b.categoryId);
        return { name: cat ? translateCategoryName(cat.name) : b.categoryId, spent, budget: budgetAmt, pct: budgetAmt > 0 ? spent / budgetAmt : 0 };
      })
      .filter(c => c.pct >= 0.8 && c.budget > 0)
      .sort((a, b) => b.pct - a.pct)
      .slice(0, 3);

    // Savings rate
    const savingsRate = monthIncome && monthIncome > 0
      ? Math.max(0, Math.round(((monthIncome - totalSpent) / monthIncome) * 100))
      : null;

    // Spending anomaly detection
    const anomalies = categories
      .filter(cat => {
        const curr = spentByCatId.get(cat.id) || 0;
        const prev = prevSpentByCatId.get(cat.id) || 0;
        return curr > 15 && prev > 0 && curr / prev >= 1.5;
      })
      .map(cat => ({
        name: translateCategoryName(cat.name),
        icon: cat.icon || '📊',
        ratio: (spentByCatId.get(cat.id) || 0) / (prevSpentByCatId.get(cat.id) || 1),
      }))
      .sort((a, b) => b.ratio - a.ratio)
      .slice(0, 2);

    // Wellness score
    let savingsScore = 0;
    if (savingsRate !== null) {
      if (savingsRate >= 20) savingsScore = 40;
      else if (savingsRate >= 10) savingsScore = 25;
      else if (savingsRate >= 5) savingsScore = 15;
      else if (savingsRate > 0) savingsScore = 8;
    }
    let budgetScore: number;
    if (budgets.length === 0) {
      budgetScore = 20;
    } else {
      const withinBudget = budgets.filter(b => (spentByCatId.get(b.categoryId) || 0) < Number(b.amount || 0)).length;
      budgetScore = Math.round((withinBudget / budgets.length) * 40);
    }
    let trendScore: number;
    if (prevTotalSpent === 0) {
      trendScore = 12;
    } else {
      const changePct = (totalSpent - prevTotalSpent) / prevTotalSpent;
      if (changePct < -0.1) trendScore = 20;
      else if (changePct <= 0.1) trendScore = 12;
      else if (changePct <= 0.3) trendScore = 6;
      else trendScore = 0;
    }
    const wellnessScore = Math.min(100, Math.max(0, savingsScore + budgetScore + trendScore));
    const wellnessGrade = wellnessScore >= 85 ? 'A' : wellnessScore >= 70 ? 'B' : wellnessScore >= 50 ? 'C' : wellnessScore >= 30 ? 'D' : 'F';

    return {
      currency, locale, recentExpenses, totalSpent, totalTransactions,
      avgDaily, avgTransaction, mostExpensive, receiptsScanned: receiptsCount,
      categorySpendingData, topCategory, budgetData, totalBudget, budgetRemaining,
      budgetProgress, catById,
      momChange, monthlyForecast, thisWeekSpent, overBudgetCategories, savingsRate,
      anomalies, wellnessScore, wellnessGrade, savingsScore, budgetScore, trendScore,
    };
  }, [loading, categories, expenses, prevExpenses, serverPrevTotal, serverPrevByCategory, receiptsCount, settings, budgets, lang, monthIncome, translateCategoryName]);

  // ── Render states ──────────────────────────────────────────────────────────
  if (loading) {
    return <DashboardSkeleton />;
  }

  if (error) {
    return <DashboardError onRetry={fetchData} />;
  }

  const {
    currency, locale, recentExpenses, totalSpent, totalTransactions, avgDaily,
    mostExpensive, receiptsScanned, categorySpendingData, topCategory, budgetData,
    totalBudget, budgetRemaining, budgetProgress,
    momChange, monthlyForecast, thisWeekSpent, overBudgetCategories, savingsRate,
    anomalies, wellnessScore, wellnessGrade, savingsScore, budgetScore, trendScore,
  } = calculatedData!;

  function formatAmount(amount: number) {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  }

  // Empty state
  if (recentExpenses.length === 0) {
    return (
      <DashboardEmpty
        onAction={() => {}}
        fetchData={fetchData}
      />
    );
  }

  const budgetProgressColor =
    budgetProgress >= 100
      ? 'bg-red-500'
      : budgetProgress >= 90
      ? 'bg-yellow-500'
      : budgetProgress >= 70
      ? 'bg-amber-400'
      : 'bg-emerald-500';

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      {/* Hero Section — Clean summary card */}
      <Card>
        <div className="p-4 md:p-6 space-y-4 md:space-y-5">
          {/* Header row */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">{t('dashboard.totalSpent') || 'Total Spent'}</p>
              <p className="text-sm text-muted-foreground hidden sm:block mt-0.5">{t('dashboard.spendingOverview') || 'Your spending overview'}</p>
            </div>
            <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center">
              <Wallet className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            </div>
          </div>

          {/* Total amount */}
          <div>
            <span className="text-2xl md:text-3xl font-semibold tabular-nums tracking-tight">{formatAmount(totalSpent)}</span>
            <div className="flex items-center gap-3 mt-1 flex-wrap">
              <p className="text-sm text-muted-foreground" suppressHydrationWarning>
                {totalTransactions} {t('dashboard.transactions') || 'transactions'} · {formatAmount(avgDaily)}/{t('dashboard.day')}
              </p>
              {momChange !== null && (
                <span className={`inline-flex items-center gap-1 text-xs font-medium ${momChange < 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`} suppressHydrationWarning>
                  {momChange < 0 ? <TrendingDown className="h-3.5 w-3.5" aria-hidden="true" /> : <TrendingUp className="h-3.5 w-3.5" aria-hidden="true" />}
                  {momChange > 0 ? '+' : ''}{momChange}% {t('dashboard.vsLastMonth') || 'vs last month'}
                </span>
              )}
            </div>
          </div>

          {totalBudget > 0 && (
            <div className="space-y-2 rounded-lg border p-3 md:p-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{t('dashboard.budgetProgress') || 'Budget Progress'}</span>
                <span className="font-medium tabular-nums">
                  {budgetRemaining >= 0
                    ? <span className="text-emerald-600 dark:text-emerald-400">{formatAmount(budgetRemaining)} {t('dashboard.left') || 'left'}</span>
                    : <span className="text-red-600 dark:text-red-400">{formatAmount(Math.abs(budgetRemaining))} {t('dashboard.over') || 'over'}</span>
                  }
                </span>
              </div>
              {/* Progress bar */}
              <div
                className="relative h-2 w-full overflow-hidden rounded-full bg-muted"
                role="progressbar"
                aria-valuenow={Math.round(budgetProgress)}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={t('dashboard.budgetProgress') || 'Budget progress'}
              >
                <div
                  className={`h-full rounded-full transition-all duration-700 ${budgetProgressColor}`}
                  style={{ width: `${Math.min(budgetProgress, 100)}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground tabular-nums" suppressHydrationWarning>
                {budgetProgress.toFixed(1)}% {t('dashboard.of')} {formatAmount(totalBudget)} {t('dashboard.budget') || 'budget'} {t('dashboard.used') || 'used'}
              </p>
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-2 pt-1">
            <ScanReceiptButton onAction={fetchData} />
            <AddExpenseTrigger onAction={fetchData} />
            <Link href="/expenses" className="w-full sm:w-auto">
              <Button variant="outline" size="default" className="w-full sm:w-auto text-sm">
                {t('dashboard.viewAllExpenses') || 'View All Expenses'}
                <ArrowUpRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </Card>

      {/* Forecast + Savings Rate */}
      {(monthlyForecast !== null || savingsRate !== null) && totalSpent > 0 && (
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
          {monthlyForecast !== null && (
            <Card className="border-dashed bg-muted/30">
              <div className="px-5 py-3.5 flex items-center gap-3">
                <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                  <Gauge className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">{t('dashboard.forecastMonth') || 'Monthly forecast'}</p>
                  <p className="text-sm font-semibold tabular-nums">{formatAmount(monthlyForecast)}</p>
                </div>
              </div>
            </Card>
          )}
          {savingsRate !== null && (
            <Card className={`border-dashed ${savingsRate >= 20 ? 'bg-emerald-500/5' : savingsRate >= 10 ? 'bg-yellow-500/5' : 'bg-red-500/5'}`}>
              <div className="px-5 py-3.5 flex items-center gap-3">
                <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${savingsRate >= 20 ? 'bg-emerald-500/15' : savingsRate >= 10 ? 'bg-yellow-500/15' : 'bg-red-500/15'}`}>
                  <PiggyBank className={`h-4 w-4 ${savingsRate >= 20 ? 'text-emerald-600' : savingsRate >= 10 ? 'text-yellow-600' : 'text-red-500'}`} aria-hidden="true" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">{t('dashboard.savingsRate') || 'Savings rate'}</p>
                  <p className={`text-sm font-semibold tabular-nums ${savingsRate >= 20 ? 'text-emerald-600 dark:text-emerald-400' : savingsRate >= 10 ? 'text-yellow-600' : 'text-red-500'}`}>{savingsRate}%</p>
                </div>
              </div>
            </Card>
          )}
        </div>
      )}

      {/* Over-budget alerts — show top 2 on mobile, all on desktop */}
      {overBudgetCategories.length > 0 && (
        <div className="flex flex-col gap-2">
          {overBudgetCategories.map((cat, i) => (
            <div key={i} className={`flex items-center gap-2 md:gap-3 rounded-xl border px-3 py-2.5 md:px-4 md:py-3 text-sm ${i >= 2 ? 'hidden md:flex' : ''} ${cat.pct >= 1 ? 'border-red-500/30 bg-red-500/8 text-red-700 dark:text-red-400' : 'border-orange-500/30 bg-orange-500/8 text-orange-700 dark:text-orange-400'}`}>
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span className="flex-1 truncate" suppressHydrationWarning>
                <span className="font-medium">{cat.name}</span>{': '}
                {(cat.pct * 100).toFixed(0)}% {cat.pct >= 1 ? (lang === 'pl' ? 'przekroczono' : 'exceeded') : (lang === 'pl' ? 'wykorzystano' : 'used')}
              </span>
              <span className="tabular-nums font-medium shrink-0 text-xs md:text-sm">{formatAmount(cat.spent)} / {formatAmount(cat.budget)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Spending anomaly alerts — hidden on mobile to reduce clutter */}
      {anomalies.length > 0 && (
        <div className="hidden md:flex flex-col gap-2">
          {anomalies.map((a, i) => (
            <div key={i} className="flex items-center gap-3 rounded-xl border border-blue-500/30 bg-blue-500/8 px-4 py-3 text-sm text-blue-700 dark:text-blue-400">
              <span className="text-base shrink-0">{a.icon}</span>
              <span className="flex-1" suppressHydrationWarning>
                <span className="font-medium">{a.name}</span>{': '}
                {a.ratio.toFixed(1)}× {lang === 'pl' ? 'więcej niż w poprzednim okresie' : 'more than previous period'}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Metric Cards */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        {[
          { label: t('dashboard.receiptsScanned') || 'Receipts Scanned', value: receiptsScanned, sub: t('dashboard.aiProcessed') || 'AI processed' },
          { label: t('dashboard.biggestPurchase') || 'Biggest Purchase', value: formatAmount(mostExpensive), sub: t('dashboard.largestTransaction') || 'Largest transaction' },
          { label: t('dashboard.thisWeek') || 'This Week', value: formatAmount(thisWeekSpent), sub: t('dashboard.weeklySpend') || 'Weekly spend' },
          { label: t('dashboard.topCategory') || 'Top Category', value: topCategory, sub: t('dashboard.highestSpending') || 'Highest spending', truncate: true },
        ].map((card, i) => (
          <Card key={i}>
            <div className="p-3 md:p-6">
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium line-clamp-1">{card.label}</p>
              <div className={`mt-1 md:mt-2 font-semibold tabular-nums${card.truncate ? ' text-sm md:text-base truncate' : ' text-lg md:text-xl'}`} title={card.truncate ? String(card.value) : undefined}>{card.value}</div>
              <p className="text-xs text-muted-foreground mt-0.5 md:mt-1 hidden md:block">{card.sub}</p>
            </div>
          </Card>
        ))}
      </div>

      {/* Financial Wellness Score — hidden on mobile to reduce clutter */}
      <div className="hidden md:block">
      <WellnessScore
        score={wellnessScore}
        grade={wellnessGrade}
        savingsScore={savingsScore}
        budgetScore={budgetScore}
        trendScore={trendScore}
        currency={currency}
        lang={lang}
      />
      </div>

      {/* Weekly Digest — hidden on mobile */}
      <div className="hidden md:block">
        <WeeklyDigest currency={currency} />
      </div>

      {/* Spending Trends */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <span suppressHydrationWarning>{t('dashboard.categoryTrends')}</span>
          </CardTitle>
          <CardDescription suppressHydrationWarning>{t('dashboard.categoryTrendsDesc')}</CardDescription>
        </CardHeader>
        <CardContent>
          <CategoryTrendChart
            key={`trend-${lastUpdate}`}
            expenses={expenses.map(e => ({
              amount: e.amount,
              date: e.date,
              categoryId: e.categoryId,
              currency: e.currency,
            }))}
            categories={categories}
            currency={currency}
          />
        </CardContent>
      </Card>

      {/* Main Content Grid */}
      <div className="grid gap-4 grid-cols-1 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-muted-foreground" />
              {t('dashboard.recentActivity') || 'Recent Activity'}
            </CardTitle>
            <CardDescription>{t('dashboard.latestTransactions') || 'Latest transactions'}</CardDescription>
          </CardHeader>
          <CardContent>
            <RecentExpensesTable
              key={`recent-${lastUpdate}`}
              data={recentExpenses.slice(0, 10).map(e => ({
                id: e.id,
                description: e.description,
                vendor: e.vendor,
                category: e.category,
                categoryId: e.categoryId,
                amount: e.amount,
                date: e.date,
                currency: e.currency,
              }))}
              currency={currency}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-4 w-4 text-muted-foreground" />
              {t('dashboard.topCategories') || 'Top Categories'}
            </CardTitle>
            <CardDescription>{t('dashboard.whereMoneyGoes') || 'Where your money goes'}</CardDescription>
          </CardHeader>
          <CardContent>
            {categorySpendingData.length === 0 ? (
              <p className="text-muted-foreground text-sm text-center py-8">
                <span suppressHydrationWarning>{t('dashboard.noCategoryData')}</span>
              </p>
            ) : (
              <div className="space-y-4">
                <SpendingByCategoryChart
                  key={`category-${lastUpdate}`}
                  data={categorySpendingData.map(c => ({ name: c.name, total: c.total }))}
                  currency={currency}
                />
                <div className="space-y-2 pt-4 border-t">
                  {categorySpendingData.map((cat, idx) => (
                    <div key={idx} className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">{cat.name}</span>
                      <span className="font-medium font-mono tabular-nums">{formatAmount(cat.total)}</span>
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
              <Target className="h-4 w-4 text-muted-foreground" />
              {t('dashboard.categoryBudgets') || 'Category Budgets'}
            </CardTitle>
            <CardDescription>{t('dashboard.trackSpending') || 'Track your spending by category'}</CardDescription>
          </CardHeader>
          <CardContent>
            <BudgetOverview key={`budget-${lastUpdate}`} data={budgetData} currency={currency} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
