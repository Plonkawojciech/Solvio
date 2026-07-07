'use client'

import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { useTranslation } from '@/lib/i18n'
import { formatAmount } from '@/lib/format'
import { useProductType } from '@/hooks/use-product-type'
import { getCategoryColor, getCategoryBadgeClass } from '@/lib/category-colors'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/components/ui/sheet'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Loader2, Trash2, Edit2, Check, X, Image as ImageIcon,
  ReceiptText, AlertCircle, RefreshCw, Search, FilterX,
  Download, ChevronLeft, ChevronRight, Share2, QrCode, Copy, CheckCheck,
  DollarSign, ClipboardCheck, ArrowDownUp, SlidersHorizontal,
} from 'lucide-react'
import dynamic from 'next/dynamic'
import Image from 'next/image'

const LazyApprovalsPage = dynamic(() => import('../approvals/page'), { ssr: false })
import { AddExpenseTrigger } from '@/components/protected/dashboard/add-expense-trigger'
import { ScanReceiptButton } from '@/components/protected/dashboard/scan-receipt-button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'

interface Expense {
  id: string
  title: string
  amount: number | string
  date: string
  vendor: string | null
  notes: string | null
  categoryId: string | null
  receiptId: string | null
  tags: string[] | null
  currency?: string
}

interface ReceiptItem {
  name: string
  quantity?: number | null
  price?: number | null
  categoryId?: string | null
}

const PAGE_SIZE = 20

// ─── Skeleton row (list) ──────────────────────────────────────────────────────
function ListRowSkeleton() {
  return (
    <div className="flex items-center gap-2 rounded-lg px-2 py-2">
      <Skeleton className="h-4 w-4 rounded" />
      <Skeleton className="h-3 w-12 rounded" />
      <Skeleton className="h-2 w-2 rounded-full" />
      <div className="flex-1 space-y-1.5">
        <Skeleton className="h-4 w-40 rounded" />
        <Skeleton className="h-3 w-28 rounded" />
      </div>
      <Skeleton className="h-4 w-16 rounded" />
    </div>
  )
}

