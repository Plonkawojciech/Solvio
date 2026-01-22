'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
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
import { Loader2, Trash2, ChevronDown, ChevronUp } from 'lucide-react'
import { AddExpenseTrigger } from '@/components/protected/dashboard/add-expense-trigger'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

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
  ocr_preview?: string
}

export default function ExpensesPage() {
  const supabase = createClient()
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [receiptItems, setReceiptItems] = useState<ReceiptItem[]>([])
  const [loadingReceiptItems, setLoadingReceiptItems] = useState(false)
  const [categories, setCategories] = useState<Map<string, string>>(new Map())

  useEffect(() => {
    fetchExpenses()
    fetchCategories()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
    }
  }

  const fetchExpenses = async () => {
    setLoading(true)
    setError(null)
    
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setError('You must be logged in')
      setLoading(false)
      return
    }

    const { data, error: fetchError } = await supabase
      .from('expenses')
      .select('id, title, amount, date, vendor, notes, category_id, receipt_id')
      .eq('user_id', user.id)
      .order('date', { ascending: false })

    if (fetchError) {
      setError('Failed to fetch expenses')
    } else {
      setExpenses(data || [])
    }
    setLoading(false)
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

  const handleExpenseClick = async (expense: Expense) => {
    setSelectedExpense(expense)
    
    // Jeśli expense ma receipt_id, pobierz produkty z paragonu
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
    <main className="min-h-screen w-full p-4 sm:p-6 md:p-10">
      <div className="flex flex-col h-full space-y-12">
        {/* Nagłówek */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 sm:gap-6">
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight">Expenses</h1>
          <div className="flex items-center space-x-2">
            <AddExpenseTrigger onAction={fetchExpenses} />
          </div>
        </div>

        {/* TABELA */}
        <section className="rounded-xl border p-4 sm:p-6 overflow-hidden flex-1">
          {loading ? (
            <div className="flex justify-center py-32">
              <Loader2 className="animate-spin h-8 w-8 text-muted-foreground" />
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-32">
              <p className="text-center text-destructive text-lg mb-4">{error}</p>
              <Button onClick={fetchExpenses} variant="outline">Retry</Button>
            </div>
          ) : expenses.length === 0 ? (
            <p className="text-center text-muted-foreground text-lg py-32">
              No expenses found. Add your first one!
            </p>
          ) : (
            <div className="overflow-y-auto max-h-[60vh]">
              <Table className="w-full text-sm sm:text-base">
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead className="hidden sm:table-cell">Vendor</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead className="hidden md:table-cell">Date</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {expenses.map((expense) => (
                    <TableRow
                      key={expense.id}
                      onClick={() => handleExpenseClick(expense)}
                      className={`cursor-pointer transition-colors ${
                        selectedExpense?.id === expense.id
                          ? 'bg-muted/40'
                          : 'hover:bg-muted/20'
                      }`}
                    >
                      <TableCell className="font-medium">
                        {expense.title}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">{expense.vendor || '—'}</TableCell>
                      <TableCell className="font-medium">{expense.amount.toFixed(2)} PLN</TableCell>
                      <TableCell className="hidden md:table-cell">
                        {new Date(expense.date).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => {
                            e.stopPropagation()
                            setSelectedExpense(expense)
                            setIsDeleteDialogOpen(true)
                          }}
                        >
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </section>

        {/* PANEL SZCZEGÓŁÓW */}
        <section className="w-full">
          {selectedExpense ? (
            <Card className="border p-4 sm:p-6">
              <CardHeader>
                <CardTitle className="text-2xl font-semibold">
                  {selectedExpense.title}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                <div className="grid grid-cols-2 gap-4">
                  <p>
                    <span className="font-medium text-muted-foreground">
                      Vendor:
                    </span>{' '}
                    {selectedExpense.vendor || '—'}
                  </p>
                  <p>
                    <span className="font-medium text-muted-foreground">
                      Amount:
                    </span>{' '}
                    {selectedExpense.amount.toFixed(2)} PLN
                  </p>
                  <p>
                    <span className="font-medium text-muted-foreground">
                      Date:
                    </span>{' '}
                    {new Date(selectedExpense.date).toLocaleDateString()}
                  </p>
                </div>

                {/* Produkty z paragonu */}
                {selectedExpense.receipt_id && (
                  <div className="mt-6 pt-6 border-t">
                    <h3 className="font-semibold text-base mb-4">Receipt Items</h3>
                    {loadingReceiptItems ? (
                      <div className="flex justify-center py-4">
                        <Loader2 className="animate-spin h-5 w-5 text-muted-foreground" />
                      </div>
                    ) : receiptItems.length > 0 ? (
                      <div className="space-y-2">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Item</TableHead>
                              <TableHead>Category</TableHead>
                              <TableHead className="text-right">Quantity</TableHead>
                              <TableHead className="text-right">Price</TableHead>
                              <TableHead className="text-right">Total</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {receiptItems.map((item, index) => {
                              const quantity = item.quantity ?? 1
                              const price = item.price ?? 0
                              const total = quantity * price
                              const categoryName = item.category_id ? categories.get(item.category_id) || 'No category' : 'No category'
                              return (
                                <TableRow key={index}>
                                  <TableCell className="font-medium">
                                    {item.name}
                                  </TableCell>
                                  <TableCell>
                                    <span className="text-sm text-muted-foreground">
                                      {categoryName}
                                    </span>
                                  </TableCell>
                                  <TableCell className="text-right">
                                    {quantity}
                                  </TableCell>
                                  <TableCell className="text-right">
                                    {price.toFixed(2)} PLN
                                  </TableCell>
                                  <TableCell className="text-right font-medium">
                                    {total.toFixed(2)} PLN
                                  </TableCell>
                                </TableRow>
                              )
                            })}
                          </TableBody>
                        </Table>
                      </div>
                    ) : (
                      <p className="text-muted-foreground">No items found in receipt</p>
                    )}
                  </div>
                )}

                {!selectedExpense.receipt_id && selectedExpense.notes && (
                  <div className="mt-4 pt-4 border-t">
                    <p>
                      <span className="font-medium text-muted-foreground">
                        Notes:
                      </span>{' '}
                      {selectedExpense.notes}
                    </p>
                  </div>
                )}
              </CardContent>
              <div className="mt-6 flex justify-end">
                <Button
                  variant="destructive"
                  onClick={() => setIsDeleteDialogOpen(true)}
                >
                  Delete
                </Button>
              </div>
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
            <DialogTitle>Delete Expense</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete “{selectedExpense?.title}”? This
              action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setIsDeleteDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => selectedExpense && deleteExpense(selectedExpense.id)}
              disabled={isDeleting}
            >
              {isDeleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Delete'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  )
}
