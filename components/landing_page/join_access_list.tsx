'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { ArrowRight, Loader2 } from 'lucide-react'
import { useTranslation } from '@/lib/i18n'

export default function JoinAccessList() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()
  const { lang } = useTranslation()

  const isPolish = lang === 'pl'

  function isValidEmail(v: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)
  }

  function handleSubmit() {
    const trimmed = email.trim()
    if (!trimmed) {
      setError(isPolish ? 'Wpisz adres e-mail' : 'Enter your email address')
      return
    }
    if (!isValidEmail(trimmed)) {
      setError(isPolish ? 'Nieprawidłowy adres e-mail' : 'Invalid email address')
      return
    }
    setError('')
    setLoading(true)
    router.push(`/sign-up?email=${encodeURIComponent(trimmed)}`)
  }

  return (
    <div className="w-full max-w-md">
      <div className="flex gap-2">
        <Input
          type="email"
          placeholder={isPolish ? 'Twój adres e-mail' : 'Your email address'}
          className="h-12 text-base"
          value={email}
          onChange={(e) => { setEmail(e.target.value); if (error) setError('') }}
          onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
          autoComplete="email"
        />
        <Button onClick={handleSubmit} size="lg" className="h-12 px-5 gap-1.5 flex-shrink-0" disabled={loading}>
          {loading
            ? <Loader2 className="h-4 w-4 animate-spin" />
            : <><span>{isPolish ? 'Zacznij' : 'Get started'}</span><ArrowRight className="h-4 w-4" /></>
          }
        </Button>
      </div>
      {error && <p className="mt-1.5 text-xs text-destructive">{error}</p>}
    </div>
  )
}
