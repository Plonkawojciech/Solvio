'use client'

import { useEffect } from 'react'
import { AlertTriangle, RefreshCw, Home, Wallet } from 'lucide-react'
import { Button } from '@/components/ui/button'
import Link from 'next/link'

const content = {
  en: {
    eyebrow: '// SYSTEM ERROR',
    title: 'An unexpected error occurred',
    sub: 'We hit an issue on our end. Your data is safe — try again or return home.',
    retry: 'Try again',
    home: 'Go home',
    code: 'Error ref',
  },
  pl: {
    eyebrow: '// BŁĄD SYSTEMU',
    title: 'Wystąpił nieoczekiwany błąd',
    sub: 'Natrafiliśmy na problem po naszej stronie. Twoje dane są bezpieczne — spróbuj ponownie lub wróć na stronę główną.',
    retry: 'Spróbuj ponownie',
    home: 'Strona główna',
    code: 'ID błędu',
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

  const lang =
    typeof window !== 'undefined'
      ? ((localStorage.getItem('language') as 'pl' | 'en') ?? 'en')
      : 'en'
  const c = content[lang] ?? content.en

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-5 py-10 text-foreground">
      <div className="flex w-full max-w-md flex-col items-center gap-5 text-center">
        <Link
          href="/"
          aria-label="Solvio — home"
          className="flex items-center gap-2 text-base font-black tracking-tight"
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-md border-2 border-foreground bg-foreground text-background shadow-[2px_2px_0_hsl(var(--foreground))]">
            <Wallet className="size-4" />
          </div>
          Solvio
        </Link>

        <div className="font-mono text-[10px] font-bold uppercase tracking-widest text-destructive">
          {c.eyebrow}
        </div>

        <div className="flex h-16 w-16 items-center justify-center rounded-md border-2 border-destructive bg-destructive/10 text-destructive shadow-[3px_3px_0_hsl(var(--destructive))]">
          <AlertTriangle className="size-7" aria-hidden="true" />
        </div>

        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-extrabold tracking-tight">{c.title}</h1>
          <p className="text-sm text-muted-foreground leading-snug">{c.sub}</p>
        </div>

        {error.digest && (
          <p className="font-mono text-[11px] text-muted-foreground/70">
            {c.code}: {error.digest}
          </p>
        )}

        <div className="mt-2 flex w-full flex-col gap-2 sm:flex-row sm:justify-center">
          <Button onClick={reset} className="w-full sm:w-auto">
            <RefreshCw className="size-4" />
            {c.retry}
          </Button>
          <Button asChild variant="outline" className="w-full sm:w-auto">
            <Link href="/">
              <Home className="size-4" />
              {c.home}
            </Link>
          </Button>
        </div>
      </div>
    </div>
  )
}
