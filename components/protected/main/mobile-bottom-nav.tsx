'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, DollarSign, Plus, Users, MoreHorizontal, FileText, Zap, type LucideIcon } from 'lucide-react'
import { useTranslation } from '@/lib/i18n'
import { useProductType } from '@/hooks/use-product-type'
import { cn } from '@/lib/utils'
import { QuickSplitSheet } from '@/components/protected/groups/quick-split-sheet'

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
      null, // center FAB placeholder
      { href: '/groups', icon: Users, labelKey: 'nav.groups' },
      { href: '/settings', icon: MoreHorizontal, labelKey: 'nav.settings' },
    ]
  }

  return [
    { href: '/dashboard', icon: Home, labelKey: 'nav.dashboard' },
    { href: '/expenses', icon: DollarSign, labelKey: 'nav.expenses' },
    null, // center FAB placeholder
    { href: '/invoices', icon: FileText, labelKey: 'nav.invoices' },
    { href: '/settings', icon: MoreHorizontal, labelKey: 'nav.settings' },
  ]
}

export function MobileBottomNav() {
  const pathname = usePathname()
  const { t } = useTranslation()
  const { isPersonal } = useProductType()
  const [quickSplitOpen, setQuickSplitOpen] = useState(false)

  const navItems = getMobileNavItems(isPersonal)
  const isOnGroupsPage = pathname.startsWith('/groups')

  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-background/95 backdrop-blur-md border-t border-border/50">
        <div className="flex items-center justify-around h-16 px-2 pb-[env(safe-area-inset-bottom)]">
          {navItems.map((item, i) => {
            if (!item) {
              // On groups pages, FAB opens Quick Split; otherwise navigates to expenses
              if (isOnGroupsPage) {
                return (
                  <button
                    key="fab"
                    type="button"
                    onClick={() => setQuickSplitOpen(true)}
                    className="flex flex-col items-center justify-center -mt-5"
                    aria-label={t('groups.quickSplit' as any)}
                  >
                    <div className="h-12 w-12 rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 flex items-center justify-center">
                      <Zap className="h-6 w-6" />
                    </div>
                  </button>
                )
              }

              return (
                <Link
                  key="fab"
                  href="/expenses"
                  className="flex flex-col items-center justify-center -mt-5"
                  aria-label="Scan receipt"
                >
                  <div className="h-12 w-12 rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 flex items-center justify-center">
                    <Plus className="h-6 w-6" />
                  </div>
                </Link>
              )
            }

            const Icon = item.icon
            const isActive =
              pathname === item.href || pathname.startsWith(item.href + '/')

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex flex-col items-center justify-center gap-1 flex-1 min-h-[44px] py-2 rounded-lg transition-colors',
                  isActive ? 'text-primary' : 'text-muted-foreground'
                )}
              >
                <Icon className="h-6 w-6" />
                <span className="text-[11px] font-medium leading-none">
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
    </>
  )
}
