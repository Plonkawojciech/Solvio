import type { Metadata, Viewport } from "next"
import { Geist } from "next/font/google"
import { ThemeProvider } from "next-themes"
import "./globals.css"

const defaultUrl = process.env.NEXT_PUBLIC_APP_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000")

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
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Solvio",
  },
  formatDetection: {
    telephone: false,
  },
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#030712" },
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
}

const geistSans = Geist({ variable: "--font-geist-sans", display: "swap", subsets: ["latin"] })

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geistSans.className} antialiased`}>
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
          {children}
        </ThemeProvider>
      </body>
    </html>
  )
}
