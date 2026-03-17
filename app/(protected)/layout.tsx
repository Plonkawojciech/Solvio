import { AppSidebar } from '@/components/protected/main/sidebar'
import { SidebarProvider } from '@/components/ui/sidebar'
import { getSession } from '@/lib/session'
import { redirect } from 'next/navigation'
import { Toaster } from 'sonner'
import { ensureUserSeeded } from '@/lib/db/seed-user'
import { AppMobileHeader } from '@/components/protected/main/app-mobile-header'
import { KeyboardShortcuts } from '@/components/protected/main/keyboard-shortcuts'
import { MobileBottomNav } from '@/components/protected/main/mobile-bottom-nav'
import { NavProgress } from '@/components/protected/main/nav-progress'
import { getProductType, getOnboardingStatus } from '@/lib/product-type'
import { ProductTypeProvider } from '@/hooks/use-product-type'

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()
  const userId = session?.userId
  if (!userId) redirect('/login')

  // Seed default categories if first login
  await ensureUserSeeded(userId)

  // Get product type and check onboarding
  const [productType, onboardingComplete] = await Promise.all([
    getProductType(userId),
    getOnboardingStatus(userId),
  ])

  // Redirect to onboarding if not completed
  if (!onboardingComplete) {
    redirect('/onboarding')
  }

  return (
    <ProductTypeProvider productType={productType}>
      <SidebarProvider>
        <NavProgress />
        <div className="flex flex-col min-h-screen w-full overflow-x-hidden">
          {/* Mobile-only sticky top header with logo + sidebar trigger */}
          <AppMobileHeader />
          <div className="flex flex-1 overflow-hidden">
            <AppSidebar />
            <main className="flex-1 overflow-y-auto overflow-x-hidden p-2 sm:p-4 md:p-6 lg:p-10 w-full max-w-full pb-24 md:pb-10 lg:pb-10">
              {children}
              <Toaster position="top-right" richColors />
            </main>
          </div>
        </div>
        {/* Mobile bottom navigation */}
        <MobileBottomNav />
        {/* Global keyboard shortcuts — renders modals, listens for hotkeys */}
        <KeyboardShortcuts />
      </SidebarProvider>
    </ProductTypeProvider>
  )
}
