'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { t, getLanguage } from '@/lib/i18n'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Plus, Trash2, Edit2, Check, X, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

interface Category {
  id: string
  name: string
  icon?: string | null
}

export function CategoriesManager({ 
  initialCategories 
}: { 
  initialCategories: Category[] 
}) {
  const supabase = createClient()
  const [categories, setCategories] = useState<Category[]>(initialCategories)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [seeding, setSeeding] = useState(false)

  const seedCategories = async () => {
    setSeeding(true)
    try {
      const response = await fetch('/api/v1/seed-categories', {
        method: 'POST',
      })
      
      const data = await response.json()
      
      if (!response.ok) {
        toast.error('Failed to seed categories', {
          description: data.error || 'Unknown error',
        })
        return
      }
      
      toast.success('Categories updated!', {
        description: data.message || 'Categories have been updated.',
      })
      
      // Odśwież listę kategorii
      const { data: updatedCategories } = await supabase
        .from('categories')
        .select('id, name, icon')
        .order('name')
      
      if (updatedCategories) {
        setCategories(updatedCategories.map(c => ({
          id: c.id as string,
          name: c.name as string,
          icon: c.icon as string | null,
        })))
      }
      
      // Odśwież stronę po 1s
      setTimeout(() => {
        window.location.reload()
      }, 1000)
      
    } catch (error) {
      toast.error('Failed to seed categories', {
        description: error instanceof Error ? error.message : 'Unknown error',
      })
    } finally {
      setSeeding(false)
    }
  }

  const addCategory = async () => {
    if (!newCategoryName.trim()) {
      toast.error(t('settings.categoryName') + ' ' + (getLanguage() === 'pl' ? 'jest wymagane' : 'is required'))
      return
    }

    setLoading(true)
    const { data, error } = await supabase
      .from('categories')
      .insert([{ name: newCategoryName.trim() }])
      .select()
      .single()

    if (error) {
      toast.error(getLanguage() === 'pl' ? 'Nie udało się dodać kategorii' : 'Failed to add category')
      console.error(error)
    } else {
      setCategories([...categories, data])
      setNewCategoryName('')
      toast.success(getLanguage() === 'pl' ? 'Kategoria dodana pomyślnie' : 'Category added successfully')
    }
    setLoading(false)
  }

  const startEditing = (cat: Category) => {
    setEditingId(cat.id)
    setEditName(cat.name)
  }

  const cancelEditing = () => {
    setEditingId(null)
    setEditName('')
  }

  const saveCategory = async (id: string) => {
    if (!editName.trim()) {
      toast.error('Category name cannot be empty')
      return
    }

    setLoading(true)
    const { error } = await supabase
      .from('categories')
      .update({ name: editName.trim() })
      .eq('id', id)

    if (error) {
      toast.error('Failed to update category')
      console.error(error)
    } else {
      setCategories(categories.map(c => 
        c.id === id ? { ...c, name: editName.trim() } : c
      ))
      setEditingId(null)
      toast.success('Category updated')
    }
    setLoading(false)
  }

  const deleteCategory = async () => {
    if (!deleteId) return

    setLoading(true)
    const { error } = await supabase
      .from('categories')
      .delete()
      .eq('id', deleteId)

    if (error) {
      toast.error('Failed to delete category')
      console.error(error)
    } else {
      setCategories(categories.filter(c => c.id !== deleteId))
      toast.success('Category deleted')
    }
    setDeleteId(null)
    setLoading(false)
  }

  return (
    <div className="space-y-4">
      {/* Seed Default Categories Button */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 border rounded-lg bg-muted/50">
        <div>
          <p className="font-medium text-sm">{t('settings.defaultCategories')}</p>
          <p className="text-xs text-muted-foreground">
            {t('settings.defaultCategoriesDesc')}
          </p>
        </div>
        <Button 
          onClick={seedCategories} 
          disabled={seeding}
          variant="outline"
          size="sm"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${seeding ? 'animate-spin' : ''}`} />
          {seeding ? t('settings.loadingDefaults') : t('settings.loadDefaults')}
        </Button>
      </div>

      {/* Add New Category */}
      <div className="flex gap-2">
        <div className="flex-1">
          <Label htmlFor="new-category" className="sr-only">{t('settings.categoryName')}</Label>
          <Input
            id="new-category"
            placeholder={getLanguage() === 'pl' ? 'Nazwa kategorii (np. Elektronika, Jedzenie, Transport)' : 'Category name (e.g., Electronics, Food, Transport)'}
            value={newCategoryName}
            onChange={(e) => setNewCategoryName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') addCategory()
            }}
            disabled={loading}
          />
        </div>
        <Button onClick={addCategory} disabled={loading || !newCategoryName.trim()}>
          <Plus className="h-4 w-4 mr-2" />
          {t('common.add')}
        </Button>
      </div>

      {/* Categories Table */}
      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('settings.categoryName')}</TableHead>
              <TableHead className="w-32 text-right">{t('expenses.actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {categories.length === 0 ? (
              <TableRow>
                <TableCell colSpan={2} className="text-center text-muted-foreground py-8">
                  {t('settings.noCategories')}
                </TableCell>
              </TableRow>
            ) : (
              categories.map((cat) => (
                <TableRow key={cat.id}>
                  <TableCell>
                    {editingId === cat.id ? (
                      <Input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') saveCategory(cat.id)
                          if (e.key === 'Escape') cancelEditing()
                        }}
                        className="h-8"
                        autoFocus
                      />
                    ) : (
                      <span className="font-medium">{cat.name}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {editingId === cat.id ? (
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => saveCategory(cat.id)}
                          disabled={loading}
                        >
                          <Check className="h-4 w-4 text-green-600" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={cancelEditing}
                          disabled={loading}
                        >
                          <X className="h-4 w-4 text-red-600" />
                        </Button>
                      </div>
                    ) : (
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => startEditing(cat)}
                          disabled={loading}
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeleteId(cat.id)}
                          disabled={loading}
                        >
                          <Trash2 className="h-4 w-4 text-red-600" />
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('settings.deleteCategory')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('settings.deleteCategoryDesc')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={deleteCategory} className="bg-red-600 hover:bg-red-700">
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
