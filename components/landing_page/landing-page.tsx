'use client'

import Link from 'next/link'
import { useRef } from 'react'
import { motion, useInView, useScroll, useTransform } from 'framer-motion'
import { Button } from '@/components/ui/button'
import JoinAccessList from './join_access_list'
import { useTranslation } from '@/lib/i18n'
import {
  Camera, Sparkles, BarChart3, Wallet, Globe, Shield,
  Check, ArrowRight, TrendingUp, TrendingDown, Zap,
  Brain, Lightbulb, AlertTriangle, Target, BrainCircuit,
  PiggyBank, ChevronRight,
} from 'lucide-react'

/* ─── Animated Section wrapper ─── */
function FadeUp({ children, delay = 0, className = '' }: { children: React.ReactNode; delay?: number; className?: string }) {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, margin: '-70px' })
  return (
    <motion.div ref={ref} initial={{ opacity: 0, y: 36 }} animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.65, delay: delay * 0.12, ease: [0.22, 1, 0.36, 1] }} className={className}>
      {children}
    </motion.div>
  )
}

/* ─── Stagger container ─── */
const stagger = { visible: { transition: { staggerChildren: 0.09 } }, hidden: {} }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const item = { hidden: { opacity: 0, y: 22 }, visible: { opacity: 1, y: 0, transition: { duration: 0.48, ease: 'easeOut' } } } as any
function Stagger({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, margin: '-60px' })
  return (
    <motion.div ref={ref} variants={stagger} initial="hidden" animate={inView ? 'visible' : 'hidden'} className={className}>
      {children}
    </motion.div>
  )
}

