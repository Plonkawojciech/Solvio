'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useSession } from '@/lib/use-session'
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
  Home,
  Settings,
  Wallet,
  LogOut,
  type LucideIcon,
} from "lucide-react"
import { useTranslation } from '@/lib/i18n'
import { Button } from '@/components/ui/button'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import { KeyboardShortcutsButton } from '@/components/protected/main/keyboard-shortcuts'
import { LanguageSwitcher } from '@/components/language-switcher'

interface NavItem {
  key: string
  href: string
  icon: LucideIcon
}

/** Solvio ma dziś dwa ekrany produktowe. Ustawienia zostają jako narzędzie —
 *  to tam wydaje się klucze API i wpina zakładkę Finanse w crm.programo.pl. */
const NAV_ITEMS: NavItem[] = [
  { key: 'dashboard', href: '/dashboard', icon: Home },
  { key: 'expenses', href: '/expenses', icon: DollarSign },
  { key: 'settings', href: '/settings', icon: Settings },
]

export function AppSidebar() {
  const { t } = useTranslation()
  const pathname = usePathname()
  const router = useRouter()
  const { email } = useSession()
  const items = NAV_ITEMS
  const displayName = email ? email.split('@')[0] : 'User'
  const initials = displayName.slice(0, 2).toUpperCase()

  async function handleSignOut() {
    await fetch('/api/auth/session', { method: 'DELETE' })
    router.push('/login')
    router.refresh()
  }

  return (
    <Sidebar>
      <SidebarHeader className="border-b border-sidebar-border p-4">
        <Link href="/dashboard" className="flex items-center gap-3 group">
          <div className="flex h-9 w-9 items-center justify-center rounded-md border border-border bg-primary text-primary-foreground shadow-[var(--nb-shadow-sm)]  group-hover:shadow-[var(--nb-shadow)] transition-all">
            <Wallet className="h-4 w-4" aria-hidden="true" />
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-black leading-tight tracking-tight">Solvio</span>
            <span className="text-[10px] font-bold uppercase tracking-widest leading-none text-muted-foreground">
              Finanse
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

      <SidebarFooter className="p-3 border-t border-sidebar-border space-y-2.5">
        {/* Product switcher (Personal / Business) */}

        <div className="h-[2px] bg-sidebar-border" />

        {/* User info */}
        <div className="flex items-center gap-3 px-2 py-2 rounded-md border border-dashed border-sidebar-border/40">
          <div className="h-9 w-9 shrink-0 rounded-md border border-border bg-card flex items-center justify-center font-mono shadow-[var(--nb-shadow-sm)]">
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