// ─── Main component ────────────────────────────────────────────────────────────
export default function ExpensesPage() {
  const { t, lang } = useTranslation()
  const router = useRouter()
  const { isBusiness } = useProductType()
  const [activeExpenseTab, setActiveExpenseTab] = useState<'expenses' | 'approvals'>('expenses')

  const translateCategoryName = useCallback((categoryName: string): string => {
    const categoryMap: Record<string, string> = {
      'Food': t('categories.food'),
      'Groceries': t('categories.groceries'),
      'Health': t('categories.health'),
      'Transport': t('categories.transport'),
      'Shopping': t('categories.shopping'),
      'Electronics': t('categories.electronics'),
      'Home & Garden': t('categories.homeGarden'),
      'Entertainment': t('categories.entertainment'),
      'Bills & Utilities': t('categories.billsUtilities'),
      'Other': t('categories.other'),
    }
    return categoryMap[categoryName] || categoryName
  }, [t])

  const [expenses, setExpenses] = useState<Expense[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [isBulkDeleteDialogOpen, setIsBulkDeleteDialogOpen] = useState(false)
  const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [receiptItems, setReceiptItems] = useState<ReceiptItem[]>([])
  const [loadingReceiptItems, setLoadingReceiptItems] = useState(false)
  const [categories, setCategories] = useState<Map<string, string>>(new Map())
  const [categoriesList, setCategoriesList] = useState<Array<{ id: string; name: string }>>([])
  const [currency, setCurrency] = useState<string>('PLN')

  const [selectedExpenseIds, setSelectedExpenseIds] = useState<Set<string>>(new Set())
  const [isBulkDeleting, setIsBulkDeleting] = useState(false)
  const [selectedItemIndices, setSelectedItemIndices] = useState<Set<number>>(new Set())

  // Inline edit — expense
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null)
  const [editExpenseTitle, setEditExpenseTitle] = useState('')
  const [editExpenseAmount, setEditExpenseAmount] = useState('')
  const [editExpenseTitleError, setEditExpenseTitleError] = useState<string | null>(null)
  const [editExpenseAmountError, setEditExpenseAmountError] = useState<string | null>(null)
  const [isSavingExpense, setIsSavingExpense] = useState(false)

  // Inline edit — receipt item
  const [editingItemIndex, setEditingItemIndex] = useState<number | null>(null)
  const [editItemName, setEditItemName] = useState('')
  const [editItemPrice, setEditItemPrice] = useState('')
  const [editItemCategory, setEditItemCategory] = useState('')
  const [editItemNameError, setEditItemNameError] = useState<string | null>(null)
  const [editItemPriceError, setEditItemPriceError] = useState<string | null>(null)
  const [isSavingItem, setIsSavingItem] = useState(false)

  // Receipt image
  const [receiptImageUrl, setReceiptImageUrl] = useState<string | null>(null)
  const [isImageDialogOpen, setIsImageDialogOpen] = useState(false)
  const [loadingImage, setLoadingImage] = useState(false)
  const [viewingReceiptId, setViewingReceiptId] = useState<string | null>(null)
  const [shareCopied, setShareCopied] = useState(false)
  const [showShareQr, setShowShareQr] = useState(false)
  const [panelShareCopied, setPanelShareCopied] = useState(false)

  // Mobile detail sheet
  const [isDetailSheetOpen, setIsDetailSheetOpen] = useState(false)

  // Search & filter
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [filterCategoryId, setFilterCategoryId] = useState<string>('all')
  const [filterTag, setFilterTag] = useState<string>('all')
  const [dateFrom, setDateFrom] = useState<string>('')
  const [dateTo, setDateTo] = useState<string>('')
  const [amountFrom, setAmountFrom] = useState<string>('')
  const [amountTo, setAmountTo] = useState<string>('')
  const [showMoreFilters, setShowMoreFilters] = useState(false)
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Sort preset
  type SortPreset = 'newest' | 'oldest' | 'highest' | 'lowest'
  const [sortPreset, setSortPreset] = useState<SortPreset>('newest')

  // Bulk delete inline confirmation
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false)

  // Pagination
  const [currentPage, setCurrentPage] = useState(1)

  // Add expense sheet — controlled externally for keyboard shortcut
  const [isAddExpenseOpen, setIsAddExpenseOpen] = useState(false)

  const handleSearchChange = (value: string) => {
    setSearchQuery(value)
    setCurrentPage(1)
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
    searchDebounceRef.current = setTimeout(() => setDebouncedSearch(value), 300)
  }

  const clearFilters = () => {
    setSearchQuery('')
    setDebouncedSearch('')
    setFilterCategoryId('all')
    setFilterTag('all')
    setDateFrom('')
    setDateTo('')
    setAmountFrom('')
    setAmountTo('')
    setCurrentPage(1)
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
  }

  const hasActiveFilters =
    debouncedSearch.trim() !== '' ||
    filterCategoryId !== 'all' ||
    filterTag !== 'all' ||
    dateFrom !== '' ||
    dateTo !== '' ||
    amountFrom !== '' ||
    amountTo !== ''

  const hasAmountRange = amountFrom !== '' || amountTo !== ''
  const hasMoreFilters = dateFrom !== '' || dateTo !== '' || hasAmountRange

  // ─── Keyboard shortcut: press "n" to open Add Expense sheet ──────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if any input, textarea, select, or contenteditable is focused
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase()
      const isEditable =
        tag === 'input' ||
        tag === 'textarea' ||
        tag === 'select' ||
        (e.target as HTMLElement)?.isContentEditable
      if (isEditable) return
      // Ignore modifier combos
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === 'n') {
        e.preventDefault()
        setIsAddExpenseOpen(true)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // ─── All unique tags from expense data ───────────────────────────────────
  const allTags = useMemo(() => {
    const tagSet = new Set<string>()
    expenses.forEach(e => {
      if (e.tags && e.tags.length > 0) {
        e.tags.forEach(tag => tagSet.add(tag))
      }
    })
    return Array.from(tagSet).sort()
  }, [expenses])

  // ─── Derived filtered + sorted + paginated list ───────────────────────────
  const filteredExpenses = useMemo(() => {
    return expenses.filter((e) => {
      const matchesSearch =
        debouncedSearch.trim() === '' ||
        e.title.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
        (e.vendor ?? '').toLowerCase().includes(debouncedSearch.toLowerCase())
      const matchesCategory =
        filterCategoryId === 'all' || e.categoryId === filterCategoryId
      const matchesTag =
        filterTag === 'all' || (e.tags && e.tags.includes(filterTag))
      const expDate = e.date ? e.date.slice(0, 10) : ''
      const matchesFrom = dateFrom === '' || expDate >= dateFrom
      const matchesTo = dateTo === '' || expDate <= dateTo
      const expAmount = parseFloat(String(e.amount))
      const matchesAmountFrom = amountFrom === '' || expAmount >= parseFloat(amountFrom)
      const matchesAmountTo = amountTo === '' || expAmount <= parseFloat(amountTo)
      return matchesSearch && matchesCategory && matchesTag && matchesFrom && matchesTo && matchesAmountFrom && matchesAmountTo
    })
  }, [expenses, debouncedSearch, filterCategoryId, filterTag, dateFrom, dateTo, amountFrom, amountTo])

  const sortedExpenses = useMemo(() => {
    return [...filteredExpenses].sort((a, b) => {
      if (sortPreset === 'oldest') return a.date.localeCompare(b.date)
      if (sortPreset === 'highest') return parseFloat(String(b.amount)) - parseFloat(String(a.amount))
      if (sortPreset === 'lowest') return parseFloat(String(a.amount)) - parseFloat(String(b.amount))
      return b.date.localeCompare(a.date) // newest
    })
  }, [filteredExpenses, sortPreset])

  const totalPages = Math.max(1, Math.ceil(sortedExpenses.length / PAGE_SIZE))
  const safePage = Math.min(currentPage, totalPages)
  const pageStart = (safePage - 1) * PAGE_SIZE
  const pageEnd = pageStart + PAGE_SIZE
  const pagedExpenses = sortedExpenses.slice(pageStart, pageEnd)

  // ─── CSV Export ───────────────────────────────────────────────────────────
  const handleExportCsv = () => {
    const rows = [
      ['Title', 'Vendor', 'Amount', 'Currency', 'Date', 'Category'],
      ...sortedExpenses.map(e => [
        `"${e.title.replace(/"/g, '""')}"`,
        `"${(e.vendor ?? '').replace(/"/g, '""')}"`,
        String(parseFloat(String(e.amount)).toFixed(2)),
        currency,
        e.date ? e.date.slice(0, 10) : '',
        `"${translateCategoryName(categories.get(e.categoryId ?? '') || '')}"`,
      ]),
    ]
    const csv = rows.map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `expenses_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // ─── Data fetching ───────────────────────────────────────────────────────────
  const fetchExpenses = useCallback(async (signal?: AbortSignal): Promise<Expense[] | undefined> => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/data/expenses', { signal })
      if (!res.ok) { setError(t('errors.fetchExpenses')); setLoading(false); return }
      const data = await res.json()
      const exps: Expense[] = data.expenses || []
      setExpenses(exps)

      const cats = data.categories || []
      const catMap = new Map<string, string>()
      cats.forEach((c: { id: string; name: string }) => catMap.set(c.id, c.name))
      setCategories(catMap)
      setCategoriesList(cats)

      const cur = (data.settings?.currency || 'PLN').toUpperCase()
      setCurrency(cur)

      setLoading(false)
      return exps
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      if (err.name === 'AbortError') return
      setError(t('errors.fetchExpenses'))
      setLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    fetchExpenses(controller.signal)
    return () => controller.abort()
  }, [fetchExpenses])

  // ─── After scan ──────────────────────────────────────────────────────────────
  const handleAfterScan = useCallback(async () => {
    const initial = expenses.length
    await fetchExpenses()
    window.dispatchEvent(new CustomEvent('expensesUpdated'))

    setTimeout(async () => {
      const updated = await fetchExpenses()
      window.dispatchEvent(new CustomEvent('expensesUpdated'))
      if (updated && updated.length > 0 && (updated.length > initial || !selectedExpense)) {
        const newest = updated[0]
        setSelectedExpense(newest)
        if (newest.receiptId) {
          setLoadingReceiptItems(true)
          try {
            const res = await fetch(`/api/data/receipts?id=${newest.receiptId}`)
            if (res.ok) {
              const receipt = await res.json()
              setReceiptItems(Array.isArray(receipt.items) ? receipt.items : [])
            }
          } finally {
            setLoadingReceiptItems(false)
          }
        }
      }
    }, 6000)
  }, [expenses.length, selectedExpense, fetchExpenses])

  // ─── Delete single ───────────────────────────────────────────────────────────
  const deleteExpense = async (id: string) => {
    setIsDeleting(true)
    try {
      const res = await fetch('/api/data/expenses', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [id] }),
      })
      if (!res.ok) throw new Error('Delete failed')
      setIsDeleteDialogOpen(false)
      setIsDetailSheetOpen(false)
      setSelectedExpense(null)
      setReceiptItems([])
      await fetchExpenses()
      window.dispatchEvent(new CustomEvent('expensesUpdated'))
      router.refresh()
      toast.success(t('expenses.deleted') || 'Expense deleted')
    } catch {
      toast.error(t('errors.saveFailed') || 'Failed to delete')
      setIsDeleteDialogOpen(false)
    } finally {
      setIsDeleting(false)
    }
  }

  // ─── Bulk delete ─────────────────────────────────────────────────────────────
  const bulkDeleteExpenses = async () => {
    if (selectedExpenseIds.size === 0) return
    setIsBulkDeleting(true)
    await fetch('/api/data/expenses', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: Array.from(selectedExpenseIds) }),
    })
    setSelectedExpenseIds(new Set())
    setSelectedExpense(null)
    setReceiptItems([])
    setIsBulkDeleteDialogOpen(false)
    setShowBulkDeleteConfirm(false)
    setIsDetailSheetOpen(false)
    await fetchExpenses()
    window.dispatchEvent(new CustomEvent('expensesUpdated'))
    router.refresh()
    setIsBulkDeleting(false)
  }

  // ─── Bulk delete items ───────────────────────────────────────────────────────
  const bulkDeleteItems = async () => {
    if (!selectedExpense || selectedItemIndices.size === 0) return
    const updatedItems = receiptItems.filter((_, idx) => !selectedItemIndices.has(idx))
    await saveReceiptItems(updatedItems)
    setSelectedItemIndices(new Set())
  }

  // ─── Selection helpers ───────────────────────────────────────────────────────
  const toggleExpenseSelection = (id: string) => {
    const s = new Set(selectedExpenseIds)
    if (s.has(id)) { s.delete(id) } else { s.add(id) }
    setSelectedExpenseIds(s)
  }

  const toggleExpenseSelectAll = () => {
    setSelectedExpenseIds(
      selectedExpenseIds.size === pagedExpenses.length
        ? new Set()
        : new Set(pagedExpenses.map(e => e.id))
    )
  }

  const toggleItemSelection = (index: number) => {
    const s = new Set(selectedItemIndices)
    if (s.has(index)) { s.delete(index) } else { s.add(index) }
    setSelectedItemIndices(s)
  }

  const toggleItemSelectAll = () => {
    setSelectedItemIndices(
      selectedItemIndices.size === receiptItems.length
        ? new Set()
        : new Set(receiptItems.map((_, idx) => idx))
    )
  }

  // ─── Expense inline edit ─────────────────────────────────────────────────────
  const startEditingExpense = (expense: Expense) => {
    setEditingExpenseId(expense.id)
    setEditExpenseTitle(expense.title)
    setEditExpenseAmount(String(expense.amount))
    setEditExpenseTitleError(null)
    setEditExpenseAmountError(null)
  }

  const cancelEditingExpense = () => {
    setEditingExpenseId(null)
    setEditExpenseTitle('')
    setEditExpenseAmount('')
    setEditExpenseTitleError(null)
    setEditExpenseAmountError(null)
  }

  const validateExpense = (): boolean => {
    let valid = true
    if (!editExpenseTitle.trim()) {
      setEditExpenseTitleError(t('expenses.titleRequired'))
      valid = false
    } else {
      setEditExpenseTitleError(null)
    }
    const parsedAmount = parseFloat(editExpenseAmount)
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setEditExpenseAmountError(t('expenses.amountRequired'))
      valid = false
    } else {
      setEditExpenseAmountError(null)
    }
    return valid
  }

  const saveExpense = async (id: string) => {
    if (!validateExpense()) return
    setIsSavingExpense(true)
    try {
      const newTitle = editExpenseTitle.trim()
      const newAmount = parseFloat(editExpenseAmount)
      const res = await fetch('/api/data/expenses', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, title: newTitle, amount: newAmount }),
      })
      if (!res.ok) throw new Error('Save failed')
      setEditingExpenseId(null)
      // Keep the detail panel in sync with the saved values
      setSelectedExpense(prev => prev && prev.id === id ? { ...prev, title: newTitle, amount: newAmount } : prev)
      await fetchExpenses()
      toast.success(t('expenses.saved') || 'Expense saved')
    } catch {
      toast.error(t('errors.saveFailed') || 'Failed to save')
    } finally {
      setIsSavingExpense(false)
    }
  }

  const handleExpenseKeyDown = (e: React.KeyboardEvent, id: string) => {
    if (e.key === 'Enter') { e.preventDefault(); saveExpense(id) }
    if (e.key === 'Escape') { e.preventDefault(); cancelEditingExpense() }
  }

  // ─── Receipt item inline edit ────────────────────────────────────────────────
  const startEditingItem = (index: number, item: ReceiptItem) => {
    setEditingItemIndex(index)
    setEditItemName(item.name)
    setEditItemPrice((item.price ?? 0).toString())
    setEditItemCategory(item.categoryId ?? '')
    setEditItemNameError(null)
    setEditItemPriceError(null)
  }

  const cancelEditingItem = () => {
    setEditingItemIndex(null)
    setEditItemName('')
    setEditItemPrice('')
    setEditItemCategory('')
    setEditItemNameError(null)
    setEditItemPriceError(null)
  }

  const validateItem = (): boolean => {
    let valid = true
    if (!editItemName.trim()) {
      setEditItemNameError(t('expenses.itemNameRequired'))
      valid = false
    } else {
      setEditItemNameError(null)
    }
    const parsedPrice = parseFloat(editItemPrice)
    if (isNaN(parsedPrice) || parsedPrice < 0) {
      setEditItemPriceError(t('expenses.itemPriceRequired'))
      valid = false
    } else {
      setEditItemPriceError(null)
    }
    return valid
  }

  const saveItem = async (index: number) => {
    if (!validateItem()) return
    setIsSavingItem(true)
    const updatedItems = [...receiptItems]
    updatedItems[index] = {
      ...updatedItems[index],
      name: editItemName.trim(),
      price: parseFloat(editItemPrice),
      categoryId: editItemCategory || null,
    }
    await saveReceiptItems(updatedItems)
    setEditingItemIndex(null)
    setIsSavingItem(false)
  }

  const handleItemKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (e.key === 'Enter') { e.preventDefault(); saveItem(index) }
    if (e.key === 'Escape') { e.preventDefault(); cancelEditingItem() }
  }

  const saveReceiptItems = async (items: ReceiptItem[]) => {
    if (!selectedExpense?.receiptId) return
    try {
      const res = await fetch('/api/data/receipts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selectedExpense.receiptId, items }),
      })
      if (res.ok) {
        setReceiptItems(items)
        toast.success(t('expenses.saved'))
        window.dispatchEvent(new CustomEvent('expensesUpdated'))
      } else {
        toast.error(t('errors.saveFailed'))
      }
    } catch {
      toast.error(t('errors.saveFailed'))
    }
  }

  // ─── Expense click / receipt items ──────────────────────────────────────────
  const handleExpenseClick = async (expense: Expense) => {
    setSelectedExpense(expense)
    setSelectedItemIndices(new Set())
    cancelEditingItem()
    if (expense.receiptId) {
      setLoadingReceiptItems(true)
      setReceiptItems([])
      try {
        const res = await fetch(`/api/data/receipts?id=${expense.receiptId}`)
        if (res.ok) {
          const receipt = await res.json()
          setReceiptItems(Array.isArray(receipt.items) ? receipt.items : [])
        }
      } finally {
        setLoadingReceiptItems(false)
      }
    } else {
      setReceiptItems([])
    }
  }

  // Row click: select + fetch items; on mobile also open bottom sheet
  const openExpense = (expense: Expense) => {
    handleExpenseClick(expense)
    if (typeof window !== 'undefined' && !window.matchMedia('(min-width: 1024px)').matches) {
      setIsDetailSheetOpen(true)
    }
  }

  const handleViewReceiptImage = async (receiptId: string) => {
    setLoadingImage(true)
    setIsImageDialogOpen(true)
    setReceiptImageUrl(null)
    setViewingReceiptId(receiptId)
    setShareCopied(false)
    setShowShareQr(false)
    try {
      const res = await fetch(`/api/data/receipts?id=${receiptId}`)
      if (res.ok) {
        const receipt = await res.json()
        setReceiptImageUrl(receipt.imageUrl || null)
      }
    } finally {
      setLoadingImage(false)
    }
  }

  const copyReceiptLink = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      // fallback
      const el = document.createElement('textarea')
      el.value = url
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
    }
  }

  const handleShareReceipt = async () => {
    if (!viewingReceiptId) return
    await copyReceiptLink(`${window.location.origin}/receipt/${viewingReceiptId}`)
    setShareCopied(true)
    setTimeout(() => setShareCopied(false), 2000)
  }

  const handleShareFromPanel = async (receiptId: string) => {
    await copyReceiptLink(`${window.location.origin}/receipt/${receiptId}`)
    setPanelShareCopied(true)
    setTimeout(() => setPanelShareCopied(false), 2000)
  }

  // ─── Formatting helpers ──────────────────────────────────────────────────────
  const dateLocale = lang === 'pl' ? 'pl-PL' : 'en-GB'
  const formatShortDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString(dateLocale, { day: 'numeric', month: 'short' })

  const categoryNameOf = (categoryId: string | null): string | null => {
    if (!categoryId) return null
    const name = categories.get(categoryId)
    return name ? translateCategoryName(name) : null
  }

  // ─── Detail panel content (shared: desktop panel + mobile sheet) ────────────
  const renderExpenseDetail = (expense: Expense) => {
    const catName = categoryNameOf(expense.categoryId)
    return (
      <div className="space-y-4">
        {/* Header: title + meta + edit */}
        {editingExpenseId === expense.id ? (
          <div className="space-y-2">
            <div>
              <Input
                value={editExpenseTitle}
                onChange={(e) => {
                  setEditExpenseTitle(e.target.value)
                  if (e.target.value.trim()) setEditExpenseTitleError(null)
                }}
                onKeyDown={(e) => handleExpenseKeyDown(e, expense.id)}
                className={`h-9 text-sm font-semibold ${editExpenseTitleError ? 'border-destructive' : ''}`}
                aria-label={t('expenses.titleCol')}
              />
              {editExpenseTitleError && (
                <p className="text-destructive text-xs mt-0.5">{editExpenseTitleError}</p>
              )}
            </div>
            <div>
              <Input
                value={editExpenseAmount}
                onChange={(e) => {
                  setEditExpenseAmount(e.target.value)
                  if (parseFloat(e.target.value) > 0) setEditExpenseAmountError(null)
                }}
                onKeyDown={(e) => handleExpenseKeyDown(e, expense.id)}
                type="number"
                step="0.01"
                min="0.01"
                className={`h-9 w-36 text-sm tabular-nums ${editExpenseAmountError ? 'border-destructive' : ''}`}
                aria-label={t('expenses.amount')}
              />
              {editExpenseAmountError && (
                <p className="text-destructive text-xs mt-0.5">{editExpenseAmountError}</p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={() => saveExpense(expense.id)} disabled={isSavingExpense} className="gap-1.5" suppressHydrationWarning>
                {isSavingExpense ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                {t('expenses.saveEdit')}
              </Button>
              <Button variant="outline" size="sm" onClick={cancelEditingExpense} disabled={isSavingExpense} className="gap-1.5" suppressHydrationWarning>
                <X className="h-3.5 w-3.5" />
                {t('common.cancel')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-start justify-between gap-2">
              <h2 className="text-lg font-extrabold leading-tight break-words min-w-0">
                {expense.title}
              </h2>
              <Button
                aria-label={t('expenses.editExpense')}
                variant="ghost"
                size="icon"
                onClick={() => startEditingExpense(expense)}
                className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
              >
                <Edit2 className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground">
              <span>{expense.vendor || '—'}</span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">{new Date(expense.date).toLocaleDateString(dateLocale)}</span>
              {catName && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className={`px-2 py-0.5 rounded-full font-semibold ${getCategoryBadgeClass(expense.categoryId!)}`}>
                    {catName}
                  </span>
                </>
              )}
            </div>
            <p className="text-3xl font-extrabold tabular-nums">
              {formatAmount(expense.amount, expense.currency || currency)}
            </p>
          </div>
        )}

        {/* Receipt items */}
        {expense.receiptId ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="nb-label" suppressHydrationWarning>
                {t('expenses.receiptItems')} ({receiptItems.length})
              </p>
              {selectedItemIndices.size > 0 && (
                <Button variant="destructive" size="sm" onClick={bulkDeleteItems} className="h-7 text-xs gap-1" suppressHydrationWarning>
                  <Trash2 className="h-3 w-3" />
                  {t('expenses.delete')} {selectedItemIndices.size}
                </Button>
              )}
            </div>
            {loadingReceiptItems ? (
              <div className="space-y-2 py-1">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <Skeleton className="h-4 w-4 rounded" />
                    <Skeleton className="h-4 flex-1 rounded" />
                    <Skeleton className="h-4 w-16 rounded" />
                  </div>
                ))}
              </div>
            ) : receiptItems.length > 0 ? (
              <div className="space-y-1">
                <div className="flex items-center gap-2 pb-1.5 border-b">
                  <Checkbox
                    checked={selectedItemIndices.size === receiptItems.length && receiptItems.length > 0}
                    onCheckedChange={toggleItemSelectAll}
                    aria-label={t('expenses.selectAll')}
                  />
                  <span className="text-xs text-muted-foreground" suppressHydrationWarning>{t('expenses.selectAll')}</span>
                </div>
                <div className="max-h-[40vh] overflow-y-auto space-y-1 pr-1">
                  {receiptItems.map((item, index) => (
                    editingItemIndex === index ? (
                      <div key={index} className="rounded-lg border p-2.5 space-y-2 bg-muted/20">
                        <div>
                          <Input
                            value={editItemName}
                            onChange={(e) => {
                              setEditItemName(e.target.value)
                              if (e.target.value.trim()) setEditItemNameError(null)
                            }}
                            onKeyDown={(e) => handleItemKeyDown(e, index)}
                            className={`h-8 text-sm ${editItemNameError ? 'border-destructive' : ''}`}
                            placeholder={t('expenses.itemName')}
                          />
                          {editItemNameError && (
                            <p className="text-destructive text-xs mt-0.5">{editItemNameError}</p>
                          )}
                        </div>
                        <div>
                          <Input
                            value={editItemPrice}
                            onChange={(e) => {
                              setEditItemPrice(e.target.value)
                              if (parseFloat(e.target.value) >= 0) setEditItemPriceError(null)
                            }}
                            onKeyDown={(e) => handleItemKeyDown(e, index)}
                            type="number"
                            step="0.01"
                            min="0"
                            className={`h-8 text-sm tabular-nums ${editItemPriceError ? 'border-destructive' : ''}`}
                            placeholder={t('expenses.price')}
                          />
                          {editItemPriceError && (
                            <p className="text-destructive text-xs mt-0.5">{editItemPriceError}</p>
                          )}
                        </div>
                        <Select value={editItemCategory} onValueChange={setEditItemCategory}>
                          <SelectTrigger className="h-8 text-sm" suppressHydrationWarning>
                            <SelectValue placeholder={t('expenses.category')} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="" suppressHydrationWarning>{t('expenses.noCategory')}</SelectItem>
                            {categoriesList.map(cat => (
                              <SelectItem key={cat.id} value={cat.id}>
                                {translateCategoryName(cat.name)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" onClick={() => saveItem(index)} disabled={isSavingItem} className="h-8 w-8" aria-label={t('expenses.saveItem')}>
                            {isSavingItem ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4 text-green-600" />}
                          </Button>
                          <Button variant="ghost" size="icon" onClick={cancelEditingItem} className="h-8 w-8" aria-label={t('expenses.cancelEditItem')}>
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div key={index} className="group flex items-center gap-2 rounded-lg px-1.5 py-1.5 hover:bg-muted/40 transition-colors">
                        <Checkbox
                          checked={selectedItemIndices.has(index)}
                          onCheckedChange={() => toggleItemSelection(index)}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{item.name}</p>
                          <p className="text-[11px] text-muted-foreground truncate" suppressHydrationWarning>
                            {item.categoryId
                              ? categoryNameOf(item.categoryId) || translateCategoryName('Other')
                              : t('expenses.noCategory')}
                          </p>
                        </div>
                        <span className="text-sm font-bold tabular-nums shrink-0">
                          {formatAmount(item.price ?? 0, expense.currency || currency)}
                        </span>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => startEditingItem(index, item)}
                          className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
                          aria-label={t('expenses.editItem')}
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground py-2" suppressHydrationWarning>
                {t('expenses.noItems')}
              </p>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground" suppressHydrationWarning>
            {t('expenses.noReceiptAttached')}
          </p>
        )}

        {/* Tags */}
        {expense.tags && expense.tags.length > 0 && (
          <div className="space-y-1.5">
            <p className="nb-label" suppressHydrationWarning>{t('expenses.tags')}</p>
            <div className="flex flex-wrap gap-1">
              {expense.tags.map(tag => (
                <span key={tag} className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Notes */}
        {expense.notes && (
          <div className="space-y-1.5">
            <p className="nb-label" suppressHydrationWarning>{t('addExpense.notes')}</p>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap break-words">{expense.notes}</p>
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-wrap gap-2 border-t pt-3">
          {expense.receiptId && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleViewReceiptImage(expense.receiptId!)}
                className="gap-1.5 text-xs"
                suppressHydrationWarning
              >
                <ImageIcon className="h-3.5 w-3.5" />
                {t('expenses.viewReceipt')}
              </Button>
              <Button variant="outline" size="sm" asChild className="gap-1.5 text-xs">
                <a href={`/receipt/${expense.receiptId}`} target="_blank" rel="noopener noreferrer" suppressHydrationWarning>
                  <ReceiptText className="h-3.5 w-3.5" />
                  {t('expenses.viewEReceipt')}
                </a>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleShareFromPanel(expense.receiptId!)}
                className="gap-1.5 text-xs"
                suppressHydrationWarning
              >
                {panelShareCopied
                  ? <><CheckCheck className="h-3.5 w-3.5" /> {t('expenses.linkCopied')}</>
                  : <><Share2 className="h-3.5 w-3.5" /> {t('expenses.copyLink')}</>
                }
              </Button>
            </>
          )}
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setIsDeleteDialogOpen(true)}
            className="gap-1.5 text-xs"
            suppressHydrationWarning
          >
            <Trash2 className="h-3.5 w-3.5" />
            {t('expenses.delete')}
          </Button>
        </div>
      </div>
    )
  }

  // ─── Approvals tab for business ────────────────────────────────────────────
  if (isBusiness && activeExpenseTab === 'approvals') {
    return (
      <main className="min-h-screen w-full p-2 sm:p-4 md:p-6 lg:p-10">
        <div className="flex flex-col h-full space-y-4 sm:space-y-6 md:space-y-10">
          {/* Tab bar */}
          <div className="flex gap-1 p-1 bg-muted/50 rounded-lg w-fit">
            <button
              onClick={() => setActiveExpenseTab('expenses')}
              className="flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-all text-muted-foreground hover:text-foreground"
              suppressHydrationWarning
            >
              <DollarSign className="h-4 w-4" />
              {t('expenses.tab.expenses')}
            </button>
            <button
              onClick={() => setActiveExpenseTab('approvals')}
              className="flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-all bg-background shadow-sm text-foreground"
              suppressHydrationWarning
            >
              <ClipboardCheck className="h-4 w-4" />
              {t('expenses.tab.approvals')}
            </button>
          </div>
          <LazyApprovalsPage />
        </div>
      </main>
    )
  }

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    <main className="min-h-screen w-full p-2 sm:p-4 md:p-6 lg:p-10">
      <div className="flex flex-col h-full space-y-4 sm:space-y-6 md:space-y-8">

        {/* ── Business Tab Bar ── */}
        {isBusiness && (
          <div className="flex gap-1 p-1 bg-muted/50 rounded-lg w-fit">
            <button
              onClick={() => setActiveExpenseTab('expenses')}
              className="flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-all bg-background shadow-sm text-foreground"
              suppressHydrationWarning
            >
              <DollarSign className="h-4 w-4" />
              {t('expenses.tab.expenses')}
            </button>
            <button
              onClick={() => setActiveExpenseTab('approvals')}
              className="flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-all text-muted-foreground hover:text-foreground"
              suppressHydrationWarning
            >
              <ClipboardCheck className="h-4 w-4" />
              {t('expenses.tab.approvals')}
            </button>
          </div>
        )}

        {/* ── Header ── */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 sm:gap-6">
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight" suppressHydrationWarning>
            {t('expenses.title')}
          </h1>
          <div className="flex items-center gap-1 sm:gap-2 flex-wrap">
            <AnimatePresence>
              {selectedExpenseIds.size > 0 && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ duration: 0.15 }}
                  className="flex items-center gap-1"
                >
                  {showBulkDeleteConfirm ? (
                    <>
                      <span className="text-xs text-muted-foreground whitespace-nowrap" suppressHydrationWarning>
                        {t('expenses.bulkDeleteConfirmPrompt')}
                      </span>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={bulkDeleteExpenses}
                        disabled={isBulkDeleting}
                        className="text-xs sm:text-sm"
                      >
                        {isBulkDeleting
                          ? <Loader2 className="h-3 w-3 animate-spin" />
                          : <><Trash2 className="mr-1 h-3 w-3" />{t('expenses.bulkDeleteConfirmYes')} {selectedExpenseIds.size}</>
                        }
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowBulkDeleteConfirm(false)}
                        disabled={isBulkDeleting}
                        className="text-xs sm:text-sm"
                        suppressHydrationWarning
                      >
                        {t('common.cancel')}
                      </Button>
                    </>
                  ) : (
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => setShowBulkDeleteConfirm(true)}
                      className="text-xs sm:text-sm"
                    >
                      <Trash2 className="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4" />
                      <span className="hidden sm:inline" suppressHydrationWarning>{t('expenses.delete')} </span>
                      {selectedExpenseIds.size}
                    </Button>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
            {expenses.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportCsv}
                className="text-xs sm:text-sm gap-1.5"
                suppressHydrationWarning
              >
                <Download className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{t('expenses.exportCsv')}</span>
                <span className="sm:hidden">CSV</span>
              </Button>
            )}
            <ScanReceiptButton onAction={handleAfterScan} />
            <AddExpenseTrigger
              open={isAddExpenseOpen}
              onOpenChange={setIsAddExpenseOpen}
              allExpenses={expenses}
              onAction={async () => {
                await fetchExpenses()
                window.dispatchEvent(new CustomEvent('expensesUpdated'))
              }}
            />
          </div>
        </div>

        {/* ── Content ── */}
        <section className="flex-1">
          {loading ? (
            /* ── Loading skeleton ── */
            <div role="status" aria-busy="true" aria-live="polite" className="space-y-4">
              <span className="sr-only" suppressHydrationWarning>{t('common.loading')}</span>
              {/* Filter bar skeleton */}
              <div className="flex flex-col sm:flex-row gap-2">
                <Skeleton className="h-9 flex-1 rounded-md" />
                <Skeleton className="h-9 w-full sm:w-44 rounded-md" />
                <Skeleton className="h-9 w-full sm:w-36 rounded-md" />
                <Skeleton className="h-9 w-full sm:w-32 rounded-md" />
              </div>
              {/* Master-detail skeleton */}
              <div className="grid gap-4 lg:grid-cols-[1.2fr_0.9fr] items-start">
                <Card>
                  <CardContent className="p-2 sm:p-3 space-y-1">
                    {Array.from({ length: 8 }).map((_, i) => <ListRowSkeleton key={i} />)}
                  </CardContent>
                </Card>
                <Card className="hidden lg:block">
                  <CardContent className="p-4 space-y-4">
                    <Skeleton className="h-6 w-3/4 rounded" />
                    <Skeleton className="h-4 w-1/2 rounded" />
                    <Skeleton className="h-9 w-32 rounded" />
                    <div className="space-y-2 pt-2">
                      {Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="flex items-center gap-3">
                          <Skeleton className="h-4 flex-1 rounded" />
                          <Skeleton className="h-4 w-14 rounded" />
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          ) : error ? (
            /* ── Error state ── */
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center justify-center py-32 gap-4"
              role="alert"
            >
              <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-destructive">
                {'// ERROR'}
              </p>
              <div className="flex items-center justify-center w-16 h-16 border border-destructive bg-destructive/10 shadow-[var(--nb-shadow-sm)] rounded-md">
                <AlertCircle className="h-8 w-8 text-destructive" />
              </div>
              <p className="text-center text-destructive text-lg font-medium">{error}</p>
              <Button
                onClick={() => fetchExpenses()}
                variant="outline"
                className="gap-2"
                suppressHydrationWarning
              >
                <RefreshCw className="h-4 w-4" />
                {t('expenses.retry')}
              </Button>
            </motion.div>
          ) : expenses.length === 0 ? (
            /* ── Empty state ── */
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="flex flex-col items-center justify-center py-20 sm:py-28 gap-5 text-center"
            >
              <div className="font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                {t('expenses.noExpensesTitle')}
              </div>
              <div className="flex items-center justify-center w-16 h-16 rounded-md border border-border bg-card text-foreground shadow-[var(--nb-shadow-sm)]">
                <ReceiptText className="h-7 w-7" aria-hidden="true" />
              </div>
              <div className="space-y-2 max-w-sm">
                <h2 className="text-xl font-extrabold tracking-tight" suppressHydrationWarning>
                  {t('expenses.noExpensesTitle')}
                </h2>
                <p className="text-muted-foreground text-sm leading-snug" suppressHydrationWarning>
                  {t('expenses.noExpensesDesc')}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-wrap justify-center pt-1">
                <ScanReceiptButton onAction={handleAfterScan} />
                <AddExpenseTrigger
                  open={isAddExpenseOpen}
                  onOpenChange={setIsAddExpenseOpen}
                  onAction={async () => {
                    await fetchExpenses()
                    window.dispatchEvent(new CustomEvent('expensesUpdated'))
                  }}
                />
              </div>
            </motion.div>
          ) : (
            /* ── Master-detail layout ── */
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.2 }}
              className="space-y-4"
            >
              {/* ── Filter bar (compact) ── */}
              <div className="flex flex-col gap-2">
                <div className="flex flex-col sm:flex-row gap-2">
                  {/* Search */}
                  <div className="relative flex-1">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" aria-hidden="true" />
                    <Input
                      type="search"
                      value={searchQuery}
                      onChange={(e) => handleSearchChange(e.target.value)}
                      placeholder={t('expenses.searchPlaceholder')}
                      className="pl-8 h-9 text-sm"
                      aria-label={t('expenses.searchPlaceholder')}
                      autoComplete="off"
                    />
                    <AnimatePresence>
                      {searchQuery && (
                        <motion.button
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.8 }}
                          onClick={() => handleSearchChange('')}
                          className="absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6 rounded flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/50 focus-visible:ring-offset-1"
                          aria-label={t('expenses.clearFilters')}
                          type="button"
                        >
                          <X className="h-3.5 w-3.5" />
                        </motion.button>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* Category filter */}
                  <Select value={filterCategoryId} onValueChange={(v) => { setFilterCategoryId(v); setCurrentPage(1) }}>
                    <SelectTrigger className="h-9 text-sm sm:w-44" suppressHydrationWarning>
                      <SelectValue placeholder={t('expenses.filterCategory')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all" suppressHydrationWarning>{t('expenses.allCategories')}</SelectItem>
                      {categoriesList.map(cat => (
                        <SelectItem key={cat.id} value={cat.id}>
                          {translateCategoryName(cat.name)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {/* Tag filter */}
                  {allTags.length > 0 && (
                    <Select value={filterTag} onValueChange={(v) => { setFilterTag(v); setCurrentPage(1) }}>
                      <SelectTrigger className="h-9 text-sm sm:w-36" suppressHydrationWarning>
                        <SelectValue placeholder={t('expenses.filterByTag')} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all" suppressHydrationWarning>{t('expenses.allTags')}</SelectItem>
                        {allTags.map(tag => (
                          <SelectItem key={tag} value={tag}>{tag}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}

                  {/* More filters toggle */}
                  <Button
                    variant={showMoreFilters || hasMoreFilters ? 'secondary' : 'outline'}
                    size="sm"
                    onClick={() => setShowMoreFilters(v => !v)}
                    className="h-9 gap-1.5 text-sm whitespace-nowrap"
                    aria-expanded={showMoreFilters}
                    suppressHydrationWarning
                  >
                    <SlidersHorizontal className="h-3.5 w-3.5" />
                    {t('expenses.moreFilters')}
                    {hasMoreFilters && <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden="true" />}
                  </Button>

                  {/* Clear filters */}
                  <AnimatePresence>
                    {hasActiveFilters && (
                      <motion.div
                        initial={{ opacity: 0, width: 0 }}
                        animate={{ opacity: 1, width: 'auto' }}
                        exit={{ opacity: 0, width: 0 }}
                        className="overflow-hidden"
                      >
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={clearFilters}
                          className="h-9 gap-1.5 text-sm whitespace-nowrap"
                          suppressHydrationWarning
                        >
                          <FilterX className="h-3.5 w-3.5" />
                          {t('expenses.clearFilters')}
                        </Button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Date range + Amount range — collapsible "More filters" */}
                <AnimatePresence initial={false}>
                  {showMoreFilters && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="flex flex-col sm:flex-row gap-2 flex-wrap pt-1">
                        <div className="flex items-center gap-2 flex-1 max-w-xs">
                          <label htmlFor="date-from" className="text-xs text-muted-foreground whitespace-nowrap" suppressHydrationWarning>
                            {t('expenses.dateFrom')}
                          </label>
                          <Input
                            id="date-from"
                            type="date"
                            value={dateFrom}
                            onChange={(e) => { setDateFrom(e.target.value); setCurrentPage(1) }}
                            className="h-9 text-sm flex-1"
                            max={dateTo || undefined}
                          />
                        </div>
                        <div className="flex items-center gap-2 flex-1 max-w-xs">
                          <label htmlFor="date-to" className="text-xs text-muted-foreground whitespace-nowrap" suppressHydrationWarning>
                            {t('expenses.dateTo')}
                          </label>
                          <Input
                            id="date-to"
                            type="date"
                            value={dateTo}
                            onChange={(e) => { setDateTo(e.target.value); setCurrentPage(1) }}
                            className="h-9 text-sm flex-1"
                            min={dateFrom || undefined}
                          />
                        </div>
                        {/* Amount range */}
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            inputMode="decimal"
                            min="0"
                            step="0.01"
                            value={amountFrom}
                            onChange={(e) => { setAmountFrom(e.target.value); setCurrentPage(1) }}
                            placeholder={t('expenses.amountFrom')}
                            className="h-9 text-sm w-28"
                            aria-label={t('expenses.amountFrom')}
                          />
                          <span className="text-xs text-muted-foreground" aria-hidden="true">–</span>
                          <Input
                            type="number"
                            inputMode="decimal"
                            min="0"
                            step="0.01"
                            value={amountTo}
                            onChange={(e) => { setAmountTo(e.target.value); setCurrentPage(1) }}
                            placeholder={t('expenses.amountTo')}
                            className="h-9 text-sm w-28"
                            aria-label={t('expenses.amountTo')}
                          />
                          <AnimatePresence>
                            {hasAmountRange && (
                              <motion.button
                                initial={{ opacity: 0, scale: 0.8 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.8 }}
                                onClick={() => { setAmountFrom(''); setAmountTo(''); setCurrentPage(1) }}
                                className="flex items-center gap-1 text-xs px-2 py-1 border border-border bg-secondary shadow-[var(--nb-shadow-sm)] rounded-md hover:-translate-y-px hover:shadow-none active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all whitespace-nowrap font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/50 focus-visible:ring-offset-1"
                                aria-label={t('expenses.clearRange')}
                                type="button"
                                suppressHydrationWarning
                              >
                                {t('expenses.amountRangeActive')}{' '}
                                {amountFrom || '0'}–{amountTo || '∞'}
                                <X className="h-3 w-3 ml-0.5" />
                              </motion.button>
                            )}
                          </AnimatePresence>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Sort preset row */}
                <div className="flex items-center gap-2 flex-wrap">
                  <ArrowDownUp className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground whitespace-nowrap" suppressHydrationWarning>
                    {t('expenses.sortBy')}:
                  </span>
                  {(['newest', 'oldest', 'highest', 'lowest'] as const).map((preset) => (
                    <button
                      key={preset}
                      onClick={() => { setSortPreset(preset); setCurrentPage(1) }}
                      className={`text-xs px-2.5 py-1 rounded-full transition-colors ${
                        sortPreset === preset
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted text-muted-foreground hover:bg-primary/10 hover:text-primary'
                      }`}
                      suppressHydrationWarning
                    >
                      {t(`expenses.sort${preset.charAt(0).toUpperCase() + preset.slice(1)}`)}
                    </button>
                  ))}
                </div>
              </div>

              {/* No results after filtering */}
              {filteredExpenses.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-md border border-border bg-card text-foreground shadow-[var(--nb-shadow-sm)]">
                    <Search className="h-6 w-6" aria-hidden="true" />
                  </div>
                  <p className="text-muted-foreground text-sm font-medium" suppressHydrationWarning>
                    {t('expenses.noExpenses')}
                  </p>
                  <Button variant="outline" size="sm" onClick={clearFilters} suppressHydrationWarning>
                    {t('expenses.clearFilters')}
                  </Button>
                </div>
              ) : (
                /* ── Master-detail grid ── */
                <div className="grid gap-4 lg:grid-cols-[1.2fr_0.9fr] items-start">
                  {/* LEFT: expense list */}
                  <Card>
                    <CardContent className="p-2 sm:p-3">
                      {/* Select all row */}
                      <div className="flex items-center gap-2 px-2 pb-2 border-b">
                        <Checkbox
                          checked={
                            pagedExpenses.length > 0 &&
                            pagedExpenses.every(e => selectedExpenseIds.has(e.id))
                          }
                          onCheckedChange={toggleExpenseSelectAll}
                          aria-label={t('expenses.selectAll')}
                        />
                        <span className="text-xs text-muted-foreground" suppressHydrationWarning>
                          {t('expenses.selectAll')}
                        </span>
                        <span className="ml-auto text-xs text-muted-foreground tabular-nums" suppressHydrationWarning>
                          {sortedExpenses.length} {t('expenses.results')}
                        </span>
                      </div>

                      {/* Rows */}
                      <div className="pt-1 space-y-0.5">
                        <AnimatePresence initial={false}>
                          {pagedExpenses.map((expense, idx) => {
                            const catName = categoryNameOf(expense.categoryId)
                            const isSelected = selectedExpense?.id === expense.id
                            return (
                              <motion.div
                                key={expense.id}
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 0.25, delay: Math.min(idx * 0.03, 0.3) }}
                                role="button"
                                tabIndex={0}
                                onClick={() => openExpense(expense)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openExpense(expense) }
                                }}
                                className={`flex items-center gap-2 rounded-lg px-2 py-2 cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${
                                  isSelected ? 'bg-secondary' : 'hover:bg-muted/40'
                                }`}
                              >
                                <span onClick={(e) => e.stopPropagation()} className="flex items-center">
                                  <Checkbox
                                    checked={selectedExpenseIds.has(expense.id)}
                                    onCheckedChange={() => toggleExpenseSelection(expense.id)}
                                    aria-label={expense.title}
                                  />
                                </span>
                                <span className="w-12 shrink-0 text-xs text-muted-foreground tabular-nums">
                                  {formatShortDate(expense.date)}
                                </span>
                                <span
                                  className={`h-2 w-2 rounded-full shrink-0 ${
                                    expense.categoryId
                                      ? getCategoryColor(expense.categoryId).dot
                                      : 'bg-muted-foreground/30'
                                  }`}
                                  aria-hidden="true"
                                />
                                <span className="min-w-0 flex-1">
                                  <span className="block text-sm font-bold truncate">{expense.title}</span>
                                  <span className="block text-[11px] text-muted-foreground truncate" suppressHydrationWarning>
                                    {expense.vendor || '—'}
                                    {catName ? ` · ${catName}` : ''}
                                  </span>
                                </span>
                                <span className="text-sm font-bold tabular-nums shrink-0">
                                  {formatAmount(expense.amount, expense.currency || currency)}
                                </span>
                              </motion.div>
                            )
                          })}
                        </AnimatePresence>
                      </div>

                      {/* ── Pagination ── */}
                      {totalPages > 1 && (
                        <div className="flex items-center justify-between mt-3 pt-3 border-t text-sm px-2">
                          <span className="text-muted-foreground text-xs" suppressHydrationWarning>
                            {t('expenses.showing')} {pageStart + 1}–{Math.min(pageEnd, sortedExpenses.length)}{' '}
                            {t('expenses.of')} {sortedExpenses.length} {t('expenses.results')}
                          </span>
                          <div className="flex items-center gap-1.5">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                              disabled={safePage === 1}
                              className="h-8 px-2.5 text-xs gap-1"
                              suppressHydrationWarning
                            >
                              <ChevronLeft className="h-3.5 w-3.5" />
                              <span className="hidden sm:inline">{t('expenses.prevPage')}</span>
                            </Button>
                            <span className="text-xs text-muted-foreground px-1" suppressHydrationWarning>
                              {t('expenses.page')} {safePage} {t('expenses.of')} {totalPages}
                            </span>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                              disabled={safePage === totalPages}
                              className="h-8 px-2.5 text-xs gap-1"
                              suppressHydrationWarning
                            >
                              <span className="hidden sm:inline">{t('expenses.nextPage')}</span>
                              <ChevronRight className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* RIGHT: detail preview (desktop only) */}
                  <Card className="hidden lg:block sticky top-4 self-start">
                    <CardContent className="p-4 sm:p-5">
                      {selectedExpense ? (
                        <AnimatePresence mode="wait">
                          <motion.div
                            key={selectedExpense.id}
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.15 }}
                          >
                            {renderExpenseDetail(selectedExpense)}
                          </motion.div>
                        </AnimatePresence>
                      ) : (
                        <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
                          <div className="flex h-14 w-14 items-center justify-center rounded-md border border-border bg-card text-muted-foreground shadow-[var(--nb-shadow-sm)]">
                            <ReceiptText className="h-6 w-6" aria-hidden="true" />
                          </div>
                          <p className="text-sm text-muted-foreground max-w-[220px]" suppressHydrationWarning>
                            {t('expenses.selectToPreview')}
                          </p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              )}
            </motion.div>
          )}
        </section>
      </div>

      {/* ── Mobile detail sheet (< lg) ── */}
      <Sheet open={isDetailSheetOpen} onOpenChange={setIsDetailSheetOpen}>
        <SheetContent side="bottom" className="lg:hidden max-h-[85vh] overflow-y-auto rounded-t-xl p-4 pt-3">
          <SheetHeader className="p-0">
            <SheetTitle className="sr-only">{selectedExpense?.title || t('expenses.title')}</SheetTitle>
          </SheetHeader>
          {selectedExpense && renderExpenseDetail(selectedExpense)}
        </SheetContent>
      </Sheet>

      {/* ── Delete single — Confirmation Dialog ── */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle suppressHydrationWarning>{t('expenses.confirmDelete')}</DialogTitle>
            <DialogDescription suppressHydrationWarning>
              {t('expenses.confirmDeleteDesc')} <strong>{selectedExpense?.title}</strong>?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsDeleteDialogOpen(false)}
              disabled={isDeleting}
              suppressHydrationWarning
            >
              {t('common.cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={() => selectedExpense && deleteExpense(selectedExpense.id)}
              disabled={isDeleting}
            >
              {isDeleting
                ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{t('expenses.deleting')}</>
                : t('common.delete')
              }
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Bulk delete — Confirmation Dialog ── */}
      <Dialog open={isBulkDeleteDialogOpen} onOpenChange={setIsBulkDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle suppressHydrationWarning>{t('expenses.confirmBulkDelete')}</DialogTitle>
            <DialogDescription suppressHydrationWarning>
              {t('expenses.confirmBulkDeleteDesc')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsBulkDeleteDialogOpen(false)}
              disabled={isBulkDeleting}
              suppressHydrationWarning
            >
              {t('common.cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={bulkDeleteExpenses}
              disabled={isBulkDeleting}
            >
              {isBulkDeleting
                ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{t('expenses.deleting')}</>
                : <><Trash2 className="mr-2 h-4 w-4" />{t('expenses.delete')} {selectedExpenseIds.size}</>
              }
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Receipt Image Dialog ── */}
      <Dialog open={isImageDialogOpen} onOpenChange={(open) => {
        setIsImageDialogOpen(open)
        if (!open) { setShowShareQr(false); setShareCopied(false) }
      }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle suppressHydrationWarning>{t('expenses.receiptImage')}</DialogTitle>
          </DialogHeader>
          <div className="flex items-center justify-center min-h-[300px]">
            {loadingImage ? (
              <Loader2 className="animate-spin h-8 w-8 text-muted-foreground" />
            ) : receiptImageUrl ? (
              <Image
                src={receiptImageUrl}
                alt="Receipt"
                className="max-w-full max-h-[70vh] object-contain rounded-lg"
                width={800}
                height={600}
                style={{ width: 'auto', height: 'auto', maxHeight: '70vh' }}
              />
            ) : (
              <p className="text-muted-foreground" suppressHydrationWarning>
                {t('expenses.noImage')}
              </p>
            )}
          </div>

          {/* Share section */}
          {viewingReceiptId && (
            <div className="border-t pt-4 space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={handleShareReceipt}
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
                >
                  {shareCopied ? (
                    <><CheckCheck className="h-3.5 w-3.5" /> {t('expenses.linkCopied')}</>
                  ) : (
                    <><Copy className="h-3.5 w-3.5" /> {t('expenses.copyLink')}</>
                  )}
                </button>
                <button
                  onClick={() => setShowShareQr(q => !q)}
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border text-sm font-medium hover:bg-muted transition-colors"
                >
                  <QrCode className="h-3.5 w-3.5" />
                  {t('expenses.qrCode')}
                </button>
                <a
                  href={`/receipt/${viewingReceiptId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border text-sm font-medium hover:bg-muted transition-colors"
                >
                  <Share2 className="h-3.5 w-3.5" />
                  {t('expenses.openReceipt')}
                </a>
              </div>

              {showShareQr && (
                <div className="flex flex-col items-center gap-2 py-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(`${typeof window !== 'undefined' ? window.location.origin : 'https://solvio-lac.vercel.app'}/receipt/${viewingReceiptId}`)}`}
                    alt="QR code for receipt"
                    width={150}
                    height={150}
                    className="rounded-lg border p-2 bg-white"
                  />
                  <p className="text-xs text-muted-foreground" suppressHydrationWarning>
                    {t('expenses.scanQr')}
                  </p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </main>
  )
}
