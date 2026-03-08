import type { Metadata } from "next"
import { getSession } from "@/lib/session"
import { redirect } from "next/navigation"

export const metadata: Metadata = {
  title: "Solvio — Smart finance for humans",
}

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()
  if (session?.userId) redirect("/dashboard")

  return (
    <div className="min-h-svh bg-background text-foreground">
      {children}
    </div>
  )
}
