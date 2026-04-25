'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useTranslation } from '@/lib/i18n'
import { Calculator, Loader2, CheckCircle2, XCircle, AlertTriangle, Sparkles } from 'lucide-react'

interface AffordResult {
  verdict: 'yes' | 'no' | 'maybe'
  explanation: string
  impact: string[]
}

interface AffordCalculatorProps {
  currency: string
  lang: string
  month: string
}

export function AffordCalculator({ currency, lang, month }: AffordCalculatorProps) {
  const { t } = useTranslation()
  const [item, setItem] = useState('')
  const [price, setPrice] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<AffordResult | null>(null)

  async function handleCheck(e: React.FormEvent) {
    e.preventDefault()
    if (!item.trim() || !price) return

    setLoading(true)
    setResult(null)
    try {
      const res = await fetch('/api/personal/budget/afford', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          item: item.trim(),
          price: parseFloat(price),
          currency,
          lang,
          month,
        }),
      })

      if (!res.ok) throw new Error('Failed to check')
      const data = await res.json()
      setResult(data)
    } catch {
      setResult({
        verdict: 'maybe',
        explanation: t('budget.affordError'),
        impact: [],
      })
    } finally {
      setLoading(false)
    }
  }

  const verdictConfig = {
    yes: { icon: CheckCircle2, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
    no: { icon: XCircle, color: 'text-red-600 dark:text-red-400', bg: 'bg-red-500/10 border-red-500/20' },
    maybe: { icon: AlertTriangle, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20' },
  }

  return (
    <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Calculator className="h-5 w-5 text-primary" />
          {t('budget.affordCheck')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={handleCheck} className="flex flex-col gap-3">
          <Input
            value={item}
            onChange={e => setItem(e.target.value)}
            placeholder={t('budget.itemName')}
            className="min-h-[44px]"
            required
          />
          <div className="flex gap-2">
            <Input
              type="number"
              step="0.01"
              min="0.01"
              value={price}
              onChange={e => setPrice(e.target.value)}
              placeholder={`${t('budget.itemPrice')} (${currency})`}
              className="min-h-[44px] flex-1"
              required
            />
            <Button type="submit" disabled={loading || !item.trim() || !price} className="min-h-[44px] shrink-0">
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <><Sparkles className="h-4 w-4 mr-1.5" />{t('budget.checkAfford')}</>
              )}
            </Button>
          </div>
        </form>

        <AnimatePresence mode="wait">
          {result && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.3 }}
              className={`rounded-lg border p-4 ${verdictConfig[result.verdict].bg}`}
            >
              <div className="flex items-start gap-3">
                {(() => {
                  const VIcon = verdictConfig[result.verdict].icon
                  return <VIcon className={`h-5 w-5 shrink-0 mt-0.5 ${verdictConfig[result.verdict].color}`} />
                })()}
                <div className="flex-1 space-y-2">
                  <p className={`text-sm font-bold ${verdictConfig[result.verdict].color}`}>
                    {t(`budget.afford.${result.verdict}` as Parameters<typeof t>[0])}
                  </p>
                  <p className="text-sm leading-relaxed">{result.explanation}</p>
                  {result.impact && result.impact.length > 0 && (
                    <ul className="space-y-1">
                      {result.impact.map((imp, i) => (
                        <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                          <span className="text-primary mt-0.5">•</span>
                          {imp}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </CardContent>
    </Card>
  )
}
