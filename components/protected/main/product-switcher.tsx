'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useProductType } from '@/hooks/use-product-type'
import { useTranslation } from '@/lib/i18n'
import { Wallet, Building2, ArrowLeftRight, Loader2, Check } from 'lucide-react'
import { toast } from 'sonner'

export function ProductSwitcher() {
  const { isPersonal } = useProductType()
  const { t } = useTranslation()
  const [switching, setSwitching] = useState(false)
  const [expanded, setExpanded] = useState(false)

  const handleSwitch = async () => {
    const newType = isPersonal ? 'business' : 'personal'
    setSwitching(true)
    try {
      const res = await fetch('/api/data/switch-product', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productType: newType }),
      })
      if (!res.ok) throw new Error('Failed to switch')
      toast.success(
        isPersonal ? t('product.switchedToBusiness') : t('product.switchedToPersonal'),
        { description: t('product.switchedDesc') }
      )
      // Hard refresh to re-fetch productType from server
      window.location.href = '/dashboard'
    } catch {
      toast.error(t('product.switchFailed'))
      setSwitching(false)
    }
  }

  return (
    <div className="w-full">
      {/* Current product indicator — clickable to expand */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-muted/70 transition-colors text-left"
      >
        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
          isPersonal
            ? 'bg-emerald-100 dark:bg-emerald-900/30'
            : 'bg-blue-100 dark:bg-blue-900/30'
        }`}>
          {isPersonal
            ? <Wallet className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            : <Building2 className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          }
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold truncate">
            {isPersonal ? t('product.personal') : t('product.business')}
          </p>
          <p className="text-[10px] text-muted-foreground truncate">
            {t('product.tapToSwitch')}
          </p>
        </div>
        <ArrowLeftRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      </button>

      {/* Expanded switch panel */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="pt-1.5 px-1 space-y-1.5">
              {/* Personal option */}
              <button
                type="button"
                onClick={() => { if (!isPersonal) handleSwitch(); else setExpanded(false); }}
                disabled={switching}
                className={`w-full flex items-center gap-2.5 px-2.5 py-2.5 rounded-lg transition-all text-left ${
                  isPersonal
                    ? 'bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800'
                    : 'hover:bg-muted/70 border border-transparent'
                }`}
              >
                <Wallet className={`h-4 w-4 shrink-0 ${isPersonal ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'}`} />
                <div className="flex-1 min-w-0">
                  <p className={`text-xs font-medium ${isPersonal ? 'text-emerald-700 dark:text-emerald-300' : ''}`}>
                    Solvio Personal
                  </p>
                  <p className="text-[10px] text-muted-foreground">{t('product.personalShort')}</p>
                </div>
                {isPersonal && <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />}
              </button>

              {/* Business option */}
              <button
                type="button"
                onClick={() => { if (isPersonal) handleSwitch(); else setExpanded(false); }}
                disabled={switching}
                className={`w-full flex items-center gap-2.5 px-2.5 py-2.5 rounded-lg transition-all text-left ${
                  !isPersonal
                    ? 'bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800'
                    : 'hover:bg-muted/70 border border-transparent'
                }`}
              >
                {switching ? (
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
                ) : (
                  <Building2 className={`h-4 w-4 shrink-0 ${!isPersonal ? 'text-blue-600 dark:text-blue-400' : 'text-muted-foreground'}`} />
                )}
                <div className="flex-1 min-w-0">
                  <p className={`text-xs font-medium ${!isPersonal ? 'text-blue-700 dark:text-blue-300' : ''}`}>
                    Solvio Business
                  </p>
                  <p className="text-[10px] text-muted-foreground">{t('product.businessShort')}</p>
                </div>
                {!isPersonal && <Check className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400 shrink-0" />}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
