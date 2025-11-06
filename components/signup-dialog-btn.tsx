import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { SignUpForm } from '@/components/sign-up-form'

export function SignupDialogBtn() {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button size="sm" variant="default">
          Sign up
        </Button>
      </AlertDialogTrigger>

      <AlertDialogContent
        className="sm:max-w-md rounded-2xl border border-white/10 dark:border-white/10
  shadow-xl backdrop-blur-xl
  bg-white/70 dark:bg-neutral-900/80
  text-foreground transition-all duration-300
  ring-1 ring-black/5 dark:ring-white/5"
      >
        <AlertDialogHeader>
          <AlertDialogTitle className="text-xl font-semibold tracking-tight">
            Create your Solvio account
          </AlertDialogTitle>
          <AlertDialogDescription className="text-sm text-muted-foreground">
            Enter your email and password to create an account.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="pt-4">
          <SignUpForm />
        </div>

        <AlertDialogFooter className="pt-4">
          <AlertDialogCancel>Close</AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
