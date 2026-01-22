import Link from 'next/link';
import { AuthButton } from './auth-button';
import { createClient } from '@/lib/supabase/server';
import { LogoutButton } from './logout-button';
import { Button } from './ui/button';
import { ThemeSwitcher } from './theme-switcher';

export default async function Header() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <header className="flex items-center justify-between px-6 sm:px-10 py-4 border-b border-border/40 sticky top-0 bg-background/80 backdrop-blur-md z-50">
      <Link
        href={user ? '/' : '/'}
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
            <Button asChild size="sm" variant={'outline'}>
              <Link href="/login">Sign in</Link>
            </Button>
            <Button asChild size="sm" variant={'default'}>
              <Link href="/sign-up">Sign up</Link>
            </Button>
          </div>
        )}
        <ThemeSwitcher />
      </div>
    </header>
  );
}
