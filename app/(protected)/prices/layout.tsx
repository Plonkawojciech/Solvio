import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Price Alerts — Solvio',
  description: 'AI-powered price comparison across Lidl, Biedronka, Żabka, Aldi and more based on your purchase history.',
}

export default function PricesLayout({ children }: { children: React.ReactNode }) {
  return children
}
