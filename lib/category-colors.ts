/**
 * Shared category color utility.
 *
 * A stable hash of the category ID (not the name) drives color assignment,
 * so the same category always receives the same color regardless of which
 * component renders it or what language the user has selected.
 */

export type CategoryColorSet = {
  /** Tailwind bg + text classes for a pill/badge */
  bg: string
  text: string
  /** Combined bg+text shorthand used in <span className={...}> */
  badge: string
  /** Tailwind class for a small colored dot */
  dot: string
  /** Hex color string suitable for Recharts fill / SVG stroke */
  hex: string
}

const PALETTE: CategoryColorSet[] = [
  {
    bg: 'bg-blue-100 dark:bg-blue-900/30',
    text: 'text-blue-700 dark:text-blue-300',
    badge: 'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-400',
    dot: 'bg-blue-500',
    hex: '#3b82f6',
  },
  {
    bg: 'bg-emerald-100 dark:bg-emerald-900/30',
    text: 'text-emerald-700 dark:text-emerald-300',
    badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400',
    dot: 'bg-emerald-500',
    hex: '#10b981',
  },
  {
    bg: 'bg-orange-100 dark:bg-orange-900/30',
    text: 'text-orange-700 dark:text-orange-300',
    badge: 'bg-orange-100 text-orange-700 dark:bg-orange-950/60 dark:text-orange-400',
    dot: 'bg-orange-500',
    hex: '#f97316',
  },
  {
    bg: 'bg-purple-100 dark:bg-purple-900/30',
    text: 'text-purple-700 dark:text-purple-300',
    badge: 'bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-400',
    dot: 'bg-purple-500',
    hex: '#8b5cf6',
  },
  {
    bg: 'bg-rose-100 dark:bg-rose-900/30',
    text: 'text-rose-700 dark:text-rose-300',
    badge: 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400',
    dot: 'bg-rose-500',
    hex: '#f43f5e',
  },
  {
    bg: 'bg-sky-100 dark:bg-sky-900/30',
    text: 'text-sky-700 dark:text-sky-300',
    badge: 'bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-400',
    dot: 'bg-sky-500',
    hex: '#0ea5e9',
  },
  {
    bg: 'bg-amber-100 dark:bg-amber-900/30',
    text: 'text-amber-700 dark:text-amber-300',
    badge: 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400',
    dot: 'bg-amber-500',
    hex: '#f59e0b',
  },
  {
    bg: 'bg-pink-100 dark:bg-pink-900/30',
    text: 'text-pink-700 dark:text-pink-300',
    badge: 'bg-pink-100 text-pink-700 dark:bg-pink-950/60 dark:text-pink-400',
    dot: 'bg-pink-500',
    hex: '#ec4899',
  },
  {
    bg: 'bg-lime-100 dark:bg-lime-900/30',
    text: 'text-lime-700 dark:text-lime-300',
    badge: 'bg-lime-100 text-lime-700 dark:bg-lime-950/60 dark:text-lime-400',
    dot: 'bg-lime-500',
    hex: '#84cc16',
  },
  {
    bg: 'bg-cyan-100 dark:bg-cyan-900/30',
    text: 'text-cyan-700 dark:text-cyan-300',
    badge: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-950/60 dark:text-cyan-400',
    dot: 'bg-cyan-500',
    hex: '#06b6d4',
  },
]

/**
 * Returns a stable color set for the given category ID.
 *
 * Uses a djb2-style hash so the same UUID always maps to the same palette
 * entry, regardless of render order or language.
 *
 * @param categoryId - The category's UUID / stable identifier (not the display name).
 */
export function getCategoryColor(categoryId: string): CategoryColorSet {
  let hash = 0
  for (let i = 0; i < categoryId.length; i++) {
    hash = categoryId.charCodeAt(i) + ((hash << 5) - hash)
  }
  return PALETTE[Math.abs(hash) % PALETTE.length]
}

/**
 * Convenience accessor — returns just the hex color string.
 * Useful for Recharts `fill` props and similar numeric-color APIs.
 */
export function getCategoryHex(categoryId: string): string {
  return getCategoryColor(categoryId).hex
}

/**
 * Convenience accessor — returns the combined badge class string
 * (bg + text, light + dark) for use in pill/badge elements.
 */
export function getCategoryBadgeClass(categoryId: string): string {
  return getCategoryColor(categoryId).badge
}
