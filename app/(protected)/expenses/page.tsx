'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useTranslation } from '@/lib/i18n'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Loader2, Trash2, Edit2, Check, X } from 'lucide-react'
import { AddExpenseTrigger } from '@/components/protected/dashboard/add-expense-trigger'
import { ScanReceiptButton } from '@/components/protected/dashboard/scan-receipt-button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface Expense {
  id: string
  title: string
  amount: number
  date: string
  vendor: string | null
  notes: string | null
  category_id: string | null
  receipt_id: string | null
}

interface ReceiptItem {
  name: string
  quantity?: number | null
  price?: number | null
  category_id?: string | null
}

interface ReceiptData {
  items?: ReceiptItem[]
}

export default function ExpensesPage() {
  const supabase = createClient()
  const { t, lang, mounted } = useTranslation()
  const isPolish = lang === 'pl'
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [receiptItems, setReceiptItems] = useState<ReceiptItem[]>([])
  const [loadingReceiptItems, setLoadingReceiptItems] = useState(false)
  const [categories, setCategories] = useState<Map<string, string>>(new Map())
  const [categoriesList, setCategoriesList] = useState<Array<{ id: string; name: string }>>([])
  const [currency, setCurrency] = useState<string>('PLN')
  
  // Bulk selection dla expenses
  const [selectedExpenseIds, setSelectedExpenseIds] = useState<Set<string>>(new Set())
  const [isBulkDeleting, setIsBulkDeleting] = useState(false)
  
  // Bulk selection dla items
  const [selectedItemIndices, setSelectedItemIndices] = useState<Set<number>>(new Set())
  
  // Inline editing dla expenses
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null)
  const [editExpenseTitle, setEditExpenseTitle] = useState('')
  const [editExpenseAmount, setEditExpenseAmount] = useState('')
  const [isSavingExpense, setIsSavingExpense] = useState(false)
  
  // Inline editing dla items
  const [editingItemIndex, setEditingItemIndex] = useState<number | null>(null)
  const [editItemName, setEditItemName] = useState('')
  const [editItemPrice, setEditItemPrice] = useState('')
  const [editItemCategory, setEditItemCategory] = useState('')
  const [isSavingItem, setIsSavingItem] = useState(false)

  const fetchSettings = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    
    const { data: settings } = await supabase
      .from('user_settings')
      .select('currency_id')
      .eq('user_id', user.id)
      .maybeSingle()
    
    if (settings?.currency_id) {
      setCurrency(settings.currency_id.toUpperCase())
    }
  }

  useEffect(() => {
    fetchExpenses()
    fetchCategories()
    fetchSettings()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Jedno odświeżenie po zakończeniu kategoryzacji (6s)
  const handleAfterScan = async () => {
    const initialExpensesCount = expenses.length
    await fetchExpenses()
    
    console.log('[Auto-refresh] Czekam na kategorie... (6s)')
    setTimeout(async () => {
      console.log('[Auto-refresh] Odświeżam kategorie!')
      const updatedExpenses = await fetchExpenses()
      
      // Automatycznie wybierz najnowszy expense (pierwszy na liście)
      if (updatedExpenses && updatedExpenses.length > 0) {
        const newestExpense = updatedExpenses[0]
        
        // Jeśli to nowy expense, automatycznie go zaznacz i pokaż items
        if (updatedExpenses.length > initialExpensesCount || !selectedExpense) {
          console.log('[Auto-refresh] Automatycznie wybieram najnowszy expense')
          setSelectedExpense(newestExpense)
          
          if (newestExpense.receipt_id) {
            setLoadingReceiptItems(true)
            const { data: receiptData } = await supabase
              .from('receipts')
              .select('notes')
              .eq('id', newestExpense.receipt_id)
              .single()
            
            if (receiptData?.notes) {
              try {
                const parsed: ReceiptData = JSON.parse(receiptData.notes)
                console.log('[Auto-refresh] ✅ Receipt items z kategoriami załadowane!')
                setReceiptItems(parsed.items || [])
              } catch (e) {
                console.error('Failed to parse receipt notes:', e)
              }
            }
            setLoadingReceiptItems(false)
          }
        }
      }
    }, 6000) // Jedno odświeżenie po 6s
  }

  const fetchCategories = async () => {
    const { data, error } = await supabase
      .from('categories')
      .select('id, name')
    
    if (!error && data) {
      const catMap = new Map<string, string>()
      data.forEach(cat => {
        catMap.set(cat.id, cat.name)
      })
      setCategories(catMap)
      setCategoriesList(data)
    }
  }

  const fetchExpenses = async (): Promise<Expense[] | undefined> => {
    setLoading(true)
    setError(null)
    
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setError('You must be logged in')
      setLoading(false)
      return undefined
    }

    const { data, error: fetchError } = await supabase
      .from('expenses')
      .select('id, title, amount, date, vendor, notes, category_id, receipt_id')
      .eq('user_id', user.id)
      .order('date', { ascending: false })

    if (fetchError) {
      setError('Failed to fetch expenses')
      setLoading(false)
      return undefined
    } else {
      setExpenses(data || [])
      setLoading(false)
      return data || []
    }
  }

  const deleteExpense = async (id: string) => {
    setIsDeleting(true)
    const { error: deleteError } = await supabase
      .from('expenses')
      .delete()
      .eq('id', id)
    
    if (deleteError) {
      setError('Failed to delete expense')
      setIsDeleting(false)
    } else {
      setIsDeleteDialogOpen(false)
      setSelectedExpense(null)
      setReceiptItems([])
      await fetchExpenses()
      setIsDeleting(false)
    }
  }

  const bulkDeleteExpenses = async () => {
    if (selectedExpenseIds.size === 0) return
    
    setIsBulkDeleting(true)
    const ids = Array.from(selectedExpenseIds)
    
    const { error: deleteError } = await supabase
      .from('expenses')
      .delete()
      .in('id', ids)
    
    if (deleteError) {
      setError('Failed to delete expenses')
    } else {
      setSelectedExpenseIds(new Set())
      setSelectedExpense(null)
      await fetchExpenses()
    }
    setIsBulkDeleting(false)
  }

  const bulkDeleteItems = async () => {
    if (!selectedExpense || selectedItemIndices.size === 0) return
    
    const updatedItems = receiptItems.filter((_, idx) => !selectedItemIndices.has(idx))
    await saveReceiptItems(updatedItems)
    setSelectedItemIndices(new Set())
  }

  const toggleExpenseSelection = (id: string) => {
    const newSet = new Set(selectedExpenseIds)
    if (newSet.has(id)) {
      newSet.delete(id)
    } else {
      newSet.add(id)
    }
    setSelectedExpenseIds(newSet)
  }

  const toggleExpenseSelectAll = () => {
    if (selectedExpenseIds.size === expenses.length) {
      setSelectedExpenseIds(new Set())
    } else {
      setSelectedExpenseIds(new Set(expenses.map(e => e.id)))
    }
  }

  const toggleItemSelection = (index: number) => {
    const newSet = new Set(selectedItemIndices)
    if (newSet.has(index)) {
      newSet.delete(index)
    } else {
      newSet.add(index)
    }
    setSelectedItemIndices(newSet)
  }

  const toggleItemSelectAll = () => {
    if (selectedItemIndices.size === receiptItems.length) {
      setSelectedItemIndices(new Set())
    } else {
      setSelectedItemIndices(new Set(receiptItems.map((_, idx) => idx)))
    }
  }

  const startEditingExpense = (expense: Expense) => {
    setEditingExpenseId(expense.id)
    setEditExpenseTitle(expense.title)
    setEditExpenseAmount(expense.amount.toString())
  }

  const cancelEditingExpense = () => {
    setEditingExpenseId(null)
    setEditExpenseTitle('')
    setEditExpenseAmount('')
  }

  const saveExpense = async (id: string) => {
    setIsSavingExpense(true)
    
    const { error: updateError } = await supabase
      .from('expenses')
      .update({
        title: editExpenseTitle,
        amount: parseFloat(editExpenseAmount) || 0,
      })
      .eq('id', id)
    
    if (updateError) {
      setError('Failed to update expense')
    } else {
      setEditingExpenseId(null)
      await fetchExpenses()
    }
    setIsSavingExpense(false)
  }

  const handleExpenseKeyDown = (e: React.KeyboardEvent, id: string) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      saveExpense(id)
    }
  }

  const startEditingItem = (index: number, item: ReceiptItem) => {
    setEditingItemIndex(index)
    setEditItemName(item.name)
    setEditItemPrice((item.price ?? 0).toString())
    setEditItemCategory(item.category_id ?? '')
  }

  const cancelEditingItem = () => {
    setEditingItemIndex(null)
    setEditItemName('')
    setEditItemPrice('')
    setEditItemCategory('')
  }

  const saveItem = async (index: number) => {
    setIsSavingItem(true)
    
    const updatedItems = [...receiptItems]
    updatedItems[index] = {
      ...updatedItems[index],
      name: editItemName,
      price: parseFloat(editItemPrice) || 0,
      category_id: editItemCategory || null,
    }
    
    await saveReceiptItems(updatedItems)
    setEditingItemIndex(null)
    setIsSavingItem(false)
  }

  const handleItemKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      saveItem(index)
    }
  }

  const saveReceiptItems = async (items: ReceiptItem[]) => {
    if (!selectedExpense?.receipt_id) return
    
    const { data: receiptData } = await supabase
      .from('receipts')
      .select('notes')
      .eq('id', selectedExpense.receipt_id)
      .single()
    
    let notesData: ReceiptData = {}
    if (receiptData?.notes) {
      try {
        notesData = JSON.parse(receiptData.notes)
      } catch (e) {
        console.error('Failed to parse receipt notes:', e)
      }
    }
    
    notesData.items = items
    
    const { error: updateError } = await supabase
      .from('receipts')
      .update({ notes: JSON.stringify(notesData) })
      .eq('id', selectedExpense.receipt_id)
    
    if (updateError) {
      setError('Failed to update items')
    } else {
      setReceiptItems(items)
    }
  }

  const handleExpenseClick = async (expense: Expense) => {
    setSelectedExpense(expense)
    setSelectedItemIndices(new Set())
    
    if (expense.receipt_id) {
      setLoadingReceiptItems(true)
      setReceiptItems([])
      
      const { data: receiptData, error: receiptError } = await supabase
        .from('receipts')
        .select('notes')
        .eq('id', expense.receipt_id)
        .single()
      
      if (!receiptError && receiptData?.notes) {
        try {
          const parsed: ReceiptData = JSON.parse(receiptData.notes)
          setReceiptItems(parsed.items || [])
        } catch (e) {
          console.error('Failed to parse receipt notes:', e)
          setReceiptItems([])
        }
      }
      
      setLoadingReceiptItems(false)
    } else {
      setReceiptItems([])
    }
  }

  return (
    <main className="min-h-screen w-full p-2 sm:p-4 md:p-6 lg:p-10">
      <div className="flex flex-col h-full space-y-4 sm:space-y-6 md:space-y-12">
        {/* Nagłówek */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 sm:gap-6">
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight" suppressHydrationWarning>
            {t('expenses.title')}
          </h1>
          <div className="flex items-center gap-1 sm:gap-2 flex-wrap">
            {selectedExpenseIds.size > 0 && (
              <Button
                variant="destructive"
                size="sm"
                onClick={bulkDeleteExpenses}
                disabled={isBulkDeleting}
                className="text-xs sm:text-sm"
              >
                {isBulkDeleting ? (
                  <>
                    <Loader2 className="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4 animate-spin" />
                    <span className="hidden sm:inline" suppressHydrationWarning>{t('expenses.deleting')}</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4" />
                    <span className="hidden sm:inline" suppressHydrationWarning>{t('expenses.delete')} </span>
                    {selectedExpenseIds.size}
                  </>
                )}
              </Button>
            )}
            <ScanReceiptButton onAction={handleAfterScan} />
            <AddExpenseTrigger onAction={fetchExpenses} />
          </div>
        </div>

        {/* TABELA EXPENSES */}
        <section className="rounded-xl border p-4 sm:p-6 overflow-hidden flex-1">
          {loading ? (
            <div className="flex justify-center py-32">
              <Loader2 className="animate-spin h-8 w-8 text-muted-foreground" />
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-32">
              <p className="text-center text-destructive text-lg mb-4">{error}</p>
              <Button onClick={fetchExpenses} variant="outline" suppressHydrationWarning>{t('expenses.retry')}</Button>
            </div>
          ) : expenses.length === 0 ? (
            <p className="text-center text-muted-foreground text-lg py-32" suppressHydrationWarning>
              {t('expenses.noExpenses')}
            </p>
          ) : (
            <>
              {/* Mobile: Card view */}
              <div className="block sm:hidden space-y-3 overflow-y-auto max-h-[60vh]">
                {expenses.map((expense) => (
                  <div
                    key={expense.id}
                    className={`border rounded-lg p-3 ${
                      selectedExpense?.id === expense.id
                        ? 'bg-muted/40 border-primary'
                        : 'bg-card'
                    }`}
                    onClick={() => handleExpenseClick(expense)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Checkbox
                            checked={selectedExpenseIds.has(expense.id)}
                            onCheckedChange={() => toggleExpenseSelection(expense.id)}
                            onClick={(e) => e.stopPropagation()}
                            className="h-4 w-4"
                          />
                          <h3 className="font-semibold text-sm truncate">
                            {editingExpenseId === expense.id ? (
                              <Input
                                value={editExpenseTitle}
                                onChange={(e) => setEditExpenseTitle(e.target.value)}
                                onKeyDown={(e) => handleExpenseKeyDown(e, expense.id)}
                                className="h-7 text-sm"
                                onClick={(e) => e.stopPropagation()}
                              />
                            ) : (
                              expense.title
                            )}
                          </h3>
                        </div>
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>{expense.vendor || '—'}</span>
                          <span className="font-medium text-foreground">
                            {editingExpenseId === expense.id ? (
                              <Input
                                value={editExpenseAmount}
                                onChange={(e) => setEditExpenseAmount(e.target.value)}
                                onKeyDown={(e) => handleExpenseKeyDown(e, expense.id)}
                                type="number"
                                step="0.01"
                                className="h-6 w-20 text-xs"
                                onClick={(e) => e.stopPropagation()}
                              />
                            ) : (
                              `${expense.amount.toFixed(2)} ${currency}`
                            )}
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {new Date(expense.date).toLocaleDateString()}
                        </div>
                      </div>
                      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                        {editingExpenseId === expense.id ? (
                          <>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => saveExpense(expense.id)}
                              disabled={isSavingExpense}
                              className="h-7 w-7"
                            >
                              <Check className="h-3 w-3 text-green-600" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={cancelEditingExpense}
                              className="h-7 w-7"
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </>
                        ) : (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setSelectedExpense(expense);
                              setIsDeleteDialogOpen(true);
                            }}
                            className="h-7 w-7"
                          >
                            <Trash2 className="h-3 w-3 text-red-500" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop: Table view */}
              <div className="hidden sm:block overflow-y-auto max-h-[60vh]">
                <Table className="w-full text-sm">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">
                        <Checkbox
                          checked={selectedExpenseIds.size === expenses.length && expenses.length > 0}
                          onCheckedChange={toggleExpenseSelectAll}
                        />
                      </TableHead>
                      <TableHead suppressHydrationWarning>{t('expenses.titleCol')}</TableHead>
                      <TableHead className="hidden sm:table-cell" suppressHydrationWarning>{t('expenses.vendor')}</TableHead>
                      <TableHead suppressHydrationWarning>{t('expenses.amount')}</TableHead>
                      <TableHead className="hidden md:table-cell" suppressHydrationWarning>{t('expenses.date')}</TableHead>
                      <TableHead className="text-right" suppressHydrationWarning>{t('expenses.actions')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {expenses.map((expense) => (
                    <TableRow
                      key={expense.id}
                      className={`${
                        selectedExpense?.id === expense.id
                          ? 'bg-muted/40'
                          : 'hover:bg-muted/20'
                      }`}
                    >
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selectedExpenseIds.has(expense.id)}
                          onCheckedChange={() => toggleExpenseSelection(expense.id)}
                        />
                      </TableCell>
                      <TableCell 
                        className="font-medium cursor-pointer"
                        onClick={() => handleExpenseClick(expense)}
                      >
                        {editingExpenseId === expense.id ? (
                          <Input
                            value={editExpenseTitle}
                            onChange={(e) => setEditExpenseTitle(e.target.value)}
                            onKeyDown={(e) => handleExpenseKeyDown(e, expense.id)}
                            className="h-8"
                            onClick={(e) => e.stopPropagation()}
                          />
                        ) : (
                          expense.title
                        )}
                      </TableCell>
                      <TableCell 
                        className="hidden sm:table-cell cursor-pointer"
                        onClick={() => handleExpenseClick(expense)}
                      >
                        {expense.vendor || '—'}
                      </TableCell>
                      <TableCell 
                        className="font-medium cursor-pointer"
                        onClick={() => handleExpenseClick(expense)}
                      >
                        {editingExpenseId === expense.id ? (
                          <Input
                            value={editExpenseAmount}
                            onChange={(e) => setEditExpenseAmount(e.target.value)}
                            onKeyDown={(e) => handleExpenseKeyDown(e, expense.id)}
                            type="number"
                            step="0.01"
                            className="h-8 w-24"
                            onClick={(e) => e.stopPropagation()}
                          />
                        ) : (
                          `${expense.amount.toFixed(2)} PLN`
                        )}
                      </TableCell>
                      <TableCell 
                        className="hidden md:table-cell cursor-pointer"
                        onClick={() => handleExpenseClick(expense)}
                      >
                        {new Date(expense.date).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        {editingExpenseId === expense.id ? (
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => saveExpense(expense.id)}
                              disabled={isSavingExpense}
                            >
                              <Check className="h-4 w-4 text-green-600" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={cancelEditingExpense}
                            >
                              <X className="h-4 w-4 text-red-500" />
                            </Button>
                          </div>
                        ) : (
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => startEditingExpense(expense)}
                            >
                              <Edit2 className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                setSelectedExpense(expense)
                                setIsDeleteDialogOpen(true)
                              }}
                            >
                              <Trash2 className="h-4 w-4 text-red-500" />
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </section>

        {/* PANEL SZCZEGÓŁÓW - ITEMS */}
        <section className="w-full">
          {selectedExpense && selectedExpense.receipt_id ? (
            <Card className="border p-4 sm:p-6">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-lg sm:text-2xl font-semibold" suppressHydrationWarning>
                  {t('expenses.receiptItems')} - {selectedExpense.title}
                </CardTitle>
                {selectedItemIndices.size > 0 && (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={bulkDeleteItems}
                    className="text-xs sm:text-sm"
                    suppressHydrationWarning
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    {t('expenses.delete')} {selectedItemIndices.size}
                  </Button>
                )}
              </CardHeader>
              <CardContent>
                {loadingReceiptItems ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="animate-spin h-6 w-6 text-muted-foreground" />
                  </div>
                ) : receiptItems.length > 0 ? (
                  <>
                    {/* Mobile: Card view */}
                    <div className="block sm:hidden space-y-2">
                      <div className="flex items-center gap-2 pb-2 border-b">
                        <Checkbox
                          checked={selectedItemIndices.size === receiptItems.length && receiptItems.length > 0}
                          onCheckedChange={toggleItemSelectAll}
                        />
                        <span className="text-sm font-medium" suppressHydrationWarning>{t('expenses.selectAll')}</span>
                      </div>
                      {receiptItems.map((item, index) => {
                        const quantity = item.quantity ?? 1
                        const totalPrice = item.price ?? 0
                        const categoryName = item.category_id ? categories.get(item.category_id) || t('expenses.noCategory') : t('expenses.noCategory')
                        
                        return (
                          <div
                            key={index}
                            className="border rounded-lg p-3 bg-card"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <Checkbox
                                    checked={selectedItemIndices.has(index)}
                                    onCheckedChange={() => toggleItemSelection(index)}
                                    className="h-4 w-4"
                                  />
                                  <h4 className="font-medium text-sm">
                                    {editingItemIndex === index ? (
                                      <Input
                                        value={editItemName}
                                        onChange={(e) => setEditItemName(e.target.value)}
                                        onKeyDown={(e) => handleItemKeyDown(e, index)}
                                        className="h-7 text-sm"
                                      />
                                    ) : (
                                      item.name
                                    )}
                                  </h4>
                                </div>
                                <div className="text-xs text-muted-foreground ml-6">
                                  {categoryName}
                                </div>
                                <div className="flex items-center justify-between text-xs mt-2 ml-6">
                                  <span suppressHydrationWarning>{t('expenses.qty')}: {quantity}</span>
                                  <span className="font-medium">{totalPrice.toFixed(2)} {currency}</span>
                                </div>
                              </div>
                              <div className="flex items-center gap-1">
                                {editingItemIndex === index ? (
                                  <>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => saveItem(index)}
                                      disabled={loading}
                                      className="h-7 w-7"
                                    >
                                      <Check className="h-3 w-3 text-green-600" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={cancelEditingItem}
                                      className="h-7 w-7"
                                    >
                                      <X className="h-3 w-3" />
                                    </Button>
                                  </>
                                ) : (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => startEditingItem(index, item)}
                                    disabled={loading}
                                    className="h-7 w-7"
                                  >
                                    <Edit2 className="h-3 w-3" />
                                  </Button>
                                )}
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>

                    {/* Desktop: Table view */}
                    <div className="hidden sm:block overflow-x-auto">
                      <Table className="w-full">
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-12">
                              <Checkbox
                                checked={selectedItemIndices.size === receiptItems.length && receiptItems.length > 0}
                                onCheckedChange={toggleItemSelectAll}
                              />
                            </TableHead>
                            <TableHead suppressHydrationWarning>{isPolish ? 'Produkt' : 'Item'}</TableHead>
                            <TableHead suppressHydrationWarning>{t('expenses.category')}</TableHead>
                            <TableHead className="text-right" suppressHydrationWarning>{t('expenses.qty')}</TableHead>
                            <TableHead className="text-right" suppressHydrationWarning>{t('expenses.price')}</TableHead>
                            <TableHead className="text-right" suppressHydrationWarning>{t('expenses.actions')}</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {receiptItems.map((item, index) => {
                        const quantity = item.quantity ?? 1
                        const totalPrice = item.price ?? 0
                        const categoryName = item.category_id ? categories.get(item.category_id) || t('expenses.noCategory') : t('expenses.noCategory')
                        
                        return (
                          <TableRow key={index}>
                            <TableCell>
                              <Checkbox
                                checked={selectedItemIndices.has(index)}
                                onCheckedChange={() => toggleItemSelection(index)}
                              />
                            </TableCell>
                            <TableCell className="font-medium">
                              {editingItemIndex === index ? (
                                <Input
                                  value={editItemName}
                                  onChange={(e) => setEditItemName(e.target.value)}
                                  onKeyDown={(e) => handleItemKeyDown(e, index)}
                                  className="h-8"
                                />
                              ) : (
                                item.name
                              )}
                            </TableCell>
                            <TableCell>
                              {editingItemIndex === index ? (
                                <Select value={editItemCategory} onValueChange={setEditItemCategory}>
                                  <SelectTrigger className="h-8 w-32">
                                    <SelectValue placeholder="Category" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {categoriesList.map(cat => (
                                      <SelectItem key={cat.id} value={cat.id}>
                                        {cat.name}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              ) : (
                                <span className="inline-flex items-center px-2 py-1 rounded-md bg-primary/10 text-primary text-xs font-medium">
                                  {categoryName}
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="text-right">{quantity}</TableCell>
                            <TableCell className="text-right font-medium">
                              {editingItemIndex === index ? (
                                <Input
                                  value={editItemPrice}
                                  onChange={(e) => setEditItemPrice(e.target.value)}
                                  onKeyDown={(e) => handleItemKeyDown(e, index)}
                                  type="number"
                                  step="0.01"
                                  className="h-8 w-24"
                                />
                              ) : (
                                `${totalPrice.toFixed(2)} PLN`
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              {editingItemIndex === index ? (
                                <div className="flex justify-end gap-1">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => saveItem(index)}
                                    disabled={isSavingItem}
                                  >
                                    <Check className="h-4 w-4 text-green-600" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={cancelEditingItem}
                                  >
                                    <X className="h-4 w-4 text-red-500" />
                                  </Button>
                                </div>
                              ) : (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => startEditingItem(index, item)}
                                >
                                  <Edit2 className="h-4 w-4" />
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        )
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  </>
                ) : (
                  <p className="text-muted-foreground py-8 text-center" suppressHydrationWarning>{t('expenses.noItems')}</p>
                )}
              </CardContent>
            </Card>
          ) : selectedExpense ? (
            <Card className="border p-4 sm:p-6">
              <CardHeader>
                <CardTitle className="text-2xl font-semibold">
                  {selectedExpense.title}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                <div className="grid grid-cols-2 gap-4">
                  <p>
                    <span className="font-medium text-muted-foreground">Vendor:</span>{' '}
                    {selectedExpense.vendor || '—'}
                  </p>
                  <p>
                    <span className="font-medium text-muted-foreground">Amount:</span>{' '}
                    {selectedExpense.amount.toFixed(2)} PLN
                  </p>
                  <p>
                    <span className="font-medium text-muted-foreground">Date:</span>{' '}
                    {new Date(selectedExpense.date).toLocaleDateString()}
                  </p>
                </div>
                {selectedExpense.notes && (
                  <div className="mt-4 pt-4 border-t">
                    <p>
                      <span className="font-medium text-muted-foreground">Notes:</span>{' '}
                      {selectedExpense.notes}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="h-48 flex items-center justify-center text-muted-foreground border rounded-xl">
              <p>Select an expense to view details</p>
            </div>
          )}
        </section>
      </div>

      {/* Dialog usuwania */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle suppressHydrationWarning>{t('expenses.delete')} {t('expenses.title')}</DialogTitle>
            <DialogDescription suppressHydrationWarning>
              {t('expenses.deleteConfirm')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)} suppressHydrationWarning>
              {t('common.cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={() => selectedExpense && deleteExpense(selectedExpense.id)}
              disabled={isDeleting}
              suppressHydrationWarning
            >
              {isDeleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('expenses.deleting')}
                </>
              ) : (
                t('expenses.delete')
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  )
}
