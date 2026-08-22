// Shared expense/receipt-item categorization.
//
// One source of truth for the two pieces every categorization path needs:
//   1. `aiCategorizeNames` — batch AI tagging against the user's categories
//      (default + custom), returning category UUIDs the user actually owns.
//   2. `makeKeywordFallback` — deterministic PL/EN keyword matcher for items
//      the AI left untagged (or when no AI client is configured).
//
// Used by:
//   - `/api/data/expenses` POST  → auto-categorize a manually added expense
//   - `/api/v1/recategorize-receipts` → backfill old receipt items
// The OCR scan path (`/api/v1/ocr-receipt`) has its own variant that also
// translates item names in the same call, so it stays separate by design.

import { getAIClient } from '@/lib/ai-client'

export type CatRef = { id: string; name: string }

/**
 * AI-categorize a list of names against the user's categories. Returns a
 * `Map<index, categoryId | null>` keyed by position in `names`. Chunks large
 * inputs (GPT degrades on hundreds of items in one call) and validates every
 * returned UUID against the user's own category set so a hallucinated id can
 * never leak through. Never throws — a failed chunk simply yields no tags.
 */
export async function aiCategorizeNames(
  names: string[],
  cats: CatRef[],
): Promise<Map<number, string | null>> {
  const result = new Map<number, string | null>()
  if (!names.length || !cats.length) return result

  const ai = getAIClient()
  if (!ai) return result

  const validIds = new Set(cats.map(c => c.id))
  const categoryMap = cats.map(c => `${c.name}: ${c.id}`).join('\n')

  // 80 names per chunk keeps token use modest while staying efficient.
  const CHUNK = 80
  for (let start = 0; start < names.length; start += CHUNK) {
    const chunk = names.slice(start, start + CHUNK)
    const itemsList = chunk.map((name, i) => `${i + 1}. ${name}`).join('\n')

    try {
      const completion = await ai.client.chat.completions.create({
        model: ai.model,
        temperature: 0,
        max_tokens: 1500,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `You categorize purchases. Names may be truncated, abbreviated, or in Polish.

CATEGORIES (name: UUID):
${categoryMap}

RULES:
- Return {"items":[{"catId":"uuid"}]} with one entry per product, in order.
- Use the UUID, not the category name.
- null catId if no category fits.
- Supermarket groceries (mleko, chleb, mięso, owoce, warzywa, jajka) → category containing "groceries"/"spożywcze"/"zakupy"
- Restaurants, fast food → "food"/"jedzenie"
- Pharmacy, medicine, vitamins → "health"/"zdrowie"
- Clothing, shoes → "shopping"/"zakupy"
- Fuel, transport, tickets, paliwo → "transport"
- Phones, laptops, cables → "electronics"/"elektronika"
- Cleaning, soap, tissues → "home"/"dom"
- Cinema, books, games → "entertainment"/"rozrywka"
- Bills, internet, rent → "bills"/"rachunki"`,
          },
          { role: 'user', content: `Products:\n${itemsList}` },
        ],
      })

      const raw = completion.choices[0]?.message?.content?.trim() ?? null
      if (!raw) continue

      let parsed: Array<{ catId: string | null }> = []
      try {
        const j = JSON.parse(raw)
        parsed = Array.isArray(j) ? j : Array.isArray(j?.items) ? j.items : []
      } catch {
        const m = raw.match(/\[[\s\S]*\]/)
        if (m) {
          try { parsed = JSON.parse(m[0]) } catch { /* skip */ }
        }
      }

      chunk.forEach((_, i) => {
        const catId = parsed[i]?.catId ?? null
        result.set(start + i, catId && validIds.has(catId) ? catId : null)
      })
    } catch (e) {
      console.error('[categorize] AI batch failed:', e)
    }
  }
  return result
}

