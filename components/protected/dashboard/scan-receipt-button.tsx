'use client'

import * as React from 'react'
import { Button } from '@/components/ui/button'
import { Camera } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { ScanReceiptSheet } from './scan-receipt-sheet'
import { t } from '@/lib/i18n'

export function ScanReceiptButton({ onAction }: { onAction?: () => void }) {
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
        <span className="hidden sm:inline">{t('receipts.scan')}</span>
        <span className="sm:hidden">{t('receipts.scan')}</span>
      </Button>

      <ScanReceiptSheet
        isOpen={isSheetOpen}
        onClose={() => setIsSheetOpen(false)}
        onParsed={() => handleAction()}
      />
    </>
  )
}
