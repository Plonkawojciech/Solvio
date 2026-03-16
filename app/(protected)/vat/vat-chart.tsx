'use client'

import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid } from 'recharts'
import { useTranslation } from '@/lib/i18n'

interface VatChartProps {
  data: Array<{
    period: string
    label: string
    input: number
    output: number
    balance: number
  }>
  currency: string
}

export function VatChart({ data, currency }: VatChartProps) {
  const { t, lang } = useTranslation()
  const locale = lang === 'pl' ? 'pl-PL' : 'en-US'

  const formatValue = (value: number) => {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value)
  }

  return (
    <div className="h-[300px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11 }}
            className="text-muted-foreground"
          />
          <YAxis
            tick={{ fontSize: 11 }}
            tickFormatter={(value) => formatValue(value)}
            className="text-muted-foreground"
          />
          <Tooltip
            formatter={(value: number, name: string) => [
              formatValue(value),
              name === 'input'
                ? (t('vat.input') || 'VAT naliczony')
                : name === 'output'
                ? (t('vat.output') || 'VAT należny')
                : (t('vat.balance') || 'Saldo'),
            ]}
            contentStyle={{
              backgroundColor: 'hsl(var(--card))',
              border: '1px solid hsl(var(--border))',
              borderRadius: '8px',
              fontSize: '12px',
            }}
          />
          <Legend
            formatter={(value: string) =>
              value === 'input'
                ? (t('vat.input') || 'VAT naliczony')
                : value === 'output'
                ? (t('vat.output') || 'VAT należny')
                : (t('vat.balance') || 'Saldo')
            }
          />
          <Bar dataKey="input" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} />
          <Bar dataKey="output" fill="hsl(var(--chart-1))" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
