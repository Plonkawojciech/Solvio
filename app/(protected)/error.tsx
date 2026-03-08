'use client'

import { useEffect } from 'react'
import { motion } from 'framer-motion'
import { AlertTriangle, RefreshCw, LayoutDashboard } from 'lucide-react'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { useTranslation } from '@/lib/i18n'

const content = {
  en: {
    badge: 'Something went wrong',
    title: 'An error occurred in the app',
    sub: "We hit a snag loading this page. Your data is safe — hit retry or head back to the dashboard.",
    retry: 'Try again',
    dashboard: 'Go to Dashboard',
    code: 'Error ID',
  },
  pl: {
    badge: 'Coś poszło nie tak',
    title: 'Wystąpił błąd w aplikacji',
    sub: 'Napotkaliśmy problem podczas ładowania tej strony. Twoje dane są bezpieczne — spróbuj ponownie lub wróć do panelu.',
    retry: 'Spróbuj ponownie',
    dashboard: 'Panel główny',
    code: 'ID błędu',
  },
}

export default function ProtectedError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[Protected] Error:', error)
  }, [error])

  const { lang } = useTranslation()
  const c = content[lang] ?? content.en

  return (
    <div className="flex flex-col items-center justify-center min-h-[65vh] gap-6 text-center px-4">
      {/* Background glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden"
      >
        <div className="h-[400px] w-[400px] rounded-full bg-destructive/5 blur-3xl" />
      </div>

      <motion.div
        className="relative z-10 flex flex-col items-center gap-5 max-w-sm"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      >
        {/* Icon */}
        <motion.div
          className="flex h-16 w-16 items-center justify-center rounded-xl bg-destructive/10 text-destructive ring-1 ring-destructive/20"
          initial={{ scale: 0.75, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.08, duration: 0.4, ease: 'easeOut' }}
        >
          <AlertTriangle className="h-8 w-8" />
        </motion.div>

        {/* Badge */}
        <motion.span
          className="inline-flex items-center gap-1.5 rounded-full border border-destructive/30 bg-destructive/8 px-3 py-1 text-xs font-medium text-destructive"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.18 }}
        >
          {c.badge}
        </motion.span>

        {/* Text */}
        <div className="space-y-2">
          <h2 className="text-xl font-semibold tracking-tight">{c.title}</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">{c.sub}</p>
        </div>

        {/* Error message (development hint) */}
        {error.message && error.message !== 'An unexpected error occurred' && (
          <motion.div
            className="w-full rounded-lg border border-border bg-muted/50 px-4 py-3 text-left"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
          >
            <p className="text-xs font-mono text-muted-foreground break-all line-clamp-3">
              {error.message}
            </p>
          </motion.div>
        )}

        {/* Digest */}
        {error.digest && (
          <p className="text-xs text-muted-foreground/50 font-mono">
            {c.code}: {error.digest}
          </p>
        )}

        {/* Actions */}
        <div className="flex flex-col sm:flex-row items-center gap-3 w-full">
          <Button onClick={reset} className="w-full gap-2">
            <RefreshCw className="h-4 w-4" />
            {c.retry}
          </Button>
          <Button asChild variant="outline" className="w-full gap-2">
            <Link href="/dashboard">
              <LayoutDashboard className="h-4 w-4" />
              {c.dashboard}
            </Link>
          </Button>
        </div>
      </motion.div>
    </div>
  )
}
