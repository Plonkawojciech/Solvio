// Canonical Polish store configuration — single source of truth.
// Import this everywhere instead of hardcoding store lists.

export const GROCERY_STORES = [
  'Biedronka', 'Lidl', 'Kaufland', 'Aldi', 'Carrefour', 'Netto', 'Auchan',
  'Dino', 'Żabka', 'Lewiatan', 'Stokrotka', 'Intermarché', 'Mila',
  'Makro', 'Selgros', 'Polo Market', 'Chata Polska', 'Freshmarket',
  'Delikatesy Centrum', 'Top Market', 'Groszek', 'ABC', 'SPAR',
  'Eko', 'Społem', 'Frac', 'Piotr i Paweł', 'Topaz',
] as const

export const PHARMACY_STORES = [
  'Rossmann', 'Hebe', 'Super-Pharm', 'Ziko Apteka', 'DM Drogerie', 'Natura',
  'Apteka Gemini', 'Apteka Dr.Max', 'Apteka Cefarm',
] as const

export const DISCOUNT_STORES = [
  'Pepco', 'Action', 'Dealz', 'Tedi', 'KiK', 'Sinsay', 'Half Price', 'TK Maxx',
] as const

export const DIY_STORES = [
  'Castorama', 'Leroy Merlin', 'OBI', 'IKEA', 'Decathlon',
  'Bricomarché', 'Bricoman', 'Praktiker',
] as const

export const ELECTRONICS_STORES = [
  'Media Expert', 'RTV Euro AGD', 'MediaMarkt', 'Empik',
  'Komputronik', 'X-Kom', 'Morele',
] as const

export const FASHION_STORES = [
  'Reserved', 'Cropp', 'House', 'Mohito', 'Sinsay', 'CCC', 'Deichmann',
  'H&M', 'Zara', 'Bershka', 'Pull&Bear', 'C&A', '4F', 'Martes Sport',
  'Smyk',
] as const

export const FUEL_STORES = [
  'Orlen', 'Shell', 'BP', 'Circle K', 'Lotos', 'Moya', 'Amic Energy', 'Avia',
] as const

export const FOOD_STORES = [
  "McDonald's", 'KFC', 'Burger King', 'Subway', 'Pizza Hut', 'Starbucks',
  'Costa Coffee', 'Green Caffè Nero', 'Telepizza', 'Da Grasso', 'Sphinx',
] as const

export const ALL_POLISH_STORES = [
  ...GROCERY_STORES,
  ...PHARMACY_STORES,
  ...DISCOUNT_STORES,
  ...DIY_STORES,
  ...ELECTRONICS_STORES,
  ...FASHION_STORES,
  ...FUEL_STORES,
  ...FOOD_STORES,
] as const

// Stores used in price comparison and promotions AI prompts (grocery + pharmacy + discount)
export const PRICE_COMPARE_STORES = [
  ...GROCERY_STORES,
  ...PHARMACY_STORES,
  ...DISCOUNT_STORES,
] as const

