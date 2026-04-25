'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Landmark, ShieldCheck, ArrowRight, Loader2, Lock, RefreshCw, Search, ChevronLeft,
} from 'lucide-react'
import { useTranslation } from '@/lib/i18n'
import { toast } from 'sonner'

interface BankInstitution {
  id: string
  name: string
  bic: string
  logo: string
  transactionTotalDays: string
}

const BANK_FEATURES = [
  { key: 'autoImport', icon: RefreshCw },
  { key: 'categorize', icon: ShieldCheck },
  { key: 'realtime', icon: Lock },
] as const

export function ConnectBankSheet({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const [connecting, setConnecting] = useState(false)
  const [institutions, setInstitutions] = useState<BankInstitution[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [selectedBank, setSelectedBank] = useState<BankInstitution | null>(null)

  // Fetch institutions when sheet opens
  useEffect(() => {
    if (!open) {
      setSelectedBank(null)
      setSearch('')
      return
    }

    if (institutions.length > 0) return

    setLoading(true)
    fetch('/api/bank/institutions')
      .then((res) => res.json())
      .then((data) => {
        setInstitutions(data.institutions || [])
      })
      .catch(() => {
        toast.error(t('bank.connectionFailed'))
      })
      .finally(() => setLoading(false))
  }, [open, institutions.length, t])

  const handleConnect = async (institution: BankInstitution) => {
    setConnecting(true)
    try {
      const res = await fetch('/api/bank/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ institutionId: institution.id }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(body?.error || `HTTP ${res.status}`)
      }
      // API returns { link, requisitionId }
      if (body?.link) {
        window.location.href = body.link
      } else {
        toast.success(t('bank.connectionInitiated'))
        onOpenChange(false)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      toast.error(msg.includes('GOCARDLESS') || msg.includes('credentials')
        ? t('bank.apiNotConfigured')
        : t('bank.connectionFailed')
      )
    } finally {
      setConnecting(false)
    }
  }

  const filteredInstitutions = search
    ? institutions.filter((inst) =>
        inst.name.toLowerCase().includes(search.toLowerCase()) ||
        inst.bic.toLowerCase().includes(search.toLowerCase()),
      )
    : institutions

  const featureLabels: Record<string, string> = {
    autoImport: 'bank.featureAutoImport',
    categorize: 'bank.featureCategorize',
    realtime: 'bank.featureRealtime',
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md flex flex-col">
        <SheetHeader className="pb-2">
          <SheetTitle className="flex items-center gap-2" suppressHydrationWarning>
            {selectedBank && (
              <button
                onClick={() => setSelectedBank(null)}
                className="h-6 w-6 rounded-md hover:bg-muted flex items-center justify-center"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
            )}
            <Landmark className="h-5 w-5 text-primary" />
            {selectedBank ? selectedBank.name : t('bank.connectTitle')}
          </SheetTitle>
          <SheetDescription suppressHydrationWarning>
            {selectedBank ? t('bank.confirmConnect') : t('bank.connectDesc')}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          <AnimatePresence mode="wait">
            {!selectedBank ? (
              /* ── Bank Selection ── */
              <motion.div
                key="bank-list"
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -12 }}
                className="space-y-3"
              >
                {/* Search */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder={t('bank.searchBanks')}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-9"
                  />
                </div>

                {/* Loading */}
                {loading && (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                )}

                {/* Bank List */}
                {!loading && (
                  <div className="space-y-1.5 max-h-[50vh] overflow-y-auto">
                    {filteredInstitutions.map((inst, i) => (
                      <motion.button
                        key={inst.id}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.2, delay: Math.min(i * 0.03, 0.3) }}
                        onClick={() => setSelectedBank(inst)}
                        className="w-full flex items-center gap-3 p-3 rounded-xl border hover:bg-muted/50 hover:border-primary/30 transition-all text-left"
                      >
                        {inst.logo ? (
                          <img
                            src={inst.logo}
                            alt={inst.name}
                            className="h-10 w-10 rounded-lg object-contain bg-white p-1 border"
                          />
                        ) : (
                          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                            <Landmark className="h-5 w-5 text-primary" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{inst.name}</p>
                          {inst.bic && (
                            <p className="text-[11px] text-muted-foreground">{inst.bic}</p>
                          )}
                        </div>
                        <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                      </motion.button>
                    ))}

                    {filteredInstitutions.length === 0 && !loading && (
                      <p className="text-center text-sm text-muted-foreground py-8" suppressHydrationWarning>
                        {t('bank.noBanksFound')}
                      </p>
                    )}
                  </div>
                )}
              </motion.div>
            ) : (
              /* ── Confirm Connection ── */
              <motion.div
                key="confirm"
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 12 }}
                className="space-y-6"
              >
                {/* Bank Logo */}
                <div className="flex flex-col items-center gap-3 py-4">
                  {selectedBank.logo ? (
                    <img
                      src={selectedBank.logo}
                      alt={selectedBank.name}
                      className="h-20 w-20 rounded-2xl object-contain bg-white p-2 border shadow-lg"
                    />
                  ) : (
                    <div className="h-20 w-20 rounded-2xl bg-gradient-to-br from-primary/80 to-primary flex items-center justify-center shadow-lg">
                      <Landmark className="h-10 w-10 text-white" />
                    </div>
                  )}
                  <div className="text-center">
                    <h3 className="font-semibold text-lg">{selectedBank.name}</h3>
                    <p className="text-xs text-muted-foreground">Open Banking (PSD2)</p>
                  </div>
                </div>

                {/* Features */}
                <div className="space-y-3">
                  {BANK_FEATURES.map(({ key, icon: Icon }, i) => (
                    <motion.div
                      key={key}
                      initial={{ opacity: 0, x: -12 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.35, delay: 0.1 + i * 0.08 }}
                      className="flex items-center gap-3 p-3 rounded-xl bg-muted/50 border"
                    >
                      <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <Icon className="h-4 w-4 text-primary" />
                      </div>
                      <span className="text-sm font-medium" suppressHydrationWarning>
                        {t(featureLabels[key])}
                      </span>
                    </motion.div>
                  ))}
                </div>

                {/* Security note */}
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: 0.4 }}
                  className="flex items-start gap-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-3"
                >
                  <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-muted-foreground leading-relaxed" suppressHydrationWarning>
                    {t('bank.securityNote')}
                  </p>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Footer — show connect button when bank is selected */}
        {selectedBank && (
          <div className="p-4 border-t space-y-3">
            <Button
              onClick={() => handleConnect(selectedBank)}
              disabled={connecting}
              className="w-full gap-2"
              size="lg"
            >
              {connecting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span suppressHydrationWarning>{t('bank.connecting')}</span>
                </>
              ) : (
                <>
                  <Landmark className="h-4 w-4" />
                  <span suppressHydrationWarning>
                    {t('bank.connectBank').replace('%s', selectedBank.name)}
                  </span>
                  <ArrowRight className="h-4 w-4 ml-auto" />
                </>
              )}
            </Button>
            <p className="text-[10px] text-muted-foreground text-center" suppressHydrationWarning>
              {t('bank.redirectNote')}
            </p>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