// --- KEYWORD FALLBACK (PL/EN) ---
export const KEYWORD_MAP: Record<string, string[]> = {
  food: ['pizza', 'burger', 'sandwich', 'restaurant', 'bar', 'cafe', 'coffee', 'lunch', 'dinner', 'meal', 'sushi', 'kebab', 'wrap', 'salad'],
  jedzenie: ['pizza', 'burger', 'sandwich', 'restauracja', 'bar', 'kawiarnia', 'kawa', 'obiad', 'kolacja', 'śniadanie', 'kebab', 'zupa'],
  groceries: ['milk', 'bread', 'cheese', 'meat', 'fruit', 'vegetable', 'eggs', 'butter', 'sugar', 'flour', 'rice', 'pasta', 'chicken', 'water', 'juice', 'yogurt', 'banana', 'apple', 'potato', 'onion', 'tomato', 'cream', 'oil', 'cereal', 'fish', 'salmon', 'pork', 'beef', 'ham', 'sausage'],
  spożywcze: ['mleko', 'chleb', 'ser', 'mięso', 'owoce', 'warzywa', 'jajka', 'masło', 'cukier', 'mąka', 'ryż', 'makaron', 'kurczak', 'woda', 'sok', 'jogurt', 'banan', 'jabłk', 'ziemniak', 'cebul', 'pomidor', 'śmietan', 'olej', 'szynk', 'kiełbas', 'bułk', 'rogal', 'czekolad', 'piwo', 'wino', 'wódk', 'alkohol', 'napój', 'chipsy', 'herbat', 'lizak', 'ciastk'],
  health: ['pharmacy', 'medicine', 'vitamin', 'pill', 'bandage', 'aspirin', 'ibuprofen', 'paracetamol', 'shampoo', 'toothpaste'],
  zdrowie: ['apteka', 'lek', 'witamin', 'tabletk', 'bandaż', 'aspiryn', 'paracetamol', 'szampon', 'pasta', 'krem', 'maść'],
  transport: ['fuel', 'petrol', 'diesel', 'paliwo', 'benzyn', 'nafta', 'parking', 'taxi', 'uber', 'bolt', 'bilet', 'ticket', 'train', 'bus', 'lpg', 'autogaz'],
  shopping: ['clothes', 'shoes', 'shirt', 'pants', 'dress', 'jacket', 'hat', 'sweater', 'socks'],
  zakupy: ['ubrania', 'buty', 'koszul', 'spodnie', 'sukienk', 'kurtk', 'skarpet', 'sweter', 'czapk'],
  electronics: ['phone', 'laptop', 'computer', 'cable', 'charger', 'battery', 'headphones', 'adapter', 'usb', 'hdmi'],
  elektronika: ['telefon', 'laptop', 'komputer', 'kabel', 'ładowark', 'bateri', 'słuchawk', 'adapter'],
  'home & garden': ['detergent', 'soap', 'tissue', 'towel', 'cleaning', 'sponge', 'trash bag', 'bleach'],
  dom: ['detergent', 'mydło', 'chusteczk', 'ręcznik', 'czyszcz', 'gąbk', 'worek', 'proszek', 'płyn', 'worki'],
  entertainment: ['cinema', 'movie', 'game', 'concert', 'book', 'magazine', 'spotify', 'netflix'],
  rozrywka: ['kino', 'film', 'gra', 'koncert', 'książk', 'czasopismo'],
  'bills & utilities': ['electricity', 'internet', 'phone bill', 'rent', 'subscription'],
  rachunki: ['prąd', 'internet', 'czynsz', 'abonament'],
}

/**
 * Build a keyword-matching fallback bound to the user's categories. Maps a
 * keyword group (e.g. "spożywcze") to whichever of the user's categories has
 * a matching name, then matches item tokens against the group's keywords.
 * Final safety net: groceries/spożywcze/zakupy.
 */
export function makeKeywordFallback(cats: CatRef[]) {
  const catList = cats.map(c => ({ id: c.id, lower: c.name.toLowerCase() }))
  const findCatId = (groupKey: string): string | null => {
    const gk = groupKey.toLowerCase()
    for (const c of catList) {
      if (c.lower === gk || c.lower.includes(gk) || gk.includes(c.lower)) return c.id
    }
    return null
  }
  return (itemName: string): string | null => {
    const tokens = itemName.toLowerCase().replace(/[^a-ząćęłńóśźż\s]/g, '').split(/\s+/)
    for (const [groupKey, keywords] of Object.entries(KEYWORD_MAP)) {
      const catId = findCatId(groupKey)
      if (!catId) continue
      for (const kw of keywords) {
        if (tokens.some(t => t.includes(kw) || kw.includes(t))) return catId
      }
    }
    return findCatId('groceries') || findCatId('spożywcze') || findCatId('zakupy') || null
  }
}

/**
 * Resolve the single best category for one expense/item name against the
 * user's categories: AI first, deterministic keyword fallback second.
 * Returns null only when nothing matches and there are no categories.
 */
export async function categorizeOne(name: string, cats: CatRef[]): Promise<string | null> {
  const trimmed = name.trim()
  if (!trimmed || !cats.length) return null
  const ai = await aiCategorizeNames([trimmed], cats)
  return ai.get(0) ?? makeKeywordFallback(cats)(trimmed)
}
