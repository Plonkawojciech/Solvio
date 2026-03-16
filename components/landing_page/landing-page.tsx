'use client'

import Link from 'next/link'
import { useRef } from 'react'
import { motion, useInView } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { useTranslation } from '@/lib/i18n'
import {
  Camera, Sparkles, Wallet,
  ArrowRight, TrendingDown,
  BrainCircuit, FileText, Users,
  CheckCircle2, Building2, User, Landmark,
  Receipt, Calculator, Shield, UserPlus,
  CreditCard, Check, X,
} from 'lucide-react'

function FadeUp({ children, delay = 0, className = '' }: { children: React.ReactNode; delay?: number; className?: string }) {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, margin: '-60px' })
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 28 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.6, delay: delay * 0.1, ease: [0.22, 1, 0.36, 1] as any }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

const personalFeatureIcons = [Camera, Landmark, BrainCircuit, Users, TrendingDown, CreditCard]
const businessFeatureIcons = [Receipt, Calculator, UserPlus, Shield, Landmark, FileText]

const featureIcons = [Camera, Landmark, Calculator, BrainCircuit, FileText, UserPlus, TrendingDown, Users]

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
    icon: featureIcons[i],
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
    <div className="relative overflow-x-hidden">

      {/* ── HERO ── */}
      <section className="relative flex flex-col items-center text-center px-5 sm:px-10 pt-20 pb-16 sm:pt-32 sm:pb-24 overflow-hidden">
        {/* Ambient glow */}
        <motion.div
          className="pointer-events-none absolute -top-32 left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full bg-primary/15 blur-[120px]"
          animate={{ scale: [1, 1.1, 1], opacity: [0.5, 0.7, 0.5] }}
          transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' as any }}
        />
        <motion.div
          className="pointer-events-none absolute top-10 right-0 w-[300px] h-[300px] rounded-full bg-violet-500/10 blur-[80px]"
          animate={{ scale: [1, 1.15, 1] }}
          transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' as any, delay: 2 }}
        />

        {/* Badge */}
        <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5 text-xs sm:text-sm font-medium text-primary mb-8">
            <Sparkles className="h-3.5 w-3.5" />
            {t('landing.badge')}
          </span>
        </motion.div>

        {/* Headline */}
        <motion.h1
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.08, ease: [0.22, 1, 0.36, 1] as any }}
          className="text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-tighter leading-[1.05] max-w-4xl mb-6"
        >
          {t('landing.h1')}{' '}
          <span className="bg-gradient-to-r from-primary via-violet-500 to-primary bg-clip-text text-transparent">
            {t('landing.h1Highlight')}
          </span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="text-base sm:text-xl text-muted-foreground max-w-2xl mb-10 leading-relaxed"
        >
          {t('landing.sub')}
        </motion.p>

        {/* CTAs */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.35 }}
          className="flex flex-col sm:flex-row gap-3"
        >
          <Button asChild size="lg" className="h-12 px-8 text-base font-semibold gap-2">
            <Link href="/login">
              {t('landing.cta')}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="h-12 px-8 text-base">
            <Link href="/login?demo=true">{t('landing.ctaDemo')}</Link>
          </Button>
        </motion.div>

        {/* Trust pills */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="flex flex-wrap justify-center gap-2 mt-8"
        >
          {benefits.map((b) => (
            <span key={b} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/50 border border-border/50 rounded-full px-3 py-1">
              <CheckCircle2 className="h-3 w-3 text-emerald-500" />
              {b}
            </span>
          ))}
        </motion.div>
      </section>

      {/* ── TRUSTED BY / PKO BADGE ── */}
      <section className="px-5 sm:px-10 pb-12 sm:pb-16">
        <FadeUp className="flex flex-col items-center gap-3">
          <p className="text-xs sm:text-sm text-muted-foreground font-medium uppercase tracking-wider">
            {t('landing.trustedBy')}
          </p>
          <div className="inline-flex items-center gap-3 rounded-xl border border-border/60 bg-card/60 px-6 py-3">
            <Landmark className="h-6 w-6 text-primary" />
            <span className="font-bold text-lg tracking-tight">PKO BP</span>
            <span className="text-xs text-muted-foreground bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-full px-2 py-0.5 font-medium">
              API
            </span>
          </div>
        </FadeUp>
      </section>

      {/* ── TWO PRODUCTS ── */}
      <section className="px-5 sm:px-10 pb-20 sm:pb-32">
        <div className="mx-auto max-w-5xl">
          <FadeUp className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-3">
              {t('landing.twoProducts')}
            </h2>
            <p className="text-muted-foreground text-base sm:text-lg max-w-lg mx-auto">
              {t('landing.twoProductsSub')}
            </p>
          </FadeUp>

          <div className="grid md:grid-cols-2 gap-6">
            {/* Personal Card */}
            <FadeUp delay={1}>
              <motion.div
                whileHover={{ y: -4 }}
                transition={{ duration: 0.25 }}
                className="relative h-full rounded-2xl border border-border/60 bg-card/80 p-8 hover:border-primary/40 transition-colors duration-300 overflow-hidden"
              >
                <motion.div
                  className="pointer-events-none absolute -top-20 -right-20 w-40 h-40 rounded-full bg-emerald-500/8 blur-[60px]"
                  animate={{ scale: [1, 1.2, 1] }}
                  transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' as any }}
                />
                <div className="relative">
                  <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                    <User className="h-6 w-6" />
                  </div>
                  <h3 className="text-xl font-bold mb-1">{t('landing.personalTitle')}</h3>
                  <p className="text-sm text-muted-foreground mb-6">{t('landing.personalSub')}</p>
                  <ul className="space-y-3 mb-8">
                    {personalFeatures.map((f, i) => {
                      const Icon = personalFeatureIcons[i]
                      return (
                        <li key={f} className="flex items-center gap-3 text-sm">
                          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shrink-0">
                            <Icon className="h-3.5 w-3.5" />
                          </div>
                          {f}
                        </li>
                      )
                    })}
                  </ul>
                  <div className="flex items-baseline gap-2 mb-6">
                    <span className="text-2xl font-extrabold">{t('landing.personalPrice')}</span>
                  </div>
                  <Button asChild className="w-full h-11 font-semibold gap-2">
                    <Link href="/login">
                      {t('landing.cta')}
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </Button>
                </div>
              </motion.div>
            </FadeUp>

            {/* Business Card */}
            <FadeUp delay={2}>
              <motion.div
                whileHover={{ y: -4 }}
                transition={{ duration: 0.25 }}
                className="relative h-full rounded-2xl border-2 border-primary/40 bg-card/80 p-8 hover:border-primary/60 transition-colors duration-300 overflow-hidden"
              >
                <motion.div
                  className="pointer-events-none absolute -top-20 -left-20 w-40 h-40 rounded-full bg-violet-500/10 blur-[60px]"
                  animate={{ scale: [1, 1.2, 1] }}
                  transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' as any, delay: 1 }}
                />
                {/* Popular badge */}
                <div className="absolute top-4 right-4">
                  <span className="text-[10px] font-bold uppercase tracking-wider bg-primary/10 text-primary rounded-full px-3 py-1">
                    {lang === 'pl' ? 'Popularne' : 'Popular'}
                  </span>
                </div>
                <div className="relative">
                  <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-violet-500/10 text-violet-600 dark:text-violet-400">
                    <Building2 className="h-6 w-6" />
                  </div>
                  <h3 className="text-xl font-bold mb-1">{t('landing.businessTitle')}</h3>
                  <p className="text-sm text-muted-foreground mb-6">{t('landing.businessSub')}</p>
                  <ul className="space-y-3 mb-8">
                    {businessFeatures.map((f, i) => {
                      const Icon = businessFeatureIcons[i]
                      return (
                        <li key={f} className="flex items-center gap-3 text-sm">
                          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-400 shrink-0">
                            <Icon className="h-3.5 w-3.5" />
                          </div>
                          {f}
                        </li>
                      )
                    })}
                  </ul>
                  <div className="flex items-baseline gap-2 mb-6">
                    <span className="text-2xl font-extrabold">{t('landing.businessPrice')}</span>
                  </div>
                  <Button asChild className="w-full h-11 font-semibold gap-2 bg-violet-600 hover:bg-violet-700 text-white">
                    <Link href="/login">
                      {t('landing.cta')}
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </Button>
                </div>
              </motion.div>
            </FadeUp>
          </div>
        </div>
      </section>

      {/* ── FEATURES GRID ── */}
      <section id="features" className="px-5 sm:px-10 pb-20 sm:pb-32">
        <div className="mx-auto max-w-6xl">
          <FadeUp className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-3">{t('landing.featuresTitle')}</h2>
            <p className="text-muted-foreground text-base sm:text-lg max-w-lg mx-auto">{t('landing.featuresSub')}</p>
          </FadeUp>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {features.map((f, i) => (
              <FadeUp key={f.title} delay={i + 1}>
                <div className="group h-full rounded-2xl border border-border/60 bg-card/60 p-6 hover:border-primary/30 hover:bg-card transition-all duration-300">
                  <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <f.icon className="h-5 w-5" />
                  </div>
                  <h3 className="font-semibold text-base mb-2">{f.title}</h3>
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
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-3">{t('landing.comparisonTitle')}</h2>
            <p className="text-muted-foreground text-base sm:text-lg max-w-lg mx-auto">{t('landing.comparisonSub')}</p>
          </FadeUp>

          <FadeUp delay={1}>
            <div className="rounded-2xl border border-border/60 bg-card/60 overflow-hidden">
              {/* Header */}
              <div className="grid grid-cols-[1fr_80px_80px] sm:grid-cols-[1fr_120px_120px] items-center gap-2 px-5 py-4 border-b border-border/40 bg-muted/30">
                <span className="text-sm font-semibold text-muted-foreground">{t('landing.comparisonFeature')}</span>
                <span className="text-sm font-bold text-center text-emerald-600 dark:text-emerald-400">{t('landing.comparisonPersonal')}</span>
                <span className="text-sm font-bold text-center text-violet-600 dark:text-violet-400">{t('landing.comparisonBusiness')}</span>
              </div>
              {/* Rows */}
              {comparisonRows.map((row, i) => (
                <motion.div
                  key={row.key}
                  initial={{ opacity: 0, x: -10 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.03, duration: 0.3 }}
                  className={`grid grid-cols-[1fr_80px_80px] sm:grid-cols-[1fr_120px_120px] items-center gap-2 px-5 py-3 ${
                    i < comparisonRows.length - 1 ? 'border-b border-border/20' : ''
                  } ${i % 2 === 0 ? '' : 'bg-muted/10'}`}
                >
                  <span className="text-sm">{t(row.key)}</span>
                  <span className="flex justify-center">
                    {row.personal ? (
                      <Check className="h-4.5 w-4.5 text-emerald-500" />
                    ) : (
                      <X className="h-4.5 w-4.5 text-muted-foreground/30" />
                    )}
                  </span>
                  <span className="flex justify-center">
                    {row.business ? (
                      <Check className="h-4.5 w-4.5 text-violet-500" />
                    ) : (
                      <X className="h-4.5 w-4.5 text-muted-foreground/30" />
                    )}
                  </span>
                </motion.div>
              ))}
            </div>
          </FadeUp>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section id="how" className="px-5 sm:px-10 pb-20 sm:pb-32">
        <div className="mx-auto max-w-4xl">
          <FadeUp className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">{t('landing.stepsTitle')}</h2>
          </FadeUp>

          <div className="grid sm:grid-cols-3 gap-6 relative">
            {/* Connector line */}
            <motion.div
              initial={{ scaleX: 0 }}
              whileInView={{ scaleX: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.9, delay: 0.3, ease: [0.22, 1, 0.36, 1] as any }}
              className="hidden sm:block absolute top-7 left-[calc(16.67%+1.5rem)] right-[calc(16.67%+1.5rem)] h-px bg-gradient-to-r from-primary/40 via-violet-500/40 to-primary/40 origin-left"
            />
            {steps.map((s, i) => (
              <FadeUp key={s.n} delay={i + 1}>
                <div className="flex flex-col items-center text-center">
                  <motion.div
                    whileHover={{ scale: 1.08 }}
                    className="relative mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-violet-500/20 border-2 border-primary/30 text-2xl font-black text-primary"
                  >
                    {s.n}
                  </motion.div>
                  <h3 className="font-bold text-base mb-2">{s.t}</h3>
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
          <div className="relative mx-auto max-w-2xl text-center overflow-hidden rounded-3xl border border-primary/25 bg-gradient-to-br from-primary/8 via-background to-violet-500/8 p-12 sm:p-16">
            <motion.div
              animate={{ scale: [1, 1.3, 1], opacity: [0.2, 0.45, 0.2] }}
              transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' as any }}
              className="pointer-events-none absolute -top-16 left-1/2 -translate-x-1/2 w-64 h-64 rounded-full bg-primary/20 blur-3xl"
            />
            <div className="relative">
              <Wallet className="h-10 w-10 text-primary mx-auto mb-5" />
              <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-3">{t('landing.ctaTitle')}</h2>
              <p className="text-muted-foreground mb-8">{t('landing.ctaSub')}</p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Button asChild size="lg" className="h-12 px-8 text-base font-semibold gap-2">
                  <Link href="/login">
                    {t('landing.cta')}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline" className="h-12 px-8 text-base">
                  <Link href="/login?demo=true">{t('landing.ctaDemo')}</Link>
                </Button>
              </div>
            </div>
          </div>
        </FadeUp>
      </section>
    </div>
  )
}
