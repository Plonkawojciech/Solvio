'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { useTranslation } from '@/lib/i18n'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ArrowLeft, Camera, Receipt, Plus } from 'lucide-react'
import Link from 'next/link'
import { GroupReceiptCard } from '@/components/protected/groups/group-receipt-card'
import { ReceiptItemAssigner } from '@/components/protected/groups/receipt-item-assigner'
import { ScanGroupReceiptSheet } from '@/components/protected/groups/scan-group-receipt-sheet'

interface ReceiptItem {
  id: string
  name: string
  quantity: string | number | null
  unitPrice: string | number | null
  totalPrice: string | number | null
}

interface Assignment {
  receiptItemId: string
  groupId: string
  memberId: string
  share: string
}

interface GroupReceipt {
  id: string
  vendor: string | null
  date: string | null
  total: string | number | null
  currency: string
  imageUrl: string | null
  paidByMemberId: string | null
  receiptItems: ReceiptItem[]
  assignments: Assignment[]
  paidByMember: { id: string; name: string } | null
  assignedItemCount: number
  totalItemCount: number
}

interface GroupMember {
  id: string
  name: string
  email?: string | null
  color?: string | null
}

export default function GroupReceiptsPage() {
  const { t } = useTranslation()
  const params = useParams()
  const router = useRouter()
  const groupId = params?.id as string

  const [receipts, setReceipts] = useState<GroupReceipt[]>([])
  const [members, setMembers] = useState<GroupMember[]>([])
  const [loading, setLoading] = useState(true)
  const [scanSheetOpen, setScanSheetOpen] = useState(false)
  const [selectedReceipt, setSelectedReceipt] = useState<GroupReceipt | null>(null)
  const [groupCurrency, setGroupCurrency] = useState('PLN')

  const fetchReceipts = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/groups/${groupId}/receipts`)
      if (!res.ok) throw new Error('Failed')
      const data = await res.json()
      setReceipts(data.receipts || [])
      setMembers(data.members || [])
      if (data.receipts?.[0]?.currency) {
        setGroupCurrency(data.receipts[0].currency)
      }
    } catch {
      // handle silently
    } finally {
      setLoading(false)
    }
  }, [groupId])

  // Also fetch group info for currency
  useEffect(() => {
    const fetchGroupInfo = async () => {
      try {
        const res = await fetch(`/api/groups/${groupId}`)
        if (res.ok) {
          const data = await res.json()
          setGroupCurrency(data.currency || 'PLN')
        }
      } catch {
        // silent
      }
    }
    fetchGroupInfo()
    fetchReceipts()
  }, [groupId, fetchReceipts])

  const handleScanned = (receiptId: string) => {
    fetchReceipts().then(() => {
      // Auto-open the assigner for the new receipt
      const newReceipt = receipts.find((r) => r.id === receiptId)
      // Will open on next render since we re-fetch
    })
  }

  const getAssignedMemberIds = (receipt: GroupReceipt): string[] => {
    const memberIds = new Set<string>()
    for (const a of receipt.assignments) {
      memberIds.add(a.memberId)
    }
    return Array.from(memberIds)
  }

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="space-y-3"
      >
        <Link
          href={`/groups/${groupId}`}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          {t('groups.backToGroups')}
        </Link>

        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{t('groups.receipts')}</h1>
            <p className="text-muted-foreground text-sm mt-0.5">
              {receipts.length} {receipts.length === 1 ? t('groups.item') : t('groups.items')}
            </p>
          </div>
          <Button onClick={() => setScanSheetOpen(true)} className="shrink-0">
            <Camera className="h-4 w-4 mr-2" />
            {t('groups.scanReceipt')}
          </Button>
        </div>
      </motion.div>

      {/* Content */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-xl" />
          ))}
        </div>
      ) : receipts.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4 }}
          className="flex flex-col items-center justify-center py-24 gap-5 text-center"
        >
          <div className="relative">
            <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-primary/10">
              <Receipt className="h-10 w-10 text-primary" />
            </div>
            <div className="absolute -inset-4 rounded-full border-2 border-primary/10 animate-pulse" />
          </div>
          <div className="space-y-1.5">
            <h2 className="text-xl font-semibold">{t('groups.noReceipts')}</h2>
            <p className="text-muted-foreground max-w-sm text-sm leading-relaxed">
              {t('groups.noReceiptsDesc')}
            </p>
          </div>
          <Button onClick={() => setScanSheetOpen(true)} size="lg">
            <Camera className="h-4 w-4 mr-2" />
            {t('groups.scanFirst')}
          </Button>
        </motion.div>
      ) : (
        <div className="space-y-3">
          {receipts.map((receipt, i) => (
            <GroupReceiptCard
              key={receipt.id}
              vendor={receipt.vendor}
              date={receipt.date}
              total={receipt.total}
              currency={receipt.currency || groupCurrency}
              items={receipt.receiptItems}
              assignedItemCount={receipt.assignedItemCount}
              totalItemCount={receipt.totalItemCount}
              assignedMemberIds={getAssignedMemberIds(receipt)}
              members={members}
              paidByMember={receipt.paidByMember}
              onClick={() => setSelectedReceipt(receipt)}
              index={i}
            />
          ))}
        </div>
      )}

      {/* Floating scan button for mobile */}
      {receipts.length > 0 && (
        <motion.div
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.5, type: 'spring', stiffness: 260, damping: 20 }}
          className="fixed bottom-20 right-4 md:bottom-8 md:right-8 z-40"
        >
          <Button
            size="lg"
            className="h-14 w-14 rounded-full shadow-lg"
            onClick={() => setScanSheetOpen(true)}
          >
            <Plus className="h-6 w-6" />
          </Button>
        </motion.div>
      )}

      {/* Scan sheet */}
      <ScanGroupReceiptSheet
        open={scanSheetOpen}
        onOpenChange={setScanSheetOpen}
        groupId={groupId}
        currency={groupCurrency}
        members={members}
        onScanned={handleScanned}
      />

      {/* Item assigner overlay */}
      <AnimatePresence>
        {selectedReceipt && (
          <ReceiptItemAssigner
            groupId={groupId}
            receiptId={selectedReceipt.id}
            vendor={selectedReceipt.vendor || 'Receipt'}
            date={selectedReceipt.date}
            currency={selectedReceipt.currency || groupCurrency}
            total={selectedReceipt.total}
            items={selectedReceipt.receiptItems}
            members={members}
            initialAssignments={selectedReceipt.assignments}
            onClose={() => setSelectedReceipt(null)}
            onSaved={() => {
              setSelectedReceipt(null)
              fetchReceipts()
            }}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
