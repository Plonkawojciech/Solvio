'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Languages } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

type Language = 'pl' | 'en'

export function LanguageSwitcher() {
  const [language, setLanguage] = useState<Language>('en')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    // Pobierz język z bazy danych lub localStorage
    const fetchLanguage = async () => {
      // Najpierw sprawdź localStorage
      const storedLang = localStorage.getItem('language') as Language
      if (storedLang && (storedLang === 'pl' || storedLang === 'en')) {
        setLanguage(storedLang)
        return
      }
      
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      
      if (user) {
        const { data: settings } = await supabase
          .from('user_settings')
          .select('language_id')
          .eq('user_id', user.id)
          .maybeSingle()
        
        if (settings?.language_id) {
          const lang = settings.language_id.toLowerCase() as Language
          if (lang === 'pl' || lang === 'en') {
            setLanguage(lang)
            localStorage.setItem('language', lang)
            return
          }
        }
      }
      
      // Domyślnie angielski
      setLanguage('en')
      localStorage.setItem('language', 'en')
    }
    
    fetchLanguage()
  }, [])

  const changeLanguage = async (newLang: Language) => {
    setLoading(true)
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      
      if (!user) {
        // Dla niezalogowanych, zapisz tylko w localStorage
        localStorage.setItem('language', newLang)
        setLanguage(newLang)
        window.location.reload()
        return
      }
      
      // Zaktualizuj w bazie danych
      const { error } = await supabase
        .from('user_settings')
        .upsert({
          user_id: user.id,
          language_id: newLang.toUpperCase(),
        }, {
          onConflict: 'user_id',
        })
      
      if (error) throw error
      
      localStorage.setItem('language', newLang)
      setLanguage(newLang)
      
      toast.success('Language changed', {
        description: `Language set to ${newLang === 'pl' ? 'Polish' : 'English'}`,
      })
      
      // Odśwież stronę po 500ms
      setTimeout(() => {
        window.location.reload()
      }, 500)
      
    } catch (error) {
      console.error('Failed to change language:', error)
      toast.error('Failed to change language')
    } finally {
      setLoading(false)
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9"
          disabled={loading}
          title={language === 'pl' ? 'Język: Polski' : 'Language: English'}
        >
          <Languages className="h-4 w-4" />
          <span className="sr-only">Change language</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          onClick={() => changeLanguage('pl')}
          className={language === 'pl' ? 'bg-accent' : ''}
        >
          🇵🇱 Polski
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => changeLanguage('en')}
          className={language === 'en' ? 'bg-accent' : ''}
        >
          🇬🇧 English
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
