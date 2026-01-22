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
    router.refresh()         
    setIsSheetOpen(false)
  }, [onAction, router])

  return (
    <>
      <Button variant={"outline"} onClick={() => setIsSheetOpen(true)} size="sm" className="text-xs sm:text-sm">
        <PlusCircle className="mr-1 sm:mr-2 h-4 w-4" /> 
        <span className="hidden sm:inline">Add Expense</span>
        <span className="sm:hidden">Add</span>
      </Button>

      <AddExpenseSheet
        isOpen={isSheetOpen}
        onClose={() => setIsSheetOpen(false)}
        onAction={handleAction}  // ⬅️ podajemy do sheeta
      />
    </>
  )
}
