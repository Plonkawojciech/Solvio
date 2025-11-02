'use client' // To jest kluczowe! Ten komponent zarządza stanem.

import * as React from 'react'
import { Button } from '@/components/ui/button'
import { PlusCircle } from 'lucide-react'
import { AddExpenseSheet } from './add-expense-sheet'

/**
 * To jest "Trigger" - komponent kliencki, który zastępuje
 * stary przycisk "Add Expense". Zawiera w sobie logikę
 * otwierania i zamykania panelu bocznego (Sheet).
 */
export function AddExpenseTrigger() {
  // 1. Dodajemy stan do kontrolowania panelu
  const [isSheetOpen, setIsSheetOpen] = React.useState(false)

  return (
    <>
      {/* 2. To jest nasz "trigger" - przycisk, który otwiera panel */}
      <Button onClick={() => setIsSheetOpen(true)}>
        <PlusCircle className="mr-2 h-4 w-4" /> Add Expense
      </Button>

      {/* 3. To jest sam panel, który jest renderowany i kontrolowany przez stan */}
      <AddExpenseSheet
        isOpen={isSheetOpen}
        onClose={() => setIsSheetOpen(false)}
      />
    </>
  )
}
