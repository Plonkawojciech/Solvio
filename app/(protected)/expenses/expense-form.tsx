'use client'

import { useState, useTransition } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { addExpense } from './actions'

export default function ExpenseForm() {
  const [form, setForm] = useState({
    title: '',
    amount: '',
    currency: 'PLN',
    notes: '',
  })
  const [isPending, startTransition] = useTransition()

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value })
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    startTransition(async () => {
      await addExpense({
        title: form.title,
        amount: parseFloat(form.amount),
        currency: form.currency,
        notes: form.notes,
      })
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label>Title</Label>
        <Input
          name="title"
          value={form.title}
          onChange={handleChange}
          required
        />
      </div>

      <div>
        <Label>Amount</Label>
        <Input
          name="amount"
          type="number"
          value={form.amount}
          onChange={handleChange}
          required
        />
      </div>

      <div>
        <Label>Currency</Label>
        <Input name="currency" value={form.currency} onChange={handleChange} />
      </div>

      <div>
        <Label>Notes</Label>
        <Input name="notes" value={form.notes} onChange={handleChange} />
      </div>

      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? 'Saving...' : 'Save'}
      </Button>
    </form>
  )
}
