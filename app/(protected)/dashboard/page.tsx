'use client'

import { useEffect, useState, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/components/ui/card';
import { Activity, TrendingUp, Wallet, Target, ArrowUpRight, AlertCircle, RefreshCw, CheckCircle2, Camera, BarChart3, Settings, Sparkles, ShieldCheck } from 'lucide-react';
import dynamic from 'next/dynamic';
import { RecentExpensesTable } from '@/components/protected/dashboard/recent-expenses-table';
/* Recharts-backed chart components — lazy-loaded so the recharts bundle is deferred */
const ChartSkeleton = () => <div className="h-[300px] w-full animate-pulse rounded-lg bg-muted" />;
const MonthlySpendingChart = dynamic(() => import('@/components/protected/dashboard/monthly-spending-chart').then(m => ({ default: m.MonthlySpendingChart })), { ssr: false, loading: ChartSkeleton });
const SpendingByCategoryChart = dynamic(() => import('@/components/protected/dashboard/spending-by-category-chart').then(m => ({ default: m.SpendingByCategoryChart })), { ssr: false, loading: ChartSkeleton });
import { BudgetOverview } from '@/components/protected/dashboard/budget-overview';
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
}

interface Budget {
  categoryId: string;
  amount: number | string;
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────
function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-4 sm:gap-6 animate-pulse">
      {/* Hero card */}
      <div className="rounded-xl border-2 bg-card p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <div className="h-5 w-32 rounded bg-muted" />
            <div className="h-3 w-48 rounded bg-muted" />
          </div>
          <div className="h-8 w-8 rounded bg-muted" />
        </div>
        <div className="h-10 w-40 rounded bg-muted" />
        <div className="h-3 w-56 rounded bg-muted" />
        <div className="flex gap-2">
          <div className="h-9 w-36 rounded-md bg-muted" />
          <div className="h-9 w-32 rounded-md bg-muted" />
          <div className="h-9 w-36 rounded-md bg-muted" />
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border bg-card p-4 space-y-3">
            <div className="h-3 w-24 rounded bg-muted" />
            <div className="h-7 w-28 rounded bg-muted" />
            <div className="h-2.5 w-20 rounded bg-muted" />
          </div>
        ))}
      </div>

      {/* Main grid */}
      <div className="grid gap-4 sm:gap-6 grid-cols-1 lg:grid-cols-3">
        <div className="lg:col-span-2 rounded-xl border bg-card p-6 space-y-3">
          <div className="h-5 w-36 rounded bg-muted" />
          <div className="h-3 w-48 rounded bg-muted" />
          <div className="space-y-2 pt-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between py-2 border-b last:border-0">
                <div className="space-y-1.5">
                  <div className="h-4 w-32 rounded bg-muted" />
                  <div className="h-3 w-20 rounded bg-muted" />
                </div>
                <div className="h-4 w-20 rounded bg-muted" />
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-xl border bg-card p-6 space-y-3">
          <div className="h-5 w-32 rounded bg-muted" />
          <div className="h-3 w-44 rounded bg-muted" />
          <div className="mx-auto mt-4 h-48 w-48 rounded-full bg-muted" />
        </div>
      </div>

      {/* Chart */}
      <div className="rounded-xl border bg-card p-6 space-y-3">
        <div className="h-5 w-40 rounded bg-muted" />
        <div className="h-3 w-52 rounded bg-muted" />
        <div className="mt-4 h-64 rounded-lg bg-muted" />
      </div>
    </div>
  );
}

