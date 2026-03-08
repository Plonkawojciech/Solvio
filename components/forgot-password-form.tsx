"use client"

import Link from "next/link"
import { motion } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Wallet, Mail, ArrowLeft } from "lucide-react"
import { useTranslation } from "@/lib/i18n"

// Forgot password is no longer relevant — there are no passwords.
// Users authenticate with email OTP from the login page.
export function ForgotPasswordForm() {
  const { lang } = useTranslation()
  const pl = lang === "pl"

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
      className="w-full"
    >
      {/* Logo */}
      <div className="flex items-center gap-2.5 mb-10">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-lg shadow-primary/30">
          <Wallet className="h-4.5 w-4.5" />
        </div>
        <span className="text-xl font-bold">Solvio</span>
      </div>

      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 mb-6">
        <Mail className="h-7 w-7 text-primary" />
      </div>

      <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight mb-3">
        {pl ? "Brak hasła" : "No password needed"}
      </h1>

      <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
        {pl
          ? "Solvio używa jednorazowych kodów e-mail zamiast haseł. Aby uzyskać dostęp do swojego konta, wróć do strony logowania i wpisz swój adres e-mail — wyślemy Ci 6-cyfrowy kod."
          : "Solvio uses one-time email codes instead of passwords. To access your account, go back to the login page and enter your email address — we will send you a 6-digit code."}
      </p>

      <Button asChild className="w-full h-11 font-semibold mb-4">
        <Link href="/login">
          {pl ? "Wróć do logowania" : "Back to login"}
        </Link>
      </Button>

      <Link
        href="/login"
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors w-fit"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        {pl ? "Wróć" : "Back"}
      </Link>
    </motion.div>
  )
}
