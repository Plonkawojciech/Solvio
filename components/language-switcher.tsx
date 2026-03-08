'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Languages } from 'lucide-react'
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
    // Get language from localStorage only
    const storedLang = localStorage.getItem('language') as Language
    if (storedLang && (storedLang === 'pl' || storedLang === 'en')) {
      setLanguage(storedLang)
      return
    }
    setLanguage('en')
    localStorage.setItem('language', 'en')
  }, [])

  const changeLanguage = async (newLang: Language) => {
    setLoading(true)
    try {
      localStorage.setItem('language', newLang)
      setLanguage(newLang)

      // Also persist to settings API if user is logged in
      try {
        await fetch('/api/data/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'settings', data: { language: newLang } }),
        })
      } catch {
        // Ignore - user might not be logged in
      }

      toast.success('Language changed', {
        description: `Language set to ${newLang === 'pl' ? 'Polish' : 'English'}`,
      })

      // Refresh page after 500ms
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
