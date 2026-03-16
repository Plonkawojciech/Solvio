'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Wallet,
  Building2,
  Check,
  ScanLine,
  Landmark,
  Lightbulb,
  Users,
  Tag,
  FileText,
  Receipt,
  FileUp,
  UserCog,
  ShieldCheck,
  ArrowRight,
  Loader2,
  type LucideIcon,
} from 'lucide-react'
import { useTranslation } from '@/lib/i18n'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import type { ProductType } from '@/lib/product-type'

interface FeatureItem {
  icon: LucideIcon
  labelKey: string
}

const personalFeatures: FeatureItem[] = [
  { icon: ScanLine, labelKey: 'onboarding.personal.feature1' },
  { icon: Landmark, labelKey: 'onboarding.personal.feature2' },
  { icon: Lightbulb, labelKey: 'onboarding.personal.feature3' },
  { icon: Users, labelKey: 'onboarding.personal.feature4' },
  { icon: Tag, labelKey: 'onboarding.personal.feature5' },
]

const businessFeatures: FeatureItem[] = [
  { icon: FileText, labelKey: 'onboarding.business.feature1' },
  { icon: Receipt, labelKey: 'onboarding.business.feature2' },
  { icon: FileUp, labelKey: 'onboarding.business.feature3' },
  { icon: UserCog, labelKey: 'onboarding.business.feature4' },
  { icon: ShieldCheck, labelKey: 'onboarding.business.feature5' },
]

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.2,
    },
  },
}

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] as any },
  },
}

const featureVariants = {
  hidden: { opacity: 0, x: -10 },
  visible: (i: number) => ({
    opacity: 1,
    x: 0,
    transition: { delay: 0.4 + i * 0.08, duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] as any },
  }),
}

