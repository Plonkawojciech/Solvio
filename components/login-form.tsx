'use client'
import { useState } from 'react'
import { motion } from 'framer-motion'
import { Loader2, Wallet, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useTranslation } from '@/lib/i18n'

export function LoginForm() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { lang } = useTranslation()
  const pl = lang === 'pl'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      if (!res.ok) throw new Error('Failed')
      localStorage.setItem('solvio_email', email)
      window.location.href = '/dashboard'
    } catch {
      setError(pl ? 'Nie udało się zalogować. Spróbuj ponownie.' : 'Sign in failed. Please try again.')
      setLoading(false)
    }
  }

  return (
    <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="w-full">
      {/* logo */}
      <div className="flex items-center gap-2.5 mb-8">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-lg shadow-primary/30">
          <Wallet className="h-4.5 w-4.5" />
        </div>
        <span className="text-xl font-bold">Solvio</span>
      </div>
      <div className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight mb-2">
          {pl ? 'Zaloguj się' : 'Welcome back'}
        </h1>
        <p className="text-sm text-muted-foreground">
          {pl ? 'Wpisz e-mail żeby zacząć' : 'Enter your email to get started'}
        </p>
      </div>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="email">{pl ? 'Adres e-mail' : 'Email address'}</Label>
          <Input
            id="email"
            type="email"
            placeholder="you@example.com"
            autoComplete="email"
            required
            value={email}
            onChange={e => setEmail(e.target.value)}
            className="h-11"
            disabled={loading}
          />
        </div>
        {error && (
          <p className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
            {error}
          </p>
        )}
        <Button type="submit" className="w-full h-11 font-semibold" disabled={loading || !email.includes('@')}>
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              {pl ? 'Logowanie…' : 'Signing in…'}
            </>
          ) : pl ? 'Zaloguj się' : 'Sign in'}
        </Button>
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-background px-2 text-muted-foreground">{pl ? 'lub' : 'or'}</span>
          </div>
        </div>
        <a href="/api/auth/demo" className="w-full">
          <Button type="button" variant="outline" className="w-full h-11 font-medium border-dashed" asChild>
            <span>
              <Zap className="h-4 w-4 mr-2 text-amber-500" />
              {pl ? 'Wejdź bez rejestracji (Demo)' : 'Try without signing up (Demo)'}
            </span>
          </Button>
        </a>
      </form>
    </motion.div>
  )
}
