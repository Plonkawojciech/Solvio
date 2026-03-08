"use client"

import { useEffect } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { motion } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Wallet, Mail } from "lucide-react"
import { useTranslation } from "@/lib/i18n"

// Sign-up and sign-in use the same email OTP flow on the login page.
// This component redirects immediately so existing /sign-up links still work.
export function SignUpForm() {
  const router = useRouter()
  const { lang } = useTranslation()
  const pl = lang === "pl"

  useEffect(() => {
    // Small delay so the animation plays before redirect
    const t = setTimeout(() => router.replace("/login"), 1800)
    return () => clearTimeout(t)
  }, [router])

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16 }}
      transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
      className="w-full text-center"
    >
      {/* Logo */}
      <div className="flex items-center justify-center gap-2.5 mb-10">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-lg shadow-primary/30">
          <Wallet className="h-4.5 w-4.5" />
        </div>
        <span className="text-xl font-bold">Solvio</span>
      </div>

      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 mx-auto mb-6">
        <Mail className="h-7 w-7 text-primary" />
      </div>

      <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight mb-3">
        {pl ? "Utwórz konto" : "Create your account"}
      </h1>

      <p className="text-sm text-muted-foreground mb-2">
        {pl
          ? "Rejestracja odbywa się przez e-mail — bez hasła."
          : "Sign-up is handled via email — no password needed."}
      </p>

      <p className="text-sm text-muted-foreground mb-8">
        {pl ? "Przekierowujemy Cię do strony logowania…" : "Redirecting you to the login page…"}
      </p>

      <Button asChild className="w-full h-11 font-semibold">
        <Link href="/login">
          {pl ? "Przejdź do logowania" : "Go to login"}
        </Link>
      </Button>

      <p className="text-xs text-muted-foreground mt-6">
        {pl
          ? "Jeśli masz już konto, po prostu wpisz swój e-mail — system rozpozna Cię automatycznie."
          : "If you already have an account, just enter your email — the system will recognise you automatically."}
      </p>
    </motion.div>
  )
}