export function OnboardingClient() {
  const { t } = useTranslation()
  const router = useRouter()
  const [selected, setSelected] = useState<ProductType | null>(null)
  const [companyName, setCompanyName] = useState('')
  const [nip, setNip] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleContinue() {
    if (!selected) return
    setSaving(true)

    try {
      const res = await fetch('/api/data/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productType: selected,
          ...(selected === 'business' ? { companyName, nip } : {}),
        }),
      })

      if (!res.ok) throw new Error('Failed')

      router.push('/dashboard')
      router.refresh()
    } catch {
      setSaving(false)
    }
  }

  return (
    <main className="min-h-[100svh] bg-background text-foreground flex items-center justify-center p-4 sm:p-6 md:p-8">
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="w-full max-w-4xl"
      >
        {/* Header */}
        <motion.div variants={itemVariants} className="text-center mb-8 sm:mb-12">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 mb-4">
            <Wallet className="h-7 w-7 text-primary" />
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight" suppressHydrationWarning>
            {t('onboarding.choose.title')}
          </h1>
          <p className="text-muted-foreground mt-2 text-base sm:text-lg max-w-xl mx-auto" suppressHydrationWarning>
            {t('onboarding.choose.subtitle')}
          </p>
        </motion.div>

        {/* Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 mb-8">
          {/* Personal Card */}
          <motion.div variants={itemVariants}>
            <button
              type="button"
              onClick={() => setSelected('personal')}
              className={cn(
                'relative w-full text-left rounded-2xl border-2 p-6 sm:p-8 transition-all duration-300 cursor-pointer group',
                'hover:shadow-lg hover:shadow-emerald-500/5',
                selected === 'personal'
                  ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20 shadow-lg shadow-emerald-500/10'
                  : 'border-border hover:border-emerald-300 dark:hover:border-emerald-700'
              )}
            >
              {/* Selected badge */}
              <AnimatePresence>
                {selected === 'personal' && (
                  <motion.div
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0, opacity: 0 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                    className="absolute top-4 right-4 h-7 w-7 rounded-full bg-emerald-500 flex items-center justify-center"
                  >
                    <Check className="h-4 w-4 text-white" />
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Icon + gradient */}
              <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center mb-5 shadow-md shadow-emerald-500/20">
                <Wallet className="h-6 w-6 text-white" />
              </div>

              <h2 className="text-xl font-bold mb-1" suppressHydrationWarning>
                {t('onboarding.personal.title')}
              </h2>
              <p className="text-sm text-muted-foreground mb-5" suppressHydrationWarning>
                {t('onboarding.personal.tagline')}
              </p>

              {/* Features */}
              <div className="space-y-3">
                {personalFeatures.map((feat, i) => (
                  <motion.div
                    key={feat.labelKey}
                    custom={i}
                    variants={featureVariants}
                    initial="hidden"
                    animate="visible"
                    className="flex items-center gap-3"
                  >
                    <div className="h-8 w-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center shrink-0">
                      <feat.icon className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <span className="text-sm font-medium" suppressHydrationWarning>
                      {t(feat.labelKey)}
                    </span>
                  </motion.div>
                ))}
              </div>
            </button>
          </motion.div>

          {/* Business Card */}
          <motion.div variants={itemVariants}>
            <button
              type="button"
              onClick={() => setSelected('business')}
              className={cn(
                'relative w-full text-left rounded-2xl border-2 p-6 sm:p-8 transition-all duration-300 cursor-pointer group',
                'hover:shadow-lg hover:shadow-blue-500/5',
                selected === 'business'
                  ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/20 shadow-lg shadow-blue-500/10'
                  : 'border-border hover:border-blue-300 dark:hover:border-blue-700'
              )}
            >
              {/* Selected badge */}
              <AnimatePresence>
                {selected === 'business' && (
                  <motion.div
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0, opacity: 0 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                    className="absolute top-4 right-4 h-7 w-7 rounded-full bg-blue-500 flex items-center justify-center"
                  >
                    <Check className="h-4 w-4 text-white" />
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Icon + gradient */}
              <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center mb-5 shadow-md shadow-blue-500/20">
                <Building2 className="h-6 w-6 text-white" />
              </div>

              <h2 className="text-xl font-bold mb-1" suppressHydrationWarning>
                {t('onboarding.business.title')}
              </h2>
              <p className="text-sm text-muted-foreground mb-5" suppressHydrationWarning>
                {t('onboarding.business.tagline')}
              </p>

              {/* Features */}
              <div className="space-y-3">
                {businessFeatures.map((feat, i) => (
                  <motion.div
                    key={feat.labelKey}
                    custom={i}
                    variants={featureVariants}
                    initial="hidden"
                    animate="visible"
                    className="flex items-center gap-3"
                  >
                    <div className="h-8 w-8 rounded-lg bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center shrink-0">
                      <feat.icon className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                    </div>
                    <span className="text-sm font-medium" suppressHydrationWarning>
                      {t(feat.labelKey)}
                    </span>
                  </motion.div>
                ))}
              </div>
            </button>
          </motion.div>
        </div>

        {/* Business extra fields */}
        <AnimatePresence>
          {selected === 'business' && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] as any }}
              className="overflow-hidden mb-8"
            >
              <div className="rounded-2xl border border-blue-200 dark:border-blue-800 bg-blue-50/30 dark:bg-blue-950/10 p-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="companyName" suppressHydrationWarning>
                      {t('onboarding.companyName')}
                    </Label>
                    <Input
                      id="companyName"
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      placeholder={t('onboarding.companyNamePlaceholder')}
                      className="bg-background"
                      suppressHydrationWarning
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="nip" suppressHydrationWarning>
                      {t('onboarding.nip')}
                    </Label>
                    <Input
                      id="nip"
                      value={nip}
                      onChange={(e) => setNip(e.target.value.replace(/\D/g, '').slice(0, 10))}
                      placeholder={t('onboarding.nipPlaceholder')}
                      className="bg-background"
                      maxLength={10}
                      inputMode="numeric"
                      suppressHydrationWarning
                    />
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Continue button */}
        <motion.div variants={itemVariants} className="flex justify-center">
          <Button
            size="lg"
            disabled={!selected || saving}
            onClick={handleContinue}
            className={cn(
              'min-w-[240px] h-12 text-base font-semibold rounded-xl transition-all duration-300',
              selected === 'personal' && 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-500/25',
              selected === 'business' && 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-500/25',
              !selected && 'opacity-50',
            )}
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                <span suppressHydrationWarning>{t('onboarding.saving')}</span>
              </>
            ) : (
              <>
                <span suppressHydrationWarning>
                  {selected === 'business'
                    ? t('onboarding.continueBusiness')
                    : selected === 'personal'
                      ? t('onboarding.continuePersonal')
                      : t('onboarding.continue')}
                </span>
                <ArrowRight className="h-4 w-4 ml-2" />
              </>
            )}
          </Button>
        </motion.div>

        {/* Privacy note */}
        <motion.p
          variants={itemVariants}
          className="text-center text-xs text-muted-foreground mt-6"
          suppressHydrationWarning
        >
          {t('onboarding.privacy')}
        </motion.p>
      </motion.div>
    </main>
  )
}
