'use client'

import * as React from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Cell,
} from 'recharts'
import {
  ChartContainer,
  ChartTooltipContent as ChartTooltipContentPrimitive,
  ChartLegend,
  ChartLegendContent,
} from '@/components/ui/chart'
import {
  Carousel,
  type CarouselApi,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '@/components/ui/carousel'
import { Card, CardContent } from '@/components/ui/card'

// --- Definicje Danych i Konfiguracji (bez zmian) ---
const areaChartData = [
  { date: '2024-10-01', groceries: 120, transport: 40 },
  { date: '2024-10-02', groceries: 80, transport: 50 },
  { date: '2024-10-03', groceries: 150, transport: 60 },
  { date: '2024-10-04', groceries: 90, transport: 45 },
  { date: '2024-10-05', groceries: 200, transport: 55 },
  { date: '2024-10-06', groceries: 130, transport: 50 },
  { date: '2024-10-07', groceries: 170, transport: 60 },
]
const areaChartConfig = {
  groceries: { label: 'Zakupy', color: 'hsl(var(--chart-1))' },
  transport: { label: 'Transport', color: 'hsl(var(--chart-2))' },
}

const barChartData = [
  { month: 'Styczeń', subscriptions: 50, housing: 450, food: 220 },
  { month: 'Luty', subscriptions: 55, housing: 460, food: 240 },
  { month: 'Marzec', subscriptions: 50, housing: 455, food: 210 },
]
const barChartConfig = {
  subscriptions: { label: 'Subskrypcje', color: 'hsl(var(--chart-5))' },
  housing: { label: 'Mieszkanie', color: 'hsl(var(--chart-1))' },
  food: { label: 'Jedzenie', color: 'hsl(var(--chart-3))' },
}

const pieChartData = [
  { category: 'Rozrywka', value: 275, fill: 'hsl(var(--chart-4))' },
  { category: 'Transport', value: 200, fill: 'hsl(var(--chart-2))' },
  { category: 'Ubrania', value: 187, fill: 'hsl(var(--chart-6))' },
]
const pieChartConfig = {
  entertainment: { label: 'Rozrywka', color: 'hsl(var(--chart-1))' },
  transport: { label: 'Transport', color: 'hsl(var(--chart-2))' },
  clothing: { label: 'Ubrania', color: 'hsl(var(--chart-3))' },
}

const chartComponents = [
  {
    title: 'Analiza Wydatków Dziennych',
    description: 'Suma wydatków na zakupy i transport w ostatnim tygodniu.',
    component: <AreaChartComponent />,
  },
  {
    title: 'Podsumowanie Miesięczne',
    description: 'Porównanie wydatków w kluczowych kategoriach.',
    component: <BarChartComponent />,
  },
  {
    title: 'Struktura Wydatków',
    description: 'Procentowy udział kategorii w miesięcznym budżecie.',
    component: <PieChartComponent />,
  },
]

export function ChartsGalleryPreview() {
  const [api, setApi] = React.useState<CarouselApi>()
  const [current, setCurrent] = React.useState(0)

  React.useEffect(() => {
    if (!api) return
    setCurrent(api.selectedScrollSnap())
    api.on('select', () => setCurrent(api.selectedScrollSnap()))
  }, [api])

  return (
    <div className="w-full h-full flex flex-col justify-center items-center px-4 md:px-12">
      <div className="w-full relative">
        <Carousel
          setApi={setApi}
          opts={{ align: 'center', loop: true }}
          className="w-full"
        >
          <CarouselContent className="-ml-4">
            {chartComponents.map((chart, index) => (
              <CarouselItem
                key={index}
                className="pl-4 md:basis-1/2 lg:basis-2/3"
              >
                <div className="p-1 h-full">
                  <Card className="h-full w-full shadow-md">
                    <CardContent className="p-0 h-full">
                      {chart.component}
                    </CardContent>
                  </Card>
                </div>
              </CarouselItem>
            ))}
          </CarouselContent>
          <CarouselPrevious className="absolute -left-10 top-1/2 -translate-y-1/2 h-10 w-10 hidden md:flex" />
          <CarouselNext className="absolute -right-10 top-1/2 -translate-y-1/2 h-10 w-10 hidden md:flex" />
        </Carousel>
      </div>

      <div className="py-6 text-center text-sm text-muted-foreground">
        <h4 className="font-medium text-lg text-foreground">
          {chartComponents[current]?.title}
        </h4>
        <p className="mt-1">{chartComponents[current]?.description}</p>
      </div>

      <div className="flex gap-2">
        {chartComponents.map((_, index) => (
          <button
            key={index}
            onClick={() => api?.scrollTo(index)}
            className={`h-2 w-2 rounded-full transition-all duration-300 ${
              current === index
                ? 'w-5 bg-primary'
                : 'bg-muted hover:bg-muted-foreground/50'
            }`}
            aria-label={`Przejdź do slajdu ${index + 1}`}
          />
        ))}
      </div>
    </div>
  )
}
function AreaChartComponent() {
  return (
    <ChartContainer config={areaChartConfig} className="w-full h-[300px] p-4">
      <ResponsiveContainer>
        <AreaChart data={areaChartData}>
          <CartesianGrid
            vertical={false}
            stroke="hsl(var(--muted-foreground) / 0.1)"
          />
          <XAxis
            dataKey="date"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            tickFormatter={(value) =>
              new Date(value).toLocaleDateString('pl-PL', {
                day: 'numeric',
                month: 'short',
              })
            }
            stroke="hsl(var(--muted-foreground))"
            tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            stroke="hsl(var(--muted-foreground))"
            tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
          />
          <Tooltip
            cursor={{ stroke: 'hsl(var(--muted-foreground))' }}
            content={<ChartTooltipContentPrimitive indicator="dot" />}
          />
          {/* 👇 POPRAWKA: Przywrócono 'fill' i 'stroke' 
              Używamy kolorów zdefiniowanych w configu.
          */}
          <Area
            dataKey="transport"
            type="natural"
            fill="hsl(var(--chart-2))"
            stroke="hsl(var(--chart-2))"
            fillOpacity={0.4}
            stackId="a"
          />
          <Area
            dataKey="groceries"
            type="natural"
            fill="hsl(var(--chart-1))"
            stroke="hsl(var(--chart-1))"
            fillOpacity={0.4}
            stackId="a"
          />
        </AreaChart>
      </ResponsiveContainer>
    </ChartContainer>
  )
}

function BarChartComponent() {
  return (
    <ChartContainer config={barChartConfig} className="w-full h-[300px] p-4">
      <ResponsiveContainer>
        <BarChart data={barChartData}>
          <CartesianGrid
            vertical={false}
            stroke="hsl(var(--muted-foreground) / 0.1)"
          />
          <XAxis
            dataKey="month"
            tickLine={false}
            axisLine={false}
            stroke="hsl(var(--muted-foreground))"
            tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            stroke="hsl(var(--muted-foreground))"
            tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
          />
          <Tooltip
            cursor={{ fill: 'hsl(var(--muted))' }}
            content={<ChartTooltipContentPrimitive />}
          />
          {/* 👇 POPRAWKA: Przywrócono 'fill' 
              Używamy kolorów zdefiniowanych w configu.
          */}
          <Bar
            dataKey="subscriptions"
            fill="hsl(var(--chart-5))"
            radius={4}
          />
          <Bar
            dataKey="housing"
            fill="hsl(var(--chart-1))"
            radius={4}
          />
          <Bar
            dataKey="food"
            fill="hsl(var(--chart-3))"
            radius={4}
          />
        </BarChart>
      </ResponsiveContainer>
    </ChartContainer>
  )
}

function PieChartComponent() {
  return (
    <ChartContainer config={pieChartConfig} className="w-full h-[300px] p-4">
      <ResponsiveContainer>
        <PieChart>
          <Tooltip 
            content={<ChartTooltipContentPrimitive 
              hideLabel 
              formatter={(value) => `$${Number(value).toFixed(2)}`}
            />} 
          />
          <Pie
            data={pieChartData}
            dataKey="value"
            nameKey="category"
            innerRadius={60}
            strokeWidth={3}
          >
            {/* Ta część jest poprawna i zostaje bez zmian */}
            {pieChartData.map((entry, index) => (
              <Cell 
                key={`cell-${index}`} 
                fill={entry.fill}
                stroke="hsl(var(--background))"
                strokeWidth={3}
              />
            ))}
          </Pie>
          <ChartLegend
            content={
              <ChartLegendContent
                nameKey="category"
                className="text-muted-foreground"
              />
            }
          />
        </PieChart>
      </ResponsiveContainer>
    </ChartContainer>
  )
}
