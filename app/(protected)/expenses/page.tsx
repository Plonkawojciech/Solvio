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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, Trash2, Plus } from 'lucide-react'
import { AddExpenseTrigger } from '@/components/protected/dashboard/add-expense-trigger'

export default function ExpensesPage() {
  const supabase = createClient()
  const [expenses, setExpenses] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [selectedExpense, setSelectedExpense] = useState<any>(null)
  const [newExpense, setNewExpense] = useState({
    title: '',
    amount: '',
    date: '',
    notes: '',
  })

  useEffect(() => {
    fetchExpenses()
  }, [])

  const fetchExpenses = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('expenses')
      .select('id, title, amount, date, notes, category_id')
      .order('date', { ascending: false })
    if (error) console.error(error)
    else setExpenses(data)
    setLoading(false)
  }

  const deleteExpense = async (id: string) => {
    const { error } = await supabase.from('expenses').delete().eq('id', id)
    if (error) console.error(error)
    else {
      setIsDeleteDialogOpen(false)
      fetchExpenses()
    }
  }

  const addExpense = async () => {
    if (!newExpense.title || !newExpense.amount) return
    const { error } = await supabase.from('expenses').insert([
      {
        title: newExpense.title,
        amount: parseFloat(newExpense.amount),
        date: newExpense.date || new Date().toISOString().split('T')[0],
        notes: newExpense.notes,
      },
    ])
    if (error) console.error(error)
    else {
      setIsAddDialogOpen(false)
      setNewExpense({ title: '', amount: '', date: '', notes: '' })
      fetchExpenses()
    }
  }

  return (
    <main className="min-h-screen w-full bg-gradient-to-br from-background via-background/70 to-background/90 backdrop-blur-2xl text-foreground p-10 sm:p-16">
      <div className="flex flex-col h-full space-y-10">
        {/* Główny nagłówek */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div>
            <h1 className="text-4xl font-bold tracking-tight">Expenses</h1>
          </div>

          <div className="flex items-center space-x-2">
            <AddExpenseTrigger onAction={fetchExpenses} />
          </div>
        </div>

        {/* Tabela */}
        <section className="flex-1 overflow-auto rounded-3xl border border-white/10 bg-white/10 shadow-2xl backdrop-blur-3xl p-8">
          {loading ? (
            <div className="flex justify-center py-32">
              <Loader2 className="animate-spin h-8 w-8 text-muted-foreground" />
            </div>
          ) : expenses.length === 0 ? (
            <p className="text-center text-muted-foreground text-lg py-32">
              No expenses found. Add your first one!
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table className="w-full text-base">
                <TableHeader>
                  <TableRow className="bg-white/15 text-foreground/90 text-sm uppercase tracking-wider">
                    <TableHead className="py-4">Title</TableHead>
                    <TableHead className="py-4">Amount</TableHead>
                    <TableHead className="py-4">Date</TableHead>
                    <TableHead className="py-4">Notes</TableHead>
                    <TableHead className="py-4 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {expenses.map((expense) => (
                    <TableRow
                      key={expense.id}
                      className="hover:bg-white/10 transition-colors border-b border-white/5"
                    >
                      <TableCell className="font-medium py-4">
                        {expense.title}
                      </TableCell>
                      <TableCell className="py-4">
                        {expense.amount.toFixed(2)} EUR
                      </TableCell>
                      <TableCell className="py-4">
                        {new Date(expense.date).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="py-4 max-w-[300px] truncate">
                        {expense.notes || '—'}
                      </TableCell>
                      <TableCell className="text-right py-4">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="hover:bg-red-500/10"
                          onClick={() => {
                            setSelectedExpense(expense)
                            setIsDeleteDialogOpen(true)
                          }}
                        >
                          <Trash2 className="h-5 w-5 text-red-500 hover:text-red-600" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </section>
      </div>

      {/* Dialog dodawania */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="sm:max-w-lg bg-background/90 border border-white/20 shadow-2xl backdrop-blur-3xl p-8 rounded-3xl">
          <DialogHeader>
            <DialogTitle className="text-2xl font-semibold">
              Add New Expense
            </DialogTitle>
            <DialogDescription>
              Enter the details below to log a new expense.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-5 py-4">
            <div className="grid gap-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                value={newExpense.title}
                onChange={(e) =>
                  setNewExpense({ ...newExpense, title: e.target.value })
                }
                placeholder="Coffee, groceries..."
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="amount">Amount</Label>
              <Input
                id="amount"
                type="number"
                value={newExpense.amount}
                onChange={(e) =>
                  setNewExpense({ ...newExpense, amount: e.target.value })
                }
                placeholder="20.50"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="date">Date</Label>
              <Input
                id="date"
                type="date"
                value={newExpense.date}
                onChange={(e) =>
                  setNewExpense({ ...newExpense, date: e.target.value })
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="notes">Notes</Label>
              <Input
                id="notes"
                value={newExpense.notes}
                onChange={(e) =>
                  setNewExpense({ ...newExpense, notes: e.target.value })
                }
                placeholder="Optional"
              />
            </div>
          </div>

          <DialogFooter className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={addExpense}>Add Expense</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog usuwania */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent className="sm:max-w-md bg-background/90 border border-white/20 shadow-2xl backdrop-blur-3xl p-8 rounded-3xl">
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
