// Canonical Polish store configuration — single source of truth.
// Import this everywhere instead of hardcoding store lists.

export const GROCERY_STORES = [
  'Biedronka', 'Lidl', 'Kaufland', 'Aldi', 'Carrefour', 'Netto', 'Auchan',
  'Dino', 'Żabka', 'Lewiatan', 'Stokrotka', 'Intermarché', 'Mila',
  'Makro', 'Selgros', 'Polo Market', 'Chata Polska', 'Freshmarket',
  'Delikatesy Centrum', 'Top Market', 'Groszek', 'ABC', 'SPAR',
] as const

export const PHARMACY_STORES = [
  'Rossmann', 'Hebe', 'Super-Pharm', 'Ziko Apteka',
] as const

export const DISCOUNT_STORES = [
  'Pepco', 'Action', 'Dealz', 'Tedi', 'KiK',
] as const

export const DIY_STORES = [
  'Castorama', 'Leroy Merlin', 'OBI', 'IKEA', 'Decathlon',
] as const

export const ELECTRONICS_STORES = [
  'Media Expert', 'RTV Euro AGD', 'MediaMarkt', 'Empik',
] as const

export const ALL_POLISH_STORES = [
  ...GROCERY_STORES,
  ...PHARMACY_STORES,
  ...DISCOUNT_STORES,
  ...DIY_STORES,
  ...ELECTRONICS_STORES,
] as const

// Stores used in price comparison and promotions AI prompts (grocery + pharmacy + discount)
export const PRICE_COMPARE_STORES = [
  ...GROCERY_STORES,
  ...PHARMACY_STORES,
  ...DISCOUNT_STORES,
] as const

// Store name normalization patterns — used by OCR and any vendor matching
export const STORE_PATTERNS: Array<[RegExp, string]> = [
  // Grocery — tier 1
  [/biedronka/i, 'Biedronka'],
  [/lidl/i, 'Lidl'],
  [/kaufland/i, 'Kaufland'],
  [/aldi/i, 'Aldi'],
  [/carrefour/i, 'Carrefour'],
  [/netto/i, 'Netto'],
  [/auchan/i, 'Auchan'],
  // Grocery — tier 2
  [/dino(?!\s*pizza)/i, 'Dino'],
  [/żabka|zabka|żapka/i, 'Żabka'],
  [/lewiatan/i, 'Lewiatan'],
  [/stokrotka/i, 'Stokrotka'],
  [/intermarch[eé]/i, 'Intermarché'],
  [/\bmila\b/i, 'Mila'],
  // Grocery — tier 3
  [/makro/i, 'Makro'],
  [/selgros/i, 'Selgros'],
  [/polo\s*market|polomarket/i, 'Polo Market'],
  [/chata\s*polska/i, 'Chata Polska'],
  [/freshmarket|fresh\s*market/i, 'Freshmarket'],
  [/delikatesy\s*centrum/i, 'Delikatesy Centrum'],
  [/top\s*market/i, 'Top Market'],
  [/groszek/i, 'Groszek'],
  [/\babc\b/i, 'ABC'],
  [/\bspar\b/i, 'SPAR'],
  [/tesco/i, 'Tesco'],
  [/e\.?leclerc|leclerc/i, 'E.Leclerc'],
  // Pharmacy
  [/rossmann/i, 'Rossmann'],
  [/\bhebe\b/i, 'Hebe'],
  [/super[\s-]?pharm/i, 'Super-Pharm'],
  [/ziko/i, 'Ziko Apteka'],
  [/apteka(?!\s*ziko)/i, 'Apteka'],
  // Discount variety
  [/pepco/i, 'Pepco'],
  [/\baction\b/i, 'Action'],
  [/dealz/i, 'Dealz'],
  [/\btedi\b/i, 'Tedi'],
  [/\bkik\b/i, 'KiK'],
  // DIY / home
  [/castorama/i, 'Castorama'],
  [/leroy\s*merlin/i, 'Leroy Merlin'],
  [/\bobi\b/i, 'OBI'],
  [/ikea/i, 'IKEA'],
  [/decathlon/i, 'Decathlon'],
  // Electronics
  [/media\s*expert/i, 'Media Expert'],
  [/rtv\s*euro\s*agd/i, 'RTV Euro AGD'],
  [/media\s*markt/i, 'MediaMarkt'],
  [/empik/i, 'Empik'],
  // European (for OCR on foreign receipts)
  [/penny/i, 'Penny'],
  [/rewe/i, 'REWE'],
  [/edeka/i, 'EDEKA'],
  [/real\b/i, 'Real'],
]

export function normalizeStoreName(merchant: string | null): string {
  if (!merchant) return 'Unknown Store'
  const trimmed = merchant.trim()
  for (const [pattern, storeName] of STORE_PATTERNS) {
    if (pattern.test(trimmed)) return storeName
  }
  return trimmed
}
