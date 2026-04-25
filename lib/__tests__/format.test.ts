/**
 * Tests for lib/format.ts — formatAmount() and formatDate().
 */

import { describe, it, expect } from 'vitest'
import { formatAmount, formatDate } from '../format'

describe('formatAmount()', () => {
  it('formats a number with PLN currency', () => {
    const result = formatAmount(10.5, 'PLN')
    // Should contain "10.50" or "10,50" depending on locale, and PLN marker
    expect(result).toContain('10')
    expect(result).toMatch(/PLN|zł/)
  })

  it('formats a number with EUR currency', () => {
    const result = formatAmount(10.5, 'EUR')
    expect(result).toContain('10')
    expect(result).toMatch(/EUR|€/)
  })

  it('defaults to PLN when currency is not provided', () => {
    const result = formatAmount(25)
    expect(result).toMatch(/PLN|zł/)
  })

  it('handles null → returns 0.00 PLN equivalent', () => {
    const result = formatAmount(null)
    expect(result).toMatch(/0[.,]00/)
  })

  it('handles undefined → returns 0.00 PLN equivalent', () => {
    const result = formatAmount(undefined)
    expect(result).toMatch(/0[.,]00/)
  })

  it('handles a numeric string', () => {
    const result = formatAmount('99.99', 'PLN')
    expect(result).toContain('99')
    expect(result).toMatch(/PLN|zł/)
  })

  it('handles an invalid string → returns 0.00 fallback', () => {
    const result = formatAmount('invalid')
    expect(result).toMatch(/0[.,]00/)
  })

  it('handles zero correctly', () => {
    const result = formatAmount(0, 'PLN')
    expect(result).toMatch(/0[.,]00/)
  })

  it('formats large numbers', () => {
    const result = formatAmount(1234567.89, 'PLN')
    expect(result).toContain('1')
    // Contains the major digits
    expect(result).toMatch(/1[,. ]?234[,. ]?567/)
  })

  it('rounds to 2 decimal places', () => {
    const result = formatAmount(10.999, 'PLN')
    // 10.999 rounds to 11.00
    expect(result).toContain('11')
  })
})

describe('formatDate()', () => {
  it('returns "—" for null', () => {
    expect(formatDate(null)).toBe('—')
  })

  it('returns "—" for undefined', () => {
    expect(formatDate(undefined)).toBe('—')
  })

  it('returns "—" for empty string', () => {
    expect(formatDate('')).toBe('—')
  })

  it('formats an ISO date string in en-US locale', () => {
    const result = formatDate('2024-01-15')
    // en-US: "January 15, 2024"
    expect(result).toContain('2024')
    expect(result).toContain('15')
    expect(result).toMatch(/Jan/)
  })

  it('formats a Date object correctly', () => {
    const date = new Date('2024-06-20T12:00:00Z')
    const result = formatDate(date)
    expect(result).toContain('2024')
    expect(result).toContain('20')
    expect(result).toMatch(/Jun/)
  })

  it('formats a December date', () => {
    const result = formatDate('2023-12-31')
    expect(result).toContain('2023')
    expect(result).toContain('31')
    expect(result).toMatch(/Dec/)
  })

  it('returns a non-empty string for valid dates', () => {
    const result = formatDate('2024-03-18')
    expect(result.length).toBeGreaterThan(0)
    expect(result).not.toBe('—')
  })
})
