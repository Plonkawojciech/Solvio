import { AppSidebar } from '@/components/protected/main/sidebar'
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar'
// Usunąłem nieużywany import 'Link'

export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <SidebarProvider>
      <div className="flex min-h-screen">
        <AppSidebar />
        <main className="flex-1 overflow-auto p-6 md:p-10">
          
       
          <div className="md:hidden mb-4">
            <SidebarTrigger />
          </div>
          {children}
        </main>
      </div>
    </SidebarProvider>
  )
}