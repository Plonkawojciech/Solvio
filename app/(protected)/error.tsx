'use client'

import { useEffect } from 'react'
import { AlertTriangle, RefreshCw, LayoutDashboard } from 'lucide-react'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { useTranslation } from '@/lib/i18n'

const content = {
  en: {
    eyebrow: '// APPLICATION ERROR',
    title: 'An error occurred',
    sub: 'We hit a snag loading this page. Your data is safe — retry or return to the dashboard.',
    retry: 'Try again',
    dashboard: 'Go to dashboard',
    code: 'Error ID',
  },
  pl: {
    eyebrow: '// BŁĄD APLIKACJI',
    title: 'Wystąpił błąd',
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
    <div className="flex min-h-[65vh] flex-col items-center justify-center gap-5 px-5 py-10 text-center">
      <div className="flex w-full max-w-md flex-col items-center gap-5">
        <div className="font-mono text-[10px] font-bold uppercase tracking-widest text-destructive">
          {c.eyebrow}
        </div>

        <div className="flex h-16 w-16 items-center justify-center rounded-md border-2 border-destructive bg-destructive/10 text-destructive shadow-[3px_3px_0_hsl(var(--destructive))]">
          <AlertTriangle className="size-7" aria-hidden="true" />
        </div>

        <div className="flex flex-col gap-2">
          <h2 className="text-xl font-extrabold tracking-tight">{c.title}</h2>
          <p className="text-sm text-muted-foreground leading-snug">{c.sub}</p>
        </div>

        {error.message && error.message !== 'An unexpected error occurred' && (
          <div className="w-full rounded-md border-2 border-foreground bg-card px-3 py-2 text-left">
            <p className="font-mono text-[11px] text-muted-foreground break-all line-clamp-3">
              {error.message}
            </p>
          </div>
        )}

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
            <Link href="/dashboard">
              <LayoutDashboard className="size-4" />
              {c.dashboard}
            </Link>
          </Button>
        </div>
      </div>
    </div>
  )
}