/* ─── Bilingual content ─── */
const content = {
  en: {
    badge: 'AI-Powered Expense Tracking',
    h1a: 'Know exactly where',
    h1b: 'your money goes',
    sub: 'Solvio scans receipts with Azure OCR, categorises every expense using GPT-4, and delivers deep AI insights about your spending — all in one place.',
    social: '500+ users already saving time',
    featuresTitle: 'Everything you need to take control',
    featuresSub: 'Powerful features, zero complexity.',
    features: [
      { icon: Camera, title: 'Receipt Scanning', desc: 'Snap a photo or upload a PDF. Azure OCR extracts every detail instantly.', grad: 'from-blue-500/20 to-cyan-500/20', col: 'text-blue-500' },
      { icon: BrainCircuit, title: 'AI Expense Analysis', desc: 'GPT-4 analyses 90 days of spending, detects anomalies, and recommends ways to save.', grad: 'from-violet-500/20 to-purple-500/20', col: 'text-violet-500', featured: true },
      { icon: BarChart3, title: 'Smart Reports', desc: 'Export beautiful PDF, CSV, or DOCX reports with one click.', grad: 'from-emerald-500/20 to-green-500/20', col: 'text-emerald-500' },
      { icon: Wallet, title: 'Budget Tracking', desc: 'Set monthly budgets per category and see live progress bars.', grad: 'from-orange-500/20 to-amber-500/20', col: 'text-orange-500' },
      { icon: Globe, title: 'Multi-language', desc: 'Full Polish and English support — switch anytime from settings.', grad: 'from-sky-500/20 to-blue-500/20', col: 'text-sky-500' },
      { icon: Shield, title: 'Secure & Private', desc: 'Bank-grade encryption, always private. Your data is always protected.', grad: 'from-rose-500/20 to-pink-500/20', col: 'text-rose-500' },
    ],
    aiTitle: 'AI that actually understands your money',
    aiSub: 'The AI Analysis page gives you a complete picture: spending trends, anomaly detection, personalised recommendations, and monthly predictions.',
    aiPoints: [
      { icon: Brain, text: 'GPT-4 reads 90 days of transactions and identifies patterns' },
      { icon: AlertTriangle, text: 'Anomaly detection flags unusual spikes in spending' },
      { icon: Lightbulb, text: 'Personalised tips with estimated monthly savings' },
      { icon: TrendingUp, text: 'Category trend tracking — increasing, decreasing, or stable' },
      { icon: Target, text: 'Predicted monthly spend based on your history' },
    ],
    howTitle: 'How it works',
    howSub: 'Three steps to financial clarity.',
    steps: [
      { num: '01', title: 'Upload your receipt', desc: 'Take a photo or drag-and-drop a PDF or image file into Solvio.' },
      { num: '02', title: 'AI processes everything', desc: 'GPT-4 reads the receipt, categorises items, and adds them to your history.' },
      { num: '03', title: 'Get deep insights', desc: 'Open AI Analysis for trends, anomalies, recommendations, and predictions.' },
    ],
    stats: [
      { v: '2h', l: 'Saved per week' },
      { v: '99%', l: 'OCR accuracy' },
      { v: '10+', l: 'Expense categories' },
      { v: '3', l: 'Export formats' },
    ],
    statsTitle: 'Built for real savings',
    ctaTitle: 'Ready to take control of your finances?',
    ctaSub: 'Start free. No credit card required.',
  },
  pl: {
    badge: 'Śledzenie wydatków z AI',
    h1a: 'Wiedz dokładnie,',
    h1b: 'gdzie idą Twoje pieniądze',
    sub: 'Solvio skanuje paragony Azure OCR, kategoryzuje każdy wydatek GPT-4 i dostarcza głęboką analizę AI Twoich finansów — wszystko w jednym miejscu.',
    social: 'Ponad 500 użytkowników już oszczędza czas',
    featuresTitle: 'Wszystko, czego potrzebujesz',
    featuresSub: 'Zaawansowane funkcje, zero komplikacji.',
    features: [
      { icon: Camera, title: 'Skanowanie paragonów', desc: 'Zrób zdjęcie lub prześlij PDF. Azure OCR wyciągnie wszystkie dane błyskawicznie.', grad: 'from-blue-500/20 to-cyan-500/20', col: 'text-blue-500' },
      { icon: BrainCircuit, title: 'Analiza AI wydatków', desc: 'GPT-4 analizuje 90 dni wydatków, wykrywa anomalie i rekomenduje jak zaoszczędzić.', grad: 'from-violet-500/20 to-purple-500/20', col: 'text-violet-500', featured: true },
      { icon: BarChart3, title: 'Inteligentne raporty', desc: 'Eksportuj raporty PDF, CSV lub DOCX jednym kliknięciem.', grad: 'from-emerald-500/20 to-green-500/20', col: 'text-emerald-500' },
      { icon: Wallet, title: 'Śledzenie budżetu', desc: 'Ustaw miesięczne budżety per kategoria i obserwuj postęp w czasie rzeczywistym.', grad: 'from-orange-500/20 to-amber-500/20', col: 'text-orange-500' },
      { icon: Globe, title: 'Wielojęzyczność', desc: 'Pełna obsługa polskiego i angielskiego — zmień język w dowolnym momencie.', grad: 'from-sky-500/20 to-blue-500/20', col: 'text-sky-500' },
      { icon: Shield, title: 'Bezpiecznie i prywatnie', desc: 'Szyfrowanie bankowe, zawsze prywatne. Twoje dane są zawsze bezpieczne.', grad: 'from-rose-500/20 to-pink-500/20', col: 'text-rose-500' },
    ],
    aiTitle: 'AI, które naprawdę rozumie Twoje pieniądze',
    aiSub: 'Strona Analizy AI daje Ci pełny obraz: trendy wydatków, wykrywanie anomalii, spersonalizowane rekomendacje i prognozę miesięczną.',
    aiPoints: [
      { icon: Brain, text: 'GPT-4 czyta 90 dni transakcji i identyfikuje wzorce' },
      { icon: AlertTriangle, text: 'Wykrywanie anomalii sygnalizuje nieoczekiwane wzrosty' },
      { icon: Lightbulb, text: 'Spersonalizowane wskazówki z szacowanymi oszczędnościami miesięcznymi' },
      { icon: TrendingUp, text: 'Śledzenie trendów kategorii — rosnące, malejące, stabilne' },
      { icon: Target, text: 'Prognoza miesięczna na podstawie historii' },
    ],
    howTitle: 'Jak to działa',
    howSub: 'Trzy kroki do finansowej przejrzystości.',
    steps: [
      { num: '01', title: 'Prześlij paragon', desc: 'Zrób zdjęcie lub przeciągnij plik PDF do Solvio.' },
      { num: '02', title: 'AI przetworzy wszystko', desc: 'GPT-4 odczyta paragon, skategoryzuje pozycje i doda je do historii.' },
      { num: '03', title: 'Uzyskaj głębokie wnioski', desc: 'Otwórz Analizę AI, aby zobaczyć trendy, anomalie, rekomendacje i prognozy.' },
    ],
    stats: [
      { v: '2h', l: 'Oszczędzone tygodniowo' },
      { v: '99%', l: 'Dokładność OCR' },
      { v: '10+', l: 'Kategorii wydatków' },
      { v: '3', l: 'Formaty eksportu' },
    ],
    statsTitle: 'Zaprojektowane dla realnych oszczędności',
    ctaTitle: 'Gotowy przejąć kontrolę nad finansami?',
    ctaSub: 'Zacznij za darmo. Bez karty kredytowej.',
  },
}

