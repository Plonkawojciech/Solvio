"use client"

import * as React from "react"
import { Pie, PieChart, Cell } from "recharts"

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"
import { formatAmount } from "@/lib/format"

type ChartData = {
  name: string
  total: number
}

// Assign colors by index so the chart works correctly in any language
const CHART_COLOR_VARS = [
  "--chart-1",
  "--chart-2",
  "--chart-3",
  "--chart-4",
  "--chart-5",
  "--chart-6",
]

const chartConfig = {
  total: {
    label: "Total",
  },
}

export function SpendingByCategoryChart({ data, currency }: { data: ChartData[]; currency: string }) {
  return (
    <div className="w-full">
      <ChartContainer
        config={chartConfig}
        className="mx-auto aspect-square max-h-[160px] md:max-h-[250px]"
      >
        <PieChart>
          <ChartTooltip
            cursor={false}
            content={
              <ChartTooltipContent
                hideLabel
                formatter={(value) => formatAmount(Number(value), currency)}
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
              const colorVar = CHART_COLOR_VARS[index % CHART_COLOR_VARS.length]

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
      <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 md:gap-x-4 md:gap-y-2 text-xs md:text-sm mt-2 md:mt-4">
        {data.map((item, index) => {
          const colorVar = CHART_COLOR_VARS[index % CHART_COLOR_VARS.length]

          return (
            <div key={item.name} className="flex items-center gap-1 md:gap-2">
              <span
                className="h-2 w-2 md:h-3 md:w-3 rounded-full shrink-0"
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
