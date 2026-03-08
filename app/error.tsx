'use client'

import { useEffect } from 'react'
import { motion } from 'framer-motion'
import { AlertTriangle, RefreshCw, Home, Wallet } from 'lucide-react'
import { Button } from '@/components/ui/button'
import Link from 'next/link'

const content = {
  en: {
    badge: 'Something went wrong',
    title: 'An unexpected error occurred',
    sub: 'We encountered an issue on our end. Your data is safe — please try again or return to the home page.',
    retry: 'Try again',
    home: 'Go home',
    code: 'Error details',
  },
  pl: {
    badge: 'Coś poszło nie tak',
    title: 'Wystąpił nieoczekiwany błąd',
    sub: 'Natrafiliśmy na problem po naszej stronie. Twoje dane są bezpieczne — spróbuj ponownie lub wróć na stronę główną.',
    retry: 'Spróbuj ponownie',
    home: 'Strona główna',
    code: 'Szczegóły błędu',
  },
}

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[Global] Error:', error)
  }, [error])

  // Detect language from localStorage if available, default to 'en'
  const lang =
    typeof window !== 'undefined'
      ? ((localStorage.getItem('language') as 'pl' | 'en') ?? 'en')
      : 'en'
  const c = content[lang] ?? content.en

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background text-foreground px-4">
      {/* Subtle radial glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 flex items-center justify-center"
      >
        <div className="h-[500px] w-[500px] rounded-full bg-destructive/5 blur-3xl" />
      </div>

      <motion.div
        className="relative z-10 flex flex-col items-center gap-6 text-center max-w-md"
        initial={{ opacity: 0, y: 32 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
      >
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 text-lg font-bold tracking-tight mb-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Wallet className="h-4 w-4" />
          </div>
          <span>Solvio</span>
        </Link>

        {/* Icon */}
        <motion.div
          className="flex h-20 w-20 items-center justify-center rounded-2xl bg-destructive/10 text-destructive ring-1 ring-destructive/20"
          initial={{ scale: 0.7, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.1, duration: 0.45, ease: 'easeOut' }}
        >
          <AlertTriangle className="h-10 w-10" />
        </motion.div>

        {/* Badge */}
        <motion.span
          className="inline-flex items-center gap-1.5 rounded-full border border-destructive/30 bg-destructive/8 px-3 py-1 text-xs font-medium text-destructive"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
        >
          {c.badge}
        </motion.span>

        {/* Heading */}
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">{c.title}</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">{c.sub}</p>
        </div>

        {/* Error digest */}
        {error.digest && (
          <p className="text-xs text-muted-foreground/60 font-mono">
            {c.code}: {error.digest}
          </p>
        )}

        {/* Actions */}
        <div className="flex flex-col sm:flex-row items-center gap-3 w-full">
          <Button
            onClick={reset}
            className="w-full sm:w-auto gap-2"
          >
            <RefreshCw className="h-4 w-4" />
            {c.retry}
          </Button>
          <Button asChild variant="outline" className="w-full sm:w-auto gap-2">
            <Link href="/">
              <Home className="h-4 w-4" />
              {c.home}
            </Link>
          </Button>
        </div>
      </motion.div>
    </div>
  )
}
