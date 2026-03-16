'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'

interface GoalProgressRingProps {
  percentage: number
  size?: number
  strokeWidth?: number
  color?: string
  className?: string
  children?: React.ReactNode
}

export function GoalProgressRing({
  percentage,
  size = 80,
  strokeWidth = 6,
  color = '#6366f1',
  className = '',
  children,
}: GoalProgressRingProps) {
  const [animatedPercent, setAnimatedPercent] = useState(0)
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const strokeDashoffset = circumference - (animatedPercent / 100) * circumference

  useEffect(() => {
    const timer = setTimeout(() => {
      setAnimatedPercent(Math.min(percentage, 100))
    }, 100)
    return () => clearTimeout(timer)
  }, [percentage])

  return (
    <div className={`relative inline-flex items-center justify-center ${className}`} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-muted/30"
        />
        {/* Progress circle */}
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset }}
          transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
        />
      </svg>
      {children && (
        <div className="absolute inset-0 flex items-center justify-center">
          {children}
        </div>
      )}
    </div>
  )
}
