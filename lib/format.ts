/**
 * Shared formatting utilities for amounts and dates.
 * Used across receipt, settlement, and expense views.
 */

export function formatAmount(amount: number | string | null | undefined, currency = 'PLN'): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : (amount ?? 0)
  if (isNaN(num)) return `0.00 ${currency}`
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: currency || 'PLN',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(num)
  } catch {
    return `${num.toFixed(2)} ${currency}`
  }
}

export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return '—'
  const dateStr = date instanceof Date ? date.toISOString() : date
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  } catch {
    return dateStr
  }
}
