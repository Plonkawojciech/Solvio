'use client'

import * as React from 'react'
import { Button } from '@/components/ui/button'
import { PlusCircle } from 'lucide-react'
import { AddExpenseSheet } from './add-expense-sheet'
import { useRouter } from 'next/navigation'
import { useTranslation } from '@/lib/i18n'

interface AddExpenseTriggerProps {
  onAction?: () => void
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

export function AddExpenseTrigger({ onAction, open, onOpenChange }: AddExpenseTriggerProps) {
  const { t } = useTranslation()
  const [internalOpen, setInternalOpen] = React.useState(false)
  const router = useRouter()

  // Support both controlled (open/onOpenChange) and uncontrolled modes
  const isSheetOpen = open !== undefined ? open : internalOpen
  const setIsSheetOpen = React.useCallback((val: boolean) => {
    if (onOpenChange) onOpenChange(val)
    else setInternalOpen(val)
  }, [onOpenChange])

  const handleAction = React.useCallback(() => {
    onAction?.()
    router.refresh()
    setIsSheetOpen(false)
  }, [onAction, router, setIsSheetOpen])

  return (
    <>
      <Button variant={"outline"} onClick={() => setIsSheetOpen(true)} size="sm" className="text-xs sm:text-sm">
        <PlusCircle className="mr-1 sm:mr-2 h-4 w-4" />
        <span className="hidden sm:inline" suppressHydrationWarning>{t('receipts.add')}</span>
        <span className="sm:hidden" suppressHydrationWarning>{t('common.add')}</span>
      </Button>

      <AddExpenseSheet
        isOpen={isSheetOpen}
        onClose={() => setIsSheetOpen(false)}
        onAction={handleAction}
      />
    </>
  )
}