export default function LandingPage() {
  const { lang } = useTranslation()
  const c = lang === 'pl' ? content.pl : content.en

  return (
    <div className="relative overflow-x-hidden">

      {/* ══════════════════════════════════ HERO ══ */}
      <section className="relative flex flex-col items-center justify-center text-center px-5 sm:px-10 pt-24 pb-20 sm:pt-40 sm:pb-28 overflow-hidden min-h-[90vh]">
        {/* Animated ambient blobs */}
        {[
          'pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 w-[700px] h-[700px] rounded-full bg-primary/20 blur-[140px]',
          'pointer-events-none absolute top-20 right-0 sm:right-10 w-[400px] h-[400px] rounded-full bg-violet-500/15 blur-[100px]',
          'pointer-events-none absolute bottom-0 left-0 w-[350px] h-[350px] rounded-full bg-cyan-500/10 blur-[100px]',
        ].map((cls, i) => (
          <motion.div key={i} className={cls}
            animate={{ scale: [1, 1.12 + i * 0.04, 1], opacity: [0.4, 0.65, 0.4] }}
            transition={{ duration: 7 + i * 2, repeat: Infinity, ease: 'easeInOut', delay: i * 2 }}
          />
        ))}

        {/* Badge */}
        <motion.div initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.5 }}>
          <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5 text-xs sm:text-sm font-medium text-primary mb-8">
            <motion.span animate={{ rotate: [0, 15, -10, 0] }} transition={{ duration: 2.5, repeat: Infinity, repeatDelay: 4 }}>
              <Sparkles className="h-3.5 w-3.5" />
            </motion.span>
            {c.badge}
          </span>
        </motion.div>

        {/* Headline */}
        <motion.h1
          initial={{ opacity: 0, y: 32 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
          className="text-5xl sm:text-7xl lg:text-[5.5rem] font-extrabold tracking-tighter leading-[1.0] max-w-5xl mb-6"
        >
          <span className="block">{c.h1a}</span>
          <span className="block bg-gradient-to-r from-primary via-violet-500 to-cyan-400 bg-clip-text text-transparent">
            {c.h1b}
          </span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.25, ease: [0.22, 1, 0.36, 1] }}
          className="text-base sm:text-xl text-muted-foreground max-w-2xl mb-10 leading-relaxed"
        >
          {c.sub}
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="w-full flex flex-col items-center gap-4"
        >
          <JoinAccessList />
          <p className="text-sm text-muted-foreground flex items-center gap-2">
            <motion.span animate={{ scale: [1, 1.25, 1] }} transition={{ duration: 1.8, repeat: Infinity, repeatDelay: 3 }}>
              <Check className="h-4 w-4 text-green-500" />
            </motion.span>
            {c.social}
          </p>
        </motion.div>

        {/* Scroll mouse */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.3 }}
          className="absolute bottom-8 left-1/2 -translate-x-1/2">
          <motion.div animate={{ y: [0, 7, 0] }} transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
            className="h-9 w-5 rounded-full border-2 border-border/50 flex justify-center pt-1.5">
            <motion.div animate={{ y: [0, 5, 0], opacity: [1, 0.3, 1] }} transition={{ duration: 1.6, repeat: Infinity }}
              className="h-1.5 w-1 rounded-full bg-muted-foreground/60" />
          </motion.div>
        </motion.div>
      </section>

      {/* ══════════════════════ DASHBOARD MOCKUP ══ */}
      <section className="px-5 sm:px-10 mb-24 sm:mb-40">
        <FadeUp>
          <div className="relative mx-auto max-w-5xl">
            <div className="pointer-events-none absolute inset-x-20 -bottom-12 h-44 bg-primary/15 blur-3xl rounded-full" />
            <motion.div whileHover={{ y: -4 }} transition={{ duration: 0.3 }}
              className="relative rounded-2xl border border-border/60 bg-card/80 backdrop-blur-md shadow-2xl shadow-black/30 overflow-hidden">
              {/* Browser bar */}
              <div className="flex items-center gap-1.5 px-4 py-3 border-b border-border/50 bg-muted/40">
                {['bg-red-400/80', 'bg-yellow-400/80', 'bg-green-400/80'].map((c, i) => (
                  <motion.span key={i} whileHover={{ scale: 1.4 }} className={`h-3 w-3 rounded-full ${c}`} />
                ))}
                <div className="ml-3 flex-1 rounded-md bg-muted/50 h-5 max-w-xs" />
                <div className="hidden sm:flex items-center gap-1 text-xs text-muted-foreground/60 ml-auto">
                  <span className="h-2 w-2 rounded-full bg-green-400" />
                  solvio.app/dashboard
                </div>
              </div>

              <div className="p-5 sm:p-8">
                {/* Stats row */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
                  {[
                    { l: lang === 'pl' ? 'Wydano' : 'Spent', v: '2 847 zł', col: 'text-primary', bg: 'bg-primary/10' },
                    { l: lang === 'pl' ? 'Transakcje' : 'Transactions', v: '34', col: 'text-foreground', bg: 'bg-muted/40' },
                    { l: lang === 'pl' ? 'Budżet' : 'Budget', v: '72%', col: 'text-emerald-500', bg: 'bg-emerald-500/10' },
                    { l: lang === 'pl' ? 'Paragony' : 'Receipts', v: '18', col: 'text-violet-500', bg: 'bg-violet-500/10' },
                  ].map((s, i) => (
                    <motion.div key={s.l} whileHover={{ scale: 1.03, y: -2 }}
                      initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
                      transition={{ duration: 0.2, delay: i * 0.1 }}
                      className={`rounded-xl border border-border/40 ${s.bg} p-3 sm:p-4`}>
                      <p className="text-xs text-muted-foreground mb-1">{s.l}</p>
                      <p className={`text-xl sm:text-2xl font-bold ${s.col}`}>{s.v}</p>
                    </motion.div>
                  ))}
                </div>

                {/* Chart bars */}
                <motion.div initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }}
                  className="rounded-xl border border-border/40 bg-muted/20 p-4 mb-4">
                  <p className="text-xs text-muted-foreground mb-3">{lang === 'pl' ? 'Wydatki miesięczne' : 'Monthly spending'}</p>
                  <div className="flex items-end gap-1.5 h-20 sm:h-28">
                    {[40, 65, 45, 80, 55, 90, 60, 75, 50, 85, 70, 95].map((h, i) => (
                      <motion.div key={i} initial={{ height: 0 }} whileInView={{ height: `${h}%` }} viewport={{ once: true }}
                        transition={{ delay: 0.3 + i * 0.04, duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
                        whileHover={{ opacity: 0.7 }}
                        className="flex-1 rounded-t-sm bg-gradient-to-t from-primary to-primary/35" />
                    ))}
                  </div>
                </motion.div>

                {/* AI Analysis preview pill */}
                <motion.div whileHover={{ scale: 1.01 }}
                  className="rounded-xl border border-violet-500/30 bg-gradient-to-r from-violet-500/8 to-purple-500/8 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <BrainCircuit className="h-4 w-4 text-violet-500" />
                    <p className="text-xs font-semibold text-violet-500">{lang === 'pl' ? 'Analiza AI' : 'AI Analysis'}</p>
                    <span className="ml-auto text-xs text-emerald-500 font-medium flex items-center gap-1">
                      <PiggyBank className="h-3 w-3" />{lang === 'pl' ? 'Zaoszczędź ~320 zł/mies.' : 'Save ~320 zł/mo'}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {lang === 'pl'
                      ? '💡 Twoje wydatki na transport wzrosły o 34% w zeszłym miesiącu. Rozważ transport publiczny.'
                      : '💡 Your transport spending rose 34% last month. Consider public transit to reduce costs.'}
                  </p>
                </motion.div>
              </div>
            </motion.div>
          </div>
        </FadeUp>
      </section>

      {/* ════════════════════════ AI ANALYSIS SPOTLIGHT ══ */}
      <section id="ai" className="px-5 sm:px-10 mb-24 sm:mb-40">
        <div className="mx-auto max-w-6xl">
          <div className="grid lg:grid-cols-2 gap-10 lg:gap-16 items-center">
            {/* Left: text */}
            <FadeUp delay={0}>
              <div>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-500/30 bg-violet-500/10 px-3 py-1 text-xs font-medium text-violet-500 mb-5">
                  <BrainCircuit className="h-3.5 w-3.5" />
                  {lang === 'pl' ? 'Nowość — Analiza AI' : 'New — AI Analysis'}
                </span>
                <h2 className="text-3xl sm:text-5xl font-extrabold tracking-tight leading-tight mb-5">
                  {c.aiTitle}
                </h2>
                <p className="text-muted-foreground leading-relaxed mb-8">{c.aiSub}</p>
                <ul className="space-y-3">
                  {c.aiPoints.map((pt, i) => (
                    <motion.li key={i} initial={{ opacity: 0, x: -16 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }}
                      transition={{ delay: i * 0.1 + 0.2 }}
                      className="flex items-start gap-3">
                      <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-violet-500/12 text-violet-500 mt-0.5">
                        <pt.icon className="h-3.5 w-3.5" />
                      </div>
                      <span className="text-sm leading-relaxed">{pt.text}</span>
                    </motion.li>
                  ))}
                </ul>
              </div>
            </FadeUp>

            {/* Right: AI mockup card */}
            <FadeUp delay={2}>
              <motion.div whileHover={{ y: -6 }} transition={{ duration: 0.3 }}
                className="relative rounded-2xl border border-violet-500/25 bg-card/80 backdrop-blur-sm p-6 shadow-xl shadow-violet-500/10">
                <div className="pointer-events-none absolute -top-10 -right-10 w-48 h-48 rounded-full bg-violet-500/15 blur-3xl" />

                {/* Summary */}
                <div className="flex items-start gap-3 mb-5 p-4 rounded-xl bg-violet-500/8 border border-violet-500/20">
                  <Brain className="h-5 w-5 text-violet-500 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {lang === 'pl'
                      ? 'W ciągu ostatnich 90 dni wydałeś 6 240 zł. Twoje wydatki na żywność są o 18% wyższe niż poprzedni kwartał.'
                      : 'Over the last 90 days you spent 6 240 zł. Your food spending is 18% higher than last quarter.'}
                  </p>
                </div>

                {/* Insight cards */}
                <div className="space-y-2 mb-5">
                  {[
                    { type: 'warning', ico: '⚠️', t: lang === 'pl' ? 'Rosnące wydatki na transport' : 'Rising transport costs', d: lang === 'pl' ? '+34% w porównaniu do zeszłego miesiąca' : '+34% vs last month' },
                    { type: 'positive', ico: '✅', t: lang === 'pl' ? 'Budżet na rozrywkę pod kontrolą' : 'Entertainment budget on track', d: lang === 'pl' ? 'Jesteś 12% poniżej limitu' : "You're 12% under the limit" },
                    { type: 'info', ico: '💡', t: lang === 'pl' ? 'Wzorzec weekendowy' : 'Weekend pattern detected', d: lang === 'pl' ? '68% wydatków pada w weekend' : '68% of spending happens on weekends' },
                  ].map((ins, i) => (
                    <motion.div key={i} initial={{ opacity: 0, x: 10 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }}
                      transition={{ delay: 0.1 * i + 0.3 }}
                      className={`flex gap-2.5 p-3 rounded-lg text-xs border ${
                        ins.type === 'warning' ? 'bg-orange-500/8 border-orange-500/20' :
                        ins.type === 'positive' ? 'bg-emerald-500/8 border-emerald-500/20' :
                        'bg-blue-500/8 border-blue-500/20'}`}>
                      <span>{ins.ico}</span>
                      <div>
                        <p className="font-semibold mb-0.5">{ins.t}</p>
                        <p className="text-muted-foreground">{ins.d}</p>
                      </div>
                    </motion.div>
                  ))}
                </div>

                {/* Recommendation */}
                <div className="flex items-center gap-3 p-3 rounded-xl border border-emerald-500/25 bg-emerald-500/8">
                  <PiggyBank className="h-5 w-5 text-emerald-500 flex-shrink-0" />
                  <div className="text-xs">
                    <p className="font-semibold text-emerald-600 dark:text-emerald-400 mb-0.5">
                      {lang === 'pl' ? 'Możliwa oszczędność: 320 zł/mies.' : 'Potential saving: 320 zł/month'}
                    </p>
                    <p className="text-muted-foreground">
                      {lang === 'pl' ? 'Ogranicz jedzenie na mieście do 3x/tydzień' : 'Limit dining out to 3× per week'}
                    </p>
                  </div>
                </div>
              </motion.div>
            </FadeUp>
          </div>
        </div>
      </section>

      {/* ════════════════════════════ FEATURES ══ */}
      <section id="features" className="px-5 sm:px-10 mb-24 sm:mb-40">
        <div className="mx-auto max-w-6xl">
          <FadeUp className="text-center mb-14">
            <h2 className="text-3xl sm:text-5xl font-extrabold tracking-tight mb-4">{c.featuresTitle}</h2>
            <p className="text-muted-foreground text-lg max-w-xl mx-auto">{c.featuresSub}</p>
          </FadeUp>

          <Stagger className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {c.features.map((f) => (
              <motion.div key={f.title} variants={item} whileHover={{ y: -6, scale: 1.02 }}
                transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                className={`group relative rounded-2xl border p-6 overflow-hidden cursor-default ${
                  (f as any).featured
                    ? 'border-violet-500/40 bg-gradient-to-br from-violet-500/8 to-purple-500/5 shadow-lg shadow-violet-500/10'
                    : 'border-border/60 bg-card/60 backdrop-blur-sm'
                }`}>
                {(f as any).featured && (
                  <span className="absolute top-3 right-3 text-[10px] font-semibold uppercase tracking-wide text-violet-500 bg-violet-500/12 border border-violet-500/25 rounded-full px-2 py-0.5">
                    {lang === 'pl' ? 'Nowość' : 'New'}
                  </span>
                )}
                <div className={`absolute inset-0 bg-gradient-to-br ${f.grad} opacity-0 group-hover:opacity-100 transition-opacity duration-500`} />
                <motion.div whileHover={{ rotate: [-5, 5, 0] }} transition={{ duration: 0.4 }}
                  className={`relative mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br ${f.grad} ${f.col}`}>
                  <f.icon className="h-5 w-5" />
                </motion.div>
                <h3 className="relative font-semibold text-base mb-2">{f.title}</h3>
                <p className="relative text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
              </motion.div>
            ))}
          </Stagger>
        </div>
      </section>

      {/* ══════════════════════ HOW IT WORKS ══ */}
      <section id="how" className="px-5 sm:px-10 mb-24 sm:mb-40">
        <div className="mx-auto max-w-5xl">
          <FadeUp className="text-center mb-16">
            <h2 className="text-3xl sm:text-5xl font-extrabold tracking-tight mb-4">{c.howTitle}</h2>
            <p className="text-muted-foreground text-lg max-w-xl mx-auto">{c.howSub}</p>
          </FadeUp>
          <div className="grid sm:grid-cols-3 gap-10 relative">
            <motion.div initial={{ scaleX: 0 }} whileInView={{ scaleX: 1 }} viewport={{ once: true }}
              transition={{ duration: 1, delay: 0.5, ease: [0.22, 1, 0.36, 1] }}
              className="hidden sm:block absolute top-10 left-[calc(16.67%+2.5rem)] right-[calc(16.67%+2.5rem)] h-px bg-gradient-to-r from-primary/60 via-violet-500/60 to-cyan-500/60 origin-left" />
            {c.steps.map((s, i) => (
              <motion.div key={s.num} initial={{ opacity: 0, y: 36 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
                transition={{ delay: i * 0.2 + 0.2, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                className="flex flex-col items-center text-center">
                <motion.div whileHover={{ scale: 1.12, rotate: 5 }} transition={{ type: 'spring', stiffness: 280 }}
                  className="relative mb-6 flex h-20 w-20 items-center justify-center">
                  <motion.div animate={{ rotate: 360 }} transition={{ duration: 22, repeat: Infinity, ease: 'linear' }}
                    className="absolute inset-0 rounded-full border-2 border-dashed border-primary/30" />
                  <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-violet-500/20 border border-primary/40">
                    <span className="text-2xl font-black text-primary">{s.num}</span>
                  </div>
                </motion.div>
                <h3 className="font-bold text-lg mb-2">{s.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed max-w-xs">{s.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════ STATS ══ */}
      <section className="px-5 sm:px-10 mb-24 sm:mb-40">
        <FadeUp>
          <div className="relative overflow-hidden mx-auto max-w-5xl rounded-3xl border border-primary/25 bg-gradient-to-br from-primary/8 via-background to-violet-500/8 p-10 sm:p-16">
            {[
              'pointer-events-none absolute -top-16 -right-16 w-56 h-56 rounded-full bg-primary/15 blur-3xl',
              'pointer-events-none absolute -bottom-16 -left-16 w-56 h-56 rounded-full bg-violet-500/15 blur-3xl',
            ].map((cls, i) => (
              <motion.div key={i} className={cls}
                animate={{ x: i === 0 ? [0, 20, 0] : [0, -20, 0], y: i === 0 ? [0, -15, 0] : [0, 15, 0] }}
                transition={{ duration: 8 + i * 2, repeat: Infinity, ease: 'easeInOut', delay: i * 3 }} />
            ))}
            <h2 className="relative text-center text-2xl sm:text-4xl font-extrabold tracking-tight mb-12">{c.statsTitle}</h2>
            <div className="relative grid grid-cols-2 sm:grid-cols-4 gap-8 text-center">
              {c.stats.map((s, i) => (
                <motion.div key={s.l} initial={{ opacity: 0, scale: 0.8 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }}
                  transition={{ delay: i * 0.12, duration: 0.5 }} whileHover={{ scale: 1.08 }}>
                  <p className="text-4xl sm:text-5xl font-black text-primary mb-2">{s.v}</p>
                  <p className="text-sm text-muted-foreground">{s.l}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </FadeUp>
      </section>

      {/* ══════════════════════ FINAL CTA ══ */}
      <section className="px-5 sm:px-10 pb-24 sm:pb-40">
        <FadeUp>
          <div className="relative mx-auto max-w-3xl text-center overflow-hidden rounded-3xl border border-primary/30 bg-gradient-to-br from-primary/10 via-background to-violet-500/10 p-12 sm:p-20">
            <motion.div animate={{ scale: [1, 1.35, 1], opacity: [0.25, 0.55, 0.25] }}
              transition={{ duration: 4.5, repeat: Infinity, ease: 'easeInOut' }}
              className="pointer-events-none absolute -top-20 left-1/2 -translate-x-1/2 w-80 h-80 rounded-full bg-primary/20 blur-3xl" />

            <motion.span initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
              transition={{ delay: 0.1 }}
              className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5 text-xs sm:text-sm font-medium text-primary mb-6">
              <Zap className="h-3.5 w-3.5" />
              {lang === 'pl' ? 'Gotowy na start?' : 'Ready to start?'}
            </motion.span>

            <motion.h2 initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
              transition={{ delay: 0.2 }}
              className="relative text-3xl sm:text-5xl font-extrabold tracking-tight mb-4">{c.ctaTitle}</motion.h2>

            <motion.p initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
              transition={{ delay: 0.3 }}
              className="relative text-muted-foreground mb-10 text-lg">{c.ctaSub}</motion.p>

            <motion.div initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
              transition={{ delay: 0.4 }} className="relative flex flex-col items-center">
              <div className="w-full max-w-sm">
                <JoinAccessList />
              </div>
              <p className="mt-4 text-xs text-muted-foreground flex items-center gap-1.5">
                <Check className="h-3.5 w-3.5 text-green-500" />
                {lang === 'pl' ? 'Bez karty kredytowej' : 'No credit card required'}
              </p>
            </motion.div>
          </div>
        </FadeUp>
      </section>
    </div>
  )
}
