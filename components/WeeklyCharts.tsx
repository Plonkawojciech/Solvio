'use client'

import * as React from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  ChartContainer,
  ChartTooltip as ChartTooltipPrimitive,
  ChartTooltipContent as ChartTooltipContentPrimitive,
  ChartLegend,
  ChartLegendContent,
} from '@/components/ui/chart'
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '@/components/ui/carousel'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

// --- Wykres 1: Area Chart (Wydatki w czasie) ---
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
  groceries: { label: 'Zakupy', color: 'var(--chart-1)' },
  transport: { label: 'Transport', color: 'var(--chart-2)' },
}

function AreaChartInteractive() {
  const [timeRange, setTimeRange] = React.useState('7d')

  const filteredData = areaChartData.filter((item) => {
    const date = new Date(item.date)
    const now = new Date('2024-10-07')
    const daysToSubtract = timeRange === '7d' ? 7 : 90
    const startDate = new Date(now)
    startDate.setDate(startDate.getDate() - daysToSubtract)
    return date >= startDate
  })

  return (
    <Card className="h-full w-full">
      <CardHeader className="flex flex-row items-center gap-2 space-y-0 border-b py-5">
        <div className="grid flex-1 gap-1 text-left">
          <CardTitle>Analiza Wydatków</CardTitle>
          <CardDescription>
            Suma wydatków na zakupy i transport w wybranym okresie
          </CardDescription>
        </div>
        <Select value={timeRange} onValueChange={setTimeRange}>
          <SelectTrigger
            className="w-[160px] rounded-lg"
            aria-label="Wybierz okres"
          >
            <SelectValue placeholder="Wybierz okres" />
          </SelectTrigger>
          <SelectContent className="rounded-xl">
            <SelectItem value="90d" className="rounded-lg">
              Ostatnie 90 dni
            </SelectItem>
            <SelectItem value="7d" className="rounded-lg">
              Ostatnie 7 dni
            </SelectItem>
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent className="px-2 pt-4 sm:px-6 sm:pt-6">
        <ChartContainer
          config={areaChartConfig}
          className="aspect-auto h-[250px] w-full"
        >
          <AreaChart data={filteredData}>
            <defs>
              <linearGradient id="fillGroceries" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="5%"
                  stopColor="var(--color-groceries)"
                  stopOpacity={0.8}
                />
                <stop
                  offset="95%"
                  stopColor="var(--color-groceries)"
                  stopOpacity={0.1}
                />
              </linearGradient>
              <linearGradient id="fillTransport" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="5%"
                  stopColor="var(--color-transport)"
                  stopOpacity={0.8}
                />
                <stop
                  offset="95%"
                  stopColor="var(--color-transport)"
                  stopOpacity={0.1}
                />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={(value) =>
                new Date(value).toLocaleDateString('pl-PL', {
                  month: 'short',
                  day: 'numeric',
                })
              }
            />
            <YAxis />
            <ChartTooltipPrimitive
              cursor={false}
              content={<ChartTooltipContentPrimitive indicator="dot" />}
            />
            <Area
              dataKey="transport"
              type="natural"
              fill="url(#fillTransport)"
              stroke="var(--color-transport)"
              stackId="a"
            />
            <Area
              dataKey="groceries"
              type="natural"
              fill="url(#fillGroceries)"
              stroke="var(--color-groceries)"
              stackId="a"
            />
            <ChartLegend content={<ChartLegendContent />} />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}

// --- Wykres 2: Bar Chart (Wydatki miesięczne) ---
const barChartData = [
  { month: 'Styczeń', subscriptions: 50, housing: 450, food: 220 },
  { month: 'Luty', subscriptions: 55, housing: 460, food: 240 },
  { month: 'Marzec', subscriptions: 50, housing: 455, food: 210 },
]
const barChartConfig = {
  subscriptions: { label: 'Subskrypcje', color: 'var(--chart-1)' },
  housing: { label: 'Mieszkanie', color: 'var(--chart-2)' },
  food: { label: 'Jedzenie', color: 'var(--chart-3)' },
}

function BarChartMonthly() {
  return (
    <Card className="h-full w-full">
      <CardHeader>
        <CardTitle>Podsumowanie Miesięczne</CardTitle>
        <CardDescription>
          Porównanie wydatków w kluczowych kategoriach
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer
          config={barChartConfig}
          className="aspect-auto h-[280px] w-full"
        >
          <BarChart data={barChartData} layout="vertical">
            <CartesianGrid horizontal={false} />
            <XAxis type="number" />
            <YAxis dataKey="month" type="category" width={80} />
            <Tooltip
              cursor={{ fill: 'hsl(var(--muted))' }}
              content={<ChartTooltipContentPrimitive hideLabel />}
            />
            <Legend />
            <Bar
              dataKey="subscriptions"
              stackId="a"
              fill="var(--color-subscriptions)"
              radius={[0, 4, 4, 0]}
            />
            <Bar dataKey="housing" stackId="a" fill="var(--color-housing)" />
            <Bar
              dataKey="food"
              stackId="a"
              fill="var(--color-food)"
              radius={[0, 4, 4, 0]}
            />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}

// --- Wykres 3: Pie Chart (Struktura wydatków) ---
const pieChartData = [
  { category: 'Rozrywka', value: 275, fill: 'var(--chart-1)' },
  { category: 'Transport', value: 200, fill: 'var(--chart-2)' },
  { category: 'Ubrania', value: 187, fill: 'var(--chart-3)' },
  { category: 'Zdrowie', value: 173, fill: 'var(--chart-4)' },
  { category: 'Inne', value: 90, fill: 'var(--chart-5)' },
]
const pieChartConfig = {
  value: { label: 'Wartość' },
  category: { label: 'Kategoria' },
}

function PieChartStructure() {
  return (
    <Card className="h-full w-full">
      <CardHeader>
        <CardTitle>Struktura Wydatków</CardTitle>
        <CardDescription>
          Procentowy udział kategorii w budżecie (Październik)
        </CardDescription>
      </CardHeader>
      <CardContent className="flex items-center justify-center">
        <ChartContainer
          config={pieChartConfig}
          className="aspect-square h-[280px] w-full max-w-[280px]"
        >
          <ResponsiveContainer>
            <PieChart>
              <Tooltip
                cursor={false}
                content={<ChartTooltipContentPrimitive hideLabel />}
              />
              <Pie
                data={pieChartData}
                dataKey="value"
                nameKey="category"
                innerRadius={60}
              />
              <ChartLegend
                content={<ChartLegendContent nameKey="category" />}
                className="-translate-y-2 flex-wrap gap-2 [&>*]:basis-1/4 [&>*]:justify-center"
              />
            </PieChart>
          </ResponsiveContainer>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}

// --- Główny komponent galerii ---
export function ChartsGalleryPreview() {
  return (
    <Carousel className="w-full max-w-xl mx-auto">
      <CarouselContent>
        <CarouselItem>
          <div className="p-1">
            <AreaChartInteractive />
          </div>
        </CarouselItem>
        <CarouselItem>
          <div className="p-1">
            <BarChartMonthly />
          </div>
        </CarouselItem>
        <CarouselItem>
          <div className="p-1">
            <PieChartStructure />
          </div>
        </CarouselItem>
      </CarouselContent>
      <CarouselPrevious className="ml-12" />
      <CarouselNext className="mr-12" />
    </Carousel>
  )
}
