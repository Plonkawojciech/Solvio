import { AppSidebar } from '@/components/protected/main/sidebar'
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar'
import Link from 'next/link'

export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <>
    <SidebarProvider>
      <AppSidebar />
      <main>
        <SidebarTrigger />
        {children}
      </main>
    </SidebarProvider>
  </>
}
