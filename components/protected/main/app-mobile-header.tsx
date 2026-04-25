'use client'

import Link from 'next/link'
import { Wallet } from 'lucide-react'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { ThemeSwitcher } from '@/components/theme-switcher'
import { LanguageSwitcher } from '@/components/language-switcher'
import { useTranslation } from '@/lib/i18n'

export function AppMobileHeader() {
  const { t } = useTranslation()
  return (
    <header className="md:hidden sticky top-0 z-50 w-full border-b-2 border-foreground bg-background/95 backdrop-blur-lg" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
      <div className="flex items-center justify-between px-3 h-14">
        {/* Hamburger trigger */}
        <SidebarTrigger className="h-9 w-9" aria-label={t('common.toggleSidebar')} />

        {/* Logo / app name — centered */}
        <Link
          href="/dashboard"
          className="absolute left-1/2 -translate-x-1/2 flex items-center gap-2 text-sm font-black"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-md border-2 border-foreground bg-foreground text-background shadow-[2px_2px_0_hsl(var(--foreground))]">
            <Wallet className="h-4 w-4" />
          </div>
          <span className="truncate tracking-tight">Solvio</span>
        </Link>

        {/* Right-side controls */}
        <div className="flex items-center gap-1.5">
          <LanguageSwitcher />
          <ThemeSwitcher />
        </div>
      </div>
    </header>
  )
}
