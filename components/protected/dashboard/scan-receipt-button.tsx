'use client'

import * as React from 'react'
import dynamic from 'next/dynamic'
import { Button } from '@/components/ui/button'
import { Camera } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useTranslation } from '@/lib/i18n'

/* ScanReceiptSheet is ~1000+ lines — lazy-load it so it only downloads when the sheet opens */
const ScanReceiptSheet = dynamic(() => import('./scan-receipt-sheet').then(m => ({ default: m.ScanReceiptSheet })), { ssr: false })

export function ScanReceiptButton({ onAction }: { onAction?: () => void }) {
  const { t } = useTranslation()
  const [isSheetOpen, setIsSheetOpen] = React.useState(false)
  const router = useRouter()

  const handleAction = React.useCallback(() => {
    setIsSheetOpen(false)
    
    // Odśwież natychmiast
    onAction?.()
    router.refresh()
    
    // Odśwież ponownie po 7s (gdy kategorie będą gotowe w tle)
    setTimeout(() => {
      onAction?.()
      router.refresh()
    }, 7000)
  }, [onAction, router])

  return (
    <>
      <Button onClick={() => setIsSheetOpen(true)} size="sm" className="text-xs sm:text-sm">
        <Camera className="mr-1 sm:mr-2 h-4 w-4" /> 
        <span className="hidden sm:inline" suppressHydrationWarning>{t('receipts.scan')}</span>
        <span className="sm:hidden" suppressHydrationWarning>{t('receipts.scan')}</span>
      </Button>

      <ScanReceiptSheet
        isOpen={isSheetOpen}
        onClose={() => setIsSheetOpen(false)}
        onParsed={() => handleAction()}
      />
    </>
  )
}
