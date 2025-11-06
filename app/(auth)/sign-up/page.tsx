import { SignUpForm } from '@/components/sign-up-form'

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>
}) {
  const email = (await searchParams).email ?? ''
  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        <SignUpForm initialEmail={email} />
      </div>
    </div>
  )
}
