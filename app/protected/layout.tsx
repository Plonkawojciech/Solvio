// app/(protected)/layout.tsx
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/protected/main/sidebar"

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <AppSidebar />
      <main className="pl-[var(--sidebar-width)] p-4">
        <SidebarTrigger />
        {children}
      </main>
    </SidebarProvider>


  )
}
