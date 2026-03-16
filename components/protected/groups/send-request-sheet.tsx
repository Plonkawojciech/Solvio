'use client'

import { useState } from 'react'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Send,
  Loader2,
  ArrowRight,
  CreditCard,
  MessageSquare,
  Copy,
  CheckCircle2,
} from 'lucide-react'

interface Debt {
  fromId: string
  fromName: string
  fromColor: string
  toId: string
  toName: string
  toColor: string
  amount: number
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

function formatCurrency(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount)
  } catch {
    return `${amount.toFixed(2)} ${currency}`
  }
}

interface SendRequestSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  groupId: string
  currency: string
  debt: Debt | null
  groupName: string
  groupEmoji: string
  onSent: () => void
}

export function SendRequestSheet({
  open,
  onOpenChange,
  groupId,
  currency,
  debt,
  groupName,
  groupEmoji,
  onSent,
}: SendRequestSheetProps) {
  const { t } = useTranslation()
  const [note, setNote] = useState('')
  const [bankAccount, setBankAccount] = useState('')
  const [sending, setSending] = useState(false)
  const [sentResult, setSentResult] = useState<{
    shareUrl: string
    paymentRequestId: string
  } | null>(null)

  const handleSend = async () => {
    if (!debt) return
    setSending(true)
    try {
      const res = await fetch(`/api/groups/${groupId}/settlements`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromMemberId: debt.fromId,
          toMemberId: debt.toId,
          amount: debt.amount,
          note: note.trim() || undefined,
          bankAccount: bankAccount.trim() || undefined,
        }),
      })
      if (!res.ok) throw new Error('Failed')
      const data = await res.json()
      setSentResult({
        shareUrl: data.shareUrl,
        paymentRequestId: data.paymentRequestId,
      })
      toast.success(t('settlements.requestSent'), {
        description: t('settlements.requestSentDesc'),
      })
    } catch {
      toast.error(t('settlements.requestFailed'))
    } finally {
      setSending(false)
    }
  }

  const handleCopyLink = async () => {
    if (!sentResult) return
    try {
      await navigator.clipboard.writeText(sentResult.shareUrl)
      toast.success(t('settlements.linkCopied'))
    } catch {
      const textArea = document.createElement('textarea')
      textArea.value = sentResult.shareUrl
      document.body.appendChild(textArea)
      textArea.select()
      document.execCommand('copy')
      document.body.removeChild(textArea)
      toast.success(t('settlements.linkCopied'))
    }
  }

  const handleClose = (isOpen: boolean) => {
    if (!isOpen) {
      setNote('')
      setBankAccount('')
      setSentResult(null)
    }
    onOpenChange(isOpen)
    if (!isOpen && sentResult) {
      onSent()
    }
  }

  if (!debt) return null

  return (
    <Sheet open={open} onOpenChange={handleClose}>
      <SheetContent side="bottom" className="rounded-t-2xl max-h-[85vh] overflow-y-auto">
        <SheetHeader className="pb-2">
          <SheetTitle>{t('settlements.sendRequest')}</SheetTitle>
          <SheetDescription>
            {groupEmoji} {groupName}
          </SheetDescription>
        </SheetHeader>

        {!sentResult ? (
          <div className="space-y-5 px-4 pb-2">
            {/* Preview card */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="relative rounded-2xl border-2 border-dashed border-muted-foreground/20 p-5 bg-muted/20"
            >
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-4">
                {t('settlements.preview')}
              </p>

              {/* From -> To */}
              <div className="flex items-center justify-center gap-4">
                <div className="flex flex-col items-center gap-1.5">
                  <div
                    className="h-12 w-12 rounded-full flex items-center justify-center text-sm font-bold text-white shadow-lg"
                    style={{ backgroundColor: debt.fromColor }}
                  >
                    {getInitials(debt.fromName)}
                  </div>
                  <span className="text-xs font-medium">{debt.fromName}</span>
                  <span className="text-[10px] text-muted-foreground">{t('settlements.from')}</span>
                </div>

                <div className="flex flex-col items-center gap-1">
                  <div className="flex items-center gap-1">
                    <div
                      className="w-8 h-0.5 rounded-full"
                      style={{
                        background: `linear-gradient(to right, ${debt.fromColor}, ${debt.toColor})`,
                      }}
                    />
                    <ArrowRight className="h-4 w-4" style={{ color: debt.toColor }} />
                  </div>
                  <p className="text-xl font-bold tabular-nums">
                    {formatCurrency(debt.amount, currency)}
                  </p>
                </div>

                <div className="flex flex-col items-center gap-1.5">
                  <div
                    className="h-12 w-12 rounded-full flex items-center justify-center text-sm font-bold text-white shadow-lg"
                    style={{ backgroundColor: debt.toColor }}
                  >
                    {getInitials(debt.toName)}
                  </div>
                  <span className="text-xs font-medium">{debt.toName}</span>
                  <span className="text-[10px] text-muted-foreground">{t('settlements.to')}</span>
                </div>
              </div>
            </motion.div>

            {/* Note */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
              className="space-y-2"
            >
              <Label className="flex items-center gap-1.5 text-sm">
                <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
                {t('settlements.note')}
              </Label>
              <Input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={t('settlements.notePlaceholder')}
                className="h-10"
              />
            </motion.div>

            {/* Bank account */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="space-y-2"
            >
              <Label className="flex items-center gap-1.5 text-sm">
                <CreditCard className="h-3.5 w-3.5 text-muted-foreground" />
                {t('settlements.bankAccount')}
              </Label>
              <Input
                value={bankAccount}
                onChange={(e) => setBankAccount(e.target.value)}
                placeholder={t('settlements.bankAccountPlaceholder')}
                className="h-10 font-mono text-sm"
              />
            </motion.div>
          </div>
        ) : (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center py-8 gap-4 text-center px-4"
          >
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30">
              <CheckCircle2 className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <p className="font-bold text-lg">{t('settlements.requestSent')}</p>
              <p className="text-sm text-muted-foreground mt-1">
                {t('settlements.requestSentDesc')}
              </p>
            </div>

            {/* Share URL */}
            <div className="w-full max-w-sm">
              <div className="flex items-center gap-2 bg-muted/50 rounded-lg p-2">
                <input
                  type="text"
                  readOnly
                  value={sentResult.shareUrl}
                  className="flex-1 bg-transparent text-xs font-mono text-muted-foreground truncate outline-none"
                />
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs gap-1 shrink-0"
                  onClick={handleCopyLink}
                >
                  <Copy className="h-3 w-3" />
                  {t('settlements.copyLink')}
                </Button>
              </div>
            </div>
          </motion.div>
        )}

        <SheetFooter>
          {!sentResult ? (
            <Button
              onClick={handleSend}
              disabled={sending}
              className="w-full h-11 gap-2"
            >
              {sending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              {sending ? t('settlements.sending') : t('settlements.sendRequest')}
            </Button>
          ) : (
            <Button
              onClick={() => handleClose(false)}
              variant="outline"
              className="w-full h-11"
            >
              {t('common.close')}
            </Button>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
