'use client'

import Link from 'next/link'
import { Wallet } from 'lucide-react'
import { useTranslation } from '@/lib/i18n'

export default function Footer() {
  const { lang } = useTranslation()

  return (
    <footer className="border-t border-border/40 bg-background/60 backdrop-blur-sm">
      <div className="mx-auto max-w-7xl px-5 sm:px-8 py-10 sm:py-12">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
          {/* Brand */}
          <div className="flex flex-col items-center sm:items-start gap-2">
            <Link href="/" className="flex items-center gap-2 font-bold text-base">
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
                <Wallet className="h-3.5 w-3.5" />
              </div>
              Solvio
            </Link>
            <p className="text-xs text-muted-foreground max-w-[220px] text-center sm:text-left">
              {lang === 'pl' ? 'Inteligentne śledzenie wydatków z AI.' : 'Smart expense tracking powered by AI.'}
            </p>
          </div>

          {/* Links */}
          <div className="flex items-center gap-5 text-xs text-muted-foreground">
            <Link href="/login" className="hover:text-foreground transition-colors">
              {lang === 'pl' ? 'Utwórz konto' : 'Sign Up'}
            </Link>
            <Link href="/login" className="hover:text-foreground transition-colors">
              {lang === 'pl' ? 'Logowanie' : 'Log In'}
            </Link>
          </div>
        </div>

        <div className="mt-8 pt-6 border-t border-border/30 text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} Solvio. {lang === 'pl' ? 'Wszelkie prawa zastrzeżone.' : 'All rights reserved.'}
        </div>
      </div>
    </footer>
  )
}
