'use client'

import Link from 'next/link'
import { Home, LayoutDashboard, Wallet, SearchX } from 'lucide-react'
import { Button } from '@/components/ui/button'

const content = {
  en: {
    eyebrow: '// 404 — NOT FOUND',
    title: "We couldn't find that page",
    sub: "The page you're looking for doesn't exist or has been moved.",
    dashboard: 'Go to dashboard',
    home: 'Home',
    hint: 'Lost? Try navigating from the sidebar inside the app.',
  },
  pl: {
    eyebrow: '// 404 — NIE ZNALEZIONO',
    title: 'Nie znaleźliśmy tej strony',
    sub: 'Strona, której szukasz, nie istnieje lub została przeniesiona.',
    dashboard: 'Panel główny',
    home: 'Strona główna',
    hint: 'Zgubiony? Skorzystaj z menu bocznego wewnątrz aplikacji.',
  },
}

export default function NotFound() {
  let lang: 'en' | 'pl' = 'en'
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem('language')
    if (stored === 'pl' || stored === 'en') lang = stored
  }
  const c = content[lang]

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

        <div className="font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          {c.eyebrow}
        </div>

        <div className="relative">
          <span className="font-mono text-[6rem] font-black leading-none tracking-tighter text-foreground select-none">
            404
          </span>
        </div>

        <div className="flex h-14 w-14 items-center justify-center rounded-md border-2 border-foreground bg-card text-foreground shadow-[3px_3px_0_hsl(var(--foreground))]">
          <SearchX className="size-6" aria-hidden="true" />
        </div>

        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-extrabold tracking-tight">{c.title}</h1>
          <p className="text-sm text-muted-foreground leading-snug">{c.sub}</p>
        </div>

        <div className="mt-2 flex w-full flex-col gap-2 sm:flex-row sm:justify-center">
          <Button asChild className="w-full sm:w-auto">
            <Link href="/dashboard">
              <LayoutDashboard className="size-4" />
              {c.dashboard}
            </Link>
          </Button>
          <Button asChild variant="outline" className="w-full sm:w-auto">
            <Link href="/">
              <Home className="size-4" />
              {c.home}
            </Link>
          </Button>
        </div>

        <p className="mt-1 text-xs text-muted-foreground/80 max-w-xs">{c.hint}</p>
      </div>
    </div>
  )
}
