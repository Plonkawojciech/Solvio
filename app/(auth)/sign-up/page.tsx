import { SignUpForm } from "@/components/sign-up-form"
import { AuthLayout } from "@/components/auth-layout"

export default async function Page() {
  return (
    <AuthLayout>
      <SignUpForm />
    </AuthLayout>
  )
}
