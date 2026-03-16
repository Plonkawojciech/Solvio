'use client'

import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

type Language = 'pl' | 'en'

interface LanguageSwitcherProps {
  className?: string
}

export function LanguageSwitcher({ className }: LanguageSwitcherProps) {
  const [language, setLanguage] = useState<Language>('en')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const storedLang = localStorage.getItem('language') as Language
    if (storedLang === 'pl' || storedLang === 'en') {
      setLanguage(storedLang)
    } else {
      setLanguage('en')
      localStorage.setItem('language', 'en')
    }
  }, [])

  const changeLanguage = async (newLang: Language) => {
    if (newLang === language || loading) return
    setLoading(true)
    try {
      localStorage.setItem('language', newLang)
      setLanguage(newLang)
      try {
        await fetch('/api/data/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'settings', data: { language: newLang } }),
        })
      } catch {}
      toast.success(newLang === 'pl' ? 'Język zmieniony na Polski' : 'Language set to English')
      setTimeout(() => window.location.reload(), 400)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={cn('flex items-center rounded-full border border-border/60 bg-muted/50 p-0.5 gap-0.5', className)}>
      <button
        onClick={() => changeLanguage('pl')}
        disabled={loading}
        className={cn(
          'px-2.5 py-1 rounded-full text-xs font-semibold transition-all duration-200 leading-none',
          language === 'pl'
            ? 'bg-background text-foreground shadow-sm'
            : 'text-muted-foreground hover:text-foreground'
        )}
      >
        PL
      </button>
      <button
        onClick={() => changeLanguage('en')}
        disabled={loading}
        className={cn(
          'px-2.5 py-1 rounded-full text-xs font-semibold transition-all duration-200 leading-none',
          language === 'en'
            ? 'bg-background text-foreground shadow-sm'
            : 'text-muted-foreground hover:text-foreground'
        )}
      >
        EN
      </button>
    </div>
  )
}
