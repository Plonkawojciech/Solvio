'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSignUp } from '@clerk/nextjs/legacy'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, Mail, Wallet } from 'lucide-react'
import { AuthLayout } from '@/components/auth-layout'
import { useTranslation } from '@/lib/i18n'

export default function Page() {
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { signUp, setActive } = useSignUp()
  const router = useRouter()
  const { lang } = useTranslation()
  const pl = lang === 'pl'

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault()
    if (!signUp) return
    setLoading(true)
    setError(null)
    try {
      const result = await signUp.attemptEmailAddressVerification({ code })
      if (result.status === 'complete') {
        await setActive({ session: result.createdSessionId })
        router.push('/dashboard')
        router.refresh()
      } else {
        setError(pl ? 'Weryfikacja nie powiodła się. Spróbuj ponownie.' : 'Verification incomplete. Please try again.')
      }
    } catch (err: any) {
      setError(err?.errors?.[0]?.message ?? err?.message ?? (pl ? 'Nieprawidłowy kod' : 'Invalid code'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout>
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        className="w-full"
      >
        {/* Logo */}
        <div className="flex items-center gap-2.5 mb-8">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-lg shadow-primary/30">
            <Wallet className="h-4.5 w-4.5" />
          </div>
          <span className="text-xl font-bold">Solvio</span>
        </div>

        <div className="mb-8 space-y-1">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <Mail className="h-6 w-6 text-primary" />
            </div>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
            {pl ? 'Sprawdź swój e-mail' : 'Check your email'}
          </h1>
          <p className="text-sm text-muted-foreground">
            {pl
              ? 'Wysłaliśmy 6-cyfrowy kod weryfikacyjny na Twój adres e-mail.'
              : 'We sent a 6-digit verification code to your email address.'}
          </p>
        </div>

        <form onSubmit={handleVerify} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="code">{pl ? 'Kod weryfikacyjny' : 'Verification code'}</Label>
            <Input
              id="code"
              type="text"
              inputMode="numeric"
              placeholder="123456"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              className="h-11 text-center text-lg tracking-widest font-mono"
              autoFocus
            />
          </div>

          {error && (
            <motion.p
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2 text-center"
            >
              {error}
            </motion.p>
          )}

          <Button type="submit" className="w-full h-11 font-semibold" disabled={loading || code.length < 6}>
            {loading ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" />{pl ? 'Weryfikowanie…' : 'Verifying…'}</>
            ) : (
              pl ? 'Zweryfikuj e-mail' : 'Verify email'
            )}
          </Button>

          <p className="text-xs text-center text-muted-foreground">
            {pl ? 'Nie otrzymałeś kodu? ' : "Didn't receive the code? "}
            <button
              type="button"
              className="text-primary hover:underline underline-offset-4"
              onClick={async () => {
                if (!signUp) return
                try {
                  await signUp.prepareEmailAddressVerification({ strategy: 'email_code' })
                  setError(null)
                } catch {}
              }}
            >
              {pl ? 'Wyślij ponownie' : 'Resend'}
            </button>
          </p>
        </form>
      </motion.div>
    </AuthLayout>
  )
}
