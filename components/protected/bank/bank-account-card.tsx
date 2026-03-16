'use client'

import { motion } from 'framer-motion'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { RefreshCw, Landmark, Loader2 } from 'lucide-react'
import { useTranslation } from '@/lib/i18n'

interface BankAccount {
  id: string
  accountName: string | null
  accountNumber: string | null
  balance: string | null
  currency: string | null
  balanceUpdatedAt: string | null
  isActive: boolean
  connectionStatus: string
  lastSyncAt: string | null
  provider: string
}

function maskIban(iban: string | null): string {
  if (!iban) return '----'
  const clean = iban.replace(/\s/g, '')
  if (clean.length < 8) return iban
  return `${clean.slice(0, 4)} **** **** ${clean.slice(-4)}`
}

function getSyncStatus(lastSyncAt: string | null): 'green' | 'yellow' | 'red' {
  if (!lastSyncAt) return 'red'
  const diff = Date.now() - new Date(lastSyncAt).getTime()
  const hours = diff / (1000 * 60 * 60)
  if (hours < 6) return 'green'
  if (hours < 24) return 'yellow'
  return 'red'
}

function formatSyncTime(lastSyncAt: string | null, lang: string): string {
  if (!lastSyncAt) return '---'
  const date = new Date(lastSyncAt)
  const now = Date.now()
  const diff = now - date.getTime()
  const minutes = Math.floor(diff / (1000 * 60))
  const hours = Math.floor(diff / (1000 * 60 * 60))
  const locale = lang === 'pl' ? 'pl-PL' : 'en-US'

  if (minutes < 1) return lang === 'pl' ? 'Przed chwilą' : 'Just now'
  if (minutes < 60) return `${minutes} min ${lang === 'pl' ? 'temu' : 'ago'}`
  if (hours < 24) return `${hours}h ${lang === 'pl' ? 'temu' : 'ago'}`
  return date.toLocaleDateString(locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

const syncDotColors: Record<string, string> = {
  green: 'bg-emerald-500',
  yellow: 'bg-yellow-500',
  red: 'bg-red-500',
}

const syncDotRingColors: Record<string, string> = {
  green: 'ring-emerald-500/30',
  yellow: 'ring-yellow-500/30',
  red: 'ring-red-500/30',
}

export function BankAccountCard({
  account,
  index,
  onSync,
  syncing,
}: {
  account: BankAccount
  index: number
  onSync: (accountId: string) => void
  syncing: boolean
}) {
  const { t, lang } = useTranslation()
  const syncStatus = getSyncStatus(account.lastSyncAt)
  const currency = account.currency || 'PLN'
  const locale = lang === 'pl' ? 'pl-PL' : 'en-US'

  const formattedBalance = account.balance
    ? new Intl.NumberFormat(locale, {
        style: 'currency',
        currency,
        minimumFractionDigits: 2,
      }).format(parseFloat(account.balance))
    : '---'

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.08, ease: [0.22, 1, 0.36, 1] as const }}
    >
      <Card className="overflow-hidden hover:shadow-md transition-shadow duration-200">
        <CardContent className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="h-11 w-11 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <Landmark className="h-5 w-5 text-primary" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-sm truncate" suppressHydrationWarning>
                    {account.provider === 'pko' ? 'PKO BP' : account.provider.toUpperCase()}
                  </h3>
                  <div className="flex items-center gap-1.5">
                    <span className={`h-2 w-2 rounded-full ring-2 ${syncDotColors[syncStatus]} ${syncDotRingColors[syncStatus]}`} />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground truncate" suppressHydrationWarning>
                  {account.accountName || t('bank.mainAccount')}
                </p>
              </div>
            </div>

            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={() => onSync(account.id)}
              disabled={syncing}
            >
              {syncing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
            </Button>
          </div>

          <div className="mt-4 space-y-3">
            {/* Balance */}
            <div>
              <p className="text-xs text-muted-foreground" suppressHydrationWarning>
                {t('bank.balance')}
              </p>
              <p className="text-2xl font-bold tabular-nums tracking-tight">
                {formattedBalance}
              </p>
            </div>

            {/* IBAN */}
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground font-mono" suppressHydrationWarning>
                {maskIban(account.accountNumber)}
              </span>
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0" suppressHydrationWarning>
                {currency}
              </Badge>
            </div>

            {/* Last sync */}
            <div className="flex items-center justify-between pt-2 border-t">
              <span className="text-[11px] text-muted-foreground" suppressHydrationWarning>
                {t('bank.lastSync')}
              </span>
              <span className="text-[11px] font-medium" suppressHydrationWarning>
                {formatSyncTime(account.lastSyncAt, lang)}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}
