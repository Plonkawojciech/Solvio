'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useSession } from '@/lib/use-session'
import { useProductType } from '@/hooks/use-product-type'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import {
  DollarSign,
  FileText,
  Home,
  Settings,
  Wallet,
  LogOut,
  Users,
  Landmark,
  Building2,
  PiggyBank,
  type LucideIcon,
} from "lucide-react"
import { useTranslation } from '@/lib/i18n'
import { Button } from '@/components/ui/button'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import { KeyboardShortcutsButton } from '@/components/protected/main/keyboard-shortcuts'
import { LanguageSwitcher } from '@/components/language-switcher'
import { ProductSwitcher } from '@/components/protected/main/product-switcher'

interface NavItem {
  key: string
  href: string
  icon: LucideIcon
}

function getNavItems(isPersonal: boolean): NavItem[] {
  if (isPersonal) {
    return [
      { key: 'dashboard', href: '/dashboard', icon: Home },
      { key: 'expenses', href: '/expenses', icon: DollarSign },
      { key: 'groups', href: '/groups', icon: Users },
      { key: 'bank', href: '/bank', icon: Landmark },
      { key: 'savings', href: '/savings', icon: PiggyBank },
      { key: 'settings', href: '/settings', icon: Settings },
    ]
  }

  return [
    { key: 'dashboard', href: '/dashboard', icon: Home },
    { key: 'expenses', href: '/expenses', icon: DollarSign },
    { key: 'invoices', href: '/invoices', icon: FileText },
    { key: 'bank', href: '/bank', icon: Landmark },
    { key: 'team', href: '/team', icon: Users },
    { key: 'settings', href: '/settings', icon: Settings },
  ]
}

export function AppSidebar() {
  const { t, lang, mounted } = useTranslation()
  const pathname = usePathname()
  const router = useRouter()
  const { email } = useSession()
  const { isPersonal, isBusiness } = useProductType()

  const items = getNavItems(isPersonal)
  const displayName = email ? email.split('@')[0] : 'User'
  const initials = displayName.slice(0, 2).toUpperCase()

  async function handleSignOut() {
    await fetch('/api/auth/session', { method: 'DELETE' })
    router.push('/login')
    router.refresh()
  }

  return (
    <Sidebar>
      <SidebarHeader className="border-b p-4">
        <Link href="/dashboard" className="flex items-center gap-2 font-bold text-lg">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            {isBusiness ? (
              <Building2 className="h-4 w-4" />
            ) : (
              <Wallet className="h-4 w-4" />
            )}
          </div>
          <div className="flex flex-col">
            <span className="leading-tight">Solvio</span>
            <span
              suppressHydrationWarning
              className={`text-[10px] font-semibold uppercase tracking-wider leading-none ${
                isBusiness
                  ? 'text-blue-500 dark:text-blue-400'
                  : 'text-emerald-500 dark:text-emerald-400'
              }`}
            >
              {t(`nav.${isPersonal ? 'personal' : 'business'}`)}
            </span>
          </div>
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel suppressHydrationWarning>
            {t('nav.navigation')}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => {
                const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton asChild isActive={isActive}>
                      <Link href={item.href} className="flex items-center gap-2">
                        <item.icon className="h-4 w-4" />
                        <span suppressHydrationWarning>{t(`nav.${item.key}`)}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-3 border-t space-y-2">
        {/* Product switcher (Personal ↔ Business) */}
        <ProductSwitcher />

        <div className="h-px bg-border/50" />

        {/* User info */}
        <div className="flex items-center gap-2.5 px-1 py-1 rounded-lg hover:bg-muted/50 transition-colors">
          <div className="h-8 w-8 shrink-0 rounded-full overflow-hidden bg-primary/10 flex items-center justify-center">
            <span className="text-xs font-semibold text-primary">{initials}</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate leading-tight">{displayName}</p>
            {email && <p className="text-xs text-muted-foreground truncate">{email}</p>}
          </div>
        </div>

        {/* Language toggle */}
        <LanguageSwitcher className="w-full justify-center" />

        {/* Theme toggle */}
        <ThemeToggle />

        {/* Keyboard shortcuts hint */}
        <KeyboardShortcutsButton
          onClick={() => {
            // Dispatch a synthetic '?' keydown so KeyboardShortcuts handles it
            document.dispatchEvent(
              new KeyboardEvent('keydown', { key: '?', bubbles: true })
            )
          }}
        />

        {/* Logout */}
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
          onClick={handleSignOut}
        >
          <LogOut className="h-4 w-4 mr-2" />
          <span suppressHydrationWarning>{t('nav.signOut')}</span>
        </Button>
      </SidebarFooter>
    </Sidebar>
  )
}
