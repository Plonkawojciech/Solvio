'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LogoutButton } from './logout-button'
import { Button } from './ui/button'
import { ThemeSwitcher } from './theme-switcher'
import { LanguageSwitcher } from './language-switcher'
import { useTranslation } from '@/lib/i18n'
import { Wallet } from 'lucide-react'
import { useSession } from '@/lib/use-session'

export default function Header() {
  const { email, isLoaded } = useSession()
  const { t, lang } = useTranslation()
  const pathname = usePathname()

  const isMarketing = pathname === '/' || pathname === ''

  return (
    <header className="sticky top-0 z-50 w-full border-b-2 border-foreground bg-background/95 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-5 sm:px-8 py-3 sm:py-4">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 text-lg sm:text-xl font-black tracking-tight">
          <div className="flex h-9 w-9 items-center justify-center rounded-md border-2 border-foreground bg-foreground text-background shadow-[2px_2px_0_hsl(var(--foreground))] font-mono">
            <Wallet className="h-4 w-4" />
          </div>
          <span>Solvio</span>
        </Link>

        {/* Nav links — only on marketing pages */}
        {isMarketing && !email && (
          <nav className="hidden md:flex items-center gap-6 font-mono text-[11px] font-bold uppercase tracking-widest">
            <a href="#features" className="text-muted-foreground hover:text-foreground transition-colors">
              {lang === 'pl' ? 'Funkcje' : 'Features'}
            </a>
            <a href="#how" className="text-muted-foreground hover:text-foreground transition-colors">
              {lang === 'pl' ? 'Jak działa' : 'How it works'}
            </a>
          </nav>
        )}

        {/* Right side */}
        <div className="flex items-center gap-1.5 sm:gap-2 md:gap-3">
          {isLoaded && email ? (
            <div className="flex items-center gap-1.5 sm:gap-2 md:gap-3">
              <Link href="/dashboard">
                <Button variant="ghost" size="sm" className="hidden sm:inline-flex text-xs sm:text-sm">
                  Dashboard
                </Button>
              </Link>
              <span className="hidden lg:inline text-sm text-muted-foreground truncate max-w-[180px]" suppressHydrationWarning>
                {email}
              </span>
              <LogoutButton />
            </div>
          ) : (
            <div className="flex gap-1.5 sm:gap-2">
              <Button asChild size="sm" variant="ghost" className="text-xs sm:text-sm">
                <Link href="/login" suppressHydrationWarning>{t('auth.signIn')}</Link>
              </Button>
              <Button asChild size="sm" className="text-xs sm:text-sm">
                <Link href="/login" suppressHydrationWarning>{t('auth.signUp')}</Link>
              </Button>
            </div>
          )}
          <LanguageSwitcher />
          <ThemeSwitcher />
        </div>
      </div>
    </header>
  )
}
