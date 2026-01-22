import Link from 'next/link'
import { Button } from './ui/button'
import { LogoutButton } from './logout-button'

interface AuthButtonProps {
  user: { email?: string } | null
}

export async function AuthButton({ user }: AuthButtonProps) {
  return user ? (
    <div className="flex items-center gap-2 sm:gap-4">
      <span className="hidden md:inline text-sm sm:text-base">Hey, {user.email}!</span>
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
  )
}

