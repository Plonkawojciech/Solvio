'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { Home, LayoutDashboard, Wallet, SearchX } from 'lucide-react'
import { Button } from '@/components/ui/button'

/* ─── Bilingual content (client component, no hook — localStorage read) ─── */
const content = {
  en: {
    code: '404',
    badge: 'Page not found',
    title: "We couldn't find that page",
    sub: "The page you're looking for doesn't exist or has been moved. Head back to the dashboard or the home page.",
    dashboard: 'Go to Dashboard',
    home: 'Home page',
    hint: "Lost? Try navigating from the sidebar inside the app.",
  },
  pl: {
    code: '404',
    badge: 'Strona nie znaleziona',
    title: 'Nie znaleźliśmy tej strony',
    sub: 'Strona, której szukasz, nie istnieje lub została przeniesiona. Wróć do panelu głównego lub strony startowej.',
    dashboard: 'Panel główny',
    home: 'Strona główna',
    hint: 'Zgubiony? Spróbuj skorzystać z menu bocznego wewnątrz aplikacji.',
  },
}

/* ─── Floating particle ─── */
function Particle({ x, y, delay, size }: { x: number; y: number; delay: number; size: number }) {
  return (
    <motion.div
      className="absolute rounded-full bg-primary/20"
      style={{ left: `${x}%`, top: `${y}%`, width: size, height: size }}
      animate={{ y: [0, -18, 0], opacity: [0.3, 0.7, 0.3] }}
      transition={{ duration: 4 + delay, repeat: Infinity, delay, ease: 'easeInOut' }}
    />
  )
}

const particles = [
  { x: 12, y: 20, delay: 0,   size: 6  },
  { x: 80, y: 15, delay: 1.2, size: 10 },
  { x: 60, y: 70, delay: 0.6, size: 7  },
  { x: 25, y: 75, delay: 2,   size: 5  },
  { x: 88, y: 55, delay: 0.9, size: 8  },
  { x: 45, y: 88, delay: 1.7, size: 6  },
  { x: 5,  y: 50, delay: 2.4, size: 4  },
  { x: 70, y: 35, delay: 0.3, size: 9  },
]

export default function NotFound() {
  // Read language preference without hook (SSR-safe default)
  let lang: 'en' | 'pl' = 'en'
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem('language')
    if (stored === 'pl' || stored === 'en') lang = stored
  }
  const c = content[lang]

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-background text-foreground px-4">
      {/* Background glow blobs */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
      >
        <div className="absolute -top-32 left-1/2 -translate-x-1/2 h-[500px] w-[700px] rounded-full bg-primary/5 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-[350px] w-[350px] rounded-full bg-primary/5 blur-3xl" />
      </div>

      {/* Floating particles */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        {particles.map((p, i) => (
          <Particle key={i} {...p} />
        ))}
      </div>

      {/* Main card */}
      <motion.div
        className="relative z-10 flex flex-col items-center gap-7 text-center max-w-md"
        initial={{ opacity: 0, y: 36 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      >
        {/* Logo */}
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.05, duration: 0.4 }}
        >
          <Link href="/" className="flex items-center gap-2 text-lg font-bold tracking-tight">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Wallet className="h-4 w-4" />
            </div>
            <span>Solvio</span>
          </Link>
        </motion.div>

        {/* 404 large number */}
        <motion.div
          className="relative"
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.12, duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        >
          {/* Background digit */}
          <span
            aria-hidden
            className="absolute inset-0 flex items-center justify-center text-[9rem] font-black text-primary/5 select-none blur-sm"
          >
            404
          </span>
          {/* Foreground digit */}
          <div className="relative flex items-center justify-center h-36">
            <motion.span
              className="text-[7.5rem] font-black leading-none tracking-tighter bg-gradient-to-br from-primary to-primary/50 bg-clip-text text-transparent select-none"
              animate={{ y: [0, -6, 0] }}
              transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
            >
              404
            </motion.span>
          </div>
        </motion.div>

        {/* Icon badge */}
        <motion.div
          className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20"
          initial={{ scale: 0.7, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.4 }}
        >
          <SearchX className="h-7 w-7" />
        </motion.div>

        {/* Badge pill */}
        <motion.span
          className="inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/8 px-3 py-1 text-xs font-medium text-primary"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.28 }}
        >
          {c.badge}
        </motion.span>

        {/* Text */}
        <motion.div
          className="space-y-3"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.32 }}
        >
          <h1 className="text-2xl font-semibold tracking-tight">{c.title}</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">{c.sub}</p>
        </motion.div>

        {/* Actions */}
        <motion.div
          className="flex flex-col sm:flex-row items-center gap-3 w-full"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.42 }}
        >
          <Button asChild className="w-full gap-2">
            <Link href="/dashboard">
              <LayoutDashboard className="h-4 w-4" />
              {c.dashboard}
            </Link>
          </Button>
          <Button asChild variant="outline" className="w-full gap-2">
            <Link href="/">
              <Home className="h-4 w-4" />
              {c.home}
            </Link>
          </Button>
        </motion.div>

        {/* Hint */}
        <motion.p
          className="text-xs text-muted-foreground/60 max-w-xs"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.55 }}
        >
          {c.hint}
        </motion.p>
      </motion.div>
    </div>
  )
}
