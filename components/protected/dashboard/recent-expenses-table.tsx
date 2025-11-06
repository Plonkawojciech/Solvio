import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

type Expense = {
  id: string;
  description: string;
  category: string;
  amount: number;
  date: string;
};

const categoryChartColors: { [key: string]: string } = {
  "Groceries": "--chart-1",
  "Transport": "--chart-2",
  "Food": "--chart-3",
  "Entertainment": "--chart-4",
  "Utilities": "--chart-5",
  "Other": "--chart-6",
};

export function RecentExpensesTable({ data, currency }: { data: Expense[]; currency: string }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Description</TableHead>
          <TableHead>Category</TableHead>
          <TableHead className="text-right">Amount</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map((expense) => {
          // Pobieramy nazwę zmiennej koloru (np. "--chart-1")
          const colorVar = categoryChartColors[expense.category] || "--chart-1";

          return (
            <TableRow key={expense.id}>
              <TableCell>
                <div className="font-medium">{expense.description}</div>
                <div className="text-sm text-muted-foreground hidden md:inline">
                  {new Date(expense.date).toLocaleDateString("en-US", {
                    day: "numeric",
                    month: "long",
                  })}
                </div>
              </TableCell>
              <TableCell>
                <Badge
                  variant="outline"
                  style={{
                    backgroundColor: `hsl(var(${colorVar}) / 0.15)`,
                    color: `hsl(var(${colorVar}))`,
                    borderColor: `hsl(var(${colorVar}) / 0.2)`,
                  }}
                >
                  {expense.category}
                </Badge>
              </TableCell>
              {/* 👇 POPRAWKA: Zmiana koloru kwoty z czerwonego na neutralny */}
              <TableCell className="text-right font-medium text-muted-foreground">
                -{expense.amount.toFixed(2)} {currency}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}