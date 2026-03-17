'use client'

import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTranslation } from '@/lib/i18n'
import { useProductType } from '@/hooks/use-product-type'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Loader2, Trash2, Edit2, Check, X, Image as ImageIcon,
  ReceiptText, AlertCircle, RefreshCw, Search, FilterX,
  ChevronUp, ChevronDown, ChevronsUpDown, Download,
  ChevronLeft, ChevronRight, Share2, QrCode, Copy, CheckCheck,
  DollarSign, ClipboardCheck,
} from 'lucide-react'
import dynamic from 'next/dynamic'

const LazyApprovalsPage = dynamic(() => import('../approvals/page'), { ssr: false })
import { AddExpenseTrigger } from '@/components/protected/dashboard/add-expense-trigger'
import { ScanReceiptButton } from '@/components/protected/dashboard/scan-receipt-button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'

interface Expense {
  id: string
  title: string
  amount: number | string
  date: string
  vendor: string | null
  notes: string | null
  categoryId: string | null
  receiptId: string | null
}

interface ReceiptItem {
  name: string
  quantity?: number | null
  price?: number | null
  categoryId?: string | null
}

type SortField = 'title' | 'vendor' | 'amount' | 'date'
type SortDir = 'asc' | 'desc'

const PAGE_SIZE = 20

// ─── Skeleton row ─────────────────────────────────────────────────────────────
function TableRowSkeleton() {
  return (
    <TableRow>
      <TableCell><Skeleton className="h-4 w-4 rounded" /></TableCell>
      <TableCell><Skeleton className="h-4 w-40 rounded" /></TableCell>
      <TableCell className="hidden sm:table-cell"><Skeleton className="h-4 w-28 rounded" /></TableCell>
      <TableCell><Skeleton className="h-4 w-20 rounded" /></TableCell>
      <TableCell className="hidden md:table-cell"><Skeleton className="h-4 w-24 rounded" /></TableCell>
      <TableCell className="text-right"><Skeleton className="h-7 w-20 ml-auto rounded" /></TableCell>
    </TableRow>
  )
}

function MobileCardSkeleton() {
  return (
    <div className="border rounded-lg p-3 bg-card space-y-2">
      <div className="flex items-center gap-2">
        <Skeleton className="h-4 w-4 rounded" />
        <Skeleton className="h-4 w-40 rounded" />
      </div>
      <div className="flex items-center justify-between">
        <Skeleton className="h-3 w-24 rounded" />
        <Skeleton className="h-3 w-16 rounded" />
      </div>
      <Skeleton className="h-3 w-20 rounded" />
    </div>
  )
}

// ─── Amount formatter ──────────────────────────────────────────────────────────
function formatAmount(amount: number | string, currency: string): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount
  if (isNaN(num)) return `0.00 ${currency}`
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(num)
  } catch {
    return `${num.toFixed(2)} ${currency}`
  }
}

// ─── Sort icon helper ─────────────────────────────────────────────────────────
function SortIcon({ field, sortField, sortDir }: { field: SortField; sortField: SortField; sortDir: SortDir }) {
  if (sortField !== field) return <ChevronsUpDown className="ml-1 h-3.5 w-3.5 text-muted-foreground/50 inline" />
  return sortDir === 'asc'
    ? <ChevronUp className="ml-1 h-3.5 w-3.5 text-foreground inline" />
    : <ChevronDown className="ml-1 h-3.5 w-3.5 text-foreground inline" />
}

