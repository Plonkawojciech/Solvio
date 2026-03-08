"use client"

import { useState, useRef, useCallback } from "react"
import { useRouter } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import { useSignIn, useSignUp } from "@clerk/nextjs/legacy"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Loader2,
  Wallet,
  Zap,
  Mail,
  ArrowLeft,
  RotateCcw,
} from "lucide-react"
import { useTranslation } from "@/lib/i18n"

type Step = "email" | "signin-otp" | "signup-otp"

export function LoginForm() {
  const [step, setStep] = useState<Step>("email")
  const [email, setEmail] = useState("")
  const [code, setCode] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [cooldown, setCooldown] = useState(0)

  const router = useRouter()
  const { lang } = useTranslation()
  const pl = lang === "pl"

  const { isLoaded: signInLoaded, signIn, setActive } = useSignIn()
  const { isLoaded: signUpLoaded, signUp, setActive: setActiveSignUp } = useSignUp()

  const isLoaded = signInLoaded && signUpLoaded

  // Cooldown timer
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const startCooldown = useCallback(() => {
    setCooldown(60)
    if (cooldownRef.current) clearInterval(cooldownRef.current)
    cooldownRef.current = setInterval(() => {
      setCooldown((c) => {
        if (c <= 1) {
          clearInterval(cooldownRef.current!)
          return 0
        }
        return c - 1
      })
    }, 1000)
  }, [])

  async function sendCode(resend = false) {
    if (!signIn || !signUp) {
      setError(pl ? "Trwa ładowanie, spróbuj ponownie" : "Auth loading, please try again")
      return
    }
    setLoading(true)
    setError(null)
    try {
      // Try sign-in first
      const result = await signIn.create({ identifier: email.trim() })
      const emailFactor = result.supportedFirstFactors?.find(
        (f: any) => f.strategy === "email_code"
      )
      if (emailFactor) {
        await signIn.prepareFirstFactor({
          strategy: "email_code",
          emailAddressId: (emailFactor as any).emailAddressId,
        })
        if (!resend) setStep("signin-otp")
        startCooldown()
      } else {
        setError(
          pl
            ? "Konto nie obsługuje kodu e-mail. Skontaktuj się z pomocą techniczną."
            : "Account doesn't support email code. Contact support."
        )
      }
    } catch (err: any) {
      const code = err?.errors?.[0]?.code
      if (code === "form_identifier_not_found") {
        // New user — sign up
        try {
          await signUp!.create({ emailAddress: email.trim() })
          await signUp!.prepareEmailAddressVerification({ strategy: "email_code" })
          if (!resend) setStep("signup-otp")
          startCooldown()
        } catch (signUpErr: any) {
          setError(
            signUpErr?.errors?.[0]?.message ??
              signUpErr?.message ??
              (pl ? "Wystąpił błąd" : "An error occurred")
          )
        }
      } else {
        setError(
          err?.errors?.[0]?.message ??
            err?.message ??
            (pl ? "Wystąpił błąd" : "An error occurred")
        )
      }
    } finally {
      setLoading(false)
    }
  }

  async function handleSendCode(e: React.FormEvent) {
    e.preventDefault()
    await sendCode(false)
  }

  async function handleResend() {
    await sendCode(true)
  }

  async function verifySignIn() {
    if (!signIn) return
    setLoading(true)
    setError(null)
    try {
      const result = await signIn.attemptFirstFactor({
        strategy: "email_code",
        code: code.trim(),
      })
      if (result.status === "complete") {
        await setActive({ session: result.createdSessionId })
        router.push("/dashboard")
        router.refresh()
      } else {
        setError(
          pl
            ? `Logowanie nie powiodło się (status: ${(result as any).status})`
            : `Sign in failed (status: ${(result as any).status})`
        )
      }
    } catch (err: any) {
      setError(
        err?.errors?.[0]?.message ??
          err?.message ??
          (pl ? "Wystąpił błąd" : "An error occurred")
      )
    } finally {
      setLoading(false)
    }
  }

  async function verifySignUp() {
    if (!signUp) return
    setLoading(true)
    setError(null)
    try {
      const result = await signUp.attemptEmailAddressVerification({ code: code.trim() })
      if (result.status === "complete") {
        await setActiveSignUp({ session: result.createdSessionId })
        router.push("/dashboard")
        router.refresh()
      } else {
        setError(
          pl
            ? `Weryfikacja nie powiodła się (status: ${(result as any).status})`
            : `Verification failed (status: ${(result as any).status})`
        )
      }
    } catch (err: any) {
      setError(
        err?.errors?.[0]?.message ??
          err?.message ??
          (pl ? "Wystąpił błąd" : "An error occurred")
      )
    } finally {
      setLoading(false)
    }
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault()
    if (step === "signin-otp") await verifySignIn()
    else await verifySignUp()
  }

  function goBack() {
    setStep("email")
    setCode("")
    setError(null)
    setCooldown(0)
    if (cooldownRef.current) clearInterval(cooldownRef.current)
  }

  return (
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

      <AnimatePresence mode="wait">
        {/* ── STEP 1: Email input ── */}
        {step === "email" && (
          <motion.div
            key="email-step"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="mb-8">
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight mb-2">
                {pl ? "Zaloguj się" : "Welcome back"}
              </h1>
              <p className="text-sm text-muted-foreground">
                {pl ? "Wpisz e-mail żeby zacząć" : "Enter your email to get started"}
              </p>
            </div>

            <form onSubmit={handleSendCode} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email">{pl ? "Adres e-mail" : "Email address"}</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-11"
                  autoFocus
                />
              </div>

              {error && (
                <motion.p
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2"
                >
                  {error}
                </motion.p>
              )}

              <Button
                type="submit"
                className="w-full h-11 font-semibold"
                disabled={loading || !isLoaded}
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    {pl ? "Wysyłanie…" : "Sending…"}
                  </>
                ) : !isLoaded ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    {pl ? "Ładowanie…" : "Loading…"}
                  </>
                ) : (
                  <>
                    <Mail className="h-4 w-4 mr-2" />
                    {pl ? "Wyślij kod" : "Send code"}
                  </>
                )}
              </Button>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-background px-2 text-muted-foreground">
                    {pl ? "lub" : "or"}
                  </span>
                </div>
              </div>

              <a href="/api/auth/demo" className="w-full">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full h-11 font-medium border-dashed"
                  asChild
                >
                  <span>
                    <Zap className="h-4 w-4 mr-2 text-amber-500" />
                    {pl ? "Wejdź bez rejestracji (Demo)" : "Try without signing up (Demo)"}
                  </span>
                </Button>
              </a>
            </form>
          </motion.div>
        )}

        {/* ── STEP 2: OTP verification ── */}
        {(step === "signin-otp" || step === "signup-otp") && (
          <motion.div
            key="otp-step"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="mb-8">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 mb-4">
                <Mail className="h-6 w-6 text-primary" />
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight mb-2">
                {pl ? "Sprawdź e-mail" : "Check your email"}
              </h1>
              <p className="text-sm text-muted-foreground">
                {pl
                  ? `Wysłaliśmy 6-cyfrowy kod na adres `
                  : `We sent a 6-digit code to `}
                <span className="font-medium text-foreground">{email}</span>
              </p>
            </div>

            <form onSubmit={handleVerify} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="otp-code">
                  {pl ? "Kod weryfikacyjny" : "Verification code"}
                </Label>
                <Input
                  id="otp-code"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  placeholder="000000"
                  maxLength={6}
                  required
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  className="h-14 text-center text-2xl tracking-[0.5em] font-mono"
                  autoFocus
                  autoComplete="one-time-code"
                />
              </div>

              {error && (
                <motion.p
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2"
                >
                  {error}
                </motion.p>
              )}

              <Button
                type="submit"
                className="w-full h-11 font-semibold"
                disabled={loading || code.length < 6}
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    {pl ? "Weryfikacja…" : "Verifying…"}
                  </>
                ) : (
                  pl ? "Weryfikuj" : "Verify"
                )}
              </Button>

              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={goBack}
                  className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  {pl ? "Wróć" : "Back"}
                </button>

                <button
                  type="button"
                  onClick={handleResend}
                  disabled={cooldown > 0 || loading}
                  className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  {cooldown > 0
                    ? pl
                      ? `Wyślij ponownie (${cooldown}s)`
                      : `Resend code (${cooldown}s)`
                    : pl
                    ? "Wyślij ponownie"
                    : "Resend code"}
                </button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
