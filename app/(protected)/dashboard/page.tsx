'use client'

import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Card, CardContent, CardHeader, CardTitle,
} from '@/components/ui/card';
import { Activity, TrendingUp, TrendingDown, Wallet, ArrowUpRight, AlertCircle, RefreshCw, CheckCircle2, Camera, BarChart3, Settings, Sparkles, ShieldCheck, Gauge, PiggyBank } from 'lucide-react';
import dynamic from 'next/dynamic';
/* Heavy components — lazy-loaded to reduce initial bundle */
const ComponentSkeleton = () => <div className="h-[200px] w-full animate-shimmer rounded-lg border border-border shadow-[var(--nb-shadow-sm)]" />;
const RecentExpensesTable = dynamic(() => import('@/components/protected/dashboard/recent-expenses-table').then(m => ({ default: m.RecentExpensesTable })), { ssr: false, loading: ComponentSkeleton });

/* Paleta kategorii Notes Classic — przypisywana wg rangi wydatków */
const CAT_COLORS = ['#e2493a', '#e29a2f', '#3f9c74', '#4f79e2', '#9a5fd1', '#c9c2b2'];

/* Klasa wypełnienia paska wg stopnia zapełnienia budżetu */
function pbFillClass(pct: number): string {
  if (pct >= 100) return 'pb-fill pb-fill-bad';
  if (pct >= 75) return 'pb-fill pb-fill-warn';
  return 'pb-fill pb-fill-ok';
}
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
      <div className="rounded-lg border border-border bg-card shadow-[var(--nb-shadow-sm)] p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <div className="h-4 w-32 rounded animate-shimmer" />
            <div className="h-3 w-48 rounded animate-shimmer" />
          </div>
          <div className="h-9 w-9 rounded border border-border animate-shimmer" />
        </div>
        <div className="h-9 w-48 rounded animate-shimmer" />
        <div className="h-3 w-56 rounded animate-shimmer" />
        <div className="flex gap-2">
          <div className="h-10 w-36 rounded-md border border-border animate-shimmer" />
          <div className="h-10 w-32 rounded-md border border-border animate-shimmer" />
          <div className="h-10 w-36 rounded-md border border-border animate-shimmer" />
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-lg border border-border bg-card shadow-[var(--nb-shadow-sm)] p-6 space-y-3">
            <div className="h-3 w-24 rounded animate-shimmer" />
            <div className="h-6 w-28 rounded animate-shimmer" />
            <div className="h-2.5 w-20 rounded animate-shimmer" />
          </div>
        ))}
      </div>

      {/* Main grid */}
      <div className="grid gap-4 grid-cols-1 lg:grid-cols-3">
        <div className="lg:col-span-2 rounded-lg border border-border bg-card shadow-[var(--nb-shadow-sm)] p-6 space-y-3">
          <div className="h-4 w-36 rounded animate-shimmer" />
          <div className="h-3 w-48 rounded animate-shimmer" />
          <div className="space-y-2 pt-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between py-2 border-b border-dashed border-border/20 last:border-0">
                <div className="space-y-1.5">
                  <div className="h-4 w-32 rounded animate-shimmer" />
                  <div className="h-3 w-20 rounded animate-shimmer" />
                </div>
                <div className="h-4 w-20 rounded animate-shimmer" />
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-lg border border-border bg-card shadow-[var(--nb-shadow-sm)] p-6 space-y-3">
          <div className="h-4 w-32 rounded animate-shimmer" />
          <div className="h-3 w-44 rounded animate-shimmer" />
          <div className="mx-auto mt-4 h-48 w-48 rounded-full border border-border animate-shimmer" />
        </div>
      </div>

      {/* Chart */}
      <div className="rounded-lg border border-border bg-card shadow-[var(--nb-shadow-sm)] p-6 space-y-3">
        <div className="h-4 w-40 rounded animate-shimmer" />
        <div className="h-3 w-52 rounded animate-shimmer" />
        <div className="mt-4 h-64 rounded-lg border border-border animate-shimmer" />
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
  // Wybrany miesiąc (YYYY-MM, czas lokalny) — przełącznik w nagłówku
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });

  const fetchData = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/data/dashboard?period=month&month=${selectedMonth}`, { signal });
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
  }, [selectedMonth]);

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
    // Dla miesięcy przeszłych (przełącznik miesiąca): miesiąc zamknięty → progress = 100%
    const currentYM = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    const isCurrentMonth = selectedMonth === currentYM;
    const refYear = Number(selectedMonth.slice(0, 4));
    const refMonth = Number(selectedMonth.slice(5, 7));
    const daysInMonth = new Date(refYear, refMonth, 0).getDate();
    const dayOfMonth = isCurrentMonth ? today.getDate() : daysInMonth;
    const monthProgress = dayOfMonth / daysInMonth;
    const monthlyForecast = isCurrentMonth && monthProgress > 0 ? totalSpent / monthProgress : null;

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

    // Bilans miesiąca: przychody − wydatki. Ujemny = deficyt (nie ukrywamy go).
    const monthBalance = monthIncome && monthIncome > 0 ? monthIncome - totalSpent : null;

    // Wskaźnik oszczędności — może być ujemny, gdy wydatki przekraczają przychody
    const savingsRate = monthIncome && monthIncome > 0
      ? Math.round(((monthIncome - totalSpent) / monthIncome) * 100)
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
        icon: cat.icon || null,
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

    // ── Notes Classic: porównanie kategorii bieżący vs poprzedni miesiąc ──
    // Kategorie bez wydatków w poprzednim miesiącu = jednorazowe/nowe (bez Δ%)
    const daysLeft = Math.max(1, daysInMonth - dayOfMonth + 1);
    const dailyAllowance = isCurrentMonth && totalBudget > 0 && budgetRemaining > 0 ? budgetRemaining / daysLeft : null;
    const comparisonData = Array.from(spentByCatId.entries())
      .map(([catId, curr]) => {
        const cat = catId === 'other' ? null : (catById.get(catId) || null);
        const prev = prevSpentByCatId.get(catId) || 0;
        const budgetAmt = catId === 'other' ? 0 : (budgetByCatId.get(catId) || 0);
        return {
          id: catId,
          name: cat ? translateCategoryName(cat.name) : translateCategoryName('Other'),
          icon: cat?.icon || null,
          curr,
          prev,
          budget: budgetAmt,
          deltaPct: prev > 0 ? Math.round(((curr - prev) / prev) * 100) : null,
        };
      })
      .sort((a, b) => b.curr - a.curr)
      .slice(0, 6);

    return {
      currency, locale, recentExpenses, totalSpent, totalTransactions,
      avgDaily, avgTransaction, mostExpensive, receiptsScanned: receiptsCount,
      categorySpendingData, topCategory, budgetData, totalBudget, budgetRemaining,
      budgetProgress, catById,
      momChange, monthlyForecast, thisWeekSpent, overBudgetCategories, savingsRate,
      anomalies, wellnessScore, wellnessGrade, savingsScore, budgetScore, trendScore,
      monthProgress, daysLeft, dailyAllowance, comparisonData, isCurrentMonth,
      monthIncome, monthBalance,
    };
  }, [loading, categories, expenses, prevExpenses, serverPrevTotal, serverPrevByCategory, receiptsCount, settings, budgets, lang, monthIncome, translateCategoryName, selectedMonth]);

  // ── Render states ──────────────────────────────────────────────────────────
  if (loading) {
    return <DashboardSkeleton />;
  }

  if (error) {
    return <DashboardError onRetry={fetchData} />;
  }

  const {
    currency, locale, recentExpenses, totalSpent, totalTransactions, avgDaily,
    mostExpensive,
    totalBudget, budgetRemaining, budgetProgress,
    momChange, monthlyForecast, thisWeekSpent, overBudgetCategories, savingsRate,
    monthProgress, daysLeft, dailyAllowance, comparisonData, isCurrentMonth,
    monthIncome: incomeThisMonth, monthBalance,
  } = calculatedData!;

  function formatAmount(amount: number) {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  }

  // Empty state — onboarding tylko dla bieżącego miesiąca; w przeglądanym
  // pustym miesiącu pokazujemy normalny dashboard z zerami
  if (recentExpenses.length === 0 && isCurrentMonth) {
    return (
      <DashboardEmpty
        onAction={() => {}}
        fetchData={fetchData}
      />
    );
  }

  // ── Notes Classic: dane pochodne renderu ──
  const monthLabel = new Date(Number(selectedMonth.slice(0, 4)), Number(selectedMonth.slice(5, 7)) - 1, 1)
    .toLocaleDateString(locale, { month: 'long', year: 'numeric' });
  const shiftMonth = (delta: number) => {
    const d = new Date(Number(selectedMonth.slice(0, 4)), Number(selectedMonth.slice(5, 7)) - 1 + delta, 1);
    setSelectedMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };
  const colorByCatId = new Map<string, string>(
    comparisonData.map((c, i) => [c.id, CAT_COLORS[Math.min(i, CAT_COLORS.length - 1)]])
  );
  // Donut struktury wydatków — CSS conic-gradient z udziałów kategorii
  const donutSegments: string[] = [];
  let cumPct = 0;
  for (let i = 0; i < comparisonData.length; i++) {
    const share = totalSpent > 0 ? (comparisonData[i].curr / totalSpent) * 100 : 0;
    donutSegments.push(`${colorByCatId.get(comparisonData[i].id)} ${cumPct}% ${cumPct + share}%`);
    cumPct += share;
  }
  if (cumPct < 100) donutSegments.push(`hsl(var(--muted)) ${cumPct}% 100%`);
  const donutStyle = { background: `conic-gradient(${donutSegments.join(', ')})` };
  const maxCompareVal = Math.max(1, ...comparisonData.flatMap(c => [c.curr, c.prev]));

  return (
    <div className="flex flex-col gap-4 md:gap-5">
      {/* ── Nagłówek strony: powitanie + akcje ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl" suppressHydrationWarning>{t('dashboard.goodMorning')}</h1>
          {/* Przełącznik miesiąca */}
          <div className="mt-0.5 flex items-center gap-1">
            <button
              onClick={() => shiftMonth(-1)}
              className="h-6 w-6 rounded-md flex items-center justify-center text-muted-foreground hover:bg-secondary hover:text-secondary-foreground transition-colors"
              aria-label="previous month"
            >
              ‹
            </button>
            <span className="text-sm font-bold text-muted-foreground capitalize tabular-nums min-w-[110px] text-center" suppressHydrationWarning>
              {monthLabel}
            </span>
            <button
              onClick={() => shiftMonth(1)}
              disabled={isCurrentMonth}
              className="h-6 w-6 rounded-md flex items-center justify-center text-muted-foreground hover:bg-secondary hover:text-secondary-foreground transition-colors disabled:opacity-30 disabled:pointer-events-none"
              aria-label="next month"
            >
              ›
            </button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <ScanReceiptButton onAction={fetchData} />
          <AddExpenseTrigger onAction={fetchData} />
        </div>
      </div>

      {/* ── Alerty przekroczonych budżetów ── */}
      {overBudgetCategories.length > 0 && (
        <div className="flex flex-col gap-2">
          {overBudgetCategories.map((cat, i) => (
            <div
              key={i}
              className={`flex items-center gap-2 md:gap-3 rounded-xl border px-3 py-2.5 md:px-4 text-sm font-medium ${i >= 2 ? 'hidden md:flex' : ''} ${
                cat.pct >= 1
                  ? 'border-[#f0c9bf] bg-[#fdeeea] text-[#a4442e] dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400'
                  : 'border-[#f0dcb4] bg-[#fdf5e2] text-[#93591a] dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-400'
              }`}
            >
              <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="flex-1 truncate" suppressHydrationWarning>
                <span className="font-bold">{cat.name}</span>{': '}
                {cat.pct >= 1
                  ? `${t('dashboard.overBudgetShort')} ${formatAmount(cat.spent - cat.budget)}`
                  : `${t('dashboard.nearLimitShort')} (${(cat.pct * 100).toFixed(0)}%)`}
              </span>
              <span className="tabular-nums shrink-0 text-xs md:text-sm">{formatAmount(cat.spent)} / {formatAmount(cat.budget)}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── Rząd górny: hero z paskiem tempa + prognoza + na dziś + donut ── */}
      <div className="grid gap-4 grid-cols-2 xl:grid-cols-[1.6fr_0.8fr_0.8fr_1.2fr]">
        {/* Hero: wydano + pasek zmieniający kolor + kreska tempa */}
        <Card className="col-span-2 xl:col-span-1">
          <div className="p-4 md:p-5">
            <p className="nb-label" suppressHydrationWarning>{t('dashboard.monthSpending')}</p>
            <div className="mt-1 mb-4 flex items-baseline gap-2 flex-wrap">
              <span className="text-3xl md:text-4xl font-extrabold tabular-nums tracking-tight">{formatAmount(totalSpent)}</span>
              {totalBudget > 0 && (
                <span className="text-sm text-muted-foreground font-medium tabular-nums">/ {formatAmount(totalBudget)}</span>
              )}
              {momChange !== null && (
                <span className={`inline-flex items-center gap-1 text-xs font-bold ${momChange < 0 ? 'text-[#1e6b2f] dark:text-emerald-400' : 'text-[#b3402c] dark:text-red-400'}`} suppressHydrationWarning>
                  {momChange < 0 ? <TrendingDown className="h-3.5 w-3.5" aria-hidden="true" /> : <TrendingUp className="h-3.5 w-3.5" aria-hidden="true" />}
                  {momChange > 0 ? '+' : ''}{momChange}% {t('dashboard.vsLastMonth')}
                </span>
              )}
            </div>
            {totalBudget > 0 ? (
              <>
                <div
                  className="pb-track"
                  role="progressbar"
                  aria-valuenow={Math.round(budgetProgress)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={t('dashboard.budgetProgress')}
                >
                  <span className={pbFillClass(budgetProgress)} style={{ width: `${Math.min(budgetProgress, 100)}%` }} />
                  {isCurrentMonth && <span className="pb-pin" style={{ left: `${Math.min(monthProgress * 100, 99)}%` }} />}
                </div>
                <div className="mt-1.5 flex items-center justify-between text-xs text-muted-foreground tabular-nums flex-wrap gap-1">
                  <span suppressHydrationWarning>
                    {budgetProgress.toFixed(0)}% ·{' '}
                    {budgetRemaining >= 0
                      ? <>{t('dashboard.remainingBudget')} <b className="text-foreground">{formatAmount(budgetRemaining)}</b></>
                      : <b className="text-[#b3402c] dark:text-red-400">{formatAmount(Math.abs(budgetRemaining))} {t('dashboard.over')}</b>}
                  </span>
                  {isCurrentMonth && (
                    <span className="hidden sm:inline" suppressHydrationWarning>{t('dashboard.paceMarker')} ({(monthProgress * 100).toFixed(0)}%)</span>
                  )}
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground" suppressHydrationWarning>
                {totalTransactions} {t('dashboard.transactions')} · {formatAmount(avgDaily)}/{t('dashboard.day')}
              </p>
            )}
          </div>
        </Card>

        {/* KPI: prognoza końca miesiąca */}
        <Card>
          <div className="p-4 md:p-5 flex flex-col justify-center h-full">
            <p className="nb-label flex items-center gap-1.5" suppressHydrationWarning>
              <Gauge className="h-3.5 w-3.5" aria-hidden="true" />{t('dashboard.forecastMonth')}
            </p>
            <p className={`mt-1 text-xl md:text-2xl font-extrabold tabular-nums ${monthlyForecast !== null && totalBudget > 0 && monthlyForecast > totalBudget ? 'text-[#b3402c] dark:text-red-400' : ''}`}>
              {monthlyForecast !== null ? formatAmount(monthlyForecast) : '—'}
            </p>
            {monthlyForecast !== null && totalBudget > 0 && (
              <p className={`text-xs font-bold mt-0.5 ${monthlyForecast > totalBudget ? 'text-[#b3402c] dark:text-red-400' : 'text-[#1e6b2f] dark:text-emerald-400'}`} suppressHydrationWarning>
                {monthlyForecast > totalBudget
                  ? `▲ ${formatAmount(monthlyForecast - totalBudget)} ${t('dashboard.over')}`
                  : `${formatAmount(totalBudget - monthlyForecast)} ${t('dashboard.remainingBudget')}`}
              </p>
            )}
          </div>
        </Card>

        {/* KPI: ile można wydać dziennie */}
        <Card>
          <div className="p-4 md:p-5 flex flex-col justify-center h-full">
            <p className="nb-label flex items-center gap-1.5" suppressHydrationWarning>
              <Wallet className="h-3.5 w-3.5" aria-hidden="true" />{t('dashboard.dailyAllowance')}
            </p>
            <p className="mt-1 text-xl md:text-2xl font-extrabold tabular-nums">
              {dailyAllowance !== null ? formatAmount(dailyAllowance) : formatAmount(avgDaily)}
            </p>
            <p className="text-xs text-muted-foreground font-medium mt-0.5" suppressHydrationWarning>
              {dailyAllowance !== null
                ? `${t('dashboard.perDay')} · ${daysLeft} ${t('dashboard.daysLeft')}`
                : `${t('dashboard.perDay')}`}
            </p>
          </div>
        </Card>

        {/* Donut: struktura wydatków */}
        <Card className="col-span-2 xl:col-span-1">
          <div className="p-4 md:p-5 flex items-center gap-4 h-full">
            <div className="relative h-24 w-24 shrink-0 rounded-full" style={donutStyle} role="img" aria-label={t('dashboard.categorySplit')}>
              <div className="absolute inset-[18px] rounded-full bg-card flex flex-col items-center justify-center">
                <span className="text-sm font-extrabold tabular-nums">{totalBudget > 0 ? `${budgetProgress.toFixed(0)}%` : formatAmount(totalSpent)}</span>
                {totalBudget > 0 && <span className="text-[9px] text-muted-foreground font-bold" suppressHydrationWarning>{t('dashboard.budget')}</span>}
              </div>
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              <p className="nb-label" suppressHydrationWarning>{t('dashboard.categorySplit')}</p>
              {comparisonData.slice(0, 4).map((c) => (
                <div key={c.id} className="flex items-center gap-1.5 text-xs font-semibold">
                  <span className="h-2 w-2 rounded-[3px] shrink-0" style={{ backgroundColor: colorByCatId.get(c.id) }} />
                  <span className="truncate flex-1">{c.name}</span>
                  <span className="tabular-nums text-muted-foreground">{totalSpent > 0 ? Math.round((c.curr / totalSpent) * 100) : 0}%</span>
                </div>
              ))}
            </div>
          </div>
        </Card>
      </div>

      {/* ── Rząd środkowy: porównanie kategorii + ostatnie transakcje ── */}
      <div className="grid gap-4 grid-cols-1 lg:grid-cols-[1.4fr_1fr]">
        {/* Porównanie: bieżący vs poprzedni miesiąc */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-baseline justify-between gap-2 flex-wrap">
              <CardTitle suppressHydrationWarning>{t('dashboard.topCategories')} — {t('dashboard.vsPrevMonth')}</CardTitle>
              <span className="text-[11px] text-muted-foreground font-medium" suppressHydrationWarning>{t('dashboard.comparisonHint')}</span>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {comparisonData.map((c) => (
              <div key={c.id} className="flex items-center gap-3">
                <span className="flex items-center gap-2 w-[120px] md:w-[140px] shrink-0 text-sm font-bold truncate">
                  <span className="h-2.5 w-2.5 rounded-[3px] shrink-0" style={{ backgroundColor: colorByCatId.get(c.id) }} />
                  <span className="truncate">{c.name}</span>
                </span>
                <span className="flex-1 flex flex-col gap-[3px] min-w-0">
                  <span className="h-[9px] rounded-[5px]" style={{ width: `${Math.max(2, (c.curr / maxCompareVal) * 100)}%`, backgroundColor: colorByCatId.get(c.id) }} />
                  <span className="h-[9px] rounded-[5px] opacity-30" style={{ width: `${Math.max(c.prev > 0 ? 2 : 0, (c.prev / maxCompareVal) * 100)}%`, backgroundColor: colorByCatId.get(c.id) }} />
                </span>
                <span className="w-[76px] text-right text-sm font-bold tabular-nums shrink-0">{formatAmount(c.curr)}</span>
                <span className={`w-[52px] text-right text-xs font-extrabold tabular-nums shrink-0 ${
                  c.deltaPct === null ? 'text-muted-foreground' : c.deltaPct > 0 ? 'text-[#b3402c] dark:text-red-400' : c.deltaPct < 0 ? 'text-[#1e6b2f] dark:text-emerald-400' : 'text-muted-foreground'
                }`} suppressHydrationWarning>
                  {c.deltaPct === null ? '•' : c.deltaPct > 0 ? `▲${c.deltaPct}%` : c.deltaPct < 0 ? `▼${Math.abs(c.deltaPct)}%` : '0%'}
                </span>
              </div>
            ))}
            {comparisonData.some(c => c.deltaPct === null) && (
              <p className="text-[11px] text-muted-foreground pt-1" suppressHydrationWarning>
                • = {t('dashboard.oneOffNew')}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Ostatnie transakcje */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-baseline justify-between gap-2">
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                <span suppressHydrationWarning>{t('dashboard.recentActivity')}</span>
              </CardTitle>
              <Link href="/expenses" className="text-xs font-bold text-primary inline-flex items-center gap-0.5 hover:underline">
                <span suppressHydrationWarning>{t('dashboard.viewAllExpenses')}</span>
                <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            <RecentExpensesTable
              key={`recent-${lastUpdate}`}
              data={recentExpenses.slice(0, 8).map(e => ({
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
      </div>

      {/* ── Dolny rząd KPI: bilans / oszczędności / tydzień / największy zakup ── */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        {/* Bilans miesiąca — przychody minus wydatki; bez przychodów zachęta do wpisania */}
        <Card className={monthBalance !== null && monthBalance < 0 ? 'border-[#f0c9bf] dark:border-red-500/30' : ''}>
          <div className="p-3 md:p-5">
            <p className="nb-label flex items-center gap-1.5" suppressHydrationWarning>
              <Wallet className="h-3.5 w-3.5" aria-hidden="true" />{t('dashboard.monthBalance')}
            </p>
            {monthBalance !== null ? (
              <>
                <p className={`mt-1 text-lg md:text-xl font-extrabold tabular-nums ${monthBalance >= 0 ? 'text-[#1e6b2f] dark:text-emerald-400' : 'text-[#b3402c] dark:text-red-400'}`}>
                  {monthBalance >= 0 ? '+' : '−'}{formatAmount(Math.abs(monthBalance))}
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5 tabular-nums" suppressHydrationWarning>
                  {formatAmount(incomeThisMonth!)} − {formatAmount(totalSpent)}
                </p>
              </>
            ) : (
              <Link href="/savings" className="mt-1 inline-flex items-center gap-1 text-sm font-bold text-primary hover:underline">
                <span suppressHydrationWarning>{t('dashboard.addIncome')}</span>
                <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            )}
          </div>
        </Card>
        <Card>
          <div className="p-3 md:p-5">
            <p className="nb-label flex items-center gap-1.5" suppressHydrationWarning>
              <PiggyBank className="h-3.5 w-3.5" aria-hidden="true" />{t('dashboard.savingsRate')}
            </p>
            <p className={`mt-1 text-lg md:text-xl font-extrabold tabular-nums ${savingsRate !== null ? (savingsRate >= 20 ? 'text-[#1e6b2f] dark:text-emerald-400' : savingsRate >= 10 ? 'text-[#93591a] dark:text-amber-400' : 'text-[#b3402c] dark:text-red-400') : ''}`}>
              {savingsRate !== null ? `${savingsRate}%` : '—'}
            </p>
          </div>
        </Card>
        <Card>
          <div className="p-3 md:p-5">
            <p className="nb-label" suppressHydrationWarning>{t('dashboard.thisWeek')}</p>
            <p className="mt-1 text-lg md:text-xl font-extrabold tabular-nums">{formatAmount(thisWeekSpent)}</p>
          </div>
        </Card>
        <Card>
          <div className="p-3 md:p-5">
            <p className="nb-label" suppressHydrationWarning>{t('dashboard.biggestPurchase')}</p>
            <p className="mt-1 text-lg md:text-xl font-extrabold tabular-nums">{formatAmount(mostExpensive)}</p>
          </div>
        </Card>
      </div>
    </div>
  );
}
