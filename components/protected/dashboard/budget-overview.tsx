import { Progress } from "@/components/ui/progress";

type Budget = {
  id: string;
  name: string;
  spent: number;
  budget: number;
};

function formatCurrency(amount: number, currency: string) {
  return `${amount.toFixed(2)} ${currency}`;
}

export function BudgetOverview({ data, currency }: { data: Budget[]; currency: string }) {
  return (
    <div className="flex flex-col gap-6">
      {data.map((item) => {
        const spent = item.spent;
        const budget = item.budget;
        const percentage = (spent / budget) * 100;

        return (
          <div key={item.id}>
            {/* Nagłówek dla budżetu */}
            <div className="flex justify-between items-baseline mb-2">
              <span className="font-medium">{item.name}</span>
              <span className="text-sm text-muted-foreground">
                {formatCurrency(spent, currency)} / {formatCurrency(budget, currency)}
              </span>
            </div>

            {/* Pasek postępu */}
            <Progress
              value={percentage > 100 ? 100 : percentage}
              className="h-3"
            // shadcn <Progress> nie wspiera łatwo zmiany koloru,
            // więc użyjemy małego triku z `indicatorClassName` (jeśli go masz)
            // lub zostawmy domyślny.
            // Dla prostoty, zostawmy domyślny kolor.
            // Aby dodać kolory, musiałbyś stworzyć warianty Progress.
            // Na razie, zignorujemy to dla prostoty.
            />

            {/* Komunikat o przekroczeniu budżetu */}
            {percentage > 100 && (
              <p className="text-xs text-red-500 mt-1.5">
                Over budget by {formatCurrency(spent - budget, currency)}!
              </p>
            )}
            {percentage > 90 && percentage <= 100 && (
              <p className="text-xs text-yellow-500 mt-1.5">
                Nearing budget limit!
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}