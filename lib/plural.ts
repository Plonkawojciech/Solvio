// CLDR-based pluralization helpers for PL/EN.
//
// Polish has 4 plural categories (one/few/many/other) per Unicode CLDR.
// JavaScript's `Intl.PluralRules` already implements the rules, but it's
// not available in every server runtime config and we want a tiny pure
// function we can use in template literals without locking the call to a
// runtime-detected language. This module exposes:
//
//   pluralPL(count): one|few|many|other
//   pluralEN(count): one|other
//   pluralizePL({ count, one, few, many, other? }): "<count> <noun>"
//
// Reference (CLDR 46, May 2026):
//   one:   n=1                                          (1)
//   few:   n%10 ∈ {2,3,4}  AND  n%100 ∉ {12,13,14}      (2,3,4,22,23,24,…)
//   many:  everything else                              (0,5,6,…,11,12,13,14,15,…,21,25,…)
//   other: n=fractional                                 (kept for API parity; not used here as we receive integer counts)
//
// Examples (paragon — receipt):
//   1 paragon (one)
//   2 paragony (few)
//   5 paragonów (many)
//   12 paragonów (many)
//   22 paragony (few)

export type PluralCategory = 'one' | 'few' | 'many' | 'other'

/** Polish CLDR plural category for an integer count. */
export function pluralPL(count: number): PluralCategory {
  if (!Number.isFinite(count)) return 'other'
  const n = Math.abs(Math.trunc(count))
  if (n === 1) return 'one'
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'few'
  return 'many'
}

/** English CLDR plural category for an integer count. */
export function pluralEN(count: number): PluralCategory {
  if (!Number.isFinite(count)) return 'other'
  const n = Math.abs(Math.trunc(count))
  return n === 1 ? 'one' : 'other'
}

interface PluralFormsPL {
  one: string
  few: string
  many: string
  /** Optional override for fractional/zero edge cases. Falls back to `many`. */
  other?: string
}

/**
 * Pick the right Polish plural form for a count and prefix the count.
 * Returns "<count> <form>" without trailing punctuation.
 *
 *   pluralizePL({ count: 1, one: 'paragon', few: 'paragony', many: 'paragonów' })
 *     -> "1 paragon"
 *   pluralizePL({ count: 5, one: 'paragon', few: 'paragony', many: 'paragonów' })
 *     -> "5 paragonów"
 */
export function pluralizePL(args: { count: number } & PluralFormsPL): string {
  const cat = pluralPL(args.count)
  const word = cat === 'one' ? args.one : cat === 'few' ? args.few : cat === 'many' ? args.many : (args.other ?? args.many)
  return `${args.count} ${word}`
}

interface PluralFormsEN {
  one: string
  other: string
}

/**
 * Pick the right English plural form for a count and prefix the count.
 *
 *   pluralizeEN({ count: 1, one: 'receipt', other: 'receipts' })
 *     -> "1 receipt"
 *   pluralizeEN({ count: 3, one: 'receipt', other: 'receipts' })
 *     -> "3 receipts"
 */
export function pluralizeEN(args: { count: number } & PluralFormsEN): string {
  return `${args.count} ${pluralEN(args.count) === 'one' ? args.one : args.other}`
}
