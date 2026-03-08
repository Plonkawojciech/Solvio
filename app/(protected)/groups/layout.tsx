import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Groups — Solvio',
  description: 'Split expenses with friends, family or roommates and track who owes what.',
}

export default function GroupsLayout({ children }: { children: React.ReactNode }) {
  return children
}
