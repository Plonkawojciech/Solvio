'use client'

import { motion } from 'framer-motion'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useTranslation } from '@/lib/i18n'
import { Heart } from 'lucide-react'

interface WellnessScoreProps {
  score: number
  grade: string
  savingsScore: number
  budgetScore: number
  trendScore: number
  currency: string
  lang: string
}

function gradeColor(grade: string): { stroke: string; text: string; bg: string } {
  switch (grade) {
    case 'A':
      return { stroke: '#10b981', text: 'text-emerald-500', bg: 'bg-emerald-500/10' }
    case 'B':
      return { stroke: '#10b981', text: 'text-emerald-500', bg: 'bg-emerald-500/10' }
    case 'C':
      return { stroke: '#eab308', text: 'text-yellow-500', bg: 'bg-yellow-500/10' }
    case 'D':
      return { stroke: '#f97316', text: 'text-orange-500', bg: 'bg-orange-500/10' }
    default:
      return { stroke: '#ef4444', text: 'text-red-500', bg: 'bg-red-500/10' }
  }
}

export function WellnessScore({
  score,
  grade,
  savingsScore,
  budgetScore,
  trendScore,
}: WellnessScoreProps) {
  const { t } = useTranslation()

  const colors = gradeColor(grade)

  // SVG circular gauge params
  const radius = 72
  const stroke = 10
  const normalizedRadius = radius - stroke / 2
  const circumference = 2 * Math.PI * normalizedRadius
  const dashOffset = circumference - (score / 100) * circumference

  const gradeName =
    grade === 'A'
      ? t('dashboard.wellnessExcellent')
      : grade === 'B'
      ? t('dashboard.wellnessGood')
      : grade === 'C'
      ? t('dashboard.wellnessFair')
      : grade === 'D'
      ? t('dashboard.wellnessPoor')
      : t('dashboard.wellnessBad')

  const subScores = [
    { label: t('dashboard.wellnessSavings'), value: savingsScore, max: 40 },
    { label: t('dashboard.wellnessBudget'), value: budgetScore, max: 40 },
    { label: t('dashboard.wellnessTrend'), value: trendScore, max: 20 },
  ]

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <Heart className="h-4 w-4 text-muted-foreground" />
          {t('dashboard.wellnessScore')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start sm:gap-8">
          {/* Circular gauge */}
          <motion.div
            className="relative shrink-0 flex items-center justify-center"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
          >
            <svg
              width={radius * 2}
              height={radius * 2}
              viewBox={`0 0 ${radius * 2} ${radius * 2}`}
              style={{ transform: 'rotate(-90deg)' }}
              aria-hidden="true"
            >
              {/* Track */}
              <circle
                cx={radius}
                cy={radius}
                r={normalizedRadius}
                fill="none"
                stroke="currentColor"
                strokeWidth={stroke}
                className="text-muted/40"
              />
              {/* Progress arc */}
              <motion.circle
                cx={radius}
                cy={radius}
                r={normalizedRadius}
                fill="none"
                stroke={colors.stroke}
                strokeWidth={stroke}
                strokeLinecap="round"
                strokeDasharray={circumference}
                initial={{ strokeDashoffset: circumference }}
                animate={{ strokeDashoffset: dashOffset }}
                transition={{ duration: 1, ease: 'easeInOut', delay: 0.2 }}
              />
            </svg>

            {/* Center content */}
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <motion.span
                className={`text-3xl font-bold leading-none ${colors.text}`}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6 }}
              >
                {grade}
              </motion.span>
              <motion.span
                className="mt-0.5 text-sm font-medium tabular-nums text-muted-foreground"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.8 }}
              >
                {score}
              </motion.span>
            </div>
          </motion.div>

          {/* Right side — grade label + sub-score bars */}
          <motion.div
            className="flex flex-1 flex-col gap-4 w-full"
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
          >
            {/* Grade label */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground uppercase tracking-wider font-medium">
                {t('dashboard.wellnessGrade')}
              </span>
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${colors.bg} ${colors.text}`}
              >
                {gradeName}
              </span>
            </div>

            {/* Sub-score bars */}
            <div className="flex flex-col gap-3">
              {subScores.map((sub) => {
                const pct = Math.round((sub.value / sub.max) * 100)
                return (
                  <div key={sub.label}>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">{sub.label}</span>
                      <span className="tabular-nums font-medium">
                        {sub.value}/{sub.max}
                      </span>
                    </div>
                    <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <motion.div
                        className="h-full rounded-full"
                        style={{ backgroundColor: colors.stroke }}
                        initial={{ width: 0 }}
                        animate={{ width: `${pct}%` }}
                        transition={{ duration: 0.8, ease: 'easeOut', delay: 0.5 }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </motion.div>
        </div>
      </CardContent>
    </Card>
  )
}
