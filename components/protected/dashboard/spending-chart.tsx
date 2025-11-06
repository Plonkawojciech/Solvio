// components/spending-chart.tsx
"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

type ChartData = {
  date: string;
  total: number;
};

export function SpendingChart({ data, currency }: { data: ChartData[]; currency: string }) {
  return (
    <ResponsiveContainer width="100%" height={350}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="date"
          stroke="#888888"
          fontSize={12}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          stroke="#888888"
          fontSize={12}
          tickLine={false}
          axisLine={false}
          tickFormatter={(value) => `${value} ${currency}`}
        />
        
        <Tooltip
          cursor={{ fill: 'transparent' }}
        />

        <Bar 
          dataKey="total" 
          fill="hsl(var(--primary))" // Używa koloru primary z Twojego motywu shadcn
          radius={[4, 4, 0, 0]} 
        />
      </BarChart>
    </ResponsiveContainer>
  );
}