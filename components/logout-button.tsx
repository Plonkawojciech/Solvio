'use client'

import { useClerk } from '@clerk/nextjs'
import { Button } from '@/components/ui/button'
import { LogOut } from 'lucide-react'

export function LogoutButton() {
  const { signOut } = useClerk()
  return (
    <Button variant="ghost" size="sm" onClick={() => signOut({ redirectUrl: '/login' })}>
      <LogOut className="h-4 w-4 mr-2" />
      Logout
    </Button>
  )
}
