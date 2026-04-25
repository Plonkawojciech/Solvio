'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import dynamic from 'next/dynamic'
import { useTranslation } from '@/lib/i18n'

/* Heavy form components — lazy-loaded to reduce initial settings bundle */
const SettingsForm = dynamic(() => import("@/components/protected/settings/settings-form").then(m => ({ default: m.SettingsForm })), { ssr: false })
const CategoriesManager = dynamic(() => import("@/components/protected/settings/categories-manager").then(m => ({ default: m.CategoriesManager })), { ssr: false })
import { useProductType } from '@/hooks/use-product-type'
import { FileBarChart2, CreditCard, FileDown, BrainCircuit, ArrowRight, Download, Loader2, Tag, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4 } },
// eslint-disable-next-line @typescript-eslint/no-explicit-any
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

interface MerchantRule {
  id: string
  vendor: string
  categoryId: string
  count: number
}

export default function SettingsPage() {
  const { t } = useTranslation()
  const { isPersonal, isBusiness } = useProductType()
  const [loading, setLoading] = useState(true)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [categories, setCategories] = useState<any[]>([])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [settings, setSettings] = useState<any>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [budgets, setBudgets] = useState<any[]>([])
  const [exportingData, setExportingData] = useState(false)
  const [merchantRules, setMerchantRules] = useState<MerchantRule[]>([])
  const [deletingRule, setDeletingRule] = useState<string | null>(null)
  const [ruleToDelete, setRuleToDelete] = useState<string | null>(null)

  async function handleExportData() {
    setExportingData(true)
    try {
      const res = await fetch('/api/personal/export-data')
      if (!res.ok) throw new Error('Export failed')
      const blob = await res.blob()
      const filename = `solvio-export-${new Date().toISOString().slice(0, 10)}.json`
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast.success(t('settings.exportSuccess'), { description: filename })
    } catch {
      toast.error(t('settings.exportFailed'))
    } finally {
      setExportingData(false)
    }
  }

  async function handleDeleteRule(vendor: string) {
    setDeletingRule(vendor)
    try {
      const res = await fetch('/api/personal/merchant-rules', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vendor }),
      })
      if (!res.ok) throw new Error('Delete failed')
      setMerchantRules(prev => prev.filter(r => r.vendor !== vendor))
      toast.success(t('settings.ruleDeleted'))
      setRuleToDelete(null)
    } catch {
      toast.error(t('settings.ruleDeleteFailed'))
    } finally {
      setDeletingRule(null)
    }
  }

  useEffect(() => {
    Promise.all([
      fetch('/api/data/settings').then(r => r.json()),
      fetch('/api/personal/merchant-rules').then(r => r.json()).catch(() => ({ rules: [] })),
    ])
      .then(([data, rulesData]) => {
        setCategories(data.categories || [])
        setSettings(data.settings || null)
        setBudgets(data.budgets || [])
        setMerchantRules(rulesData.rules || [])
        setLoading(false)
      })
      .catch((error) => {
        console.error('Failed to load settings:', error)
        toast.error(t('settings.loadFailed'))
        setLoading(false)
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
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

      {/* Merchant Rules — Personal only */}
      {isPersonal && (
        <motion.div variants={fadeUp} initial="hidden" animate="visible" transition={{ delay: 0.55 }}>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Tag className="h-5 w-5" />
                <span suppressHydrationWarning>{t('settings.merchantRules')}</span>
              </CardTitle>
              <CardDescription suppressHydrationWarning>{t('settings.merchantRulesDesc')}</CardDescription>
            </CardHeader>
            <CardContent>
              {merchantRules.length === 0 ? (
                <p className="text-sm text-muted-foreground" suppressHydrationWarning>
                  {t('settings.noRules')}
                </p>
              ) : (
                <div className="divide-y">
                  {merchantRules.slice(0, 10).map((rule) => {
                    const cat = categories.find((c) => c.id === rule.categoryId)
                    return (
                      <div key={rule.vendor} className="flex items-center justify-between py-2.5 gap-3">
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-medium capitalize">{rule.vendor}</span>
                          <span className="text-muted-foreground mx-1.5">→</span>
                          <span className="text-sm text-muted-foreground">
                            {cat ? (cat.icon ? `${cat.icon} ${cat.name}` : cat.name) : rule.categoryId}
                          </span>
                          <span className="ml-2 text-xs text-muted-foreground/60">
                            ({rule.count}x)
                          </span>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="shrink-0 text-muted-foreground hover:bg-destructive hover:text-destructive-foreground"
                          onClick={() => setRuleToDelete(rule.vendor)}
                          disabled={deletingRule === rule.vendor}
                          aria-label={`${t('settings.clearRule')}: ${rule.vendor}`}
                        >
                          {deletingRule === rule.vendor
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            : <Trash2 className="h-3.5 w-3.5" />
                          }
                        </Button>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      )}

      <ConfirmDialog
        open={ruleToDelete !== null}
        onOpenChange={(open) => !open && !deletingRule && setRuleToDelete(null)}
        title={t('settings.ruleDeleteTitle')}
        description={ruleToDelete ? t('settings.ruleDeleteDesc').replace('{vendor}', ruleToDelete) : ''}
        confirmLabel={t('common.delete')}
        cancelLabel={t('common.cancel')}
        destructive
        loading={deletingRule !== null}
        onConfirm={() => { if (ruleToDelete) handleDeleteRule(ruleToDelete) }}
      />

      {/* Data Export / GDPR */}
      <motion.div variants={fadeUp} initial="hidden" animate="visible" transition={{ delay: 0.6 }}>
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Download className="h-5 w-5" />
                  <span suppressHydrationWarning>{t('settings.exportData') || 'Export My Data'}</span>
                </CardTitle>
                <CardDescription suppressHydrationWarning>
                  {t('settings.exportDataDesc') || 'Download all your expenses, receipts, and settings as a JSON file.'}
                </CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={handleExportData} disabled={exportingData}>
                {exportingData
                  ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                  : <Download className="h-4 w-4 mr-1.5" />
                }
                <span suppressHydrationWarning>{t('settings.downloadJson') || 'Download JSON'}</span>
              </Button>
            </div>
          </CardHeader>
        </Card>
      </motion.div>
    </div>
  )
}
