'use client'
import { useState } from 'react'
import { Loader2, Wallet, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useTranslation } from '@/lib/i18n'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function LoginForm() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [demoLoading, setDemoLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { lang } = useTranslation()
  const pl = lang === 'pl'

  const isEmailValid = EMAIL_RE.test(email.trim())

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!isEmailValid) {
      setError(pl ? 'Wprowadź prawidłowy adres e-mail.' : 'Please enter a valid email address.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      })
      if (!res.ok) throw new Error('Failed')
      localStorage.setItem('solvio_email', email.trim())
      window.location.href = '/dashboard'
    } catch {
      setError(pl ? 'Nie udało się zalogować. Spróbuj ponownie.' : 'Sign in failed. Please try again.')
      setLoading(false)
    }
  }

  return (
    <div className="w-full">
      <div className="mb-8 flex items-center gap-2 text-base font-black tracking-tight">
        <div className="flex h-9 w-9 items-center justify-center rounded-md border-2 border-foreground bg-foreground text-background shadow-[2px_2px_0_hsl(var(--foreground))]">
          <Wallet className="size-4" />
        </div>
        Solvio
      </div>

      <div className="mb-2 font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
        {'// '}{pl ? 'LOGOWANIE' : 'SIGN IN'}
      </div>

      <div className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight mb-2">
          {pl ? 'Witaj ponownie' : 'Welcome back'}
        </h1>
        <p className="text-sm text-muted-foreground">
          {pl ? 'Wpisz e-mail aby się zalogować.' : 'Enter your email to sign in.'}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="email">{pl ? 'Adres e-mail' : 'Email address'}</Label>
          <Input
            id="email"
            type="email"
            inputMode="email"
            placeholder="you@example.com"
            autoComplete="email"
            autoFocus
            required
            aria-required="true"
            aria-invalid={error ? 'true' : undefined}
            aria-describedby={error ? 'email-error' : undefined}
            value={email}
            onChange={(e) => {
              setEmail(e.target.value)
              if (error) setError(null)
            }}
            disabled={loading}
          />
        </div>

        {error && (
          <div
            id="email-error"
            role="alert"
            aria-live="assertive"
            className="rounded-md border-2 border-destructive bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive"
          >
            {error}
          </div>
        )}

        <Button
          type="submit"
          className="w-full"
          disabled={loading || !isEmailValid}
          aria-label={pl ? 'Zaloguj się e-mailem' : 'Sign in with email'}
        >
          {loading ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              {pl ? 'Logowanie…' : 'Signing in…'}
            </>
          ) : (
            <>{pl ? 'Zaloguj się' : 'Sign in'}</>
          )}
        </Button>

        <div className="relative my-2">
          <div className="absolute inset-0 flex items-center" aria-hidden="true">
            <span className="w-full border-t-2 border-dashed border-foreground/30" />
          </div>
          <div className="relative flex justify-center">
            <span className="bg-background px-3 font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              {pl ? 'LUB' : 'OR'}
            </span>
          </div>
        </div>

        <Button
          type="button"
          variant="outline"
          className="w-full border-dashed"
          disabled={demoLoading}
          aria-label={pl ? 'Wejdź na konto demonstracyjne' : 'Try the demo account'}
          onClick={async () => {
            setDemoLoading(true)
            setError(null)
            try {
              const res = await fetch('/api/auth/demo', { method: 'POST' })
              if (!res.ok) throw new Error('Failed')
              const data = await res.json()
              window.location.href = data.redirect || '/dashboard'
            } catch {
              setError(pl ? 'Nie udało się zalogować na demo.' : 'Demo login failed.')
              setDemoLoading(false)
            }
          }}
        >
          {demoLoading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Zap className="size-4" />
          )}
          {pl ? 'Konto demo' : 'Demo account'}
        </Button>
      </form>
    </div>
  )
}
