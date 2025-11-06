'use client'

import * as React from 'react'
import { Button } from '@/components/ui/button'
import { PlusCircle } from 'lucide-react'
import { AddExpenseSheet } from './add-expense-sheet'
import { useRouter } from 'next/navigation'

export function AddExpenseTrigger({ onAction }: { onAction?: () => void }) {
  const [isSheetOpen, setIsSheetOpen] = React.useState(false)
  const router = useRouter()

  const handleAction = React.useCallback(() => {
    onAction?.()
    router.refresh()         // ⬅️ kluczowe odświeżenie danych SSR
    setIsSheetOpen(false)    // domknięcie po sukcesie
  }, [onAction, router])

  return (
    <>
      <Button onClick={() => setIsSheetOpen(true)}>
        <PlusCircle className="mr-2 h-4 w-4" /> Add Expense
      </Button>

      <AddExpenseSheet
        isOpen={isSheetOpen}
        onClose={() => setIsSheetOpen(false)}
        onAction={handleAction}  // ⬅️ podajemy do sheeta
      />
    </>
  )
}
