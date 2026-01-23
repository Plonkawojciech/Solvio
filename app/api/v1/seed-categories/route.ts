import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// 10 kategorii dla zakupów
const CATEGORIES = [
  { name: 'Food', icon: '🍔' },
  { name: 'Groceries', icon: '🛒' },
  { name: 'Health', icon: '💊' },
  { name: 'Transport', icon: '🚗' },
  { name: 'Shopping', icon: '🛍️' },
  { name: 'Electronics', icon: '📱' },
  { name: 'Home & Garden', icon: '🏠' },
  { name: 'Entertainment', icon: '🎬' },
  { name: 'Bills & Utilities', icon: '💡' },
  { name: 'Other', icon: '📦' },
]

export async function POST() {
  try {
    const supabase = await createClient()
    
    // Pobierz istniejące kategorie
    const { data: existingCategories } = await supabase
      .from('categories')
      .select('id, name')
    
    const existingNames = new Set(existingCategories?.map(c => c.name.toLowerCase()) || [])
    const categoryNames = new Set(CATEGORIES.map(c => c.name.toLowerCase()))
    
    // Usuń stare kategorie (których nie ma w nowej liście)
    const categoriesToDelete = existingCategories?.filter(
      cat => !categoryNames.has(cat.name.toLowerCase())
    ) || []
    
    if (categoriesToDelete.length > 0) {
      const idsToDelete = categoriesToDelete.map(c => c.id)
      const { error: deleteError } = await supabase
        .from('categories')
        .delete()
        .in('id', idsToDelete)
      
      if (deleteError) {
        console.error('[Seed Categories] Delete error:', deleteError)
      } else {
        console.log(`[Seed Categories] Deleted ${categoriesToDelete.length} old categories`)
      }
    }
    
    // Dodaj tylko nowe kategorie (których jeszcze nie ma)
    const newCategories = CATEGORIES.filter(
      cat => !existingNames.has(cat.name.toLowerCase())
    )
    
    if (newCategories.length === 0) {
      return NextResponse.json({
        message: 'All categories already exist',
        categories: CATEGORIES.length,
        deleted: categoriesToDelete.length,
      })
    }
    
    // Wstaw nowe kategorie
    const { data, error } = await supabase
      .from('categories')
      .insert(newCategories)
      .select()
    
    if (error) {
      console.error('[Seed Categories] Error:', error)
      return NextResponse.json(
        { error: 'Failed to seed categories', details: error.message },
        { status: 500 }
      )
    }
    
    return NextResponse.json({
      message: `Updated categories: added ${newCategories.length}, deleted ${categoriesToDelete.length}`,
      added: data,
      deleted: categoriesToDelete.map(c => c.name),
      total: CATEGORIES.length,
    })
    
  } catch (error) {
    console.error('[Seed Categories] Unexpected error:', error)
    return NextResponse.json(
      { error: 'Unexpected error', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    )
  }
}
