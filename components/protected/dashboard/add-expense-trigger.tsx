'use client'

import * as React from 'react'
import dynamic from 'next/dynamic'
import { Button } from '@/components/ui/button'
import { PlusCircle } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useTranslation } from '@/lib/i18n'

/* Round-3 (A1): AddExpenseSheet is ~846 lines (form, validation, multiple
 * Radix dialogs, framer-motion). It only mounts when the user opens the
 * "+ Add" sheet — lazy-loading parallels the ScanReceiptSheet pattern in
 * scan-receipt-button.tsx and shaves the trigger's initial cost on every
 * page that renders it (dashboard, expenses list, mobile bottom nav). */
const AddExpenseSheet = dynamic(
  () => import('./add-expense-sheet').then(m => ({ default: m.AddExpenseSheet })),
  { ssr: false }
)

interface ExpenseForSuggestion {
  vendor: string | null
  title: string
  categoryId: string | null
}

interface AddExpenseTriggerProps {
  onAction?: () => void
  open?: boolean
  onOpenChange?: (open: boolean) => void
  allExpenses?: ExpenseForSuggestion[]
}

export function AddExpenseTrigger({ onAction, open, onOpenChange, allExpenses }: AddExpenseTriggerProps) {
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
        allExpenses={allExpenses}
      />
    </>
  )
}