// Store name normalization patterns — used by OCR and any vendor matching.
// Patterns are tolerant to common OCR confusions:
// - "0/O" (zero/letter-O), "1/I/l/!" (one/letter-I/letter-L/exclamation),
//   "5/S", "8/B", "6/G" — all common Tesseract/Azure OCR mistakes on
//   smudged thermal-receipt prints.
// - Optional whitespace inside brand name (Azure sometimes splits letters).
export const STORE_PATTERNS: Array<[RegExp, string]> = [
  // Grocery — tier 1 (national giants, OCR-tolerant)
  [/b\s*[i1!|l]\s*e\s*d\s*r\s*[o0]\s*n\s*k\s*a/i, 'Biedronka'],
  [/l\s*[i1!|l]\s*d\s*l/i, 'Lidl'],
  [/k\s*a\s*u\s*f\s*l\s*a\s*n\s*d/i, 'Kaufland'],
  [/\ba\s*l\s*d\s*[i1!]/i, 'Aldi'],
  [/c\s*a\s*r\s*r\s*e\s*f\s*[o0]\s*u\s*r/i, 'Carrefour'],
  [/\bn\s*e\s*t\s*t\s*[o0]\b/i, 'Netto'],
  [/a\s*u\s*c\s*h\s*a\s*n/i, 'Auchan'],
  // Grocery — tier 2
  [/\bd\s*[i1!]\s*n\s*[o0]\b(?!\s*pizza)/i, 'Dino'],
  [/[żz]\s*a\s*[bp]\s*k\s*a/i, 'Żabka'],
  [/lewiatan/i, 'Lewiatan'],
  [/stokrotka/i, 'Stokrotka'],
  [/intermarch[eé]/i, 'Intermarché'],
  [/\bmila\b/i, 'Mila'],
  [/topaz/i, 'Topaz'],
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
  [/spo[łl]em/i, 'Społem'],
  [/\beko\b/i, 'Eko'],
  [/piotr\s*i\s*pawe[łl]/i, 'Piotr i Paweł'],
  [/\bfrac\b/i, 'Frac'],
  // Pharmacy / drogeria
  [/rossmann/i, 'Rossmann'],
  [/\bhebe\b/i, 'Hebe'],
  [/super[\s-]?pharm/i, 'Super-Pharm'],
  [/ziko/i, 'Ziko Apteka'],
  [/\bdm\b\s*drogerie|drogerie\s*markt/i, 'DM Drogerie'],
  [/\bnatura\b/i, 'Natura'],
  [/apteka\s*gemini/i, 'Apteka Gemini'],
  [/apteka\s*dr\.?\s*max|dr\.?\s*max/i, 'Apteka Dr.Max'],
  [/apteka\s*cefarm|cefarm/i, 'Apteka Cefarm'],
  [/apteka(?!\s*ziko|\s*gemini|\s*dr|\s*cefarm)/i, 'Apteka'],
  // Discount variety
  [/pepco/i, 'Pepco'],
  [/\baction\b/i, 'Action'],
  [/dealz/i, 'Dealz'],
  [/\btedi\b/i, 'Tedi'],
  [/\bkik\b/i, 'KiK'],
  [/sinsay/i, 'Sinsay'],
  [/half\s*price/i, 'Half Price'],
  [/tk\s*maxx/i, 'TK Maxx'],
  // DIY / home
  [/castorama/i, 'Castorama'],
  [/leroy\s*merlin/i, 'Leroy Merlin'],
  [/\bobi\b/i, 'OBI'],
  [/ikea/i, 'IKEA'],
  [/decathlon/i, 'Decathlon'],
  [/bricomarch[eé]/i, 'Bricomarché'],
  [/bricoman/i, 'Bricoman'],
  [/praktiker/i, 'Praktiker'],
  // Electronics
  [/media\s*expert/i, 'Media Expert'],
  [/rtv\s*euro\s*agd/i, 'RTV Euro AGD'],
  [/media\s*markt/i, 'MediaMarkt'],
  [/empik/i, 'Empik'],
  [/komputronik/i, 'Komputronik'],
  [/x[\s-]?kom/i, 'X-Kom'],
  [/morele/i, 'Morele'],
  // Fashion
  [/reserved/i, 'Reserved'],
  [/\bcropp\b/i, 'Cropp'],
  [/\bhouse\b/i, 'House'],
  [/mohito/i, 'Mohito'],
  [/\bccc\b/i, 'CCC'],
  [/deichmann/i, 'Deichmann'],
  [/\bh\s*&\s*m\b|\bh\s*and\s*m\b/i, 'H&M'],
  [/\bzara\b/i, 'Zara'],
  [/bershka/i, 'Bershka'],
  [/pull\s*&\s*bear|pull\s*and\s*bear/i, 'Pull&Bear'],
  [/\bc\s*&\s*a\b/i, 'C&A'],
  [/\b4f\b/i, '4F'],
  [/martes\s*sport/i, 'Martes Sport'],
  [/\bsmyk\b/i, 'Smyk'],
  // Stacje paliw — paliwo to jeden z najczęstszych wydatków, a do tej pory
  // żadna stacja nie miała wzorca i „PKN ORLEN S.A." zostawało jako nazwa.
  [/\b(pkn\s*)?[o0]\s*r\s*l\s*e\s*n\b/i, 'Orlen'],
  [/\bshell\b/i, 'Shell'],
  [/\bcircle\s*k\b/i, 'Circle K'],
  [/\blot[o0]s\b/i, 'Lotos'],
  [/\bmoya\b/i, 'Moya'],
  [/\bamic\b/i, 'Amic Energy'],
  [/\bavia\b/i, 'Avia'],
  [/\bbp\s*(europa|stacja|polska)?\b(?=.*paliw|.*stacja|.*paliwo)/i, 'BP'],
  // Gastronomia
  [/mc\s*donald|mcdonald/i, "McDonald's"],
  [/\bk\s*f\s*c\b/i, 'KFC'],
  [/burger\s*king/i, 'Burger King'],
  [/\bsubway\b/i, 'Subway'],
  [/pizza\s*hut/i, 'Pizza Hut'],
  [/starbucks/i, 'Starbucks'],
  [/costa\s*coffee/i, 'Costa Coffee'],
  [/telepizza/i, 'Telepizza'],
  [/da\s*grasso/i, 'Da Grasso'],
  [/\bsphinx\b/i, 'Sphinx'],
  // European (for OCR on foreign receipts)
  [/penny/i, 'Penny'],
  [/rewe/i, 'REWE'],
  [/edeka/i, 'EDEKA'],
  [/real\b/i, 'Real'],
]