// ─── Error state ─────────────────────────────────────────────────────────────
function DashboardError({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation()
  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.35 }}
        className="flex flex-col items-center gap-4 text-center max-w-sm"
      >
        <div className="h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center">
          <AlertCircle className="h-8 w-8 text-destructive" />
        </div>
        <div className="space-y-1">
          <h3 className="text-lg font-semibold" suppressHydrationWarning>
            {t('dashboard.failedLoad')}
          </h3>
          <p className="text-sm text-muted-foreground" suppressHydrationWarning>
            {t('dashboard.failedLoadDesc')}
          </p>
        </div>
        <Button onClick={onRetry} variant="outline" className="gap-2" suppressHydrationWarning>
          <RefreshCw className="h-4 w-4" />
          {t('dashboard.tryAgain')}
        </Button>
      </motion.div>
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

  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.12, delayChildren: 0.1 },
    },
  }

  const itemVariants = {
    hidden: { opacity: 0, y: 28 },
    show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] as const } },
  }

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
      iconClass: 'text-violet-600 dark:text-violet-400',
      ringClass: 'bg-violet-100 dark:bg-violet-950/50',
      badgeClass: 'bg-violet-100 dark:bg-violet-950/50 text-violet-700 dark:text-violet-300',
      title: t('onboarding.step3.title'),
      desc: t('onboarding.step3.desc'),
      completed: false,
      action: (
        <Link href="/analysis">
          <Button variant="ghost" size="sm" className="gap-1.5 text-violet-700 dark:text-violet-400 hover:text-violet-800 dark:hover:text-violet-300 px-3 opacity-50 cursor-not-allowed pointer-events-none">
            <Sparkles className="h-3.5 w-3.5" />
            <span suppressHydrationWarning>{t('onboarding.step3.action')}</span>
          </Button>
        </Link>
      ),
    },
  ]

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="show"
      className="w-full max-w-2xl mx-auto py-8 px-4 flex flex-col gap-8"
    >
      {/* Header */}
      <motion.div variants={itemVariants} className="text-center space-y-3">
        <div className="flex items-center justify-center gap-2 mb-4">
          <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center shadow-sm">
            <Wallet className="h-7 w-7 text-primary" />
          </div>
        </div>
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight" suppressHydrationWarning>
          {t('onboarding.title')}
        </h1>
        <p className="text-muted-foreground text-sm sm:text-base max-w-sm mx-auto" suppressHydrationWarning>
          {t('onboarding.subtitle')}
        </p>
      </motion.div>

      {/* Step cards */}
      <div className="flex flex-col gap-4">
        {steps.map((step, idx) => {
          const Icon = step.icon
          return (
            <motion.div key={idx} variants={itemVariants}>
              <div className={`relative rounded-xl border bg-card p-5 transition-all duration-200 ${step.completed ? 'border-emerald-200 dark:border-emerald-900/60' : 'hover:border-primary/30 hover:shadow-sm'}`}>
                {/* Completion stripe */}
                {step.completed && (
                  <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-xl bg-emerald-500" />
                )}

                <div className="flex items-start gap-4">
                  {/* Step icon */}
                  <div className={`shrink-0 h-10 w-10 rounded-xl flex items-center justify-center ${step.ringClass}`}>
                    <Icon className={`h-5 w-5 ${step.iconClass}`} />
                  </div>

                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${step.badgeClass}`} suppressHydrationWarning>
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
                      <h3 className="font-semibold text-sm sm:text-base" suppressHydrationWarning>
                        {step.title}
                      </h3>
                      <p className="text-xs sm:text-sm text-muted-foreground mt-0.5 leading-relaxed" suppressHydrationWarning>
                        {step.desc}
                      </p>
                    </div>

                    {/* Action */}
                    <div className="pt-1">
                      {step.action}
                    </div>
                  </div>

                  {/* Step number */}
                  <div className={`shrink-0 h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold border-2 ${step.completed ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40' : 'border-muted text-muted-foreground'}`}>
                    {idx + 1}
                  </div>
                </div>
              </div>
            </motion.div>
          )
        })}
      </div>

      {/* Footer */}
      <motion.div variants={itemVariants} className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
        <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
        <span suppressHydrationWarning>{t('onboarding.privacy')}</span>
      </motion.div>
    </motion.div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function ProtectedPage() {
  const { t, lang, mounted } = useTranslation();

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
  const [receiptsCount, setReceiptsCount] = useState<number>(0);
  const [settings, setSettings] = useState<any>(null);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [lastUpdate, setLastUpdate] = useState<number>(Date.now());

  const fetchData = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/data/dashboard', { signal });
      if (!res.ok) {
        const msg = res.status === 401
          ? 'Unauthorized'
          : `Server error ${res.status}`;
        throw new Error(msg);
      }
      const data = await res.json();
      setCategories(data.categories || []);
      setExpenses(data.expenses || []);
      setReceiptsCount(data.receiptsCount ?? 0);
      setSettings(data.settings || null);
      setBudgets(data.budgets || []);
      setLastUpdate(Date.now());
    } catch (err: any) {
      if (err.name === 'AbortError') return;
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
    // Don't compute while loading
    if (loading) return null;
    // After loading, even if there are 0 categories/expenses, compute (just with empty data)

    const today = new Date();
    const currency = (settings?.currency || 'PLN').toUpperCase();
    const locale = lang === 'pl' ? 'pl-PL' : 'en-US';

    const catById = new Map<string, Category>(categories.map(c => [c.id, c]));
    const budgetByCatId = new Map<string, number>(
      budgets.map(b => [b.categoryId, Number(b.amount || 0)])
    );

    const recentExpenses = expenses.map(e => ({
      id: e.id,
      description: e.title,
      categoryId: e.categoryId,
      // raw name for colour lookup in the table
      categoryRaw: e.categoryId ? (catById.get(e.categoryId)?.name || 'Other') : '',
      category: e.categoryId
        ? translateCategoryName(catById.get(e.categoryId)?.name || 'Other')
        : '',
      amount: Number(e.amount),
      date: e.date,
      receiptId: e.receiptId,
      vendor: e.vendor,
    }));

    const totalSpent = recentExpenses.reduce((sum, e) => sum + e.amount, 0);
    const totalTransactions = recentExpenses.length;
    const avgDaily = totalSpent / 30;
    const avgTransaction = totalTransactions > 0 ? totalSpent / totalTransactions : 0;
    const mostExpensive = recentExpenses.length > 0
      ? Math.max(...recentExpenses.map(e => e.amount))
      : 0;

    // Category spending from expenses
    const spentByCatId = new Map<string, number>();
    for (const e of expenses) {
      const key = e.categoryId || 'other';
      spentByCatId.set(key, (spentByCatId.get(key) || 0) + Number(e.amount || 0));
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

    // Monthly chart (30 days)
    const monthlySpendingData = Array.from({ length: 30 }).map((_, i) => {
      const d = new Date(today);
      d.setDate(today.getDate() - (29 - i));
      const dateStr = d.toISOString().slice(0, 10);
      const dayData: any = {
        date: d.toLocaleDateString(locale, { day: 'numeric', month: 'short' }),
      };
      categorySpendingData.forEach(cat => { dayData[cat.rawName] = 0; });
      dayData['Other'] = 0;

      expenses
        .filter(e => e.date?.startsWith(dateStr))
        .forEach(e => {
          const catName = e.categoryId ? (catById.get(e.categoryId)?.name || 'Other') : 'Other';
          if (!dayData[catName]) dayData[catName] = 0;
          dayData[catName] += Number(e.amount || 0);
        });

      return dayData;
    });

    const chartCategories = Array.from(new Set([
      ...categorySpendingData.map(c => c.rawName),
      'Other',
    ])).filter(cat => monthlySpendingData.some(day => (day[cat] || 0) > 0));

    return {
      currency, locale, recentExpenses, totalSpent, totalTransactions,
      avgDaily, avgTransaction, mostExpensive, receiptsScanned: receiptsCount,
      categorySpendingData, topCategory, budgetData, totalBudget, budgetRemaining,
      budgetProgress, monthlySpendingData, chartCategories, catById,
    };
  }, [loading, categories, expenses, receiptsCount, settings, budgets, lang, t, translateCategoryName]);

  // ── Render states ──────────────────────────────────────────────────────────
  if (loading) {
    return <DashboardSkeleton />;
  }

  if (error) {
    return <DashboardError onRetry={fetchData} />;
  }

  // calculatedData is guaranteed non-null here (loading is false, no error)
  const {
    currency, locale, recentExpenses, totalSpent, totalTransactions, avgDaily, avgTransaction,
    mostExpensive, receiptsScanned, categorySpendingData, topCategory, budgetData,
    totalBudget, budgetRemaining, budgetProgress, monthlySpendingData, chartCategories,
  } = calculatedData!;

  function formatAmount(amount: number) {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  }

  // Empty state: fetch succeeded but there are no expenses at all
  if (recentExpenses.length === 0) {
    return (
      <DashboardEmpty
        onAction={() => {}}
        fetchData={fetchData}
      />
    );
  }

  const fadeUp = {
    hidden: { opacity: 0, y: 24 },
    show: (i: number) => ({
      opacity: 1, y: 0,
      transition: { duration: 0.5, delay: i * 0.08, ease: [0.22, 1, 0.36, 1] as const },
    }),
  };

  const budgetProgressColor =
    budgetProgress >= 100
      ? 'bg-red-500'
      : budgetProgress >= 90
      ? 'bg-yellow-500'
      : budgetProgress >= 70
      ? 'bg-amber-400'
      : 'bg-emerald-500';

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.35 }} className="flex flex-col gap-4 sm:gap-6">
      {/* Hero Section */}
      <motion.div custom={0} initial="hidden" animate="show" variants={fadeUp}>
        <Card className="border-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-xl sm:text-2xl font-bold">{t('dashboard.totalSpent') || 'Total Spent'}</CardTitle>
                <CardDescription className="hidden sm:block">{t('dashboard.spendingOverview') || 'Your spending overview'}</CardDescription>
              </div>
              <Wallet className="h-6 w-6 sm:h-8 sm:w-8 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent className="space-y-4 sm:space-y-6">
            <div>
              <p className="text-sm text-muted-foreground mb-1">{t('dashboard.totalSpent') || 'Total Spent'}</p>
              <div className="flex items-baseline gap-2 sm:gap-3">
                <span className="text-3xl sm:text-4xl font-bold tabular-nums">{formatAmount(totalSpent)}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1" suppressHydrationWarning>
                {totalTransactions} {t('dashboard.transactions') || 'transactions'} · {formatAmount(avgDaily)}/{t('dashboard.day')}
              </p>
            </div>

            {totalBudget > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{t('dashboard.budgetProgress') || 'Budget Progress'}</span>
                  <span className="font-medium">
                    {budgetRemaining >= 0
                      ? <span className="text-emerald-600 dark:text-emerald-400">{formatAmount(budgetRemaining)} {t('dashboard.left') || 'left'}</span>
                      : <span className="text-red-600 dark:text-red-400">{formatAmount(Math.abs(budgetRemaining))} {t('dashboard.over') || 'over'}</span>
                    }
                  </span>
                </div>
                {/* Color-coded progress bar */}
                <div className={`relative h-2.5 w-full overflow-hidden rounded-full ${
                  budgetProgress >= 100
                    ? 'bg-red-100 dark:bg-red-950/40'
                    : budgetProgress >= 90
                    ? 'bg-yellow-100 dark:bg-yellow-950/40'
                    : budgetProgress >= 70
                    ? 'bg-amber-100 dark:bg-amber-950/40'
                    : 'bg-emerald-100 dark:bg-emerald-950/40'
                }`}>
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${budgetProgressColor}`}
                    style={{ width: `${Math.min(budgetProgress, 100)}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground" suppressHydrationWarning>
                  {budgetProgress.toFixed(1)}% {t('dashboard.of')} {formatAmount(totalBudget)} {t('dashboard.budget') || 'budget'} {t('dashboard.used') || 'used'}
                </p>
              </div>
            )}

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
      </motion.div>

      {/* Metric Cards */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        {[
          { label: t('dashboard.receiptsScanned') || 'Receipts Scanned', value: receiptsScanned, sub: t('dashboard.aiProcessed') || 'AI processed' },
          { label: t('dashboard.biggestPurchase') || 'Biggest Purchase', value: formatAmount(mostExpensive), sub: t('dashboard.largestTransaction') || 'Largest transaction' },
          { label: t('dashboard.avgTransaction') || 'Avg Transaction', value: formatAmount(avgTransaction), sub: t('dashboard.averagePerTransaction') || 'Average per transaction' },
          { label: t('dashboard.topCategory') || 'Top Category', value: topCategory, sub: t('dashboard.highestSpending') || 'Highest spending', truncate: true },
        ].map((card, i) => (
          <motion.div key={i} custom={i + 1} initial="hidden" animate="show" variants={fadeUp}>
            <Card className="h-full hover:shadow-md transition-shadow duration-200">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground">{card.label}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className={`font-bold tabular-nums${card.truncate ? ' text-lg truncate' : ' text-2xl'}`} title={card.truncate ? String(card.value) : undefined}>{card.value}</div>
                <p className="text-xs text-muted-foreground mt-1">{card.sub}</p>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Main Content Grid */}
      <motion.div custom={5} initial="hidden" animate="show" variants={fadeUp} className="grid gap-4 sm:gap-6 grid-cols-1 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
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
              }))}
              currency={currency}
            />
          </CardContent>
        </Card>

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
                      <span className="font-medium tabular-nums">{formatAmount(cat.total)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Category Budgets */}
      {budgetData.length > 0 && (
        <motion.div custom={6} initial="hidden" animate="show" variants={fadeUp}>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Target className="h-5 w-5" />
                {t('dashboard.categoryBudgets') || 'Category Budgets'}
              </CardTitle>
              <CardDescription>{t('dashboard.trackSpending') || 'Track your spending by category'}</CardDescription>
            </CardHeader>
            <CardContent>
              <BudgetOverview key={`budget-${lastUpdate}`} data={budgetData} currency={currency} />
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Monthly Spending Trend */}
      <motion.div custom={7} initial="hidden" animate="show" variants={fadeUp}>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              {t('dashboard.monthlySpending') || 'Monthly Spending'}
            </CardTitle>
            <CardDescription>{t('dashboard.dailyExpenses') || 'Daily expenses over the last 30 days'}</CardDescription>
          </CardHeader>
          <CardContent className="pl-2">
            <MonthlySpendingChart
              key={`monthly-${lastUpdate}`}
              data={monthlySpendingData}
              currency={currency}
              categories={chartCategories}
            />
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  );
}
