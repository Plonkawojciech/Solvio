'use client'

import Link from 'next/link'
import { Wallet } from 'lucide-react'
import { useTranslation } from '@/lib/i18n'

export default function Footer() {
  const { t } = useTranslation()

  return (
    <footer className="border-t-2 border-foreground bg-background">
      <div className="mx-auto max-w-7xl px-5 sm:px-8 py-10 sm:py-12">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
          {/* Brand */}
          <div className="flex flex-col items-center sm:items-start gap-3">
            <Link href="/" className="flex items-center gap-2 font-black text-base">
              <div className="flex h-9 w-9 items-center justify-center rounded-md border-2 border-foreground bg-foreground text-background shadow-[2px_2px_0_hsl(var(--foreground))]">
                <Wallet className="h-4 w-4" aria-hidden="true" />
              </div>
              Solvio
            </Link>
            <p className="text-xs text-muted-foreground max-w-[240px] text-center sm:text-left" suppressHydrationWarning>
              {t('footer.tagline')}
            </p>
          </div>

          {/* Links */}
          <div className="flex items-center gap-3 font-mono text-[11px] font-bold uppercase tracking-widest">
            <Link href="/login" className="text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2 rounded transition-colors" suppressHydrationWarning>
              {t('footer.signUp')}
            </Link>
            <span className="text-foreground/30" aria-hidden="true">/</span>
            <Link href="/login" className="text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2 rounded transition-colors" suppressHydrationWarning>
              {t('footer.logIn')}
            </Link>
          </div>
        </div>

        <div className="mt-8 pt-6 border-t-2 border-dashed border-foreground/30 text-center font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          <span suppressHydrationWarning>© {new Date().getFullYear()} Solvio. {t('footer.rights')}</span>
        </div>
      </div>
    </footer>
  )
}
