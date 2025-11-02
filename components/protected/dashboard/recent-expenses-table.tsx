import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

// Definiujemy typ dla pojedynczego wydatku
type Expense = {
  id: string;
  description: string;
  category: string;
  amount: number;
  date: string;
};

// 👇 POPRAWKA: Mapowanie kategorii na zmienne CSS z Twojej palety
// Używamy tych samych kolorów co na wykresie kołowym dla spójności
const categoryChartColors: { [key: string]: string } = {
  "Groceries": "--chart-1",
  "Transport": "--chart-2",
  "Food": "--chart-3",
  "Entertainment": "--chart-4",
  "Utilities": "--chart-5",
  "Other": "--chart-6",
};

export function RecentExpensesTable({ data }: { data: Expense[] }) {
  return (
    // 👇 POPRAWKA: Usunięto zbędny div z klasą 'border'.
    // Tabela będzie teraz renderowana bezpośrednio w CardContent (który ma padding).
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
                  {new Date(expense.date).toLocaleDateString("pl-PL", { // Zmiana na pl-PL
                    day: "numeric",
                    month: "long",
                  })}
                </div>
              </TableCell>
              <TableCell>
                {/* 👇 POPRAWKA: Używamy 'style' do dynamicznego kolorowania
                    zamiast 'variant'. Tworzymy delikatny badge pasujący do wykresów.
                */}
                <Badge
                  variant="outline" // Używamy outline jako bazy
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
                -${expense.amount.toFixed(2)}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}