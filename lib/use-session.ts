'use client'

import { useState, useEffect } from 'react'

interface SessionState {
  email: string | null
  isLoaded: boolean
}

export function useSession(): SessionState {
  const [state, setState] = useState<SessionState>({ email: null, isLoaded: false })

  useEffect(() => {
    fetch('/api/auth/session/me')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        setState({ email: data?.email ?? null, isLoaded: true })
      })
      .catch(() => setState({ email: null, isLoaded: true }))
  }, [])

  return state
}
