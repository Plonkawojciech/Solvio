'use client'

/**
 * All Recharts chart components for the Analysis page live here so that the
 * entire recharts bundle is loaded in ONE lazy chunk rather than at module
 * evaluation time. This file is dynamically imported via next/dynamic in the
 * analysis page, keeping Recharts out of the initial JS bundle.
 */

import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'

const COLORS = ['#3b82f6', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#84cc16', '#f97316', '#6366f1']

function fmtMoney(v: number, cur: string) {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: cur, maximumFractionDigits: 0 }).format(v)
}

/* ─── Monthly trend area chart ─── */
interface MonthlyTrendChartProps {
  data: { month: string; total: number }[]
  currency: string
  spendingLabel: string
}

export function MonthlyTrendChart({ data, currency, spendingLabel }: MonthlyTrendChartProps) {
  return (
    <ResponsiveContainer width="100%" height={220} minWidth={280}>
      <AreaChart data={data}>
        <defs>
          <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
            <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
        <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
        <Tooltip
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          formatter={(v: any) => [fmtMoney(v, currency), spendingLabel]}
          contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: 12 }}
        />
        <Area type="monotone" dataKey="total" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#colorTotal)" dot={{ r: 4, fill: 'hsl(var(--primary))' }} activeDot={{ r: 6 }} />
      </AreaChart>
    </ResponsiveContainer>
  )
}

/* ─── Category donut / pie chart ─── */
interface CategoryPieChartProps {
  data: { name: string; value: number }[]
  currency: string
  amountLabel: string
}

export function CategoryPieChart({ data, currency, amountLabel }: CategoryPieChartProps) {
  return (
    <ResponsiveContainer width="100%" height={220} minWidth={280}>
      <PieChart>
        <Pie data={data.slice(0, 6)} cx="50%" cy="50%" innerRadius={55} outerRadius={90} paddingAngle={3} dataKey="value">
          {data.slice(0, 6).map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
        </Pie>
        <Tooltip
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          formatter={(v: any) => [fmtMoney(v, currency), amountLabel]}
          contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: 12 }}
        />
        <Legend formatter={(value) => <span style={{ fontSize: 11 }}>{value}</span>} />
      </PieChart>
    </ResponsiveContainer>
  )
}

/* ─── Daily spending bar chart ─── */
interface DailySpendingChartProps {
  data: { date: string; total: number }[]
  currency: string
  spendingLabel: string
  dateLabel: string
}

export function DailySpendingChart({ data, currency, spendingLabel, dateLabel }: DailySpendingChartProps) {
  return (
    <ResponsiveContainer width="100%" height={180} minWidth={280}>
      <BarChart data={data} barSize={8}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" interval={4} />
        <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
        <Tooltip
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          formatter={(v: any) => [fmtMoney(v, currency), spendingLabel]}
          labelFormatter={(label) => `${dateLabel}: ${label}`}
          contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: 12 }}
        />
        <Bar dataKey="total" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

/* ─── Category horizontal bar comparison chart ─── */
interface CategoryBarChartProps {
  data: { name: string; value: number }[]
  currency: string
  amountLabel: string
}

export function CategoryBarChart({ data, currency, amountLabel }: CategoryBarChartProps) {
  return (
    <ResponsiveContainer width="100%" height={Math.max(180, data.length * 36)} minWidth={280}>
      <BarChart data={data} layout="vertical" barSize={16}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
        <XAxis type="number" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" tickFormatter={v => fmtMoney(v, currency)} />
        <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" width={90} />
        <Tooltip
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          formatter={(v: any) => [fmtMoney(v, currency), amountLabel]}
          contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: 12 }}
        />
        <Bar dataKey="value" radius={[0, 6, 6, 0]}>
          {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

/* ─── Weekday spending bar chart ─── */
interface WeekdaySpendingChartProps {
  data: { day: string; total: number; count: number; avg: number }[]
  currency: string
  spendingLabel: string
  avgLabel: string
}

export function WeekdaySpendingChart({ data, currency, spendingLabel, avgLabel }: WeekdaySpendingChartProps) {
  const maxTotal = Math.max(...data.map(d => d.total), 1)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload || payload.length === 0) return null
    const d = payload[0].payload
    return (
      <div style={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 8, padding: '8px 12px', fontSize: 12 }}>
        <p style={{ fontWeight: 600, marginBottom: 4 }}>{d.day}</p>
        <p style={{ color: 'hsl(var(--muted-foreground))' }}>
          {spendingLabel}: <span style={{ fontWeight: 600, color: 'hsl(var(--foreground))' }}>{fmtMoney(d.total, currency)}</span>
        </p>
        <p style={{ color: 'hsl(var(--muted-foreground))' }}>
          {avgLabel}: <span style={{ fontWeight: 600, color: 'hsl(var(--foreground))' }}>{fmtMoney(d.avg, currency)}</span>
        </p>
        {d.count > 0 && (
          <p style={{ color: 'hsl(var(--muted-foreground))', fontSize: 11 }}>×{d.count}</p>
        )}
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={200} minWidth={280}>
      <BarChart data={data} barSize={32}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis dataKey="day" tick={{ fontSize: 12, fontWeight: 500 }} stroke="hsl(var(--muted-foreground))" />
        <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" tickFormatter={v => fmtMoney(v, currency)} width={55} />
        <Tooltip content={<CustomTooltip />} />
        <Bar dataKey="total" radius={[6, 6, 0, 0]}>
          {data.map((d, i) => (
            <Cell
              key={i}
              fill={d.total === maxTotal && d.total > 0 ? 'hsl(var(--primary))' : 'hsl(var(--primary) / 0.45)'}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
