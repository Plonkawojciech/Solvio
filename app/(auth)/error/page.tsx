'use client'

import Link from 'next/link'
import { AlertCircle, ArrowLeft, Home } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useTranslation } from '@/lib/i18n'
import { use } from 'react'

export default function AuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const params = use(searchParams)
  const { lang } = useTranslation()
  const pl = lang === 'pl'

  return (
    <div className="flex min-h-svh w-full items-center justify-center bg-background p-5 sm:p-10">
      <div className="w-full max-w-sm">
        <div className="rounded-lg border-2 border-foreground bg-card p-6 shadow-[6px_6px_0_hsl(var(--foreground))]">
          <div className="mb-4 font-mono text-[10px] font-bold uppercase tracking-widest text-destructive">
            {'// '}{pl ? 'BŁĄD LOGOWANIA' : 'AUTH ERROR'}
          </div>

          <div className="flex flex-col items-center gap-4 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-md border-2 border-destructive bg-destructive/10 text-destructive shadow-[3px_3px_0_hsl(var(--destructive))]">
              <AlertCircle className="size-6" aria-hidden="true" />
            </div>
            <h1 className="text-xl font-extrabold tracking-tight text-foreground">
              {pl ? 'Coś poszło nie tak' : 'Something went wrong'}
            </h1>
            <p className="text-sm text-muted-foreground leading-snug">
              {params?.error
                ? (pl ? 'Szczegóły błędu: ' : 'Error: ') + params.error
                : pl
                  ? 'Wystąpił nieoczekiwany błąd. Spróbuj ponownie.'
                  : 'An unexpected error occurred. Please try again.'}
            </p>
          </div>

          <div className="mt-6 flex flex-col gap-2">
            <Button asChild className="w-full">
              <Link href="/login" aria-label={pl ? 'Wróć do logowania' : 'Back to login'}>
                <ArrowLeft className="size-4" />
                {pl ? 'Wróć do logowania' : 'Back to login'}
              </Link>
            </Button>
            <Button asChild variant="outline" className="w-full">
              <Link href="/" aria-label={pl ? 'Strona główna' : 'Homepage'}>
                <Home className="size-4" />
                {pl ? 'Strona główna' : 'Homepage'}
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