/// Normalises a single merchant string (typically Azure's MerchantName field).
/// Falls through to the original trimmed string if no pattern matches —
/// callers should treat empty/short results as "unknown" themselves.
export function normalizeStoreName(merchant: string | null): string {
  if (!merchant) return 'Unknown Store'
  const trimmed = merchant.trim()
  for (const [pattern, storeName] of STORE_PATTERNS) {
    if (pattern.test(trimmed)) return storeName
  }
  return trimmed
}

/// Scans full raw OCR text (entire receipt content) for any known chain.
/// Used as a second-chance extraction when Azure's MerchantName field is
/// missing, garbled, or returns a generic "Unknown Store" — most Polish
/// receipts repeat the chain name in headers, footers, and loyalty
/// program lines, so even when the MerchantName extractor misses it,
/// the chain name is almost always *somewhere* in the OCR text.
///
/// Returns `null` if no known chain is found — caller decides whether to
/// fall through to AI extraction or accept "Unknown Store".
/**
 * Marki, których nazwa jest zwykłym słowem z paragonu. „NETTO" stoi
 * w tabelce PTU na KAŻDYM polskim paragonie, „ABC" i „EKO" bywają skrótem
 * w nazwie produktu. Skan całej treści robił z nich sprzedawcę, więc paragon
 * z nieznanego sklepu potrafił wylądować jako „Netto". Tych szukamy wyłącznie
 * w nagłówku, gdzie faktycznie stoi nazwa sklepu.
 */
const HEADER_ONLY_BRANDS: ReadonlySet<string> = new Set([
  'Netto', 'ABC', 'Eko', 'Mila', 'Real', 'Natura', 'Groszek', 'Frac', 'Topaz',
  'Społem', 'Avia', 'BP', 'Subway', 'Moya',
])

// Nagłówek polskiego paragonu to nazwa sklepu, dwie linie adresu, NIP
// i „PARAGON FISKALNY" — sześć linii z zapasem. Szersze okno wpuszczało
// z powrotem tabelkę PTU ze słowem „netto".
const HEADER_LINES = 6

export function findStoreInText(rawText: string | null | undefined): string | null {
  if (!rawText || typeof rawText !== 'string') return null
  // Nazwa sieci pojawia się w nagłówku, w stopce lojalnościowej („Karta Lidl
  // Plus"), w banerze NIP-u i w identyfikatorze terminala — dlatego skanujemy
  // całą treść. Wyjątek: marki-zwykłe-słowa, tylko nagłówek.
  const header = rawText.split('\n').slice(0, HEADER_LINES).join('\n')
  for (const [pattern, storeName] of STORE_PATTERNS) {
    const haystack = HEADER_ONLY_BRANDS.has(storeName) ? header : rawText
    if (pattern.test(haystack)) return storeName
  }
  return null
}

/// Returns the canonical chain name for a string that may be a free-form
/// merchant from any source (Azure, GPT, raw text). Combines
/// `normalizeStoreName` (full-string match) with `findStoreInText`
/// (substring match) — useful when the input is a multi-line address
/// block where the chain name is buried somewhere.
export function resolveStoreName(input: string | null | undefined): string | null {
  if (!input) return null
  const direct = normalizeStoreName(input)
  // normalizeStoreName falls through to the original trimmed string when
  // no pattern matches; treat that as "no canonical match" for this API.
  for (const [, storeName] of STORE_PATTERNS) {
    if (direct === storeName) return storeName
  }
  // Fall back to substring scan over the input
  return findStoreInText(input)
}
