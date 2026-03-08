import { AppSidebar } from '@/components/protected/main/sidebar'
import { SidebarProvider } from '@/components/ui/sidebar'
import { getSession } from '@/lib/session'
import { redirect } from 'next/navigation'
import { Toaster } from 'sonner'
import { ensureUserSeeded } from '@/lib/db/seed-user'
import { AppMobileHeader } from '@/components/protected/main/app-mobile-header'
import { KeyboardShortcuts } from '@/components/protected/main/keyboard-shortcuts'

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()
  const userId = session?.userId
  if (!userId) redirect('/login')

  // Seed default categories if first login
  await ensureUserSeeded(userId)

  return (
    <SidebarProvider>
      <div className="flex flex-col min-h-screen w-full overflow-x-hidden">
        {/* Mobile-only sticky top header with logo + sidebar trigger */}
        <AppMobileHeader />
        <div className="flex flex-1 overflow-hidden">
          <AppSidebar />
          <main className="flex-1 overflow-y-auto overflow-x-hidden p-2 sm:p-4 md:p-6 lg:p-10 w-full max-w-full">
            {children}
            <Toaster position="top-right" richColors />
          </main>
        </div>
      </div>
      {/* Global keyboard shortcuts — renders modals, listens for hotkeys */}
      <KeyboardShortcuts />
    </SidebarProvider>
  )
}
