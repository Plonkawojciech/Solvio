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
      initial={{ opacity: 0, y: 20 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.5, delay: delay * 0.1, ease: [0.22, 1, 0.36, 1] as any }}
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
      <section className="relative flex flex-col items-center text-center px-5 sm:px-10 pt-20 pb-16 sm:pt-32 sm:pb-24">
        {/* Badge */}
        <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <span className="inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-xs sm:text-sm font-medium text-muted-foreground mb-8">
            <Sparkles className="h-3.5 w-3.5" />
            {t('landing.badge')}
          </span>
        </motion.div>

        {/* Headline */}
        <motion.h1
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.08, ease: [0.22, 1, 0.36, 1] as any }}
          className="text-4xl sm:text-5xl lg:text-6xl font-semibold tracking-tighter leading-[1.05] max-w-3xl mb-6"
        >
          {t('landing.h1')}{' '}
          <span className="text-muted-foreground">
            {t('landing.h1Highlight')}
          </span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="text-base sm:text-lg text-muted-foreground max-w-2xl mb-10 leading-relaxed"
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
          <Button asChild size="lg" className="h-11 px-8 text-sm font-medium gap-2">
            <Link href="/login">
              {t('landing.cta')}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="h-11 px-8 text-sm">
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
            <span key={b} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground border rounded-full px-3 py-1">
              <CheckCircle2 className="h-3 w-3 text-emerald-500" />
              {b}
            </span>
          ))}
        </motion.div>
      </section>

      {/* ── TRUSTED BY / PKO BADGE ── */}
      <section className="px-5 sm:px-10 pb-12 sm:pb-16">
        <FadeUp className="flex flex-col items-center gap-3">
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
            {t('landing.trustedBy')}
          </p>
          <div className="inline-flex items-center gap-3 rounded-lg border px-6 py-3">
            <Landmark className="h-5 w-5 text-muted-foreground" />
            <span className="font-semibold text-base tracking-tight">PKO BP</span>
            <span className="text-xs text-muted-foreground bg-muted rounded-full px-2 py-0.5 font-medium">
              API
            </span>
          </div>
        </FadeUp>
      </section>

      {/* ── TWO PRODUCTS ── */}
      <section className="px-5 sm:px-10 pb-20 sm:pb-32">
        <div className="mx-auto max-w-5xl">
          <FadeUp className="text-center mb-12">
            <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight mb-3">
              {t('landing.twoProducts')}
            </h2>
            <p className="text-muted-foreground text-sm sm:text-base max-w-lg mx-auto">
              {t('landing.twoProductsSub')}
            </p>
          </FadeUp>

          <div className="grid md:grid-cols-2 gap-4">
            {/* Personal Card */}
            <FadeUp delay={1}>
              <div className="h-full rounded-lg border bg-card p-8">
                <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                  <User className="h-5 w-5 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-semibold mb-1">{t('landing.personalTitle')}</h3>
                <p className="text-sm text-muted-foreground mb-6">{t('landing.personalSub')}</p>
                <ul className="space-y-3 mb-8">
                  {personalFeatures.map((f, i) => {
                    const Icon = personalFeatureIcons[i]
                    return (
                      <li key={f} className="flex items-center gap-3 text-sm">
                        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-muted shrink-0">
                          <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                        </div>
                        {f}
                      </li>
                    )
                  })}
                </ul>
                <div className="flex items-baseline gap-2 mb-6">
                  <span className="text-xl font-semibold tabular-nums">{t('landing.personalPrice')}</span>
                </div>
                <Button asChild className="w-full h-10 font-medium gap-2">
                  <Link href="/login">
                    {t('landing.cta')}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </FadeUp>

            {/* Business Card */}
            <FadeUp delay={2}>
              <div className="relative h-full rounded-lg border-2 border-foreground/20 bg-card p-8">
                {/* Popular badge */}
                <div className="absolute top-4 right-4">
                  <span className="text-[10px] font-medium uppercase tracking-wider bg-muted text-muted-foreground rounded-full px-3 py-1">
                    {lang === 'pl' ? 'Popularne' : 'Popular'}
                  </span>
                </div>
                <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                  <Building2 className="h-5 w-5 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-semibold mb-1">{t('landing.businessTitle')}</h3>
                <p className="text-sm text-muted-foreground mb-6">{t('landing.businessSub')}</p>
                <ul className="space-y-3 mb-8">
                  {businessFeatures.map((f, i) => {
                    const Icon = businessFeatureIcons[i]
                    return (
                      <li key={f} className="flex items-center gap-3 text-sm">
                        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-muted shrink-0">
                          <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                        </div>
                        {f}
                      </li>
                    )
                  })}
                </ul>
                <div className="flex items-baseline gap-2 mb-6">
                  <span className="text-xl font-semibold tabular-nums">{t('landing.businessPrice')}</span>
                </div>
                <Button asChild className="w-full h-10 font-medium gap-2">
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
            <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight mb-3">{t('landing.featuresTitle')}</h2>
            <p className="text-muted-foreground text-sm sm:text-base max-w-lg mx-auto">{t('landing.featuresSub')}</p>
          </FadeUp>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {features.map((f, i) => (
              <FadeUp key={f.title} delay={i + 1}>
                <div className="h-full rounded-lg border bg-card p-6">
                  <div className="mb-4 inline-flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
                    <f.icon className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <h3 className="text-sm font-medium mb-2">{f.title}</h3>
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
            <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight mb-3">{t('landing.comparisonTitle')}</h2>
            <p className="text-muted-foreground text-sm sm:text-base max-w-lg mx-auto">{t('landing.comparisonSub')}</p>
          </FadeUp>

          <FadeUp delay={1}>
            <div className="rounded-lg border overflow-hidden">
              {/* Header */}
              <div className="grid grid-cols-[1fr_80px_80px] sm:grid-cols-[1fr_120px_120px] items-center gap-2 px-5 py-3 border-b bg-muted/50">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{t('landing.comparisonFeature')}</span>
                <span className="text-xs font-medium text-center uppercase tracking-wider">{t('landing.comparisonPersonal')}</span>
                <span className="text-xs font-medium text-center uppercase tracking-wider">{t('landing.comparisonBusiness')}</span>
              </div>
              {/* Rows */}
              {comparisonRows.map((row, i) => (
                <div
                  key={row.key}
                  className={`grid grid-cols-[1fr_80px_80px] sm:grid-cols-[1fr_120px_120px] items-center gap-2 px-5 py-3 ${
                    i < comparisonRows.length - 1 ? 'border-b' : ''
                  }`}
                >
                  <span className="text-sm">{t(row.key)}</span>
                  <span className="flex justify-center">
                    {row.personal ? (
                      <Check className="h-4 w-4 text-foreground" />
                    ) : (
                      <X className="h-4 w-4 text-muted-foreground/30" />
                    )}
                  </span>
                  <span className="flex justify-center">
                    {row.business ? (
                      <Check className="h-4 w-4 text-foreground" />
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

      {/* ── HOW IT WORKS ── */}
      <section id="how" className="px-5 sm:px-10 pb-20 sm:pb-32">
        <div className="mx-auto max-w-4xl">
          <FadeUp className="text-center mb-12">
            <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight">{t('landing.stepsTitle')}</h2>
          </FadeUp>

          <div className="grid sm:grid-cols-3 gap-6 relative">
            {/* Connector line */}
            <div className="hidden sm:block absolute top-6 left-[calc(16.67%+1.5rem)] right-[calc(16.67%+1.5rem)] h-px bg-border" />
            {steps.map((s, i) => (
              <FadeUp key={s.n} delay={i + 1}>
                <div className="flex flex-col items-center text-center">
                  <div className="relative mb-5 flex h-12 w-12 items-center justify-center rounded-full border-2 bg-background text-lg font-semibold">
                    {s.n}
                  </div>
                  <h3 className="text-sm font-medium mb-2">{s.t}</h3>
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
          <div className="mx-auto max-w-2xl text-center rounded-lg border bg-card p-12 sm:p-16">
            <Wallet className="h-8 w-8 text-muted-foreground mx-auto mb-5" />
            <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight mb-3">{t('landing.ctaTitle')}</h2>
            <p className="text-muted-foreground text-sm mb-8">{t('landing.ctaSub')}</p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button asChild size="lg" className="h-11 px-8 text-sm font-medium gap-2">
                <Link href="/login">
                  {t('landing.cta')}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="h-11 px-8 text-sm">
                <Link href="/login?demo=true">{t('landing.ctaDemo')}</Link>
              </Button>
            </div>
          </div>
        </FadeUp>
      </section>
    </div>
  )
}
