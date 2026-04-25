import type { Metadata, Viewport } from "next"
import { Inter, JetBrains_Mono } from "next/font/google"
import { ThemeProvider } from "next-themes"
import "./globals.css"

const defaultUrl = process.env.NEXT_PUBLIC_APP_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000")

// Web is desktop-only — the mobile experience lives in `native-ios/`. We
// intentionally do NOT register a service worker, expose a manifest, or
// advertise "Add to Home Screen" / `appleWebApp` capability. iOS users
// install the native app from the App Store; web is a back-office surface.
export const metadata: Metadata = {
  metadataBase: new URL(defaultUrl),
  title: {
    default: "Solvio — Smart finance for humans",
    template: "%s | Solvio",
  },
  description: "AI-powered expense tracking with receipt scanning, group splitting, and financial reporting.",
  openGraph: {
    title: "Solvio — Smart finance for humans",
    description: "AI-powered expense tracking with receipt scanning, group splitting, and financial reporting.",
    url: defaultUrl,
    siteName: "Solvio",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Solvio — Smart finance for humans",
    description: "AI-powered expense tracking with receipt scanning.",
  },
  icons: {
    icon: "/favicon.ico",
  },
  formatDetection: {
    telephone: false,
  },
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f0eb" },
    { media: "(prefers-color-scheme: dark)", color: "#141414" },
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
}

const inter = Inter({
  variable: "--font-inter",
  display: "swap",
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700", "800", "900"],
})

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  display: "swap",
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700"],
})

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pl" suppressHydrationWarning>
      <body className={`${inter.variable} ${jetbrainsMono.variable} antialiased`}>
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
          {children}
        </ThemeProvider>
      </body>
    </html>
  )
}
