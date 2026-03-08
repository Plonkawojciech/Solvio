import { Suspense } from 'react'
import { LoginForm } from "@/components/login-form"
import { AuthLayout } from "@/components/auth-layout"

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ message?: string }>
}) {
  const { message } = await searchParams
  return (
    <AuthLayout>
      {message && (
        <div className="mb-5 rounded-lg bg-emerald-500/10 border border-emerald-500/25 p-3 text-sm text-emerald-700 dark:text-emerald-300">
          {message}
        </div>
      )}
      <Suspense>
        <LoginForm />
      </Suspense>
    </AuthLayout>
  )
}
