'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import { SettingsForm } from "@/components/protected/settings/settings-form"
import { CategoriesManager } from "@/components/protected/settings/categories-manager"
import { useTranslation } from '@/lib/i18n'
import { useProductType } from '@/hooks/use-product-type'
import { FileBarChart2, CreditCard, FileDown, BrainCircuit, ArrowRight } from 'lucide-react'

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4 } },
} as any

function SettingsSkeleton() {
  return (
    <div className="flex flex-col gap-4 sm:gap-6 md:gap-8">
      <div className="space-y-2">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-5 w-72" />
      </div>

      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-4 w-56 mt-1" />
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex flex-wrap gap-4">
            <div className="space-y-2 w-full sm:w-56">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-10 w-full" />
            </div>
            <div className="space-y-2 w-full sm:w-56">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-10 w-full" />
            </div>
          </div>
          <Skeleton className="h-px w-full" />
          <div className="space-y-3">
            <Skeleton className="h-5 w-40" />
            <div className="grid gap-3 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <Skeleton key={i} className="h-20 w-full rounded-lg" />
              ))}
            </div>
          </div>
          <div className="flex justify-end">
            <Skeleton className="h-10 w-32" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-80 mt-1" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-16 w-full rounded-lg" />
          <div className="flex gap-2">
            <Skeleton className="h-10 flex-1" />
            <Skeleton className="h-10 w-10" />
            <Skeleton className="h-10 w-24" />
          </div>
          <Skeleton className="h-48 w-full rounded-lg" />
        </CardContent>
      </Card>
    </div>
  )
}

export default function SettingsPage() {
  const { t } = useTranslation()
  const { isPersonal, isBusiness } = useProductType()
  const [loading, setLoading] = useState(true)
  const [categories, setCategories] = useState<any[]>([])
  const [settings, setSettings] = useState<any>(null)
  const [budgets, setBudgets] = useState<any[]>([])

  useEffect(() => {
    fetch('/api/data/settings')
      .then(r => r.json())
      .then(data => {
        setCategories(data.categories || [])
        setSettings(data.settings || null)
        setBudgets(data.budgets || [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  if (loading) {
    return <SettingsSkeleton />
  }

  const initialCurrency = settings?.currency ?? 'PLN'
  const initialLanguage = settings?.language ?? 'EN'

  const categoryBudgets = categories.map((cat) => {
    const budget = budgets.find((b) => b.categoryId === cat.id)
    return {
      categoryId: cat.id as string,
      categoryName: cat.name as string,
      icon: cat.icon as string | null | undefined,
      amount: budget?.amount ? Number(budget.amount) : 0,
      currency: initialCurrency,
    }
  })

  return (
    <div className="flex flex-col gap-4 sm:gap-6 md:gap-8">
      <motion.div
        variants={fadeUp}
        initial="hidden"
        animate="visible"
        transition={{ delay: 0 }}
      >
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">{t('settings.title')}</h2>
        <p className="text-muted-foreground mt-1">{t('settings.managePreferences')}</p>
      </motion.div>

      <motion.div variants={fadeUp} initial="hidden" animate="visible" transition={{ delay: 0.1 }}>
        <Card>
          <CardHeader>
            <CardTitle>{t('settings.general')}</CardTitle>
            <CardDescription>{t('settings.languageCurrency')}</CardDescription>
          </CardHeader>
          <CardContent>
            <SettingsForm
              initialCurrency={initialCurrency}
              initialLanguage={initialLanguage}
              categoryBudgets={categoryBudgets}
            />
          </CardContent>
        </Card>
      </motion.div>

      <motion.div variants={fadeUp} initial="hidden" animate="visible" transition={{ delay: 0.2 }}>
        <Card>
          <CardHeader>
            <CardTitle>{t('settings.categories')}</CardTitle>
            <CardDescription>{t('settings.categoriesDesc')}</CardDescription>
          </CardHeader>
          <CardContent>
            <CategoriesManager
              initialCategories={categories.map(c => ({
                id: c.id as string,
                name: c.name as string,
                icon: c.icon as string | null,
              }))}
            />
          </CardContent>
        </Card>
      </motion.div>

      {/* Reports */}
      <motion.div variants={fadeUp} initial="hidden" animate="visible" transition={{ delay: 0.3 }}>
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <FileBarChart2 className="h-5 w-5" />
                  <span suppressHydrationWarning>{t('settings.reports')}</span>
                </CardTitle>
                <CardDescription suppressHydrationWarning>{t('settings.reportsDesc')}</CardDescription>
              </div>
              <Button variant="outline" size="sm" asChild>
                <Link href="/reports">
                  <span suppressHydrationWarning>{t('settings.generateReports')}</span>
                  <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
                </Link>
              </Button>
            </div>
          </CardHeader>
        </Card>
      </motion.div>

      {/* Analysis & Insights */}
      <motion.div variants={fadeUp} initial="hidden" animate="visible" transition={{ delay: 0.4 }}>
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <BrainCircuit className="h-5 w-5" />
                  <span suppressHydrationWarning>{t('settings.analysisInsights')}</span>
                </CardTitle>
                <CardDescription suppressHydrationWarning>{t('settings.analysisInsightsDesc')}</CardDescription>
              </div>
              <Button variant="outline" size="sm" asChild>
                <Link href="/analysis">
                  <span suppressHydrationWarning>{t('settings.openAnalysis')}</span>
                  <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
                </Link>
              </Button>
            </div>
          </CardHeader>
        </Card>
      </motion.div>

      {/* Loyalty Cards — Personal only */}
      {isPersonal && (
        <motion.div variants={fadeUp} initial="hidden" animate="visible" transition={{ delay: 0.5 }}>
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <CreditCard className="h-5 w-5" />
                    <span suppressHydrationWarning>{t('settings.loyaltyCards')}</span>
                  </CardTitle>
                  <CardDescription suppressHydrationWarning>{t('settings.loyaltyCardsDesc')}</CardDescription>
                </div>
                <Button variant="outline" size="sm" asChild>
                  <Link href="/loyalty">
                    <span suppressHydrationWarning>{t('settings.manageLoyalty')}</span>
                    <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
                  </Link>
                </Button>
              </div>
            </CardHeader>
          </Card>
        </motion.div>
      )}

      {/* JPK Export — Business only */}
      {isBusiness && (
        <motion.div variants={fadeUp} initial="hidden" animate="visible" transition={{ delay: 0.5 }}>
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <FileDown className="h-5 w-5" />
                    <span suppressHydrationWarning>{t('settings.jpkExport')}</span>
                  </CardTitle>
                  <CardDescription suppressHydrationWarning>{t('settings.jpkExportDesc')}</CardDescription>
                </div>
                <Button variant="outline" size="sm" asChild>
                  <Link href="/vat">
                    <span suppressHydrationWarning>{t('settings.exportJpk')}</span>
                    <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
                  </Link>
                </Button>
              </div>
            </CardHeader>
          </Card>
        </motion.div>
      )}
    </div>
  )
}
