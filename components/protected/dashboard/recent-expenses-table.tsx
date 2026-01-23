import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Expense = {
  id: string;
  description: string;
  vendor?: string | null;
  amount: number;
  date: string;
};

export function RecentExpensesTable({ data, currency }: { data: Expense[]; currency: string }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Description</TableHead>
          <TableHead className="hidden sm:table-cell">Vendor</TableHead>
          <TableHead className="text-right">Amount</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map((expense) => {
          return (
            <TableRow key={expense.id}>
              <TableCell>
                <div className="font-medium">{expense.description}</div>
                <div className="text-sm text-muted-foreground">
                  {new Date(expense.date).toLocaleDateString("en-US", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </div>
              </TableCell>
              <TableCell className="hidden sm:table-cell">
                <span className="text-sm text-muted-foreground">
                  {expense.vendor || '—'}
                </span>
              </TableCell>
              <TableCell className="text-right font-medium">
                {expense.amount.toFixed(2)} {currency}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}