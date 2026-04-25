'use client'

import { useState, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import { useTranslation } from '@/lib/i18n'
import { Button } from '@/components/ui/button'
import { Check, Loader2, Receipt, X } from 'lucide-react'

const MEMBER_COLORS = [
  '#6366f1', '#ec4899', '#f59e0b', '#10b981',
  '#3b82f6', '#8b5cf6', '#ef4444', '#14b8a6',
]

interface ReceiptItem {
  id: string
  name: string
  quantity: string | number | null
  unitPrice: string | number | null
  totalPrice: string | number | null
}

interface GroupMember {
  id: string
  name: string
  email?: string | null
  color?: string | null
}

interface Assignment {
  receiptItemId: string
  groupId: string
  memberId: string
  share: string
}

interface ReceiptItemAssignerProps {
  groupId: string
  receiptId: string
  vendor: string
  date: string | null
  currency: string
  total: string | number | null
  items: ReceiptItem[]
  members: GroupMember[]
  initialAssignments: Assignment[]
  onClose: () => void
  onSaved: () => void
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

function getMemberColor(members: GroupMember[], memberId: string): string {
  const idx = members.findIndex((m) => m.id === memberId)
  return MEMBER_COLORS[(idx >= 0 ? idx : 0) % MEMBER_COLORS.length]
}

export function ReceiptItemAssigner({
  groupId,
  receiptId,
  vendor,
  date,
  currency,
  total,
  items,
  members,
  initialAssignments,
  onClose,
  onSaved,
}: ReceiptItemAssignerProps) {
  const { t } = useTranslation()
  const [saving, setSaving] = useState(false)

  // Map: receiptItemId -> Set<memberId>
  const [assignmentMap, setAssignmentMap] = useState<Record<string, Set<string>>>(() => {
    const map: Record<string, Set<string>> = {}
    for (const item of items) {
      map[item.id] = new Set()
    }
    for (const a of initialAssignments) {
      if (map[a.receiptItemId]) {
        map[a.receiptItemId].add(a.memberId)
      }
    }
    return map
  })

  const toggleMember = useCallback((itemId: string, memberId: string) => {
    setAssignmentMap((prev) => {
      const next = { ...prev }
      const set = new Set(next[itemId] || [])
      if (set.has(memberId)) {
        set.delete(memberId)
      } else {
        set.add(memberId)
      }
      next[itemId] = set
      return next
    })
  }, [])

  const handleSave = async () => {
    setSaving(true)
    try {
      const assignments = Object.entries(assignmentMap).map(([receiptItemId, memberSet]) => ({
        receiptItemId,
        memberIds: Array.from(memberSet),
      }))

      const res = await fetch(`/api/groups/${groupId}/receipts/${receiptId}/assign`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignments }),
      })

      if (!res.ok) throw new Error('Failed to save')
      toast.success(t('groups.assignmentsSaved'), { description: t('groups.assignmentsSavedDesc') })
      onSaved()
    } catch {
      toast.error(t('groups.failedAssignments'))
    } finally {
      setSaving(false)
    }
  }

  // Compute per-person subtotals
  const personSubtotals = useMemo(() => {
    const totals: Record<string, number> = {}
    members.forEach((m) => {
      totals[m.id] = 0
    })

    for (const item of items) {
      const memberIds = Array.from(assignmentMap[item.id] || [])
      if (memberIds.length === 0) continue
      const itemTotal = parseFloat(String(item.totalPrice ?? 0))
      const perPerson = itemTotal / memberIds.length
      for (const mid of memberIds) {
        totals[mid] = (totals[mid] || 0) + perPerson
      }
    }

    return totals
  }, [items, assignmentMap, members])

  const assignedCount = Object.values(assignmentMap).filter((s) => s.size > 0).length
  const totalItems = items.length

  const formatDate = (d: string | null) => {
    if (!d) return ''
    try {
      return new Date(d).toLocaleDateString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    } catch {
      return d
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-start justify-center overflow-y-auto py-4 px-4 md:py-8"
    >
      <motion.div
        initial={{ opacity: 0, y: 40, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 40, scale: 0.96 }}
        transition={{ type: 'spring', damping: 28, stiffness: 300 }}
        className="relative w-full max-w-lg"
      >
        {/* Receipt paper card */}
        <div className="bg-card border rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto">
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 z-10 h-8 w-8 rounded-full bg-muted/80 flex items-center justify-center hover:bg-muted transition-colors"
          >
            <X className="h-4 w-4" />
          </button>

          {/* Receipt header — dashed border bottom like real receipt */}
          <div className="px-6 pt-6 pb-4 text-center border-b border-dashed border-border">
            <div className="flex items-center justify-center gap-2 mb-2">
              <Receipt className="h-5 w-5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground uppercase tracking-widest font-medium">
                {t('groups.receiptDetail')}
              </span>
            </div>
            <h2 className="text-xl font-bold">{vendor || 'Receipt'}</h2>
            {date && (
              <p className="text-sm text-muted-foreground mt-1">{formatDate(date)}</p>
            )}
            <div className="mt-3 flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <span className="bg-muted px-2 py-0.5 rounded-full">
                {assignedCount}/{totalItems} {t('groups.itemsAssigned')}
              </span>
            </div>
          </div>

          {/* Member legend — horizontally scrollable on mobile */}
          <div className="relative px-4 py-3 bg-muted/30 border-b overflow-x-auto scrollbar-hide">
            <div className="absolute right-0 top-0 bottom-0 w-6 bg-gradient-to-l from-muted/30 to-transparent pointer-events-none z-10" />
            <div className="flex gap-2 min-w-min">
              {members.map((m, idx) => (
                <div
                  key={m.id}
                  className="flex items-center gap-1.5 shrink-0 bg-background rounded-full px-2.5 py-1 border"
                >
                  <div
                    className="h-5 w-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white shrink-0"
                    style={{ backgroundColor: MEMBER_COLORS[idx % MEMBER_COLORS.length] }}
                  >
                    {getInitials(m.name)}
                  </div>
                  <span className="text-xs font-medium whitespace-nowrap">{m.name}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Items list */}
          <div className="divide-y divide-dashed divide-border">
            <AnimatePresence initial={false}>
              {items.map((item, itemIdx) => {
                const assigned = assignmentMap[item.id] || new Set()
                const hasAssignment = assigned.size > 0
                // Find dominant color for left border
                const dominantMemberId = assigned.size === 1 ? Array.from(assigned)[0] : null
                const borderColor = dominantMemberId
                  ? getMemberColor(members, dominantMemberId)
                  : assigned.size > 1
                  ? '#a855f7'
                  : 'transparent'

                return (
                  <motion.div
                    key={item.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: itemIdx * 0.03 }}
                    className="relative transition-colors duration-200"
                    style={{
                      borderLeftWidth: 3,
                      borderLeftColor: borderColor,
                      backgroundColor: hasAssignment
                        ? `${borderColor}08`
                        : undefined,
                    }}
                  >
                    <div className="px-4 py-3">
                      {/* Item info row */}
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium leading-tight truncate">
                            {item.name}
                          </p>
                          {(item.quantity && Number(item.quantity) !== 1) && (
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {Number(item.quantity).toFixed(item.quantity && Number(item.quantity) % 1 !== 0 ? 3 : 0)} x{' '}
                              {currency} {parseFloat(String(item.unitPrice ?? 0)).toFixed(2)}
                            </p>
                          )}
                        </div>
                        <span className="text-sm font-semibold tabular-nums shrink-0">
                          {currency} {parseFloat(String(item.totalPrice ?? 0)).toFixed(2)}
                        </span>
                      </div>

                      {/* Member assignment dots */}
                      <div className="flex items-center gap-2 flex-wrap">
                        {members.map((m, mIdx) => {
                          const isAssigned = assigned.has(m.id)
                          const color = MEMBER_COLORS[mIdx % MEMBER_COLORS.length]
                          return (
                            <motion.button
                              key={m.id}
                              type="button"
                              onClick={() => toggleMember(item.id, m.id)}
                              whileTap={{ scale: 0.85 }}
                              className="relative h-9 w-9 rounded-full border-2 flex items-center justify-center transition-all duration-150"
                              style={{
                                borderColor: color,
                                backgroundColor: isAssigned ? color : 'transparent',
                              }}
                              title={m.name}
                            >
                              <AnimatePresence>
                                {isAssigned && (
                                  <motion.div
                                    initial={{ scale: 0, opacity: 0 }}
                                    animate={{ scale: 1, opacity: 1 }}
                                    exit={{ scale: 0, opacity: 0 }}
                                    transition={{ type: 'spring', damping: 15, stiffness: 400 }}
                                  >
                                    <Check className="h-3.5 w-3.5 text-white" />
                                  </motion.div>
                                )}
                              </AnimatePresence>
                              {!isAssigned && (
                                <span
                                  className="text-[10px] font-bold"
                                  style={{ color }}
                                >
                                  {getInitials(m.name)}
                                </span>
                              )}
                            </motion.button>
                          )
                        })}
                      </div>
                    </div>
                  </motion.div>
                )
              })}
            </AnimatePresence>
          </div>

          {/* Per-person summary */}
          <div className="border-t border-dashed border-border px-4 py-3 space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              {t('groups.perPerson')}
            </p>
            <div className="space-y-1.5">
              {members.map((m, idx) => {
                const subtotal = personSubtotals[m.id] || 0
                if (subtotal < 0.01) return null
                const color = MEMBER_COLORS[idx % MEMBER_COLORS.length]
                return (
                  <motion.div
                    key={m.id}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.1 + idx * 0.05 }}
                    className="flex items-center justify-between gap-2"
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className="h-8 w-8 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                        style={{ backgroundColor: color }}
                      >
                        {getInitials(m.name)}
                      </div>
                      <span className="text-sm font-medium">{m.name}</span>
                    </div>
                    <span className="text-sm font-semibold tabular-nums">
                      {currency} {subtotal.toFixed(2)}
                    </span>
                  </motion.div>
                )
              }).filter(Boolean)}
            </div>
          </div>

          {/* Grand total */}
          <div className="border-t-2 border-border px-6 py-4 flex items-center justify-between">
            <span className="text-base font-bold">{t('groups.totalAmount')}</span>
            <span className="text-lg font-bold tabular-nums">
              {currency} {parseFloat(String(total ?? 0)).toFixed(2)}
            </span>
          </div>

          {/* Save button */}
          <div className="px-6 pb-6">
            <Button
              className="w-full"
              size="lg"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {t('groups.savingAssignments')}
                </>
              ) : (
                <>
                  <Check className="h-4 w-4 mr-2" />
                  {t('groups.saveAssignments')}
                </>
              )}
            </Button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}
