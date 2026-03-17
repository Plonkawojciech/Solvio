'use client'

import { useEffect, useRef } from 'react'
import { motion, useMotionValue, useTransform, animate } from 'framer-motion'

interface AnimatedNumberProps {
  value: number
  duration?: number
  format?: (n: number) => string
  className?: string
}

export function AnimatedNumber({ value, duration = 1, format, className }: AnimatedNumberProps) {
  const motionValue = useMotionValue(0)
  const rounded = useTransform(motionValue, (v) => format ? format(v) : v.toFixed(2))
  const ref = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const controls = animate(motionValue, value, { duration, ease: 'easeOut' })
    return controls.stop
  }, [value, duration, motionValue])

  useEffect(() => {
    const unsubscribe = rounded.on('change', (v) => {
      if (ref.current) ref.current.textContent = String(v)
    })
    return unsubscribe
  }, [rounded])

  return <motion.span ref={ref} className={className} />
}
