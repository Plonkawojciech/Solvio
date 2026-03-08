import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'

const isProtectedRoute = createRouteMatcher([
  '/dashboard(.*)',
  '/expenses(.*)',
  '/analysis(.*)',
  '/audit(.*)',
  '/reports(.*)',
  '/settings(.*)',
  '/groups(.*)',
  '/prices(.*)',
])

export default clerkMiddleware(async (auth, req) => {
  if (isProtectedRoute(req)) {
    await auth.protect()
  }
})

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|api/clerk-proxy|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
