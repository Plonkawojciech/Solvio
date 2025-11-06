'use client'

import { Button } from '@/components/ui/button'
import { deleteExpense } from './actions'
import { useTransition } from 'react'

export default function ExpensesTable({ data }: { data: any[] }) {
  const [isPending, startTransition] = useTransition()

  if (!data?.length)
    return <p className="text-muted-foreground">No expenses found.</p>

  return (
    <table className="w-full border border-border rounded-lg overflow-hidden">
      <thead className="bg-muted/50">
        <tr className="text-left text-sm font-medium text-muted-foreground">
          <th className="p-3">Title</th>
          <th className="p-3">Amount</th>
          <th className="p-3">Date</th>
          <th className="p-3">Notes</th>
          <th className="p-3 text-right">Actions</th>
        </tr>
      </thead>
      <tbody>
        {data.map((exp) => (
          <tr key={exp.id} className="border-t border-border">
            <td className="p-3">{exp.title}</td>
            <td className="p-3">
              {exp.amount} {exp.currency}
            </td>
            <td className="p-3">{exp.date}</td>
            <td className="p-3">{exp.notes || '-'}</td>
            <td className="p-3 text-right">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => startTransition(() => deleteExpense(exp.id))}
                disabled={isPending}
              >
                Delete
              </Button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
