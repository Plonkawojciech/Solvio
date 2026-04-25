'use client'

import { useState, useCallback } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Home, DollarSign, Camera, Users, FileText, Zap, PiggyBank, type LucideIcon } from 'lucide-react'
import { useTranslation } from '@/lib/i18n'
import { useProductType } from '@/hooks/use-product-type'
import { cn } from '@/lib/utils'
import { QuickSplitSheet } from '@/components/protected/groups/quick-split-sheet'
import { ScanReceiptSheet } from '@/components/protected/dashboard/scan-receipt-sheet'

interface MobileNavItem {
  href: string
  icon: LucideIcon
  labelKey: string
}

type NavSlot = MobileNavItem | null

function getMobileNavItems(isPersonal: boolean): NavSlot[] {
  if (isPersonal) {
    return [
      { href: '/dashboard', icon: Home, labelKey: 'nav.dashboard' },
      { href: '/expenses', icon: DollarSign, labelKey: 'nav.expenses' },
      null, // center FAB — scan receipt
      { href: '/groups', icon: Users, labelKey: 'nav.groups' },
      { href: '/savings', icon: PiggyBank, labelKey: 'nav.savings' },
    ]
  }

  return [
    { href: '/dashboard', icon: Home, labelKey: 'nav.dashboard' },
    { href: '/expenses', icon: DollarSign, labelKey: 'nav.expenses' },
    null, // center FAB — quick split
    { href: '/invoices', icon: FileText, labelKey: 'nav.invoices' },
    { href: '/team', icon: Users, labelKey: 'nav.team' },
  ]
}

export function MobileBottomNav() {
  const pathname = usePathname()
  const router = useRouter()
  const { t } = useTranslation()
  const { isPersonal } = useProductType()
  const [quickSplitOpen, setQuickSplitOpen] = useState(false)
  const [scanOpen, setScanOpen] = useState(false)

  const navItems = getMobileNavItems(isPersonal)
  const isOnGroupsPage = pathname.startsWith('/groups')

  const handleScanDone = useCallback(() => {
    setScanOpen(false)
    router.refresh()
    // refresh again after a few seconds for categories to load
    setTimeout(() => router.refresh(), 5000)
  }, [router])

  return (
    <>
      <nav className="shrink-0 md:hidden bg-background border-t-2 border-foreground" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
        <div className="flex items-center justify-around h-14 px-2">
          {navItems.map((item) => {
            if (!item) {
              if (isOnGroupsPage) {
                return (
                  <button
                    key="fab"
                    type="button"
                    onClick={() => setQuickSplitOpen(true)}
                    className="flex flex-col items-center justify-center -mt-5 active:translate-x-[1px] active:translate-y-[1px] transition-transform"
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    aria-label={t('groups.quickSplit' as any)}
                  >
                    <div className="h-12 w-12 rounded-md border-2 border-foreground bg-foreground text-background shadow-[3px_3px_0_hsl(var(--foreground))] flex items-center justify-center">
                      <Zap className="h-5 w-5" aria-hidden="true" />
                    </div>
                  </button>
                )
              }

              return (
                <button
                  key="fab"
                  type="button"
                  onClick={() => setScanOpen(true)}
                  className="flex flex-col items-center justify-center -mt-5 active:translate-x-[1px] active:translate-y-[1px] transition-transform"
                  aria-label={t('receipts.scan')}
                >
                  <div className="h-12 w-12 rounded-md border-2 border-foreground bg-foreground text-background shadow-[3px_3px_0_hsl(var(--foreground))] flex items-center justify-center">
                    <Camera className="h-5 w-5" aria-hidden="true" />
                  </div>
                </button>
              )
            }

            const Icon = item.icon
            const isActive =
              pathname === item.href || pathname.startsWith(item.href + '/')

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'flex flex-col items-center justify-center gap-1 flex-1 min-h-[44px] py-2 rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/50 focus-visible:ring-inset',
                  isActive
                    ? 'text-foreground font-bold border-t-[3px] border-foreground -mt-[2px]'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <Icon className="h-5 w-5" aria-hidden="true" />
                <span className="font-mono text-[10px] font-bold uppercase tracking-wider leading-none">
                  {t(item.labelKey as Parameters<typeof t>[0])}
                </span>
              </Link>
            )
          })}
        </div>
      </nav>

      <QuickSplitSheet
        open={quickSplitOpen}
        onOpenChange={setQuickSplitOpen}
      />

      <ScanReceiptSheet
        isOpen={scanOpen}
        onClose={() => setScanOpen(false)}
        onParsed={handleScanDone}
      />
    </>
  )
}
