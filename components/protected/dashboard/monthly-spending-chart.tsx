"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";
import { getCategoryHex } from "@/lib/category-colors";

type ChartData = {
  date: string;
  [categoryName: string]: number | string; // category names as keys with amounts
};

export function MonthlySpendingChart({
  data,
  currency,
  categories
}: {
  data: ChartData[];
  currency: string;
  categories: string[]; // Array of category names (raw English names used as stable keys)
}) {
  return (
    <ResponsiveContainer width="100%" height={400}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="date"
          stroke="#888888"
          fontSize={11}
          tickLine={false}
          axisLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          stroke="#888888"
          fontSize={12}
          tickLine={false}
          axisLine={false}
          tickFormatter={(value) => `${value}`}
        />

        <Tooltip
          cursor={{ fill: 'rgba(0,0,0,0.05)' }}
          contentStyle={{
            backgroundColor: 'hsl(var(--background))',
            border: '1px solid hsl(var(--border))',
            borderRadius: '8px',
          }}
          formatter={(value: any) => `${Number(value).toFixed(2)} ${currency}`}
        />

        <Legend
          wrapperStyle={{ paddingTop: '20px' }}
          iconType="circle"
        />

        {categories.map((category, index) => (
          <Bar
            key={category}
            dataKey={category}
            stackId="spending"
            // Use getCategoryHex so every chart bar matches the badge color for
            // the same category — raw English name is the stable key here because
            // the dashboard always passes rawName strings (not translated names).
            fill={getCategoryHex(category)}
            radius={index === categories.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
