import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { LogoutButton } from './logout-button'
import { Button } from './ui/button'
import { ModeToggle } from './dark-mode-toggle'
import { LoginDialogBtn } from './login-dialog-btn'
import { SignupDialogBtn } from './signup-dialog-btn'

export default async function Header() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  return (
    <header className="flex items-center justify-between px-6 sm:px-10 py-4 border-b border-border/40 sticky top-0 bg-background/80 backdrop-blur-md z-50">
      <Link
        href={user ? '/dashboard' : '/'}
        className="text-xl font-semibold tracking-tight"
      >
        Solvio
      </Link>

      <div className="flex items-center gap-4">
        {user ? (
          <div className="flex items-center gap-4">
            Hey, {user.email}!
            <LogoutButton />
          </div>
        ) : (
          <div className="flex gap-2">
            <LoginDialogBtn />
            <SignupDialogBtn />
          </div>
        )}
        <ModeToggle />
      </div>
    </header>
  )
}
