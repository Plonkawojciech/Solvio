"use client"

import { motion } from "framer-motion"
import { BrainCircuit, BarChart3, Camera, Shield } from "lucide-react"
import { useTranslation } from "@/lib/i18n"
import Link from "next/link"

const features = [
  { icon: Camera, key: "scan" },
  { icon: BrainCircuit, key: "ai" },
  { icon: BarChart3, key: "reports" },
  { icon: Shield, key: "secure" },
]

const featureText = {
  en: {
    scan: { t: "Receipt Scanning", d: "Snap or upload receipts instantly" },
    ai: { t: "AI Analysis", d: "GPT-4 insights & recommendations" },
    reports: { t: "Smart Reports", d: "PDF, CSV, DOCX exports" },
    secure: { t: "Secure & Private", d: "Bank-grade encryption, always private" },
  },
  pl: {
    scan: { t: "Skanowanie paragonów", d: "Zrób zdjęcie lub prześlij plik" },
    ai: { t: "Analiza AI", d: "Wnioski i rekomendacje GPT-4" },
    reports: { t: "Inteligentne raporty", d: "Eksport PDF, CSV, DOCX" },
    secure: { t: "Bezpiecznie", d: "Szyfrowanie bankowe, zawsze prywatne" },
  },
}

export function AuthLayout({ children }: { children: React.ReactNode }) {
  const { lang } = useTranslation()
  const pl = lang === "pl"
  const ft = featureText[pl ? "pl" : "en"]

  return (
    <div className="min-h-svh flex">
      {/* ── Left panel (branding) — hidden on mobile ── */}
      <div className="hidden lg:flex lg:w-[48%] xl:w-[52%] relative flex-col justify-between p-10 xl:p-14 overflow-hidden bg-gradient-to-br from-primary/10 via-background to-violet-500/10 border-r border-border/40">
        {/* Animated blobs */}
        <motion.div
          animate={{ scale: [1, 1.15, 1], opacity: [0.4, 0.7, 0.4] }}
          transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
          className="pointer-events-none absolute -top-32 -left-32 w-96 h-96 rounded-full bg-primary/20 blur-3xl"
        />
        <motion.div
          animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.5, 0.3] }}
          transition={{ duration: 9, repeat: Infinity, ease: "easeInOut", delay: 2 }}
          className="pointer-events-none absolute -bottom-32 right-0 w-80 h-80 rounded-full bg-violet-500/20 blur-3xl"
        />

        {/* Logo */}
        <Link href="/" className="relative flex items-center gap-2.5 w-fit">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-lg shadow-primary/30">
            <BarChart3 className="h-4.5 w-4.5" />
          </div>
          <span className="text-xl font-bold">Solvio</span>
        </Link>

        {/* Main copy */}
        <motion.div
          initial={{ opacity: 0, y: 32 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
          className="relative space-y-6"
        >
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">
            {pl ? "Twoje finanse pod kontrolą" : "Your finances, under control"}
          </p>
          <h2 className="text-3xl xl:text-4xl font-extrabold tracking-tight leading-tight">
            {pl ? "Przestań zgadywać,\ngdzie idą Twoje pieniądze" : "Stop guessing\nwhere your money goes"}
          </h2>
          <p className="text-muted-foreground leading-relaxed max-w-sm">
            {pl
              ? "Solvio skanuje paragony, kategoryzuje wydatki z AI i daje Ci głębokie wnioski o Twoich finansach."
              : "Solvio scans receipts, categorises expenses with AI, and gives you deep insights about your spending."}
          </p>

          {/* Feature list */}
          <div className="grid grid-cols-2 gap-3 pt-2">
            {features.map((f, i) => (
              <motion.div
                key={f.key}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 + i * 0.1, duration: 0.5 }}
                className="flex items-start gap-3 p-3 rounded-xl border border-border/50 bg-background/50 backdrop-blur-sm"
              >
                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary">
                  <f.icon className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-semibold leading-tight">{ft[f.key as keyof typeof ft].t}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{ft[f.key as keyof typeof ft].d}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Social proof */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8 }}
          className="relative text-xs text-muted-foreground"
        >
          {pl ? "Dołącz do 500+ użytkowników już korzystających z Solvio" : "Join 500+ users already using Solvio"}
        </motion.p>
      </div>

      {/* ── Right panel (form) ── */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-md">
          {children}
        </div>
      </div>
    </div>
  )
}
