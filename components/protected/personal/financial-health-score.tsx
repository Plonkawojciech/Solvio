'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useTranslation } from '@/lib/i18n'
import { Heart, Loader2 } from 'lucide-react'

interface HealthData {
  score: number
  label: string
  tips: string[]
}

interface FinancialHealthScoreProps {
  className?: string
}

export function FinancialHealthScore({ className = '' }: FinancialHealthScoreProps) {
  const { t, lang } = useTranslation()
  const [data, setData] = useState<HealthData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/personal/financial-health')
      .then(r => r.json())
      .then(d => {
        if (d && typeof d.score === 'number') setData(d)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <Card className={className}>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          <span className="ml-2 text-sm text-muted-foreground">{t('health.calculating')}</span>
        </CardContent>
      </Card>
    )
  }

  if (!data) return null

  const score = data.score
  const radius = 60
  const strokeWidth = 10
  const circumference = Math.PI * radius // Half circle
  const progress = (score / 100) * circumference

  // Color based on score
  const scoreColor =
    score >= 80 ? '#22c55e' :
    score >= 60 ? '#3b82f6' :
    score >= 40 ? '#eab308' :
    '#ef4444'

  const labelKey =
    score >= 80 ? 'health.excellent' :
    score >= 60 ? 'health.good' :
    score >= 40 ? 'health.fair' :
    'health.poor'

  return (
    <Card className={`border-primary/20 ${className}`}>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Heart className="h-5 w-5 text-primary" />
          {t('health.score')}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-4">
        {/* Gauge */}
        <div className="relative" style={{ width: 160, height: 90 }}>
          <svg width={160} height={90} viewBox="0 0 160 90">
            {/* Background arc */}
            <path
              d="M 10 80 A 60 60 0 0 1 150 80"
              fill="none"
              stroke="currentColor"
              strokeWidth={strokeWidth}
              className="text-muted/30"
              strokeLinecap="round"
            />
            {/* Progress arc */}
            <motion.path
              d="M 10 80 A 60 60 0 0 1 150 80"
              fill="none"
              stroke={scoreColor}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeDasharray={circumference}
              initial={{ strokeDashoffset: circumference }}
              animate={{ strokeDashoffset: circumference - progress }}
              transition={{ duration: 1.5, ease: [0.22, 1, 0.36, 1] }}
            />
          </svg>
          {/* Score text */}
          <div className="absolute inset-0 flex flex-col items-center justify-end pb-0">
            <motion.span
              className="text-3xl font-extrabold"
              style={{ color: scoreColor }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.8 }}
            >
              {score}
            </motion.span>
            <span className="text-xs text-muted-foreground font-medium">{t(labelKey as any)}</span>
          </div>
        </div>

        {/* Tips */}
        {data.tips && data.tips.length > 0 && (
          <div className="w-full space-y-1.5">
            {data.tips.slice(0, 3).map((tip, i) => (
              <motion.p
                key={i}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 1 + i * 0.15 }}
                className="text-xs text-muted-foreground flex items-start gap-1.5"
              >
                <span className="text-primary mt-0.5">•</span>
                {tip}
              </motion.p>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
