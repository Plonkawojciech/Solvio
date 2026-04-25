'use client'

import { BrainCircuit, BarChart3, Camera, Shield } from 'lucide-react'
import { useTranslation } from '@/lib/i18n'
import Link from 'next/link'

const features = [
  { icon: Camera, key: 'scan' },
  { icon: BrainCircuit, key: 'ai' },
  { icon: BarChart3, key: 'reports' },
  { icon: Shield, key: 'secure' },
] as const

const featureText = {
  en: {
    scan: { t: 'Receipt scanning', d: 'Snap or upload receipts instantly.' },
    ai: { t: 'AI analysis', d: 'GPT insights & recommendations.' },
    reports: { t: 'Smart reports', d: 'PDF, CSV, DOCX exports.' },
    secure: { t: 'Secure & private', d: 'Bank-grade encryption.' },
  },
  pl: {
    scan: { t: 'Skanowanie paragonów', d: 'Zrób zdjęcie lub wgraj plik.' },
    ai: { t: 'Analiza AI', d: 'Wnioski i rekomendacje GPT.' },
    reports: { t: 'Inteligentne raporty', d: 'Eksport PDF, CSV, DOCX.' },
    secure: { t: 'Bezpiecznie', d: 'Szyfrowanie bankowe.' },
  },
} as const

export function AuthLayout({ children }: { children: React.ReactNode }) {
  const { lang } = useTranslation()
  const pl = lang === 'pl'
  const ft = featureText[pl ? 'pl' : 'en']

  return (
    <div className="min-h-svh flex bg-background">
      {/* Left panel (branding) — hidden on mobile */}
      <div className="hidden lg:flex lg:w-[48%] xl:w-[52%] relative flex-col justify-between border-r-2 border-foreground bg-secondary p-10 xl:p-14">
        <Link
          href="/"
          className="flex w-fit items-center gap-2 text-lg font-black tracking-tight"
          aria-label="Solvio — home"
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-md border-2 border-foreground bg-foreground text-background shadow-[2px_2px_0_hsl(var(--foreground))]">
            <BarChart3 className="size-4" />
          </div>
          Solvio
        </Link>

        <div className="space-y-5">
          <div className="font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            {'// '}{pl ? 'TWOJE FINANSE' : 'YOUR FINANCES'}
          </div>
          <h2 className="text-3xl xl:text-4xl font-extrabold tracking-tight leading-[1.1]">
            {pl
              ? 'Przestań zgadywać,\ngdzie idą Twoje pieniądze'
              : 'Stop guessing\nwhere your money goes'}
          </h2>
          <p className="text-muted-foreground leading-snug max-w-sm">
            {pl
              ? 'Solvio skanuje paragony, kategoryzuje wydatki z AI i daje Ci głębokie wnioski o Twoich finansach.'
              : 'Solvio scans receipts, categorises expenses with AI, and gives you deep insights about your spending.'}
          </p>

          <div className="grid grid-cols-2 gap-3 pt-2">
            {features.map((f) => (
              <div
                key={f.key}
                className="flex items-start gap-3 rounded-md border-2 border-foreground bg-card p-3 shadow-[2px_2px_0_hsl(var(--foreground))]"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border-2 border-foreground bg-foreground text-background">
                  <f.icon className="size-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-extrabold leading-tight">
                    {ft[f.key as keyof typeof ft].t}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
                    {ft[f.key as keyof typeof ft].d}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="font-mono text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
          {pl ? '// 500+ AKTYWNYCH UŻYTKOWNIKÓW' : '// 500+ ACTIVE USERS'}
        </p>
      </div>

      {/* Right panel (form) */}
      <div className="flex-1 flex items-center justify-center p-5 sm:p-10">
        <div className="w-full max-w-md">{children}</div>
      </div>
    </div>
  )
}
