"use client"

import { useRouter } from "next/navigation"
import { useEffect } from "react"

// Clerk handles password reset via email codes, not URL tokens.
// Redirect to forgot-password flow.
export function UpdatePasswordForm() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/forgot-password')
  }, [router])

  return null
}
