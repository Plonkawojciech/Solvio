'use client'

import { useEffect, useState } from 'react'
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
} from "lucide-react"
import Footer from "@/components/footer"
import { useTranslation } from '@/lib/i18n'

const items = [
  { key: 'dashboard', href: "/dashboard", icon: Home },
  { key: 'expenses', href: "/expenses", icon: DollarSign },
  { key: 'reports', href: "/reports", icon: FileText },
  { key: 'settings', href: "/settings", icon: Settings },
]

export function AppSidebar() {
  const { t, lang, mounted } = useTranslation()
  
  return (
    <Sidebar>
      <SidebarHeader className="border-b p-4">
        <a href="/dashboard" className="flex items-center gap-2 font-semibold text-lg">
          <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            💰
          </div>
          <span>Solvio</span>
        </a>
      </SidebarHeader>
      
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel suppressHydrationWarning>
            {mounted ? (lang === 'pl' ? 'Nawigacja' : 'Navigation') : 'Navigation'}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton asChild>
                    <a href={item.href}>
                      <item.icon className="mr-2 h-4 w-4" />
                      <span suppressHydrationWarning>{t(`nav.${item.key}`)}</span>
                    </a>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-0">
        <Footer />
      </SidebarFooter>
    </Sidebar>
  )
}
