import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Activity, CreditCard, DollarSign, PlusCircle } from "lucide-react";

import { RecentExpensesTable } from "@/components/protected/dashboard/recent-expenses-table";
import { SpendingChart } from "@/components/protected/dashboard/spending-chart";
import { SpendingByCategoryChart } from "@/components/protected/dashboard/spending-by-category-chart";
import { BudgetOverview } from "@/components/protected/dashboard/budget-overview";
// --- Rozbudowane Demo Dane ---
const recentExpenses = [
  { id: "tx_1", description: "Kawa w Starbucks", category: "Food", amount: 5.75, date: "2025-10-31" },
  { id: "tx_2", description: "Miesięczny bilet ZTM", category: "Transport", amount: 65.00, date: "2025-10-30" },
  { id: "tx_3", description: "Subskrypcja Netflix", category: "Entertainment", amount: 15.99, date: "2025-10-29" },
  { id: "tx_4", description: "Zakupy spożywcze Biedronka", category: "Groceries", amount: 120.40, date: "2025-10-29" },
  { id: "tx_5", description: "Bilety do kina", category: "Entertainment", amount: 30.00, date: "2025-10-28" },
  { id: "tx_6", description: "Rachunek za prąd", category: "Utilities", amount: 75.50, date: "2025-10-28" },
  { id: "tx_7", description: "Tankowanie paliwa", category: "Transport", amount: 50.00, date: "2025-10-27" },
  { id: "tx_8", description: "Lunch w biurze", category: "Food", amount: 12.00, date: "2025-10-27" },
];

const dailySpendingData = [
  { date: 'Oct 25', total: 30.00 }, { date: 'Oct 26', total: 15.50 }, { date: 'Oct 27', total: 62.00 },
  { date: 'Oct 28', total: 105.50 }, { date: 'Oct 29', total: 136.39 }, { date: 'Oct 30', total: 65.00 },
  { date: 'Oct 31', total: 5.75 },
];

// Dane są teraz powiązane ze zmiennymi CSS zdefiniowanymi w pliku CSS
const categorySpendingData = [
  { name: 'Groceries', total: 450.20, fill: "var(--color-groceries)" },
  { name: 'Transport', total: 115.50, fill: "var(--color-transport)" },
  { name: 'Food', total: 205.75, fill: "var(--color-food)" },
  { name: 'Entertainment', total: 90.00, fill: "var(--color-entertainment)" },
  { name: 'Utilities', total: 150.00, fill: "var(--color-utilities)" },
  { name: 'Other', total: 45.30, fill: "var(--color-other)" },
];

const budgetData = [
  { id: "b_1", name: 'Groceries', spent: 450.20, budget: 600 },
  { id: "b_2", name: 'Entertainment', spent: 90.00, budget: 100 },
  { id: "b_3", name: 'Transport', spent: 115.50, budget: 100 },
  { id: "b_4", name: 'Food (Restaurants)', spent: 205.75, budget: 250 },
];
// --- Koniec Demo Danych ---


export default async function ProtectedPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/");
  }

  return (
    // Używamy flex-col z odstępem
    <div className="flex flex-col gap-8">

      {/* Rząd 1: Tytuł strony i Akcje */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center sm:justify-between gap-4">
        
        {/* 👇 PROPOZYCJA ULEPSZENIA: Zgrupowanie tytułu i dodanie podtytułu 👇 */}
        <div>
          <h2 className="text-3xl font-bold tracking-tight">
            Dashboard
          </h2>
          <p className="text-muted-foreground hidden sm:block pt-1">
            Here's an overview of your finances.
            {/* Można też użyć e-maila: Welcome back, {user.email}! */}
          </p>
        </div>

        <div className="flex items-center space-x-2">
          {/* Tu możesz dodać np. wybór zakresu dat */}
          <Button variant="outline">Last 30 Days</Button>
          <Button>
            <PlusCircle className="mr-2 h-4 w-4" /> Add Expense
          </Button>
        </div>
      </div>

      {/* Rząd 2: Karty ze statystykami */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium min-h-10 flex items-center">
              Total Spent (October)
            </CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">$1,056.75</div>
            <p className="text-xs text-muted-foreground">+3.1% from last month</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium min-h-10 flex items-center">
              Total Transactions
            </CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">+61</div>
            <p className="text-xs text-muted-foreground">+12% from last month</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium min-h-10 flex items-center">
              Avg. Daily Spend
            </CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">$34.09</div>
            <p className="text-xs text-muted-foreground">-1.5% from last month</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium min-h-10 flex items-center">
              Top Category
            </CardTitle>
            <span className="h-4 w-4 text-muted-foreground">🛒</span>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">Groceries</div>
            <p className="text-xs text-muted-foreground">$450.20 spent</p>
          </CardContent>
        </Card>
      </div>
      {/* Rząd 3: Ostatnie wydatki i Wykres kategorii */}
      <div className="grid gap-4 grid-cols-1 xl:grid-cols-3">
        {/* Kolumna 1 i 2: Tabela (większa) */}
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Recent Expenses</CardTitle>
            <CardDescription>Your 8 most recent transactions.</CardDescription>
          </CardHeader>
          <CardContent>
            {/* Przekazujemy więcej danych do tabeli */}
            <RecentExpensesTable data={recentExpenses} />
          </CardContent>
        </Card>

        {/* Kolumna 3: Wykres kołowy */}
        <Card>
          <CardHeader>
            <CardTitle>Spending by Category</CardTitle>
            <CardDescription>Breakdown of your spending.</CardDescription>
          </CardHeader>
          <CardContent>
            {/* Nowy komponent wykresu */}
            <SpendingByCategoryChart data={categorySpendingData} />
          </CardContent>
        </Card>
      </div>

      {/* Rząd 4: Budżety i Wykres dzienny */}
      <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Budget Overview</CardTitle>
            <CardDescription>Tracking your monthly budgets.</CardDescription>
          </CardHeader>
          <CardContent>
            {/* Nowy komponent budżetów */}
            <BudgetOverview data={budgetData} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Spending Overview</CardTitle>
            <CardDescription>Your spending for the last 7 days.</CardDescription>
          </CardHeader>
          <CardContent className="pl-2">
            {/* Używamy ponownie starego komponentu */}
            <SpendingChart data={dailySpendingData} />
          </CardContent>
        </Card>
      </div>

    </div>
  );
}