// ─── Main component ────────────────────────────────────────────────────────────
export default function ExpensesPage() {
  const { t, lang, mounted } = useTranslation()
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

  // Search & filter
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [filterCategoryId, setFilterCategoryId] = useState<string>('all')
  const [dateFrom, setDateFrom] = useState<string>('')
  const [dateTo, setDateTo] = useState<string>('')
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Sort
  const [sortField, setSortField] = useState<SortField>('date')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

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
    setDateFrom('')
    setDateTo('')
    setCurrentPage(1)
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
  }

  const hasActiveFilters =
    debouncedSearch.trim() !== '' ||
    filterCategoryId !== 'all' ||
    dateFrom !== '' ||
    dateTo !== ''

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDir(field === 'date' ? 'desc' : 'asc')
    }
    setCurrentPage(1)
  }

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

  // ─── Derived filtered + sorted + paginated list ───────────────────────────
  const filteredExpenses = useMemo(() => {
    return expenses.filter((e) => {
      const matchesSearch =
        debouncedSearch.trim() === '' ||
        e.title.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
        (e.vendor ?? '').toLowerCase().includes(debouncedSearch.toLowerCase())
      const matchesCategory =
        filterCategoryId === 'all' || e.categoryId === filterCategoryId
      const expDate = e.date ? e.date.slice(0, 10) : ''
      const matchesFrom = dateFrom === '' || expDate >= dateFrom
      const matchesTo = dateTo === '' || expDate <= dateTo
      return matchesSearch && matchesCategory && matchesFrom && matchesTo
    })
  }, [expenses, debouncedSearch, filterCategoryId, dateFrom, dateTo])

  const sortedExpenses = useMemo(() => {
    return [...filteredExpenses].sort((a, b) => {
      let cmp = 0
      if (sortField === 'title') {
        cmp = a.title.localeCompare(b.title)
      } else if (sortField === 'vendor') {
        cmp = (a.vendor ?? '').localeCompare(b.vendor ?? '')
      } else if (sortField === 'amount') {
        cmp = parseFloat(String(a.amount)) - parseFloat(String(b.amount))
      } else if (sortField === 'date') {
        cmp = a.date.localeCompare(b.date)
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [filteredExpenses, sortField, sortDir])

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
      if (!res.ok) { setError('Failed to fetch expenses'); setLoading(false); return }
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
    } catch (err: any) {
      if (err.name === 'AbortError') return
      setError('Failed to fetch expenses')
      setLoading(false)
    }
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
    await fetch('/api/data/expenses', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [id] }),
    })
    setIsDeleteDialogOpen(false)
    setSelectedExpense(null)
    setReceiptItems([])
    await fetchExpenses()
    window.dispatchEvent(new CustomEvent('expensesUpdated'))
    setIsDeleting(false)
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
    await fetchExpenses()
    window.dispatchEvent(new CustomEvent('expensesUpdated'))
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
    await fetch('/api/data/expenses', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, title: editExpenseTitle.trim(), amount: parseFloat(editExpenseAmount) }),
    })
    setEditingExpenseId(null)
    await fetchExpenses()
    setIsSavingExpense(false)
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
    await fetch('/api/data/receipts', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: selectedExpense.receiptId, items }),
    })
    setReceiptItems(items)
    window.dispatchEvent(new CustomEvent('expensesUpdated'))
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

  const handleShareReceipt = async () => {
    if (!viewingReceiptId) return
    const url = `${window.location.origin}/receipt/${viewingReceiptId}`
    try {
      await navigator.clipboard.writeText(url)
      setShareCopied(true)
      setTimeout(() => setShareCopied(false), 2000)
    } catch {
      // fallback
      const el = document.createElement('textarea')
      el.value = url
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
      setShareCopied(true)
      setTimeout(() => setShareCopied(false), 2000)
    }
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
      <div className="flex flex-col h-full space-y-4 sm:space-y-6 md:space-y-10">

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
                >
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setIsBulkDeleteDialogOpen(true)}
                    className="text-xs sm:text-sm"
                  >
                    <Trash2 className="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4" />
                    <span className="hidden sm:inline" suppressHydrationWarning>{t('expenses.delete')} </span>
                    {selectedExpenseIds.size}
                  </Button>
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
              onAction={async () => {
                await fetchExpenses()
                window.dispatchEvent(new CustomEvent('expensesUpdated'))
              }}
            />
          </div>
        </div>

        {/* ── Expenses Table Section ── */}
        <section className="rounded-xl border p-4 sm:p-6 overflow-hidden flex-1">
          {loading ? (
            /* ── Loading skeleton ── */
            <>
              {/* Search bar skeleton */}
              <div className="flex flex-col sm:flex-row gap-2 mb-4">
                <Skeleton className="h-9 w-full sm:w-64 rounded-md" />
                <Skeleton className="h-9 w-full sm:w-48 rounded-md" />
                <Skeleton className="h-9 w-full sm:w-32 rounded-md" />
                <Skeleton className="h-9 w-full sm:w-32 rounded-md" />
              </div>
              {/* Mobile skeletons */}
              <div className="block sm:hidden space-y-3">
                {Array.from({ length: 5 }).map((_, i) => <MobileCardSkeleton key={i} />)}
              </div>
              {/* Desktop skeletons */}
              <div className="hidden sm:block">
                <Table className="w-full text-sm">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12"><Skeleton className="h-4 w-4 rounded" /></TableHead>
                      <TableHead><Skeleton className="h-4 w-16 rounded" /></TableHead>
                      <TableHead className="hidden sm:table-cell"><Skeleton className="h-4 w-16 rounded" /></TableHead>
                      <TableHead><Skeleton className="h-4 w-16 rounded" /></TableHead>
                      <TableHead className="hidden md:table-cell"><Skeleton className="h-4 w-16 rounded" /></TableHead>
                      <TableHead className="text-right"><Skeleton className="h-4 w-16 ml-auto rounded" /></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {Array.from({ length: 7 }).map((_, i) => <TableRowSkeleton key={i} />)}
                  </TableBody>
                </Table>
              </div>
            </>
          ) : error ? (
            /* ── Error state ── */
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center justify-center py-32 gap-4"
            >
              <div className="flex items-center justify-center w-16 h-16 rounded-full bg-destructive/10">
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
              className="flex flex-col items-center justify-center py-32 gap-5 text-center"
            >
              <div className="flex items-center justify-center w-20 h-20 rounded-full bg-muted">
                <ReceiptText className="h-10 w-10 text-muted-foreground" />
              </div>
              <div className="space-y-1">
                <h2 className="text-xl font-semibold" suppressHydrationWarning>
                  {t('expenses.noExpensesTitle')}
                </h2>
                <p className="text-muted-foreground text-sm max-w-xs" suppressHydrationWarning>
                  {t('expenses.noExpensesDesc')}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-wrap justify-center">
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
            /* ── Expense list ── */
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.2 }}
            >
              {/* ── Filter bar ── */}
              <div className="flex flex-col gap-2 mb-4">
                <div className="flex flex-col sm:flex-row gap-2">
                  {/* Search */}
                  <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                    <Input
                      value={searchQuery}
                      onChange={(e) => handleSearchChange(e.target.value)}
                      placeholder={t('expenses.searchPlaceholder')}
                      className="pl-8 h-9 text-sm"
                    />
                    <AnimatePresence>
                      {searchQuery && (
                        <motion.button
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.8 }}
                          onClick={() => handleSearchChange('')}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                          aria-label="Clear search"
                        >
                          <X className="h-3.5 w-3.5" />
                        </motion.button>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* Category filter */}
                  <Select value={filterCategoryId} onValueChange={(v) => { setFilterCategoryId(v); setCurrentPage(1) }}>
                    <SelectTrigger className="h-9 text-sm sm:w-48" suppressHydrationWarning>
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

                {/* Date range row */}
                <div className="flex flex-col sm:flex-row gap-2">
                  <div className="flex items-center gap-2 flex-1 max-w-xs">
                    <label className="text-xs text-muted-foreground whitespace-nowrap" suppressHydrationWarning>
                      {t('expenses.dateFrom')}
                    </label>
                    <Input
                      type="date"
                      value={dateFrom}
                      onChange={(e) => { setDateFrom(e.target.value); setCurrentPage(1) }}
                      className="h-9 text-sm flex-1"
                      max={dateTo || undefined}
                    />
                  </div>
                  <div className="flex items-center gap-2 flex-1 max-w-xs">
                    <label className="text-xs text-muted-foreground whitespace-nowrap" suppressHydrationWarning>
                      {t('expenses.dateTo')}
                    </label>
                    <Input
                      type="date"
                      value={dateTo}
                      onChange={(e) => { setDateTo(e.target.value); setCurrentPage(1) }}
                      className="h-9 text-sm flex-1"
                      min={dateFrom || undefined}
                    />
                  </div>
                </div>
              </div>

              {/* No results after filtering */}
              {filteredExpenses.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
                  <Search className="h-10 w-10 text-muted-foreground/50" />
                  <p className="text-muted-foreground text-sm" suppressHydrationWarning>
                    {t('expenses.noExpenses')}
                  </p>
                  <Button variant="ghost" size="sm" onClick={clearFilters} suppressHydrationWarning>
                    {t('expenses.clearFilters')}
                  </Button>
                </div>
              ) : (
                <>
                  {/* ── Mobile: Card view ── */}
                  <motion.div
                    className="block sm:hidden space-y-3 overflow-y-auto max-h-[60vh]"
                    variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.05 } } }}
                    initial="hidden"
                    animate="visible"
                  >
                    {pagedExpenses.map((expense) => (
                      <motion.div
                        key={expense.id}
                        variants={{ hidden: { opacity: 0, y: 8 }, visible: { opacity: 1, y: 0, transition: { duration: 0.3 } } }}
                        className={`border rounded-lg p-3 transition-colors ${
                          selectedExpense?.id === expense.id
                            ? 'bg-muted/40 border-primary'
                            : 'bg-card'
                        }`}
                        onClick={() => handleExpenseClick(expense)}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <Checkbox
                                checked={selectedExpenseIds.has(expense.id)}
                                onCheckedChange={() => toggleExpenseSelection(expense.id)}
                                onClick={(e) => e.stopPropagation()}
                                className="h-4 w-4"
                              />
                              <h3 className="font-semibold text-sm truncate">
                                {editingExpenseId === expense.id ? (
                                  <div onClick={(e) => e.stopPropagation()} className="space-y-1">
                                    <Input
                                      value={editExpenseTitle}
                                      onChange={(e) => {
                                        setEditExpenseTitle(e.target.value)
                                        if (e.target.value.trim()) setEditExpenseTitleError(null)
                                      }}
                                      onKeyDown={(e) => handleExpenseKeyDown(e, expense.id)}
                                      className={`h-7 text-sm ${editExpenseTitleError ? 'border-destructive' : ''}`}
                                    />
                                    {editExpenseTitleError && (
                                      <p className="text-destructive text-xs">{editExpenseTitleError}</p>
                                    )}
                                  </div>
                                ) : expense.title}
                              </h3>
                            </div>
                            <div className="flex items-center justify-between text-xs text-muted-foreground">
                              <span>{expense.vendor || '—'}</span>
                              <span className="font-medium text-foreground">
                                {editingExpenseId === expense.id ? (
                                  <div onClick={(e) => e.stopPropagation()} className="space-y-1">
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
                                      className={`h-6 w-20 text-xs ${editExpenseAmountError ? 'border-destructive' : ''}`}
                                    />
                                    {editExpenseAmountError && (
                                      <p className="text-destructive text-xs">{editExpenseAmountError}</p>
                                    )}
                                  </div>
                                ) : formatAmount(expense.amount, currency)}
                              </span>
                            </div>
                            <div className="text-xs text-muted-foreground mt-1">
                              {new Date(expense.date).toLocaleDateString()}
                            </div>
                          </div>
                          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                            {editingExpenseId === expense.id ? (
                              <>
                                <Button variant="ghost" size="icon" onClick={() => saveExpense(expense.id)} disabled={isSavingExpense} className="h-7 w-7">
                                  {isSavingExpense ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3 text-green-600" />}
                                </Button>
                                <Button variant="ghost" size="icon" onClick={cancelEditingExpense} className="h-7 w-7">
                                  <X className="h-3 w-3" />
                                </Button>
                              </>
                            ) : (
                              <>
                                {expense.receiptId && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={(e) => { e.stopPropagation(); handleViewReceiptImage(expense.receiptId!) }}
                                    className="h-7 w-7"
                                    title={t('expenses.viewReceipt')}
                                  >
                                    <ImageIcon className="h-3 w-3 text-blue-500" />
                                  </Button>
                                )}
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={(e) => { e.stopPropagation(); startEditingExpense(expense) }}
                                  className="h-7 w-7"
                                >
                                  <Edit2 className="h-3 w-3" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => { setSelectedExpense(expense); setIsDeleteDialogOpen(true) }}
                                  className="h-7 w-7"
                                >
                                  <Trash2 className="h-3 w-3 text-red-500" />
                                </Button>
                              </>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </motion.div>

                  {/* ── Desktop: Table view ── */}
                  <div className="hidden sm:block overflow-y-auto max-h-[60vh]">
                    <Table className="w-full text-sm">
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-12">
                            <Checkbox
                              checked={
                                pagedExpenses.length > 0 &&
                                pagedExpenses.every(e => selectedExpenseIds.has(e.id))
                              }
                              onCheckedChange={toggleExpenseSelectAll}
                            />
                          </TableHead>
                          <TableHead
                            className="cursor-pointer select-none"
                            onClick={() => handleSort('title')}
                            suppressHydrationWarning
                          >
                            {t('expenses.titleCol')}
                            <SortIcon field="title" sortField={sortField} sortDir={sortDir} />
                          </TableHead>
                          <TableHead
                            className="hidden sm:table-cell cursor-pointer select-none"
                            onClick={() => handleSort('vendor')}
                            suppressHydrationWarning
                          >
                            {t('expenses.vendor')}
                            <SortIcon field="vendor" sortField={sortField} sortDir={sortDir} />
                          </TableHead>
                          <TableHead
                            className="cursor-pointer select-none"
                            onClick={() => handleSort('amount')}
                            suppressHydrationWarning
                          >
                            {t('expenses.amount')}
                            <SortIcon field="amount" sortField={sortField} sortDir={sortDir} />
                          </TableHead>
                          <TableHead
                            className="hidden md:table-cell cursor-pointer select-none"
                            onClick={() => handleSort('date')}
                            suppressHydrationWarning
                          >
                            {t('expenses.date')}
                            <SortIcon field="date" sortField={sortField} sortDir={sortDir} />
                          </TableHead>
                          <TableHead className="text-right" suppressHydrationWarning>{t('expenses.actions')}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        <AnimatePresence initial={false}>
                          {pagedExpenses.map((expense, idx) => (
                            <motion.tr
                              key={expense.id}
                              initial={{ opacity: 0, y: 8 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0 }}
                              transition={{ duration: 0.3, delay: idx * 0.05 }}
                              className={`border-b transition-colors ${
                                selectedExpense?.id === expense.id
                                  ? 'bg-muted/40'
                                  : 'hover:bg-muted/20'
                              }`}
                            >
                              <TableCell onClick={(e) => e.stopPropagation()}>
                                <Checkbox
                                  checked={selectedExpenseIds.has(expense.id)}
                                  onCheckedChange={() => toggleExpenseSelection(expense.id)}
                                />
                              </TableCell>

                              {/* Title cell */}
                              <TableCell className="font-medium cursor-pointer" onClick={() => handleExpenseClick(expense)}>
                                {editingExpenseId === expense.id ? (
                                  <div onClick={(e) => e.stopPropagation()} className="space-y-1">
                                    <Input
                                      value={editExpenseTitle}
                                      onChange={(e) => {
                                        setEditExpenseTitle(e.target.value)
                                        if (e.target.value.trim()) setEditExpenseTitleError(null)
                                      }}
                                      onKeyDown={(e) => handleExpenseKeyDown(e, expense.id)}
                                      className={`h-8 ${editExpenseTitleError ? 'border-destructive' : ''}`}
                                    />
                                    {editExpenseTitleError && (
                                      <p className="text-destructive text-xs">{editExpenseTitleError}</p>
                                    )}
                                  </div>
                                ) : expense.title}
                              </TableCell>

                              <TableCell className="hidden sm:table-cell cursor-pointer" onClick={() => handleExpenseClick(expense)}>
                                {expense.vendor || '—'}
                              </TableCell>

                              {/* Amount cell */}
                              <TableCell className="font-medium cursor-pointer" onClick={() => handleExpenseClick(expense)}>
                                {editingExpenseId === expense.id ? (
                                  <div onClick={(e) => e.stopPropagation()} className="space-y-1">
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
                                      className={`h-8 w-28 ${editExpenseAmountError ? 'border-destructive' : ''}`}
                                    />
                                    {editExpenseAmountError && (
                                      <p className="text-destructive text-xs">{editExpenseAmountError}</p>
                                    )}
                                  </div>
                                ) : formatAmount(expense.amount, currency)}
                              </TableCell>

                              <TableCell className="hidden md:table-cell cursor-pointer" onClick={() => handleExpenseClick(expense)}>
                                {new Date(expense.date).toLocaleDateString()}
                              </TableCell>

                              {/* Actions */}
                              <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                                {editingExpenseId === expense.id ? (
                                  <div className="flex justify-end gap-1">
                                    <Button variant="ghost" size="icon" onClick={() => saveExpense(expense.id)} disabled={isSavingExpense}>
                                      {isSavingExpense ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4 text-green-600" />}
                                    </Button>
                                    <Button variant="ghost" size="icon" onClick={cancelEditingExpense}>
                                      <X className="h-4 w-4 text-red-500" />
                                    </Button>
                                  </div>
                                ) : (
                                  <div className="flex justify-end gap-1">
                                    {expense.receiptId && (
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => handleViewReceiptImage(expense.receiptId!)}
                                        title={t('expenses.viewReceipt')}
                                      >
                                        <ImageIcon className="h-4 w-4 text-blue-500" />
                                      </Button>
                                    )}
                                    <Button variant="ghost" size="icon" onClick={() => startEditingExpense(expense)}>
                                      <Edit2 className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => { setSelectedExpense(expense); setIsDeleteDialogOpen(true) }}
                                    >
                                      <Trash2 className="h-4 w-4 text-red-500" />
                                    </Button>
                                  </div>
                                )}
                              </TableCell>
                            </motion.tr>
                          ))}
                        </AnimatePresence>
                      </TableBody>
                    </Table>
                  </div>

                  {/* ── Pagination ── */}
                  {totalPages > 1 && (
                    <div className="flex items-center justify-between mt-4 pt-4 border-t text-sm">
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
                </>
              )}
            </motion.div>
          )}
        </section>

        {/* ── Receipt Items Panel ── */}
        <AnimatePresence>
          {selectedExpense && (
            <motion.section
              key={selectedExpense.id}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.2 }}
              className="w-full"
            >
              {selectedExpense.receiptId ? (
                <Card className="border p-4 sm:p-6">
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-lg sm:text-2xl font-semibold" suppressHydrationWarning>
                      {t('expenses.receiptItems')} — {selectedExpense.title}
                    </CardTitle>
                    {selectedItemIndices.size > 0 && (
                      <Button variant="destructive" size="sm" onClick={bulkDeleteItems} className="text-xs sm:text-sm" suppressHydrationWarning>
                        <Trash2 className="mr-2 h-4 w-4" />
                        {t('expenses.delete')} {selectedItemIndices.size}
                      </Button>
                    )}
                  </CardHeader>
                  <CardContent>
                    {loadingReceiptItems ? (
                      <div className="space-y-2 py-4">
                        {Array.from({ length: 4 }).map((_, i) => (
                          <div key={i} className="flex items-center gap-3">
                            <Skeleton className="h-4 w-4 rounded" />
                            <Skeleton className="h-4 flex-1 rounded" />
                            <Skeleton className="h-4 w-20 rounded" />
                            <Skeleton className="h-4 w-24 rounded" />
                          </div>
                        ))}
                      </div>
                    ) : receiptItems.length > 0 ? (
                      <>
                        {/* Mobile */}
                        <div className="block sm:hidden space-y-2">
                          <div className="flex items-center gap-2 pb-2 border-b">
                            <Checkbox
                              checked={selectedItemIndices.size === receiptItems.length && receiptItems.length > 0}
                              onCheckedChange={toggleItemSelectAll}
                            />
                            <span className="text-sm font-medium" suppressHydrationWarning>{t('expenses.selectAll')}</span>
                          </div>
                          {receiptItems.map((item, index) => (
                            <div key={index} className="border rounded-lg p-3">
                              <div className="flex items-start gap-2">
                                <Checkbox
                                  checked={selectedItemIndices.has(index)}
                                  onCheckedChange={() => toggleItemSelection(index)}
                                  className="mt-1"
                                />
                                <div className="flex-1 space-y-1">
                                  {editingItemIndex === index ? (
                                    <div className="space-y-2">
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
                                          className={`h-8 text-sm ${editItemPriceError ? 'border-destructive' : ''}`}
                                          placeholder={t('expenses.price')}
                                        />
                                        {editItemPriceError && (
                                          <p className="text-destructive text-xs mt-0.5">{editItemPriceError}</p>
                                        )}
                                      </div>
                                      <Select value={editItemCategory} onValueChange={setEditItemCategory}>
                                        <SelectTrigger className="h-8 text-sm">
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
                                    </div>
                                  ) : (
                                    <>
                                      <p className="font-medium text-sm">{item.name}</p>
                                      <p className="text-xs text-muted-foreground">
                                        {formatAmount(item.price ?? 0, currency)} · {item.categoryId
                                          ? translateCategoryName(categories.get(item.categoryId) || 'Other')
                                          : t('expenses.noCategory')
                                        }
                                      </p>
                                    </>
                                  )}
                                </div>
                                <div className="flex gap-1">
                                  {editingItemIndex === index ? (
                                    <>
                                      <Button variant="ghost" size="icon" onClick={() => saveItem(index)} disabled={isSavingItem} className="h-7 w-7">
                                        {isSavingItem ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3 text-green-600" />}
                                      </Button>
                                      <Button variant="ghost" size="icon" onClick={cancelEditingItem} className="h-7 w-7">
                                        <X className="h-3 w-3" />
                                      </Button>
                                    </>
                                  ) : (
                                    <Button variant="ghost" size="icon" onClick={() => startEditingItem(index, item)} className="h-7 w-7">
                                      <Edit2 className="h-3 w-3" />
                                    </Button>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* Desktop */}
                        <div className="hidden sm:block overflow-y-auto max-h-[50vh]">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="w-10">
                                  <Checkbox
                                    checked={selectedItemIndices.size === receiptItems.length && receiptItems.length > 0}
                                    onCheckedChange={toggleItemSelectAll}
                                  />
                                </TableHead>
                                <TableHead suppressHydrationWarning>{t('expenses.itemName')}</TableHead>
                                <TableHead suppressHydrationWarning>{t('expenses.price')}</TableHead>
                                <TableHead suppressHydrationWarning>{t('expenses.category')}</TableHead>
                                <TableHead className="text-right" suppressHydrationWarning>{t('expenses.actions')}</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {receiptItems.map((item, index) => (
                                <TableRow key={index}>
                                  <TableCell>
                                    <Checkbox checked={selectedItemIndices.has(index)} onCheckedChange={() => toggleItemSelection(index)} />
                                  </TableCell>
                                  <TableCell>
                                    {editingItemIndex === index ? (
                                      <div className="space-y-1">
                                        <Input
                                          value={editItemName}
                                          onChange={(e) => {
                                            setEditItemName(e.target.value)
                                            if (e.target.value.trim()) setEditItemNameError(null)
                                          }}
                                          onKeyDown={(e) => handleItemKeyDown(e, index)}
                                          className={`h-8 ${editItemNameError ? 'border-destructive' : ''}`}
                                        />
                                        {editItemNameError && (
                                          <p className="text-destructive text-xs">{editItemNameError}</p>
                                        )}
                                      </div>
                                    ) : <span className="font-medium">{item.name}</span>}
                                  </TableCell>
                                  <TableCell>
                                    {editingItemIndex === index ? (
                                      <div className="space-y-1">
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
                                          className={`h-8 w-28 ${editItemPriceError ? 'border-destructive' : ''}`}
                                        />
                                        {editItemPriceError && (
                                          <p className="text-destructive text-xs">{editItemPriceError}</p>
                                        )}
                                      </div>
                                    ) : formatAmount(item.price ?? 0, currency)}
                                  </TableCell>
                                  <TableCell>
                                    {editingItemIndex === index ? (
                                      <Select value={editItemCategory} onValueChange={setEditItemCategory}>
                                        <SelectTrigger className="h-8">
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
                                    ) : item.categoryId
                                      ? translateCategoryName(categories.get(item.categoryId) || 'Other')
                                      : <span className="text-muted-foreground text-xs" suppressHydrationWarning>{t('expenses.noCategory')}</span>
                                    }
                                  </TableCell>
                                  <TableCell className="text-right">
                                    {editingItemIndex === index ? (
                                      <div className="flex justify-end gap-1">
                                        <Button variant="ghost" size="icon" onClick={() => saveItem(index)} disabled={isSavingItem}>
                                          {isSavingItem ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4 text-green-600" />}
                                        </Button>
                                        <Button variant="ghost" size="icon" onClick={cancelEditingItem}>
                                          <X className="h-4 w-4 text-red-500" />
                                        </Button>
                                      </div>
                                    ) : (
                                      <Button variant="ghost" size="icon" onClick={() => startEditingItem(index, item)}>
                                        <Edit2 className="h-4 w-4" />
                                      </Button>
                                    )}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </>
                    ) : (
                      <p className="text-center text-muted-foreground py-8" suppressHydrationWarning>
                        {t('expenses.noItems')}
                      </p>
                    )}
                  </CardContent>
                </Card>
              ) : (
                <Card className="border p-4 sm:p-6">
                  <CardHeader>
                    <CardTitle className="text-lg sm:text-2xl font-semibold">{selectedExpense.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-muted-foreground" suppressHydrationWarning>{t('expenses.noReceiptAttached')}</p>
                  </CardContent>
                </Card>
              )}
            </motion.section>
          )}
        </AnimatePresence>
      </div>

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
              <img
                src={receiptImageUrl}
                alt="Receipt"
                className="max-w-full max-h-[70vh] object-contain rounded-lg"
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
