'use client'

import { motion } from 'framer-motion'
import { useTranslation } from '@/lib/i18n'
import { Receipt } from 'lucide-react'

const MEMBER_COLORS = [
  '#6366f1', '#ec4899', '#f59e0b', '#10b981',
  '#3b82f6', '#8b5cf6', '#ef4444', '#14b8a6',
]

interface ReceiptItem {
  id: string
  name: string
  totalPrice: string | number | null
}

interface GroupMember {
  id: string
  name: string
  color?: string | null
}

interface GroupReceiptCardProps {
  vendor: string | null
  date: string | null
  total: string | number | null
  currency: string
  items: ReceiptItem[]
  assignedItemCount: number
  totalItemCount: number
  assignedMemberIds: string[]
  members: GroupMember[]
  paidByMember: { id: string; name: string } | null
  onClick: () => void
  index?: number
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return ''
  try {
    return new Date(dateStr).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    })
  } catch {
    return dateStr
  }
}

export function GroupReceiptCard({
  vendor,
  date,
  total,
  currency,
  items,
  assignedItemCount,
  totalItemCount,
  assignedMemberIds,
  members,
  paidByMember,
  onClick,
  index = 0,
}: GroupReceiptCardProps) {
  const { t } = useTranslation()

  const progress = totalItemCount > 0 ? (assignedItemCount / totalItemCount) * 100 : 0
  const isComplete = assignedItemCount === totalItemCount && totalItemCount > 0
  const displayItems = items.slice(0, 3)
  const moreCount = Math.max(0, items.length - 3)

  // Unique member colors for dots
  const memberMap = new Map(members.map((m, i) => [m.id, { ...m, colorIdx: i }]))

  return (
    <motion.div
      initial={{ opacity: 0, y: 16, rotate: 0 }}
      animate={{ opacity: 1, y: 0, rotate: 0 }}
      transition={{ delay: index * 0.06, duration: 0.35 }}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className="cursor-pointer group/receipt"
    >
      <div className="relative bg-card border rounded-xl shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden">
        {/* Torn edge effect at top */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary/20 via-primary/40 to-primary/20" />

        <div className="p-4">
          {/* Header: store + date + total */}
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                <Receipt className="h-5 w-5 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm truncate leading-tight">
                  {vendor || 'Receipt'}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {formatDate(date)}
                </p>
              </div>
            </div>
            <div className="text-right shrink-0">
              <p className="text-sm font-bold tabular-nums">
                {currency} {parseFloat(String(total ?? 0)).toFixed(2)}
              </p>
              <p className="text-xs text-muted-foreground">
                {totalItemCount} {totalItemCount === 1 ? t('groups.item') : t('groups.items')}
              </p>
            </div>
          </div>

          {/* Mini item list */}
          <div className="space-y-1 mb-3">
            {displayItems.map((item) => (
              <div key={item.id} className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="truncate flex-1 mr-2">{item.name}</span>
                <span className="tabular-nums shrink-0">
                  {currency} {parseFloat(String(item.totalPrice ?? 0)).toFixed(2)}
                </span>
              </div>
            ))}
            {moreCount > 0 && (
              <p className="text-xs text-muted-foreground/60 italic">
                +{moreCount} {t('groups.moreItems')}
              </p>
            )}
          </div>

          {/* Progress bar */}
          <div className="mb-3">
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-muted-foreground">
                {assignedItemCount}/{totalItemCount} {t('groups.assignProgress')}
              </span>
              {isComplete && (
                <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                  {t('groups.allItemsAssigned')}
                </span>
              )}
            </div>
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                transition={{ delay: index * 0.06 + 0.2, duration: 0.5, ease: [0.32, 0.72, 0, 1] as any }}
                className={`h-full rounded-full ${
                  isComplete
                    ? 'bg-emerald-500'
                    : progress > 0
                    ? 'bg-primary'
                    : 'bg-muted'
                }`}
              />
            </div>
          </div>

          {/* Footer: member dots + paid by */}
          <div className="flex items-center justify-between gap-2">
            {/* Assigned member dots */}
            <div className="flex -space-x-1">
              {assignedMemberIds.slice(0, 6).map((mid) => {
                const mem = memberMap.get(mid)
                if (!mem) return null
                const color = MEMBER_COLORS[mem.colorIdx % MEMBER_COLORS.length]
                return (
                  <div
                    key={mid}
                    className="h-6 w-6 rounded-full border-2 border-card flex items-center justify-center text-[8px] font-bold text-white shrink-0"
                    style={{ backgroundColor: color }}
                    title={mem.name}
                  >
                    {getInitials(mem.name)}
                  </div>
                )
              })}
              {assignedMemberIds.length > 6 && (
                <div className="h-6 w-6 rounded-full border-2 border-card bg-muted flex items-center justify-center text-[8px] font-semibold text-muted-foreground">
                  +{assignedMemberIds.length - 6}
                </div>
              )}
            </div>

            {/* Paid by */}
            {paidByMember && (
              <p className="text-xs text-muted-foreground truncate">
                {t('groups.paidByMember')} {paidByMember.name}
              </p>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  )
}
