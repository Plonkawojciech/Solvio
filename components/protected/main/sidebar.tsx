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
  Repeat,
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
      { key: 'subscriptions', href: '/subscriptions', icon: Repeat },
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
  const { t } = useTranslation()
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
      <SidebarHeader className="border-b-2 border-sidebar-border p-4">
        <Link href="/dashboard" className="flex items-center gap-3 group">
          <div className="flex h-9 w-9 items-center justify-center rounded-md border-2 border-foreground bg-foreground text-background shadow-[2px_2px_0_hsl(var(--foreground))] group-hover:translate-x-[-1px] group-hover:translate-y-[-1px] group-hover:shadow-[3px_3px_0_hsl(var(--foreground))] transition-all">
            {isBusiness ? (
              <Building2 className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Wallet className="h-4 w-4" aria-hidden="true" />
            )}
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-black leading-tight tracking-tight">Solvio</span>
            <span
              suppressHydrationWarning
              className="font-mono text-[10px] font-bold uppercase tracking-widest leading-none text-muted-foreground"
            >
              {'// '}{t(`nav.${isPersonal ? 'personal' : 'business'}`)}
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
                        <item.icon className="h-4 w-4" aria-hidden="true" />
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

      <SidebarFooter className="p-3 border-t-2 border-sidebar-border space-y-2.5">
        {/* Product switcher (Personal / Business) */}
        <ProductSwitcher />

        <div className="h-[2px] bg-sidebar-border" />

        {/* User info */}
        <div className="flex items-center gap-3 px-2 py-2 rounded-md border-2 border-dashed border-sidebar-border/40">
          <div className="h-9 w-9 shrink-0 rounded-md border-2 border-foreground bg-card flex items-center justify-center font-mono shadow-[2px_2px_0_hsl(var(--foreground))]">
            <span className="text-xs font-black text-foreground">{initials}</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold truncate leading-tight">{displayName}</p>
            {email && <p className="font-mono text-[11px] text-muted-foreground truncate mt-0.5" title={email}>{email}</p>}
          </div>
        </div>

        {/* Language toggle */}
        <LanguageSwitcher className="w-full justify-center" />

        {/* Theme toggle */}
        <ThemeToggle />

        {/* Keyboard shortcuts hint */}
        <KeyboardShortcutsButton
          onClick={() => {
            document.dispatchEvent(
              new KeyboardEvent('keydown', { key: '?', bubbles: true })
            )
          }}
        />

        {/* Logout */}
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start text-muted-foreground hover:bg-destructive hover:text-destructive-foreground"
          onClick={handleSignOut}
          aria-label={t('nav.signOut')}
        >
          <LogOut className="h-4 w-4 mr-2" aria-hidden="true" />
          <span suppressHydrationWarning>{t('nav.signOut')}</span>
        </Button>
      </SidebarFooter>
    </Sidebar>
  )
}
