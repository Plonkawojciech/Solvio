'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
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
      <div className="w-full max-w-4xl">
        {/* Header */}
        <div className="text-center mb-8 sm:mb-12">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-lg bg-muted mb-4">
            <Wallet className="h-6 w-6 text-muted-foreground" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight" suppressHydrationWarning>
            {t('onboarding.choose.title')}
          </h1>
          <p className="text-muted-foreground mt-2 text-sm sm:text-base max-w-xl mx-auto" suppressHydrationWarning>
            {t('onboarding.choose.subtitle')}
          </p>
        </div>

        {/* Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 mb-8">
          {/* Personal Card */}
          <button
            type="button"
            onClick={() => setSelected('personal')}
            className={cn(
              'relative w-full text-left rounded-lg border p-6 sm:p-8 transition-colors cursor-pointer',
              selected === 'personal'
                ? 'border-foreground bg-accent/50'
                : 'border-border hover:border-foreground/20'
            )}
          >
            {/* Selected badge */}
            {selected === 'personal' && (
              <div className="absolute top-4 right-4 h-6 w-6 rounded-full bg-foreground flex items-center justify-center">
                <Check className="h-3.5 w-3.5 text-background" />
              </div>
            )}

            {/* Icon */}
            <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center mb-5">
              <Wallet className="h-5 w-5 text-foreground" />
            </div>

            <h2 className="text-lg font-semibold mb-1" suppressHydrationWarning>
              {t('onboarding.personal.title')}
            </h2>
            <p className="text-sm text-muted-foreground mb-5" suppressHydrationWarning>
              {t('onboarding.personal.tagline')}
            </p>

            {/* Features */}
            <div className="space-y-3">
              {personalFeatures.map((feat) => (
                <div
                  key={feat.labelKey}
                  className="flex items-center gap-3"
                >
                  <div className="h-7 w-7 rounded-md bg-muted flex items-center justify-center shrink-0">
                    <feat.icon className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                  <span className="text-sm" suppressHydrationWarning>
                    {t(feat.labelKey)}
                  </span>
                </div>
              ))}
            </div>
          </button>

          {/* Business Card */}
          <button
            type="button"
            onClick={() => setSelected('business')}
            className={cn(
              'relative w-full text-left rounded-lg border p-6 sm:p-8 transition-colors cursor-pointer',
              selected === 'business'
                ? 'border-foreground bg-accent/50'
                : 'border-border hover:border-foreground/20'
            )}
          >
            {/* Selected badge */}
            {selected === 'business' && (
              <div className="absolute top-4 right-4 h-6 w-6 rounded-full bg-foreground flex items-center justify-center">
                <Check className="h-3.5 w-3.5 text-background" />
              </div>
            )}

            {/* Icon */}
            <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center mb-5">
              <Building2 className="h-5 w-5 text-foreground" />
            </div>

            <h2 className="text-lg font-semibold mb-1" suppressHydrationWarning>
              {t('onboarding.business.title')}
            </h2>
            <p className="text-sm text-muted-foreground mb-5" suppressHydrationWarning>
              {t('onboarding.business.tagline')}
            </p>

            {/* Features */}
            <div className="space-y-3">
              {businessFeatures.map((feat) => (
                <div
                  key={feat.labelKey}
                  className="flex items-center gap-3"
                >
                  <div className="h-7 w-7 rounded-md bg-muted flex items-center justify-center shrink-0">
                    <feat.icon className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                  <span className="text-sm" suppressHydrationWarning>
                    {t(feat.labelKey)}
                  </span>
                </div>
              ))}
            </div>
          </button>
        </div>

        {/* Business extra fields */}
        <AnimatePresence>
          {selected === 'business' && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="overflow-hidden mb-8"
            >
              <div className="rounded-lg border p-6">
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
        <div className="flex justify-center">
          <Button
            size="lg"
            disabled={!selected || saving}
            onClick={handleContinue}
            className="min-w-[240px] h-11 text-sm font-medium"
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
        </div>

        {/* Privacy note */}
        <p
          className="text-center text-xs text-muted-foreground mt-6"
          suppressHydrationWarning
        >
          {t('onboarding.privacy')}
        </p>
      </div>
    </main>
  )
}
