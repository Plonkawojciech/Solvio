'use client'

import Link from 'next/link'
import { useRef } from 'react'
import { motion, useInView } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { useTranslation } from '@/lib/i18n'
import {
  Camera, Wallet,
  ArrowRight, TrendingDown,
  BrainCircuit, FileText, Users,
  Building2, User, Landmark,
  Receipt, Calculator, Shield, UserPlus,
  CreditCard, Check, X, CheckCircle2, Star,
} from 'lucide-react'

function FadeUp({ children, delay = 0, className = '' }: { children: React.ReactNode; delay?: number; className?: string }) {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, margin: '-60px' })
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 20 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      transition={{ duration: 0.5, delay: delay * 0.1, ease: [0.22, 1, 0.36, 1] as any }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

/* Paleta kategorii — ta sama co w aplikacji (dashboard) */
const CAT = {
  red: '#e2493a',
  amber: '#e29a2f',
  green: '#3f9c74',
  blue: '#4f79e2',
  violet: '#9a5fd1',
}

const personalFeatureIcons = [Camera, Landmark, BrainCircuit, Users, TrendingDown, CreditCard]
const businessFeatureIcons = [Receipt, Calculator, UserPlus, Shield, Landmark, FileText]

/* Funkcje: każda dostaje kolor z palety kategorii — język wizualny produktu */
const featureMeta: { icon: typeof Camera; color: string }[] = [
  { icon: Camera, color: CAT.red },
  { icon: Landmark, color: CAT.blue },
  { icon: Calculator, color: CAT.amber },
  { icon: BrainCircuit, color: CAT.violet },
  { icon: FileText, color: CAT.green },
  { icon: UserPlus, color: CAT.blue },
  { icon: TrendingDown, color: CAT.red },
  { icon: Users, color: CAT.amber },
]

type ComparisonRow = {
  key: string
  personal: boolean
  business: boolean
}

const comparisonRows: ComparisonRow[] = [
  { key: 'landing.comp.receiptScan', personal: true, business: true },
  { key: 'landing.comp.invoiceScan', personal: false, business: true },
  { key: 'landing.comp.bankSync', personal: true, business: true },
  { key: 'landing.comp.aiAnalysis', personal: true, business: true },
  { key: 'landing.comp.budgets', personal: true, business: true },
  { key: 'landing.comp.reports', personal: true, business: true },
  { key: 'landing.comp.groupSplit', personal: true, business: false },
  { key: 'landing.comp.priceAlerts', personal: true, business: false },
  { key: 'landing.comp.vatTracking', personal: false, business: true },
  { key: 'landing.comp.jpkExport', personal: false, business: true },
  { key: 'landing.comp.teamMgmt', personal: false, business: true },
  { key: 'landing.comp.approvals', personal: false, business: true },
  { key: 'landing.comp.departments', personal: false, business: true },
  { key: 'landing.comp.loyaltyCards', personal: true, business: false },
  { key: 'landing.comp.promotions', personal: true, business: false },
]

/* ── Żywy mini-dashboard — sygnatura strony ──
   Prawdziwy DOM w tokenach produktu, nie screenshot: animowany pasek budżetu
   z pinezką tempa, kategorie w palecie aplikacji, wjeżdżający paragon. */
function HeroDashboard() {
  const { t, lang } = useTranslation()
  const pl = lang === 'pl'
  const rows = [
    { name: t('categories.groceries'), color: CAT.red, w: 92, delta: '▲27%', bad: true },
    { name: t('categories.billsUtilities'), color: CAT.amber, w: 64, delta: '▲3%', bad: false },
    { name: t('categories.transport'), color: CAT.green, w: 45, delta: '▼19%', bad: false },
    { name: t('categories.food'), color: CAT.blue, w: 38, delta: '▲10%', bad: false },
  ]
  return (
    <div className="relative w-full max-w-[440px] mx-auto select-none" aria-hidden="true">
      {/* Karta główna */}
      <div className="rounded-2xl border border-border bg-card shadow-[var(--nb-shadow-lg)] p-5 sm:p-6">
        <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
          {t('dashboard.monthSpending')}
        </p>
        <div className="mt-1 mb-4 flex items-baseline gap-2">
          <span className="text-3xl font-extrabold tabular-nums tracking-tight">4 280 zł</span>
          <span className="text-sm font-medium text-muted-foreground tabular-nums">/ 5 000 zł</span>
        </div>
        {/* Pasek budżetu z pinezką tempa */}
        <div className="relative h-4 rounded-[9px] bg-muted overflow-hidden">
          <motion.span
            className="block h-full rounded-[9px]"
            style={{ background: 'linear-gradient(90deg,#e2962f,#f0b452)' }}
            initial={{ width: '0%' }}
            animate={{ width: '86%' }}
            transition={{ duration: 1.4, delay: 0.5, ease: [0.22, 1, 0.36, 1] }}
          />
          <span className="absolute top-[-3px] bottom-[-3px] w-[2px] bg-foreground/60" style={{ left: '72%' }} />
        </div>
        <div className="mt-1.5 flex justify-between text-[11px] text-muted-foreground tabular-nums">
          <span>86% · {t('dashboard.remainingBudget')} <b className="text-foreground">720 zł</b></span>
          <span className="hidden sm:inline">{t('dashboard.paceMarker')}</span>
        </div>

        {/* Kategorie vs poprzedni miesiąc */}
        <div className="mt-5 space-y-2.5">
          {rows.map((r, i) => (
            <div key={r.name} className="flex items-center gap-2.5">
              <span className="h-2.5 w-2.5 rounded-[3px] shrink-0" style={{ backgroundColor: r.color }} />
              <span className="w-[92px] sm:w-[120px] shrink-0 truncate text-xs font-bold">{r.name}</span>
              <span className="flex-1 h-[8px] rounded-[5px] bg-muted overflow-hidden">
                <motion.span
                  className="block h-full rounded-[5px]"
                  style={{ backgroundColor: r.color }}
                  initial={{ width: '0%' }}
                  animate={{ width: `${r.w}%` }}
                  transition={{ duration: 1, delay: 0.9 + i * 0.12, ease: [0.22, 1, 0.36, 1] }}
                />
              </span>
              <span className={`w-[44px] text-right text-[11px] font-extrabold tabular-nums ${r.bad ? 'text-[#b3402c] dark:text-red-400' : 'text-[#1e6b2f] dark:text-emerald-400'}`}>
                {r.delta}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Wjeżdżający paragon — "zeskanowano" */}
      <motion.div
        initial={{ opacity: 0, y: 24, rotate: 4 }}
        animate={{ opacity: 1, y: 0, rotate: 3 }}
        transition={{ duration: 0.7, delay: 1.6, ease: [0.22, 1, 0.36, 1] }}
        className="absolute -bottom-20 -right-2 sm:-right-8 w-[168px] rounded-xl border border-border bg-card shadow-[var(--nb-shadow-lg)] p-3.5"
      >
        <div className="flex items-center gap-2 mb-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Camera className="h-3.5 w-3.5" />
          </span>
          <span className="text-[11px] font-extrabold">Biedronka</span>
        </div>
        <div className="space-y-1 text-[10px] text-muted-foreground tabular-nums">
          <div className="flex justify-between"><span>{pl ? 'Mleko 2%' : 'Milk 2%'}</span><span>4,29</span></div>
          <div className="flex justify-between"><span>{pl ? 'Chleb' : 'Bread'}</span><span>5,80</span></div>
          <div className="flex justify-between"><span>{pl ? 'Masło' : 'Butter'}</span><span>8,99</span></div>
        </div>
        <div className="mt-2 pt-2 border-t border-dashed border-border flex items-center justify-between">
          <span className="inline-flex items-center gap-1 text-[10px] font-extrabold text-[#1e6b2f] dark:text-emerald-400">
            <CheckCircle2 className="h-3 w-3" />
            {pl ? 'Zeskanowano' : 'Scanned'}
          </span>
          <span className="text-[11px] font-extrabold tabular-nums">84,50 zł</span>
        </div>
      </motion.div>
    </div>
  )
}

/* Mała pomarańczowa etykieta sekcji */
function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-block text-[11px] font-extrabold uppercase tracking-[0.14em] text-primary mb-3">
      {children}
    </span>
  )
}

export default function LandingPage() {
  const { t, lang } = useTranslation()

  const personalFeatures = [
    t('landing.personalF1'),
    t('landing.personalF2'),
    t('landing.personalF3'),
    t('landing.personalF4'),
    t('landing.personalF5'),
    t('landing.personalF6'),
  ]

  const businessFeatures = [
    t('landing.businessF1'),
    t('landing.businessF2'),
    t('landing.businessF3'),
    t('landing.businessF4'),
    t('landing.businessF5'),
    t('landing.businessF6'),
  ]

  const features = Array.from({ length: 8 }, (_, i) => ({
    icon: featureMeta[i].icon,
    color: featureMeta[i].color,
    title: t(`landing.feature${i + 1}Title`),
    desc: t(`landing.feature${i + 1}Desc`),
  }))

  const steps = [
    { n: t('landing.step1n'), t: t('landing.step1t'), d: t('landing.step1d') },
    { n: t('landing.step2n'), t: t('landing.step2t'), d: t('landing.step2d') },
    { n: t('landing.step3n'), t: t('landing.step3t'), d: t('landing.step3d') },
  ]

  const benefits = t('landing.benefits').split('|')

  return (
    <div className="relative overflow-x-hidden bg-background paper-grid">

      {/* ── HERO — tekst + żywy dashboard ── */}
      <section className="px-5 sm:px-10 pt-16 pb-20 sm:pt-24 sm:pb-28">
        <div className="mx-auto max-w-6xl grid lg:grid-cols-[1.05fr_1fr] gap-12 lg:gap-8 items-center">
          <div className="text-center lg:text-left">
            <motion.h1
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] as any }}
              className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tighter leading-[1.04] mb-6 [text-wrap:balance]"
            >
              {t('landing.h1')}{' '}
              <span className="text-primary">{t('landing.h1Highlight')}</span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.15 }}
              className="text-base sm:text-lg text-muted-foreground max-w-xl mx-auto lg:mx-0 mb-8 leading-relaxed"
            >
              {t('landing.sub')}
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.3 }}
              className="flex flex-col sm:flex-row gap-3 justify-center lg:justify-start"
            >
              <Button asChild size="lg" className="gap-2">
                <Link href="/login">
                  {t('landing.cta')}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/login?demo=true">{t('landing.ctaDemo')}</Link>
              </Button>
            </motion.div>

            {/* Zalety — spokojna linia tekstu zamiast rzędów pigułek */}
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.55 }}
              className="mt-7 text-xs font-semibold text-muted-foreground flex flex-wrap justify-center lg:justify-start gap-x-4 gap-y-1"
            >
              {benefits.map((b) => (
                <span key={b} className="inline-flex items-center gap-1.5">
                  <Check className="h-3 w-3 text-primary" strokeWidth={3} />
                  {b}
                </span>
              ))}
            </motion.p>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 32 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="pb-20"
          >
            <HeroDashboard />
          </motion.div>
        </div>
      </section>

      {/* ── BANK BADGE ── */}
      <section className="px-5 sm:px-10 pb-16 sm:pb-24">
        <FadeUp className="flex flex-col items-center gap-3">
          <p className="text-[11px] text-muted-foreground font-extrabold uppercase tracking-[0.14em]">
            {t('landing.trustedBy')}
          </p>
          <div className="inline-flex items-center gap-3 rounded-xl border border-border bg-card px-6 py-3 shadow-[var(--nb-shadow-sm)]">
            <Landmark className="h-5 w-5 text-primary" />
            <span className="font-extrabold text-base tracking-tight">PKO BP</span>
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-primary-foreground bg-primary rounded-md px-2 py-0.5">
              API
            </span>
          </div>
        </FadeUp>
      </section>

      {/* ── TWO PRODUCTS ── */}
      <section className="px-5 sm:px-10 pb-20 sm:pb-32">
        <div className="mx-auto max-w-5xl">
          <FadeUp className="text-center mb-12">
            <Eyebrow>{lang === 'pl' ? 'Produkty' : 'Products'}</Eyebrow>
            <h2 className="text-3xl sm:text-4xl font-black tracking-tighter mb-3">
              {t('landing.twoProducts')}
            </h2>
            <p className="text-muted-foreground text-sm sm:text-base max-w-lg mx-auto">
              {t('landing.twoProductsSub')}
            </p>
          </FadeUp>

          <div className="grid md:grid-cols-2 gap-6">
            {/* Personal */}
            <FadeUp delay={1}>
              <div className="h-full rounded-2xl border border-border bg-card p-8 shadow-[var(--nb-shadow)] border-t-4" style={{ borderTopColor: CAT.green }}>
                <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl" style={{ backgroundColor: `${CAT.green}1a`, color: CAT.green }}>
                  <User className="h-5 w-5" />
                </div>
                <h3 className="text-xl font-extrabold mb-1 tracking-tight">{t('landing.personalTitle')}</h3>
                <p className="text-sm text-muted-foreground mb-6">{t('landing.personalSub')}</p>
                <ul className="space-y-2.5 mb-8">
                  {personalFeatures.map((f, i) => {
                    const Icon = personalFeatureIcons[i]
                    return (
                      <li key={f} className="flex items-center gap-3 text-sm font-medium">
                        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                        {f}
                      </li>
                    )
                  })}
                </ul>
                <div className="flex items-baseline gap-2 mb-6">
                  <span className="text-2xl font-extrabold tabular-nums">{t('landing.personalPrice')}</span>
                </div>
                <Button asChild variant="outline" className="w-full gap-2">
                  <Link href="/login">
                    {t('landing.cta')}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </FadeUp>

            {/* Business — Popular */}
            <FadeUp delay={2}>
              <div className="relative h-full rounded-2xl border border-border bg-card p-8 shadow-[var(--nb-shadow-lg)] border-t-4 border-t-primary">
                <div className="absolute -top-3 right-6">
                  <span className="inline-flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-widest bg-primary text-primary-foreground rounded-md px-3 py-1 shadow-[var(--nb-shadow-sm)]">
                    <Star className="h-3 w-3 fill-current" aria-hidden="true" />
                    {lang === 'pl' ? 'Popularne' : 'Popular'}
                  </span>
                </div>
                <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Building2 className="h-5 w-5" />
                </div>
                <h3 className="text-xl font-extrabold mb-1 tracking-tight">{t('landing.businessTitle')}</h3>
                <p className="text-sm text-muted-foreground mb-6">{t('landing.businessSub')}</p>
                <ul className="space-y-2.5 mb-8">
                  {businessFeatures.map((f, i) => {
                    const Icon = businessFeatureIcons[i]
                    return (
                      <li key={f} className="flex items-center gap-3 text-sm font-medium">
                        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                        {f}
                      </li>
                    )
                  })}
                </ul>
                <div className="flex items-baseline gap-2 mb-6">
                  <span className="text-2xl font-extrabold tabular-nums">{t('landing.businessPrice')}</span>
                </div>
                <Button asChild className="w-full gap-2">
                  <Link href="/login">
                    {t('landing.cta')}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </FadeUp>
          </div>
        </div>
      </section>

      {/* ── FEATURES GRID ── */}
      <section id="features" className="px-5 sm:px-10 pb-20 sm:pb-32">
        <div className="mx-auto max-w-6xl">
          <FadeUp className="text-center mb-12">
            <Eyebrow>{lang === 'pl' ? 'Funkcje' : 'Features'}</Eyebrow>
            <h2 className="text-3xl sm:text-4xl font-black tracking-tighter mb-3">{t('landing.featuresTitle')}</h2>
            <p className="text-muted-foreground text-sm sm:text-base max-w-lg mx-auto">{t('landing.featuresSub')}</p>
          </FadeUp>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {features.map((f, i) => (
              <FadeUp key={f.title} delay={i + 1}>
                <div className="h-full rounded-2xl border border-border bg-card p-6 shadow-[var(--nb-shadow-sm)] transition-shadow hover:shadow-[var(--nb-shadow-lg)]">
                  <div
                    className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl"
                    style={{ backgroundColor: `${f.color}1a`, color: f.color }}
                  >
                    <f.icon className="h-4.5 w-4.5" />
                  </div>
                  <h3 className="text-base font-extrabold mb-2 tracking-tight">{f.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
                </div>
              </FadeUp>
            ))}
          </div>
        </div>
      </section>

      {/* ── COMPARISON TABLE ── */}
      <section className="px-5 sm:px-10 pb-20 sm:pb-32">
        <div className="mx-auto max-w-3xl">
          <FadeUp className="text-center mb-12">
            <Eyebrow>{lang === 'pl' ? 'Porównanie' : 'Compare'}</Eyebrow>
            <h2 className="text-3xl sm:text-4xl font-black tracking-tighter mb-3">{t('landing.comparisonTitle')}</h2>
            <p className="text-muted-foreground text-sm sm:text-base max-w-lg mx-auto">{t('landing.comparisonSub')}</p>
          </FadeUp>

          <FadeUp delay={1}>
            <div className="rounded-2xl border border-border bg-card shadow-[var(--nb-shadow)] overflow-hidden">
              <div className="grid grid-cols-[1fr_80px_80px] sm:grid-cols-[1fr_120px_120px] items-center gap-2 px-5 py-3.5 border-b border-border bg-secondary/60">
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-muted-foreground">{t('landing.comparisonFeature')}</span>
                <span className="text-[11px] font-extrabold text-center uppercase tracking-wider" style={{ color: CAT.green }}>{t('landing.comparisonPersonal')}</span>
                <span className="text-[11px] font-extrabold text-center uppercase tracking-wider text-primary">{t('landing.comparisonBusiness')}</span>
              </div>
              {comparisonRows.map((row, i) => (
                <div
                  key={row.key}
                  className={`grid grid-cols-[1fr_80px_80px] sm:grid-cols-[1fr_120px_120px] items-center gap-2 px-5 py-3 ${
                    i < comparisonRows.length - 1 ? 'border-b border-border/50' : ''
                  } ${i % 2 === 1 ? 'bg-muted/30' : ''}`}
                >
                  <span className="text-sm font-medium">{t(row.key)}</span>
                  <span className="flex justify-center">
                    {row.personal ? (
                      <Check className="h-4 w-4" strokeWidth={3} style={{ color: CAT.green }} />
                    ) : (
                      <X className="h-4 w-4 text-muted-foreground/30" />
                    )}
                  </span>
                  <span className="flex justify-center">
                    {row.business ? (
                      <Check className="h-4 w-4 text-primary" strokeWidth={3} />
                    ) : (
                      <X className="h-4 w-4 text-muted-foreground/30" />
                    )}
                  </span>
                </div>
              ))}
            </div>
          </FadeUp>
        </div>
      </section>

      {/* ── HOW IT WORKS — prawdziwa sekwencja, więc numeracja jest zasadna ── */}
      <section id="how" className="px-5 sm:px-10 pb-20 sm:pb-32">
        <div className="mx-auto max-w-4xl">
          <FadeUp className="text-center mb-12">
            <Eyebrow>{lang === 'pl' ? 'Jak to działa' : 'How it works'}</Eyebrow>
            <h2 className="text-3xl sm:text-4xl font-black tracking-tighter">{t('landing.stepsTitle')}</h2>
          </FadeUp>

          <div className="grid sm:grid-cols-3 gap-8 sm:gap-6 relative">
            {/* Linia łącząca kroki na desktopie */}
            <div className="hidden sm:block absolute top-7 left-[16%] right-[16%] border-t-2 border-dashed border-border" aria-hidden="true" />
            {steps.map((s, i) => (
              <FadeUp key={s.n} delay={i + 1}>
                <div className="flex flex-col items-center text-center relative">
                  <div className="relative z-10 mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground text-xl font-extrabold shadow-[var(--nb-shadow)]">
                    {s.n}
                  </div>
                  <h3 className="text-base font-extrabold mb-2 tracking-tight">{s.t}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{s.d}</p>
                </div>
              </FadeUp>
            ))}
          </div>
        </div>
      </section>

      {/* ── FINAL CTA ── */}
      <section className="px-5 sm:px-10 pb-24 sm:pb-40">
        <FadeUp>
          <div className="mx-auto max-w-2xl text-center rounded-2xl border border-border bg-card p-12 sm:p-16 shadow-[var(--nb-shadow-lg)]">
            <div className="mx-auto mb-5 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-[var(--nb-shadow-sm)]">
              <Wallet className="h-6 w-6" />
            </div>
            <h2 className="text-3xl sm:text-4xl font-black tracking-tighter mb-3">{t('landing.ctaTitle')}</h2>
            <p className="text-muted-foreground text-sm mb-8">{t('landing.ctaSub')}</p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button asChild size="lg" className="gap-2">
                <Link href="/login">
                  {t('landing.cta')}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/login?demo=true">{t('landing.ctaDemo')}</Link>
              </Button>
            </div>
          </div>
        </FadeUp>
      </section>
    </div>
  )
}
