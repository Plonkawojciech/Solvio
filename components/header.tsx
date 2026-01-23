'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link';
import { AuthButton } from './auth-button';
import { createClient } from '@/lib/supabase/client';
import { LogoutButton } from './logout-button';
import { Button } from './ui/button';
import { ThemeSwitcher } from './theme-switcher';
import { LanguageSwitcher } from './language-switcher';
import { useTranslation } from '@/lib/i18n';

export default function Header() {
  const supabase = createClient();
  const [user, setUser] = useState<any>(null)
  const { t, lang, mounted } = useTranslation()
  
  useEffect(() => {
    const fetchUser = async () => {
      const { data: { user: currentUser } } = await supabase.auth.getUser()
      setUser(currentUser)
    }
    
    fetchUser()
  }, [])

  return (
    <header className="flex items-center justify-between px-3 sm:px-6 md:px-10 py-3 sm:py-4 border-b border-border/40 sticky top-0 bg-background/80 backdrop-blur-md z-50">
      <Link
        href={user ? '/' : '/'}
        className="text-lg sm:text-xl font-semibold tracking-tight"
      >
        Solvio
      </Link>

      <div className="flex items-center gap-1 sm:gap-2 md:gap-4">
        {user ? (
          <div className="flex items-center gap-1 sm:gap-2 md:gap-4">
            <span className="hidden lg:inline text-xs sm:text-sm md:text-base truncate max-w-[150px] sm:max-w-none" suppressHydrationWarning>
              {lang === 'pl' ? 'Cześć' : 'Hey'}, {user.email}!
            </span>
            <LogoutButton />
          </div>
        ) : (
          <div className="flex gap-1 sm:gap-2">
            <Button asChild size="sm" variant={'outline'} className="text-xs sm:text-sm">
              <Link href="/login" suppressHydrationWarning>{t('auth.signIn')}</Link>
            </Button>
            <Button asChild size="sm" variant={'default'} className="text-xs sm:text-sm">
              <Link href="/sign-up" suppressHydrationWarning>{t('auth.signUp')}</Link>
            </Button>
          </div>
        )}
        <LanguageSwitcher />
        <ThemeSwitcher />
      </div>
    </header>
  );
}
