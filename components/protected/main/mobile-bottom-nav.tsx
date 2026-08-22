'use client'

import { useState, useCallback } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Home, DollarSign, Camera, Settings, type LucideIcon } from 'lucide-react'
import { useTranslation } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { ScanReceiptSheet } from '@/components/protected/dashboard/scan-receipt-sheet'

interface MobileNavItem {
  href: string
  icon: LucideIcon
  labelKey: string
}

/** `null` to środkowy FAB — skanowanie paragonu. Zasada produktu: to JEDYNY
 *  przycisk skanowania w nawigacji, żadna strona nie dokłada własnego. */
const NAV_SLOTS: (MobileNavItem | null)[] = [
  { href: '/dashboard', icon: Home, labelKey: 'nav.dashboard' },
  null,
  { href: '/expenses', icon: DollarSign, labelKey: 'nav.expenses' },
  { href: '/settings', icon: Settings, labelKey: 'nav.settings' },
]

export function MobileBottomNav() {
  const pathname = usePathname()
  const router = useRouter()
  const { t } = useTranslation()
  const [scanOpen, setScanOpen] = useState(false)

  const handleScanDone = useCallback(() => {
    setScanOpen(false)
    router.refresh()
    // Drugie odświeżenie: kategoryzacja pozycji paragonu dobiega po chwili.
    setTimeout(() => router.refresh(), 5000)
  }, [router])

  return (
    <>
      <nav
        className="shrink-0 md:hidden bg-background border-t border-border"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <div className="flex items-center justify-around h-14 px-2">
          {NAV_SLOTS.map((item, i) => {
            if (!item) {
              return (
                <button
                  key="fab"
                  type="button"
                  onClick={() => setScanOpen(true)}
                  className="flex flex-col items-center justify-center -mt-5 active:scale-95 transition-transform"
                  aria-label={t('receipts.scan')}
                >
                  <div className="h-12 w-12 rounded-full bg-primary text-primary-foreground shadow-[var(--nb-shadow)] flex items-center justify-center">
                    <Camera className="h-5 w-5" aria-hidden="true" />
                  </div>
                </button>
              )
            }

            const Icon = item.icon
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/')

            return (
              <Link
                key={item.href ?? i}
                href={item.href}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'flex flex-col items-center justify-center gap-1 flex-1 min-h-[44px] py-2 rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
                  isActive ? 'text-primary font-semibold' : 'text-muted-foreground hover:text-foreground',
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

      <ScanReceiptSheet
        isOpen={scanOpen}
        onClose={() => setScanOpen(false)}
        onParsed={handleScanDone}
      />
    </>
  )
}
