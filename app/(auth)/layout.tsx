import type { Metadata } from "next"
import { auth } from "@clerk/nextjs/server"
import { redirect } from "next/navigation"

export const metadata: Metadata = {
  title: "Solvio — Smart finance for humans",
}

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const { userId } = await auth()
  if (userId) redirect("/dashboard")

  return (
    <div className="min-h-svh bg-background text-foreground">
      {children}
    </div>
  )
}
