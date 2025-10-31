import Link from 'next/link'
import { AuthButton } from './auth-button'

export default function Header() {
  return (
    <header className="flex items-center justify-between px-6 sm:px-10 py-4 border-b border-border/40 sticky top-0 bg-background/80 backdrop-blur-md z-50">
      <Link href="/" className="text-xl font-semibold tracking-tight">
        Solvio
      </Link>

      <div className="flex items-center gap-4">
        <AuthButton />
      </div>
    </header>
  )
}
