'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Landmark, ShieldCheck, ArrowRight, Loader2, Lock, RefreshCw } from 'lucide-react'
import { useTranslation } from '@/lib/i18n'
import { toast } from 'sonner'

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
  const { t, lang } = useTranslation()
  const [connecting, setConnecting] = useState(false)

  const handleConnect = async () => {
    setConnecting(true)
    try {
      const res = await fetch('/api/bank/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'pko' }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.error || `HTTP ${res.status}`)
      }
      const { url } = await res.json()
      if (url) {
        window.location.href = url
      } else {
        toast.success(t('bank.connectionInitiated'))
        onOpenChange(false)
      }
    } catch (err) {
      toast.error(t('bank.connectionFailed'))
    } finally {
      setConnecting(false)
    }
  }

  const isPolish = lang === 'pl'

  const featureLabels: Record<string, { pl: string; en: string }> = {
    autoImport: {
      pl: 'Automatyczny import transakcji',
      en: 'Automatic transaction import',
    },
    categorize: {
      pl: 'AI kategoryzacja wydatków',
      en: 'AI expense categorization',
    },
    realtime: {
      pl: 'Bezpieczne połączenie PSD2',
      en: 'Secure PSD2 connection',
    },
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader className="pb-2">
          <SheetTitle className="flex items-center gap-2" suppressHydrationWarning>
            <Landmark className="h-5 w-5 text-primary" />
            {t('bank.connectTitle')}
          </SheetTitle>
          <SheetDescription suppressHydrationWarning>
            {t('bank.connectDesc')}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6">
          {/* Bank Logo */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4 }}
            className="flex flex-col items-center gap-3 py-6"
          >
            <div className="h-20 w-20 rounded-2xl bg-gradient-to-br from-blue-600 to-blue-800 flex items-center justify-center shadow-lg">
              <span className="text-white text-2xl font-bold">PKO</span>
            </div>
            <div className="text-center">
              <h3 className="font-semibold text-lg">PKO Bank Polski</h3>
              <p className="text-xs text-muted-foreground">PSD2 Open Banking API</p>
            </div>
          </motion.div>

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
                <span className="text-sm font-medium">
                  {isPolish ? featureLabels[key].pl : featureLabels[key].en}
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
        </div>

        {/* Footer */}
        <div className="p-4 border-t space-y-3">
          <Button
            onClick={handleConnect}
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
                <span suppressHydrationWarning>{t('bank.connectPKO')}</span>
                <ArrowRight className="h-4 w-4 ml-auto" />
              </>
            )}
          </Button>
          <p className="text-[10px] text-muted-foreground text-center" suppressHydrationWarning>
            {t('bank.redirectNote')}
          </p>
        </div>
      </SheetContent>
    </Sheet>
  )
}
