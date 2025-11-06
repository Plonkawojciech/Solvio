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
  const user = await supabase.auth.getClaims()

  if (!user) {
    redirect('/')
  }

  return (
    <SidebarProvider>
      <div className="flex flex-col min-h-screen">
        <Header />
        <div className="flex flex-1 overflow-hidden">
          <AppSidebar />
          <main className="flex-1 overflow-auto p-6 md:p-10">
            <div className="md:hidden mb-4">
              <SidebarTrigger />
            </div>
            {children}
            <Toaster position="top-right" richColors />
          </main>
        </div>
      </div>
    </SidebarProvider>
  )
}
