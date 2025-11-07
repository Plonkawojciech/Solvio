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
import { Loader2, Trash2 } from 'lucide-react'
import { AddExpenseTrigger } from '@/components/protected/dashboard/add-expense-trigger'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default function ExpensesPage() {
  const supabase = createClient()
  const [expenses, setExpenses] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [selectedExpense, setSelectedExpense] = useState<any>(null)

  useEffect(() => {
    fetchExpenses()
  }, [])

  const fetchExpenses = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('expenses')
      .select('id, title, amount, date, vendor, notes, category_id')
      .order('date', { ascending: false })

    if (error) console.error('Error fetching expenses:', error)
    else setExpenses(data)
    setLoading(false)
  }

  const deleteExpense = async (id: string) => {
    const { error } = await supabase.from('expenses').delete().eq('id', id)
    if (error) console.error(error)
    else {
      setIsDeleteDialogOpen(false)
      setSelectedExpense(null)
      fetchExpenses()
    }
  }

  return (
    <main className="min-h-screen w-full p-10 sm:p-16">
      <div className="flex flex-col h-full space-y-12">
        {/* Nagłówek */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <h1 className="text-4xl font-bold tracking-tight">Expenses</h1>
          <div className="flex items-center space-x-2">
            <AddExpenseTrigger onAction={fetchExpenses} />
          </div>
        </div>

        {/* TABELA */}
        <section className="rounded-xl border p-6 overflow-hidden flex-1">
          {loading ? (
            <div className="flex justify-center py-32">
              <Loader2 className="animate-spin h-8 w-8 text-muted-foreground" />
            </div>
          ) : expenses.length === 0 ? (
            <p className="text-center text-muted-foreground text-lg py-32">
              No expenses found. Add your first one!
            </p>
          ) : (
            <div className="overflow-y-auto max-h-[60vh]">
              <Table className="w-full text-base">
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>Vendor</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {expenses.map((expense) => (
                    <TableRow
                      key={expense.id}
                      onClick={() => setSelectedExpense(expense)}
                      className={`cursor-pointer transition-colors ${
                        selectedExpense?.id === expense.id
                          ? 'bg-muted/40'
                          : 'hover:bg-muted/20'
                      }`}
                    >
                      <TableCell className="font-medium">
                        {expense.title}
                      </TableCell>
                      <TableCell>{expense.vendor || '—'}</TableCell>
                      <TableCell>{expense.amount.toFixed(2)} PLN</TableCell>
                      <TableCell>
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
            <Card className="border p-6">
              <CardHeader>
                <CardTitle className="text-2xl font-semibold">
                  {selectedExpense.title}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
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
                <p>
                  <span className="font-medium text-muted-foreground">
                    Notes:
                  </span>{' '}
                  {selectedExpense.notes || '—'}
                </p>
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
              onClick={() => deleteExpense(selectedExpense.id)}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  )
}
