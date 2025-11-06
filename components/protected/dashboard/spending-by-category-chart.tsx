"use client"

import * as React from "react"
import { Pie, PieChart, Cell } from "recharts"

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"

type ChartData = {
  name: string
  total: number
}

// ta sama mapa kategorii → zmienne CSS co w RecentExpensesTable
const categoryChartColors: { [key: string]: string } = {
  Groceries: "--chart-1",
  Transport: "--chart-2",
  Food: "--chart-3",
  Entertainment: "--chart-4",
  Utilities: "--chart-5",
  Other: "--chart-6",
}

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

export function SpendingByCategoryChart({ data, currency }: { data: ChartData[]; currency: string }) {
  return (
    <div className="w-full">
      <ChartContainer
        config={chartConfig}
        className="mx-auto aspect-square max-h-[300px]"
      >
        <PieChart>
          <ChartTooltip
            cursor={false}
            content={
              <ChartTooltipContent
                hideLabel
                formatter={(value) => {
                  const numericValue = Number(value)
                  return `${numericValue.toFixed(2)} ${currency}`
                }}
              />
            }
          />
          <Pie
            data={data}
            dataKey="total"
            nameKey="name"
            innerRadius="60%"
            outerRadius="100%"
            strokeWidth={5}
          >
            {data.map((entry, index) => {
              const colorVar =
                categoryChartColors[entry.name] || "--chart-1"

              return (
                <Cell
                  key={`cell-${index}`}
                  fill={`hsl(var(${colorVar}))`}
                  stroke="hsl(var(--background))"
                  strokeWidth={2}
                />
              )
            })}
          </Pie>
        </PieChart>
      </ChartContainer>

      {/* Legenda pod wykresem */}
      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-sm mt-4">
        {data.map((item) => {
          const colorVar =
            categoryChartColors[item.name] || "--chart-1"

          return (
            <div key={item.name} className="flex items-center gap-2">
              <span
                className="h-3 w-3 rounded-full"
                style={{ backgroundColor: `hsl(var(${colorVar}))` }}
              />
              <span>{item.name}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
