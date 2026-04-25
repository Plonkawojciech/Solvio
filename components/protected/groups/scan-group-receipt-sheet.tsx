'use client'

import { useState, useRef, useEffect } from 'react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { useTranslation } from '@/lib/i18n'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Camera, Upload, Loader2, Check, Receipt } from 'lucide-react'
import Image from 'next/image'

const MEMBER_COLORS = [
  '#6366f1', '#ec4899', '#f59e0b', '#10b981',
  '#3b82f6', '#8b5cf6', '#ef4444', '#14b8a6',
]

interface GroupMember {
  id: string
  name: string
  email?: string | null
  color?: string | null
}

interface ScanGroupReceiptSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  groupId: string
  currency: string
  members: GroupMember[]
  onScanned: (receiptId: string) => void
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

type ScanStage = 'upload' | 'processing' | 'preview' | 'done'

interface ScannedItem {
  name: string
  quantity: number | null
  price: number | null
}

export function ScanGroupReceiptSheet({
  open,
  onOpenChange,
  groupId,
  currency,
  members,
  onScanned,
}: ScanGroupReceiptSheetProps) {
  const { t } = useTranslation()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [stage, setStage] = useState<ScanStage>('upload')
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [paidByMemberId, setPaidByMemberId] = useState<string>(members[0]?.id ?? '')
  const [scannedData, setScannedData] = useState<{
    merchant: string
    total: number
    items: ScannedItem[]
    receiptId: string
  } | null>(null)
  const [loading, setLoading] = useState(false)

  // Reset state on open
  useEffect(() => {
    if (open) {
      setStage('upload')
      setFile(null)
      setPreviewUrl(null)
      setPaidByMemberId(members[0]?.id ?? '')
      setScannedData(null)
      setLoading(false)
    }
  }, [open, members])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return

    if (f.size > 10 * 1024 * 1024) {
      toast.error(t('errors.fileTooLarge'))
      return
    }

    setFile(f)
    setPreviewUrl(URL.createObjectURL(f))
  }

  const handleScan = async () => {
    if (!file) return

    setStage('processing')
    setLoading(true)

    try {
      // 1. Call OCR
      const formData = new FormData()
      formData.append('files', file)

      const ocrRes = await fetch('/api/v1/ocr-receipt', {
        method: 'POST',
        body: formData,
      })

      if (!ocrRes.ok) throw new Error('OCR failed')

      const ocrData = await ocrRes.json()

      if (!ocrData.success || !ocrData.results?.[0]?.success) {
        const errMsg = ocrData.results?.[0]?.message || 'OCR failed'
        throw new Error(errMsg)
      }

      const result = ocrData.results[0]
      const receiptId = result.receipt_id

      setScannedData({
        merchant: result.data.merchant || 'Unknown',
        total: result.data.total || 0,
        items: result.data.items || [],
        receiptId,
      })

      // 2. Link receipt to group
      const linkRes = await fetch(`/api/groups/${groupId}/receipts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          receiptId,
          paidByMemberId,
        }),
      })

      if (!linkRes.ok) throw new Error('Failed to link receipt to group')

      setStage('preview')
    } catch (err) {
      toast.error(t('groups.scanFailed'), {
        description: err instanceof Error ? err.message : undefined,
      })
      setStage('upload')
    } finally {
      setLoading(false)
    }
  }

  const handleDone = () => {
    if (scannedData) {
      toast.success(t('groups.scanSuccess'), { description: t('groups.scanSuccessDesc') })
      onScanned(scannedData.receiptId)
    }
    onOpenChange(false)
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto flex flex-col gap-0 p-0">
        <SheetHeader className="p-6 pb-4 border-b">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
              <Receipt className="h-5 w-5 text-primary" />
            </div>
            <div>
              <SheetTitle>{t('groups.scanReceipt')}</SheetTitle>
              <SheetDescription className="text-sm text-muted-foreground mt-0.5">
                {t('groups.scanReceiptDesc')}
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Stage: Upload */}
          {stage === 'upload' && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-5"
            >
              {/* File upload area */}
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed rounded-xl p-8 text-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-all duration-200"
              >
                {previewUrl ? (
                  <div className="space-y-3">
                    <div className="relative mx-auto w-32 h-32 rounded-lg overflow-hidden border">
                      <Image
                        src={previewUrl}
                        alt="Receipt preview"
                        className="w-full h-full object-cover"
                        width={128}
                        height={128}
                        unoptimized
                      />
                    </div>
                    <p className="text-sm font-medium">{file?.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {((file?.size || 0) / 1024).toFixed(0)} KB
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex h-14 w-14 mx-auto items-center justify-center rounded-full bg-muted">
                      <Camera className="h-7 w-7 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="font-medium text-sm">{t('groups.selectFile')}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        JPG, PNG, WebP, PDF — max 10MB
                      </p>
                    </div>
                  </div>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,.pdf"
                  capture="environment"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </div>

              {/* Who paid */}
              <div className="space-y-2">
                <Label>{t('groups.whoPaid')}</Label>
                <Select value={paidByMemberId} onValueChange={setPaidByMemberId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {members.map((m, idx) => (
                      <SelectItem key={m.id} value={m.id}>
                        <div className="flex items-center gap-2">
                          <div
                            className="h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                            style={{ backgroundColor: MEMBER_COLORS[idx % MEMBER_COLORS.length] }}
                          >
                            {getInitials(m.name)}
                          </div>
                          {m.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </motion.div>
          )}

          {/* Stage: Processing */}
          {stage === 'processing' && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center py-12 gap-4"
            >
              <motion.div
                animate={{ rotate: 360 }}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                transition={{ duration: 2, repeat: Infinity, ease: 'linear' as any }}
              >
                <Loader2 className="h-10 w-10 text-primary" />
              </motion.div>
              <div className="text-center">
                <p className="font-semibold">{t('groups.processing')}</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Azure OCR + AI...
                </p>
              </div>
            </motion.div>
          )}

          {/* Stage: Preview */}
          {stage === 'preview' && scannedData && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-4"
            >
              {/* Success indicator */}
              <div className="flex items-center gap-3 p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg border border-emerald-200 dark:border-emerald-800">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/50">
                  <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                    {t('groups.scanSuccess')}
                  </p>
                  <p className="text-xs text-emerald-600 dark:text-emerald-400">
                    {scannedData.merchant} — {currency} {scannedData.total.toFixed(2)}
                  </p>
                </div>
              </div>

              {/* Extracted items preview */}
              <div className="space-y-2">
                <p className="text-sm font-semibold">
                  {scannedData.items.length} {t('groups.items')}
                </p>
                <div className="rounded-lg border divide-y max-h-64 overflow-y-auto">
                  {scannedData.items.map((item, idx) => (
                    <motion.div
                      key={idx}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: idx * 0.03 }}
                      className="flex items-center justify-between px-3 py-2 text-sm"
                    >
                      <span className="truncate flex-1 mr-2">{item.name}</span>
                      <span className="tabular-nums shrink-0 text-muted-foreground">
                        {currency} {(item.price ?? 0).toFixed(2)}
                      </span>
                    </motion.div>
                  ))}
                </div>
              </div>

              {/* Who paid summary */}
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">{t('groups.paidByMember')}:</span>
                {(() => {
                  const payer = members.find((m) => m.id === paidByMemberId)
                  const payerIdx = members.findIndex((m) => m.id === paidByMemberId)
                  if (!payer) return null
                  return (
                    <div className="flex items-center gap-1.5">
                      <div
                        className="h-5 w-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white"
                        style={{ backgroundColor: MEMBER_COLORS[payerIdx % MEMBER_COLORS.length] }}
                      >
                        {getInitials(payer.name)}
                      </div>
                      <span className="font-medium">{payer.name}</span>
                    </div>
                  )
                })()}
              </div>
            </motion.div>
          )}
        </div>

        <SheetFooter className="p-6 pt-4 border-t">
          {stage === 'upload' && (
            <Button
              className="w-full"
              onClick={handleScan}
              disabled={!file || loading}
            >
              <Upload className="h-4 w-4 mr-2" />
              {t('groups.scanReceipt')}
            </Button>
          )}
          {stage === 'preview' && (
            <Button className="w-full" onClick={handleDone}>
              <Check className="h-4 w-4 mr-2" />
              {t('groups.assignItems')}
            </Button>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
