'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function getExpenses() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('expenses')
    .select('id, title, amount, currency, date, notes, category_id')
    .order('date', { ascending: false })

  if (error) throw error
  return data
}

export async function addExpense(expense: {
  title: string
  amount: number
  currency?: string
  date?: string
  notes?: string
  category_id?: string | null
}) {
  const supabase = await createClient()
  const { error } = await supabase.from('expenses').insert([expense])
  if (error) throw error
  revalidatePath('/expenses')
}

export async function updateExpense(id: string, updates: Record<string, any>) {
  const supabase = await createClient()
  const { error } = await supabase.from('expenses').update(updates).eq('id', id)
  if (error) throw error
  revalidatePath('/expenses')
}

export async function deleteExpense(id: string) {
  const supabase = await createClient()
  const { error } = await supabase.from('expenses').delete().eq('id', id)
  if (error) throw error
  revalidatePath('/expenses')
}
