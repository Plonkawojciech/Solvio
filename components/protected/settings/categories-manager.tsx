'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTranslation } from '@/lib/i18n'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Plus, Trash2, Edit2, Check, X, RefreshCw, Smile } from 'lucide-react'
import { toast } from 'sonner'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover'

// Curated emoji icon palette
const CATEGORY_ICONS = [
  '🍔', '🛒', '💊', '🚗', '👕', '💻', '🏠', '🎬', '💡', '📦',
  '☕', '🍕', '🍺', '🎮', '🏋️', '✈️', '🎁', '📚', '🐾', '💰',
  '🏥', '🚌', '⛽', '🛍️', '🍰', '🎵', '🧴', '🧹', '🌿', '🔧',
  '📱', '🖥️', '📷', '👶', '🐶', '🌎', '🏖️', '🎯', '💳', '🏦',
]

interface Category {
  id: string
  name: string
  icon?: string | null
}

function IconPicker({
  value,
  onChange,
}: {
  value: string
  onChange: (icon: string) => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-10 w-10 shrink-0 text-lg"
          aria-label="Pick emoji icon"
        >
          {value || <Smile className="h-4 w-4 text-muted-foreground" />}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-2" align="start">
        <p className="text-xs text-muted-foreground mb-2 px-1">Pick an icon</p>
        <div className="grid grid-cols-8 gap-1">
          {/* Empty / clear option */}
          <Button
            type="button"
            variant={!value ? 'secondary' : 'ghost'}
            size="icon"
            className="h-8 w-8 text-muted-foreground"
            onClick={() => { onChange(''); setOpen(false) }}
            aria-label="No icon"
          >
            <X className="h-3 w-3" />
          </Button>
          {CATEGORY_ICONS.map(emoji => (
            <Button
              key={emoji}
              type="button"
              variant={value === emoji ? 'secondary' : 'ghost'}
              size="icon"
              className="h-8 w-8 text-base"
              onClick={() => { onChange(emoji); setOpen(false) }}
            >
              {emoji}
            </Button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}

const rowVariants = {
  hidden: { opacity: 0, y: -8 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.25 } },
  exit: { opacity: 0, x: -16, transition: { duration: 0.2 } },
} as any

export function CategoriesManager({ initialCategories }: { initialCategories: Category[] }) {
  const { t, lang } = useTranslation()
  const [categories, setCategories] = useState<Category[]>(initialCategories)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [newCategoryIcon, setNewCategoryIcon] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editIcon, setEditIcon] = useState('')
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [seeding, setSeeding] = useState(false)

  const seedCategories = async () => {
    setSeeding(true)
    try {
      const response = await fetch('/api/v1/seed-categories', { method: 'POST' })
      const data = await response.json()

      if (!response.ok) {
        toast.error(lang === 'pl' ? 'Nie udało się załadować kategorii' : 'Failed to seed categories', {
          description: data.error || (lang === 'pl' ? 'Nieznany błąd' : 'Unknown error'),
        })
        return
      }

      toast.success(lang === 'pl' ? 'Kategorie zaktualizowane!' : 'Categories updated!', {
        description: data.message || (lang === 'pl' ? 'Kategorie domyślne zostały załadowane.' : 'Default categories have been loaded.'),
      })

      // Refresh categories list
      const res = await fetch('/api/data/settings')
      const settingsData = await res.json()
      if (settingsData?.categories) {
        setCategories(settingsData.categories.map((c: Category) => ({
          id: c.id,
          name: c.name,
          icon: c.icon ?? null,
        })))
      }

      setTimeout(() => window.location.reload(), 1000)
    } catch (error) {
      toast.error(lang === 'pl' ? 'Nie udało się załadować kategorii' : 'Failed to seed categories', {
        description: error instanceof Error ? error.message : (lang === 'pl' ? 'Nieznany błąd' : 'Unknown error'),
      })
    } finally {
      setSeeding(false)
    }
  }

  const addCategory = async () => {
    const name = newCategoryName.trim()
    if (!name) {
      toast.error(lang === 'pl' ? 'Nazwa kategorii jest wymagana' : 'Category name is required')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/data/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, icon: newCategoryIcon || null }),
      })
      if (!res.ok) throw new Error('Failed to add category')
      const data = await res.json()
      setCategories(prev => [...prev, { id: data.id, name: data.name, icon: data.icon ?? null }])
      setNewCategoryName('')
      setNewCategoryIcon('')
      toast.success(lang === 'pl' ? 'Kategoria dodana pomyślnie' : 'Category added successfully')
    } catch {
      toast.error(lang === 'pl' ? 'Nie udało się dodać kategorii' : 'Failed to add category')
    } finally {
      setLoading(false)
    }
  }

  const startEditing = (cat: Category) => {
    setEditingId(cat.id)
    setEditName(cat.name)
    setEditIcon(cat.icon ?? '')
  }

  const cancelEditing = () => {
    setEditingId(null)
    setEditName('')
    setEditIcon('')
  }

  const saveCategory = async (id: string) => {
    const name = editName.trim()
    if (!name) {
      toast.error(lang === 'pl' ? 'Nazwa kategorii nie może być pusta' : 'Category name cannot be empty')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/data/categories', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, name, icon: editIcon || null }),
      })
      if (!res.ok) throw new Error('Failed to update category')
      setCategories(prev =>
        prev.map(c => c.id === id ? { ...c, name, icon: editIcon || null } : c)
      )
      cancelEditing()
      toast.success(lang === 'pl' ? 'Kategoria zaktualizowana' : 'Category updated')
    } catch {
      toast.error(lang === 'pl' ? 'Nie udało się zaktualizować kategorii' : 'Failed to update category')
    } finally {
      setLoading(false)
    }
  }

  const deleteCategory = async () => {
    if (!deleteId) return

    setLoading(true)
    try {
      const res = await fetch('/api/data/categories', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: deleteId }),
      })
      if (!res.ok) throw new Error('Failed to delete category')
      setCategories(prev => prev.filter(c => c.id !== deleteId))
      toast.success(lang === 'pl' ? 'Kategoria usunięta' : 'Category deleted')
    } catch {
      toast.error(lang === 'pl' ? 'Nie udało się usunąć kategorii' : 'Failed to delete category')
    } finally {
      setDeleteId(null)
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Seed Default Categories */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 border rounded-lg bg-muted/50">
        <div>
          <p className="font-medium text-sm">{t('settings.defaultCategories')}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{t('settings.defaultCategoriesDesc')}</p>
        </div>
        <Button onClick={seedCategories} disabled={seeding} variant="outline" size="sm" className="shrink-0">
          <RefreshCw className={`h-4 w-4 mr-2 ${seeding ? 'animate-spin' : ''}`} />
          {seeding ? t('settings.loadingDefaults') : t('settings.loadDefaults')}
        </Button>
      </div>

      {/* Add New Category */}
      <div className="flex gap-2 items-end">
        <div className="shrink-0">
          <Label className="sr-only">Icon</Label>
          <IconPicker value={newCategoryIcon} onChange={setNewCategoryIcon} />
        </div>
        <div className="flex-1">
          <Label htmlFor="new-category" className="sr-only">{t('settings.categoryName')}</Label>
          <Input
            id="new-category"
            placeholder={lang === 'pl'
              ? 'Nazwa kategorii (np. Elektronika, Jedzenie)'
              : 'Category name (e.g., Electronics, Food)'}
            value={newCategoryName}
            onChange={(e) => setNewCategoryName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') addCategory() }}
            disabled={loading}
          />
        </div>
        <Button
          onClick={addCategory}
          disabled={loading || !newCategoryName.trim()}
          className="shrink-0"
        >
          <Plus className="h-4 w-4 mr-2" />
          {t('common.add')}
        </Button>
      </div>

      {/* Categories Table */}
      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12 pl-4">
                {lang === 'pl' ? 'Ikona' : 'Icon'}
              </TableHead>
              <TableHead>{t('settings.categoryName')}</TableHead>
              <TableHead className="w-36 text-right pr-4">{t('expenses.actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {categories.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="text-center text-muted-foreground py-10">
                  {t('settings.noCategories')}
                </TableCell>
              </TableRow>
            ) : (
              <AnimatePresence initial={false}>
                {categories.map((cat) => (
                  <motion.tr
                    key={cat.id}
                    variants={rowVariants}
                    initial="hidden"
                    animate="visible"
                    exit="exit"
                    layout
                    className="border-b last:border-0"
                  >
                    {/* Icon cell */}
                    <TableCell className="pl-4 py-3 w-12">
                      {editingId === cat.id ? (
                        <IconPicker value={editIcon} onChange={setEditIcon} />
                      ) : (
                        <span className="text-xl leading-none">
                          {cat.icon || <span className="text-muted-foreground text-sm">—</span>}
                        </span>
                      )}
                    </TableCell>

                    {/* Name cell */}
                    <TableCell className="py-3">
                      {editingId === cat.id ? (
                        <Input
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') saveCategory(cat.id)
                            if (e.key === 'Escape') cancelEditing()
                          }}
                          className="h-9 max-w-xs"
                          autoFocus
                        />
                      ) : (
                        <span className="font-medium">{cat.name}</span>
                      )}
                    </TableCell>

                    {/* Actions cell */}
                    <TableCell className="text-right pr-4 py-3">
                      {editingId === cat.id ? (
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => saveCategory(cat.id)}
                            disabled={loading}
                            aria-label="Save"
                          >
                            <Check className="h-4 w-4 text-green-600" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={cancelEditing}
                            disabled={loading}
                            aria-label="Cancel"
                          >
                            <X className="h-4 w-4 text-red-500" />
                          </Button>
                        </div>
                      ) : (
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => startEditing(cat)}
                            disabled={loading}
                            aria-label="Edit"
                          >
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setDeleteId(cat.id)}
                            disabled={loading}
                            aria-label="Delete"
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </motion.tr>
                ))}
              </AnimatePresence>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('settings.deleteCategory')}</AlertDialogTitle>
            <AlertDialogDescription>{t('settings.deleteCategoryDesc')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={deleteCategory}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
