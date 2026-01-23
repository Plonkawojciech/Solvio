import { AppSidebar } from '@/components/protected/main/sidebar'
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Toaster } from 'sonner'
import Header from '@/components/header'

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/')
  }

  return (
    <SidebarProvider>
      <div className="flex flex-col min-h-screen w-full overflow-x-hidden">
        <Header />
        <div className="flex flex-1 overflow-hidden">
          <AppSidebar />
          <main className="flex-1 overflow-y-auto overflow-x-hidden p-2 sm:p-4 md:p-6 lg:p-10 w-full max-w-full">
            <div className="md:hidden mb-2 sm:mb-4">
              <SidebarTrigger />
            </div>
            {children}
            <Toaster position="top-center sm:top-right" richColors />
          </main>
        </div>
      </div>
    </SidebarProvider>
  )
}
