'use client'

import Link from 'next/link'
import { Wallet } from 'lucide-react'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { ThemeSwitcher } from '@/components/theme-switcher'
import { LanguageSwitcher } from '@/components/language-switcher'

export function AppMobileHeader() {
  return (
    <header className="md:hidden sticky top-0 z-50 w-full border-b border-border/40 bg-background/80 backdrop-blur-md">
      <div className="flex items-center justify-between px-3 h-14">
        {/* Hamburger trigger */}
        <SidebarTrigger className="h-9 w-9" />

        {/* Logo / app name — centered */}
        <Link
          href="/dashboard"
          className="absolute left-1/2 -translate-x-1/2 flex items-center gap-2 font-bold text-base"
        >
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Wallet className="h-3.5 w-3.5" />
          </div>
          <span className="truncate">Solvio</span>
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
