'use client'

import { useTheme } from 'next-themes'
import { Moon, Sun } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useTranslation } from '@/lib/i18n'
import { useEffect, useState } from 'react'

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const { t } = useTranslation()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    // Render a placeholder to avoid hydration mismatch
    return (
      <Button
        variant="ghost"
        size="sm"
        className="w-full justify-start text-muted-foreground"
        disabled
      >
        <Sun className="h-4 w-4 mr-2" />
        <span>...</span>
      </Button>
    )
  }

  const isDark = theme === 'dark'

  return (
    <Button
      variant="ghost"
      size="sm"
      className="w-full justify-start text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
    >
      {isDark ? (
        <Sun className="h-4 w-4 mr-2" />
      ) : (
        <Moon className="h-4 w-4 mr-2" />
      )}
      <span suppressHydrationWarning>
        {isDark ? t('nav.lightMode') : t('nav.darkMode')}
      </span>
    </Button>
  )
}
