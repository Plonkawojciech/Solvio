'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useUser } from '@clerk/nextjs'
import { LogoutButton } from './logout-button'
import { Button } from './ui/button'
import { ThemeSwitcher } from './theme-switcher'
import { LanguageSwitcher } from './language-switcher'
import { useTranslation } from '@/lib/i18n'
import { Wallet } from 'lucide-react'

export default function Header() {
  const { user, isLoaded } = useUser()
  const { t, lang } = useTranslation()
  const pathname = usePathname()

  const isMarketing = pathname === '/' || pathname === ''

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-5 sm:px-8 py-3 sm:py-4">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 text-lg sm:text-xl font-bold tracking-tight">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Wallet className="h-4 w-4" />
          </div>
          <span>Solvio</span>
        </Link>

        {/* Nav links — only on marketing pages */}
        {isMarketing && !user && (
          <nav className="hidden md:flex items-center gap-6 text-sm text-muted-foreground">
            <a href="#features" className="hover:text-foreground transition-colors">
              {lang === 'pl' ? 'Funkcje' : 'Features'}
            </a>
            <a href="#how" className="hover:text-foreground transition-colors">
              {lang === 'pl' ? 'Jak działa' : 'How it works'}
            </a>
          </nav>
        )}

        {/* Right side */}
        <div className="flex items-center gap-1.5 sm:gap-2 md:gap-3">
          {isLoaded && user ? (
            <div className="flex items-center gap-1.5 sm:gap-2 md:gap-3">
              <Link href="/dashboard">
                <Button variant="ghost" size="sm" className="hidden sm:inline-flex text-xs sm:text-sm">
                  Dashboard
                </Button>
              </Link>
              <span className="hidden lg:inline text-sm text-muted-foreground truncate max-w-[180px]" suppressHydrationWarning>
                {user.primaryEmailAddress?.emailAddress}
              </span>
              <LogoutButton />
            </div>
          ) : (
            <div className="flex gap-1.5 sm:gap-2">
              <Button asChild size="sm" variant="ghost" className="text-xs sm:text-sm">
                <Link href="/login" suppressHydrationWarning>{t('auth.signIn')}</Link>
              </Button>
              <Button asChild size="sm" className="text-xs sm:text-sm">
                <Link href="/sign-up" suppressHydrationWarning>{t('auth.signUp')}</Link>
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
