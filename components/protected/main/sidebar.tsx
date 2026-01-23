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
import { createClient } from '@/lib/supabase/client'
import { getLanguage, t } from '@/lib/i18n'

const items = [
  { key: 'dashboard', href: "/dashboard", icon: Home },
  { key: 'expenses', href: "/expenses", icon: DollarSign },
  { key: 'reports', href: "/reports", icon: FileText },
  { key: 'settings', href: "/settings", icon: Settings },
]

export function AppSidebar() {
  const [lang, setLang] = useState<'pl' | 'en'>('en')
  
  useEffect(() => {
    // Pobierz język z localStorage lub bazy
    const fetchLanguage = async () => {
      const stored = localStorage.getItem('language') as 'pl' | 'en'
      if (stored && (stored === 'pl' || stored === 'en')) {
        setLang(stored)
        return
      }
      
      // Jeśli nie ma w localStorage, sprawdź bazę
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: settings } = await supabase
          .from('user_settings')
          .select('language_id')
          .eq('user_id', user.id)
          .maybeSingle()
        
        if (settings?.language_id) {
          const dbLang = settings.language_id.toLowerCase() as 'pl' | 'en'
          if (dbLang === 'pl' || dbLang === 'en') {
            setLang(dbLang)
            localStorage.setItem('language', dbLang)
          }
        }
      }
    }
    
    fetchLanguage()
    
    // Nasłuchuj zmian języka
    const handleStorageChange = () => {
      const stored = localStorage.getItem('language') as 'pl' | 'en'
      if (stored && (stored === 'pl' || stored === 'en')) {
        setLang(stored)
      }
    }
    
    window.addEventListener('storage', handleStorageChange)
    return () => window.removeEventListener('storage', handleStorageChange)
  }, [])
  
  const currentLang = getLanguage()
  
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
          <SidebarGroupLabel>{currentLang === 'pl' ? 'Nawigacja' : 'Navigation'}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton asChild>
                    <a href={item.href}>
                      <item.icon className="mr-2 h-4 w-4" />
                      <span>{t(`nav.${item.key}`)}</span>
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
