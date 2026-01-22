'use client'

import * as React from 'react'
import { Button } from '@/components/ui/button'
import { Camera } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { ScanReceiptSheet } from './scan-receipt-sheet'

export function ScanReceiptButton({ onAction }: { onAction?: () => void }) {
  const [isSheetOpen, setIsSheetOpen] = React.useState(false)
  const router = useRouter()

  const handleAction = React.useCallback(() => {
    onAction?.()
    router.refresh()         
    setIsSheetOpen(false)
  }, [onAction, router])

  return (
    <>
      <Button onClick={() => setIsSheetOpen(true)}>
        <Camera className="mr-2 h-4 w-4" /> Scan Receipt
      </Button>

      <ScanReceiptSheet
        isOpen={isSheetOpen}
        onClose={() => setIsSheetOpen(false)}
        onParsed={() => handleAction()}
      />
    </>
  )
}
