import { Progress } from "@/components/ui/progress";

type Budget = {
  id: string;
  name: string;
  spent: number;
  budget: number;
};

// Funkcja pomocnicza do formatowania waluty
function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
}

export function BudgetOverview({ data }: { data: Budget[] }) {
  return (
    <div className="flex flex-col gap-6">
      {data.map((item) => {
        const spent = item.spent;
        const budget = item.budget;
        const percentage = (spent / budget) * 100;
        
        // Określ kolor paska postępu
        const progressColor =
          percentage > 90 ? "bg-red-500" : // Ostrzeżenie, gdy > 90%
          percentage > 70 ? "bg-yellow-500" : // Uwaga, gdy > 70%
          "bg-primary"; // Domyślny kolor

        return (
          <div key={item.id}>
            {/* Nagłówek dla budżetu */}
            <div className="flex justify-between items-baseline mb-2">
              <span className="font-medium">{item.name}</span>
              <span className="text-sm text-muted-foreground">
                {formatCurrency(spent)} / {formatCurrency(budget)}
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
                Over budget by {formatCurrency(spent - budget)}!
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