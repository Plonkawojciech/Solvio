"use client"

import * as React from "react"
import { Pie, PieChart, Cell } from "recharts"

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"
type ChartData = {
  name: string;
  total: number;
  fill: string;
};

const chartConfig = {
  total: {
    label: "Total",
  },
  Groceries: {
    label: "Groceries",
    color: "hsl(var(--chart-1))",
  },
  Transport: {
    label: "Transport",
    color: "hsl(var(--chart-2))",
  },
  Food: {
    label: "Food",
    color: "hsl(var(--chart-3))",
  },
  Entertainment: {
    label: "Entertainment",
    color: "hsl(var(--chart-4))",
  },
  Utilities: {
    label: "Utilities",
    color: "hsl(var(--chart-5))",
  },
  Other: {
    label: "Other",
    color: "hsl(var(--chart-6))",
  },
}

export function SpendingByCategoryChart({ data }: { data: ChartData[] }) {
  const totalValue = React.useMemo(() => {
    return data.reduce((acc, curr) => acc + curr.total, 0)
  }, [data])

  return (
    <div className="w-full">
      <ChartContainer
        config={chartConfig}
        className="mx-auto aspect-square max-h-[300px]"
      >
        <PieChart>
          <ChartTooltip
            cursor={false}
            content={<ChartTooltipContent
              hideLabel
              formatter={(value) => {
                const numericValue = Number(value);
                return `$${numericValue.toFixed(2)}`;
              }}
            />}
          />
          <Pie
            data={data}
            dataKey="total"
            nameKey="name"
            innerRadius="60%"
            outerRadius="100%"
            strokeWidth={5}
          >
            {data.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={entry.fill} 
                stroke="hsl(var(--background))"
                strokeWidth={2}
              />
            ))}
          </Pie>
        </PieChart>
      </ChartContainer>

      {/* Legenda pod wykresem */}
      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-sm mt-4">
        {data.map((item) => (
          <div key={item.name} className="flex items-center gap-2">
            <span
              className="h-3 w-3 rounded-full"
              style={{ backgroundColor: item.fill }}
            />
            <span>{item.name}</span>
          </div>
        ))}
      </div>
    </div>
  )
}