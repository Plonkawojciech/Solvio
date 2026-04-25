'use client'

import { useState, useMemo } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts'
import { getCategoryHex } from '@/lib/category-colors'
import { useTranslation } from '@/lib/i18n'
import { cn } from '@/lib/utils'

interface CategoryTrendChartProps {
  expenses: Array<{
    amount: string | number
    date: string
    categoryId?: string | null
    currency?: string
  }>
  categories: Array<{ id: string; name: string }>
  currency: string
}

const PERIODS = [
  { key: '7d', days: 7 },
  { key: '1m', days: 30 },
  { key: '3m', days: 90 },
  { key: '6m', days: 180 },
  { key: '12m', days: 365 },
] as const

type Period = (typeof PERIODS)[number]['key']

export function CategoryTrendChart({
  expenses,
  categories,
  currency,
}: CategoryTrendChartProps) {
  const { t } = useTranslation()
  const [period, setPeriod] = useState<Period>('1m')
  const [hiddenCategories, setHiddenCategories] = useState<Set<string>>(
    new Set()
  )

  const toggleCategory = (catName: string) => {
    setHiddenCategories((prev) => {
      const next = new Set(prev)
      if (next.has(catName)) next.delete(catName)
      else next.add(catName)
      return next
    })
  }

  const { chartData, visibleCategories, allCategories } = useMemo(() => {
    const periodConfig = PERIODS.find((p) => p.key === period) || PERIODS[1]
    const now = new Date()
    const startDate = new Date(now)
    startDate.setDate(startDate.getDate() - periodConfig.days)
    startDate.setHours(0, 0, 0, 0)

    // Filter expenses within period
    const filtered = expenses.filter((e) => {
      const d = new Date(e.date)
      return d >= startDate && d <= now
    })

    // Create category name map
    const catMap = new Map(categories.map((c) => [c.id, c.name]))
    const otherLabel = t('categories.other') || 'Inne'

    // Determine bucket type based on period
    let bucketFn: (date: Date) => string
    let generateBuckets: () => string[]

    if (periodConfig.days <= 30) {
      // Daily buckets
      bucketFn = (d) => d.toISOString().slice(5, 10) // MM-DD
      generateBuckets = () => {
        const buckets: string[] = []
        for (let i = 0; i < periodConfig.days; i++) {
          const d = new Date(startDate)
          d.setDate(d.getDate() + i)
          buckets.push(bucketFn(d))
        }
        return buckets
      }
    } else if (periodConfig.days <= 90) {
      // Weekly buckets
      bucketFn = (d) => {
        const weekStart = new Date(d)
        weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1) // Monday-based
        return weekStart.toISOString().slice(5, 10)
      }
      generateBuckets = () => {
        const buckets: string[] = []
        const seen = new Set<string>()
        for (let i = 0; i < periodConfig.days; i++) {
          const d = new Date(startDate)
          d.setDate(d.getDate() + i)
          const key = bucketFn(d)
          if (!seen.has(key)) {
            seen.add(key)
            buckets.push(key)
          }
        }
        return buckets
      }
    } else {
      // Monthly buckets
      bucketFn = (d) => d.toISOString().slice(0, 7) // YYYY-MM
      generateBuckets = () => {
        const buckets: string[] = []
        const seen = new Set<string>()
        const d = new Date(startDate)
        while (d <= now) {
          const key = bucketFn(d)
          if (!seen.has(key)) {
            seen.add(key)
            buckets.push(key)
          }
          d.setMonth(d.getMonth() + 1)
        }
        // Ensure current month is included
        const nowKey = bucketFn(now)
        if (!seen.has(nowKey)) {
          buckets.push(nowKey)
        }
        return buckets
      }
    }

    // Generate ordered buckets
    const orderedBuckets = generateBuckets()
    const bucketData = new Map<string, Record<string, number>>()
    for (const key of orderedBuckets) {
      bucketData.set(key, {})
    }

    // Fill buckets with expense data
    for (const exp of filtered) {
      const bucket = bucketFn(new Date(exp.date))
      const catName = exp.categoryId
        ? catMap.get(exp.categoryId) || otherLabel
        : otherLabel
      const amount =
        typeof exp.amount === 'string' ? parseFloat(exp.amount) : exp.amount
      if (!bucketData.has(bucket)) bucketData.set(bucket, {})
      const b = bucketData.get(bucket)!
      b[catName] = (b[catName] || 0) + (amount || 0)
    }

    // Get all unique category names from data
    const allCats = new Set<string>()
    for (const b of bucketData.values()) {
      for (const k of Object.keys(b)) allCats.add(k)
    }
    const allCatsArr = [...allCats]
    const visible = allCatsArr.filter((c) => !hiddenCategories.has(c))

    // Convert to array in order
    const data = orderedBuckets.map((date) => ({
      date,
      ...(bucketData.get(date) || {}),
    }))

    return {
      chartData: data,
      visibleCategories: visible,
      allCategories: allCatsArr,
    }
  }, [expenses, categories, period, hiddenCategories, t])

  // Determine XAxis tick interval for readability
  const tickInterval = useMemo(() => {
    if (period === '1m') return 4 // Show every 5th label
    return 0 // Show all
  }, [period])

  const isEmpty = chartData.length === 0 || allCategories.length === 0

  return (
    <div className="space-y-3">
      {/* Period selector */}
      <div className="flex items-center gap-1 md:gap-1.5" role="group" aria-label={t('dashboard.categoryTrends')}>
        {PERIODS.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => setPeriod(p.key)}
            aria-label={t('dashboard.chartPeriodAria').replace('{period}', p.key)}
            aria-pressed={period === p.key}
            className={cn(
              'px-2 py-1 md:px-3 md:py-1.5 text-xs font-medium rounded-md border transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/50 focus-visible:ring-offset-2',
              period === p.key
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-background text-muted-foreground border-border hover:bg-muted'
            )}
          >
            {p.key}
          </button>
        ))}
      </div>

      {/* Chart */}
      {isEmpty ? (
        <div className="flex items-center justify-center h-[200px] md:h-[300px] text-sm text-muted-foreground">
          {t('dashboard.noCategoryData')}
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={300} minWidth={280}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="date"
              stroke="#888888"
              fontSize={10}
              tickLine={false}
              axisLine={false}
              interval={tickInterval}
            />
            <YAxis
              stroke="#888888"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              width={45}
              tickFormatter={(value) => `${value}`}
            />
            <Tooltip
              cursor={{ fill: 'rgba(0,0,0,0.05)' }}
              contentStyle={{
                backgroundColor: 'hsl(var(--background))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '8px',
                fontSize: '12px',
              }}
              formatter={(value: number | string) =>
                `${Number(value).toFixed(2)} ${currency}`
              }
            />
            {visibleCategories.map((category, index) => (
              <Bar
                key={category}
                dataKey={category}
                stackId="spending"
                fill={getCategoryHex(category)}
                radius={
                  index === visibleCategories.length - 1
                    ? [4, 4, 0, 0]
                    : [0, 0, 0, 0]
                }
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      )}

      {/* Toggleable legend */}
      {allCategories.length > 0 && (
        <div className="flex flex-wrap gap-1.5 md:gap-2" role="group" aria-label={t('dashboard.categoryTrendsDesc')}>
          {allCategories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => toggleCategory(cat)}
              aria-label={t('dashboard.chartToggleCategoryAria').replace('{category}', cat)}
              aria-pressed={!hiddenCategories.has(cat)}
              className={cn(
                'inline-flex items-center gap-1 md:gap-1.5 text-[10px] md:text-xs px-1.5 py-0.5 md:px-2 md:py-1 rounded-full border transition-opacity',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/50 focus-visible:ring-offset-1',
                hiddenCategories.has(cat)
                  ? 'opacity-40 line-through'
                  : 'opacity-100'
              )}
            >
              <span
                aria-hidden="true"
                className="h-2 w-2 md:h-2.5 md:w-2.5 rounded-full shrink-0"
                style={{ backgroundColor: getCategoryHex(cat) }}
              />
              {cat}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
