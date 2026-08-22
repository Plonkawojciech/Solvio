// Wydzielone z `app/api/v1/ocr-receipt/route.ts` (1598 linii w jednym pliku).
// Trasa jest teraz wyłącznie orkiestracją: uwierzytelnienie, pętla po plikach
// i zapis. Cała robota siedzi w `lib/ocr/*`, gdzie da się ją czytać i testować
// bez podnoszenia handlera HTTP.

import { getAIClient } from '@/lib/ai-client'
import { chatParams, chatWithEffortRetry, readContent } from '@/lib/ai-params'

type Completion = { choices?: Array<{ message?: { content?: string | null }; finish_reason?: string }> }
import { log } from './shared'

// --- LANGUAGE DETECTION + CATEGORIZATION + TRANSLATION ---
export function detectLanguage(rawText: string): string {
  const text = rawText.toUpperCase();
  // Spanish keywords
  const spanishScore = [/\bIVA\b/, /\bEUROS\b/, /\bPRECIO\b/, /\bIMPORTE\b/, /\bMERCADO\b/, /\bDESCRIPCION\b/, /\bFECHA\b/].filter(p => p.test(text)).length;
  // German keywords
  const germanScore = [/\bMWST\b/, /\bDATUM\b/, /\bARTIKEL\b/, /\bBETRAG\b/].filter(p => p.test(text)).length;
  // Polish keywords
  const polishScore = [/\bPARAGON\b/, /\bCENA\b/, /\bILOŚĆ\b/, /\bZŁ\b/, /\bSUMA\b/, /\bKASA\b/, /\bFISKALNY\b/, /\bRABAT\b/, /\bSZT\b/, /\bSPRZEDAŻ\b/].filter(p => p.test(text)).length;
  // English keywords
  const englishScore = [/\bTAX\b/, /\bRECEIPT\b/, /\bAMOUNT\b/, /\bSUBTOTAL\b/, /\bCHANGE\b/].filter(p => p.test(text)).length;

  if (spanishScore >= 2) return 'es';
  if (germanScore >= 2) return 'de';
  if (polishScore >= 2) return 'pl';
  if (englishScore >= 2) return 'en';
  // Default: check for Polish characters
  if (/[ąćęłńóśźż]/i.test(rawText)) return 'pl';
  return 'en';
}

/// Maps merchant names to chain-specific brand hints injected into the
/// AI cleanup prompt. Polish supermarket private labels are heavy
/// abbreviation magnets — "PILOSJOG" almost certainly means "Pilos
/// jogurt" if the receipt is from Lidl, but could mean nothing on a
/// Carrefour receipt. Knowing the chain helps the model expand
/// truncated names accurately instead of guessing.
const CHAIN_BRAND_HINTS: Record<string, string[]> = {
  'Lidl': ['Pilos', 'Combino', 'Milbona', 'Freeway', 'Crownfield', 'Linessa', 'Bellarom', 'Fairglobe', 'Vitafit', 'Italiamo', 'Chef Select', 'Deluxe', 'Cien'],
  'Biedronka': ['Tola', 'Vital Fresh', 'Marka', 'Dada', 'Krasula', 'Mintaka', 'Tropikale', 'Ego', 'Dobre', 'Tradycyjne', 'Grandes'],
  'Kaufland': ['K-Classic', 'K-Take it Veggie', 'Bevola', 'K-to-go', 'K-jestem', 'K-Favourites'],
  'Auchan': ['Auchan', 'Cosmia', 'Pouce'],
  'Carrefour': ['Carrefour', 'Carrefour Bio', 'Carrefour Selection', 'Reflets de France'],
  'Aldi': ['Mamma', 'Almare', 'Just Veggies', 'Beauty Eq', 'Crusti Croc'],
  'Netto': ['Netto', 'Goldhand'],
  'Dino': ['Bona', 'Dino', 'Smacze'],
  'Żabka': ['Żabka', 'Żabka Cafe', 'Foodie'],
  'Stokrotka': ['Stokrotka', 'Bons'],
  'Rossmann': ['Babydream', 'Isana', 'Alterra', 'Enzymax', 'Domol', 'Profissimo', 'Sunozon', 'Altapharma'],
  'Hebe': ['Hebe', 'Hebe Naturals'],
};

export async function categorizeAndTranslateItems(
  items: Array<{ name: string; quantity: number | null; price: number | null }>,
  cats: Array<{ id: string; name: string }>,
  rawText: string,
  merchantHint?: string | null,
): Promise<{
  items: Array<{ name: string; nameClean: string | null; nameTranslated: string | null; quantity: number | null; price: number | null; category_id: string | null }>;
  detectedLanguage: string;
}> {
  const detectedLanguage = detectLanguage(rawText);
  const needsTranslation = detectedLanguage !== 'pl' && detectedLanguage !== 'en';

  const ai = getAIClient();
  if (!ai) {
    console.warn('[GPT] AI client not available - no AZURE_OPENAI_* or OPENAI_API_KEY configured?');
    return {
      items: items.map(item => ({ ...item, nameClean: null, nameTranslated: null, category_id: null })),
      detectedLanguage,
    };
  }

  if (!cats.length || items.length === 0) {
    return {
      items: items.map(item => ({ ...item, nameClean: null, nameTranslated: null, category_id: null })),
      detectedLanguage,
    };
  }

  try {
    const validCategories = cats.filter(c => c.id && c.name);
    const categoryMap = validCategories.map(c => `${c.name}: ${c.id}`).join('\n');
    const itemsList = items.map((item, idx) => `${idx + 1}. ${item.name}`).join('\n');

    const langNote = needsTranslation
      ? `The receipt is in ${detectedLanguage}. For each item, provide the English translation in "en" and the category UUID in "catId".`
      : `Items are in PL/EN — set "en" to null (no translation needed). Provide the category UUID in "catId".`;

    // Chain-specific brand hint — when we know the receipt is from
    // Lidl, telling the AI about Pilos/Combino/Milbona helps it
    // expand "PILOSJOG" → "Pilos jogurt" instead of guessing wrong.
    let chainHint = '';
    if (merchantHint && CHAIN_BRAND_HINTS[merchantHint]) {
      chainHint = `\n\nCHAIN CONTEXT: This receipt is from ${merchantHint}. Common private-label and exclusive brands sold there: ${CHAIN_BRAND_HINTS[merchantHint].join(', ')}. When you see abbreviations that match these brands, prefer that interpretation.`;
    } else if (merchantHint) {
      chainHint = `\n\nCHAIN CONTEXT: This receipt is from ${merchantHint}.`;
    }

    log(`[GPT] Language: ${detectedLanguage}, needsTranslation: ${needsTranslation}, merchant: ${merchantHint || '(none)'}`);

    // Bumped max_tokens 800 → 1400 because we now ask for an extra
    // "cleaned" field per item (full readable Polish name expanded
    // from the truncated POS abbreviation). Without the bump, the
    // response can be cut off mid-JSON for receipts with 10+ items.
    const completion = await chatWithEffortRetry<Completion>(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (params) => ai.client.chat.completions.create(params as any),
      {
      // Zapas na pozycję + rozwiniętą nazwę + tłumaczenie razy 20 pozycji.
      ...chatParams({ model: ai.model, maxTokens: 2400, json: { type: 'json_object' } }),
      messages: [
        {
          role: 'system',
          content: `You clean up, categorize, and (if needed) translate receipt items.

Polish supermarket POS systems truncate product names to 16-24 characters and concatenate words without spaces (e.g. "ChlezytnOrkisz", "WodaMin Cisow", "JogPitTruskBakoma"). Your job is to expand each abbreviation back into the full, properly-formatted Polish (or original-language) product name.${chainHint}

CATEGORIES (name: UUID):
${categoryMap}

OUTPUT — return STRICTLY this JSON shape:
{"items":[{"cleaned":"full readable name","en":"english translation or null","catId":"uuid or null"}]}
One entry per product, in input order. No extra commentary.

CLEANED NAME RULES:
- Expand truncated/concatenated words into proper Polish (or original-language) names with correct spaces, Polish diacritics (ą ć ę ł ń ó ś ź ż), and Sentence case.
- DECIPHERING TABLE — common Polish POS abbreviations:
  • Chl-/Chleb- → "Chleb"        (e.g. "Chlezytn" → "Chleb żytni")
  • Bul-/Bulk- → "Bułka"          (e.g. "BulkMasl" → "Bułka maślana")
  • Ml/Mleko/Mlk → "Mleko"        (e.g. "MlekoLac3,2" → "Mleko Łaciate 3,2%")
  • Smie/Smiet → "Śmietana"
  • Mas/Maslo → "Masło"
  • Twar/Tw → "Twaróg"
  • Ser/Serek → "Ser/Serek"        (e.g. "SerekHomog" → "Serek homogenizowany")
  • Jog/JogPit → "Jogurt/Jogurt pitny"
  • Jaja/Jaj → "Jajka"             (e.g. "JajaM10szt" → "Jajka rozm. M, 10 szt.")
  • Kurcz/Filet → "Kurczak/Filet z kurczaka"
  • Wol/Wolow → "Wołowina"
  • Kielb/Kielb → "Kiełbasa"       (e.g. "KielbBial" → "Kiełbasa biała")
  • Szynka/Szyn → "Szynka"
  • Parow/Parow → "Parówki"
  • Pomid/Pomidor → "Pomidor"
  • Ogor/Ogorek → "Ogórek"
  • Cebul/Cebula → "Cebula"
  • Ziem/Ziemn → "Ziemniaki"
  • Marchew/Marchewka → "Marchewka"
  • Banan/Bana → "Banan"
  • Jabl/Jablko → "Jabłko"
  • Cytr/Cytryna → "Cytryna"
  • WodaMin/WodaNiegaz → "Woda mineralna/niegazowana"
  • Sok/Sok → "Sok"
  • Piwo/Piwo → "Piwo"
  • Wino/Wino → "Wino"
  • Mak/Makar → "Makaron"
  • Ryz/Ryz → "Ryż"
  • Kaw/Kawa → "Kawa"
  • Herb/Herbata → "Herbata"
  • Czek/Czekol → "Czekolada"
  • Cuk/Cukier → "Cukier"
  • Sol/Sol → "Sól"
  • Olej/OlRzep → "Olej (rzepakowy)"
  • Maslan/MasOrz → "Masło orzechowe"
  • PapTual → "Papier toaletowy"
  • RecznikPap → "Ręcznik papierowy"
  • PlynNacz → "Płyn do naczyń"
  • Proszek → "Proszek do prania"
  • Pasta-z → "Pasta do zębów"
  • Szam/Szamp → "Szampon"
  • MydloW → "Mydło w płynie"
- Preserve brand names exactly (Bakoma, Łaciate, Cisowianka, Pilos, Tola, Krasula, Mlekowita, Zott, Danone, Hochland, Almette, Tymbark, Kubuś, Hortex, Coca-Cola, Pepsi, Tyskie, Żywiec, etc.).
- Sentence case ("Chleb żytni" not "CHLEB ŻYTNI" not "chleb żytni").
- Keep package size / fat percentage if present (1L, 500g, 2%, 500ml).
- If the name is already clean and readable (e.g. "Banan", "Pomidor"), just normalise capitalisation and return it as-is.
- If you genuinely cannot guess what the abbreviation means, set "cleaned" to a Sentence-case version of the original — never invent products.

CATEGORY RULES:
- Use the UUID, not the category name.
- null catId if no category fits.
- Supermarket groceries (milk, bread, meat, vegetables) → category containing "groceries"/"spożywcze"/"zakupy"
- Restaurants, fast food → "food"/"jedzenie"
- Pharmacy, medicine → "health"/"zdrowie"
- Clothing, shoes → "shopping"/"zakupy"
- Fuel, transport, tickets → "transport"

${langNote}`,
        },
        {
          role: 'user',
          content: `Products:\n${itemsList}`,
        },
      ],
    });

    const { text: result, truncated } = readContent(completion);
    if (truncated) {
      console.warn('[GPT] ⚠️ odpowiedź kategoryzacji ucięta na limicie tokenów');
    }
    if (!result) {
      return {
        items: items.map(item => ({ ...item, nameClean: null, nameTranslated: null, category_id: null })),
        detectedLanguage,
      };
    }

    const jsonStr = result;

    let parsed: Array<{ cleaned?: string | null; en: string | null; catId: string | null }> = [];
    try {
      const raw = JSON.parse(jsonStr);
      parsed = Array.isArray(raw) ? raw : (Array.isArray(raw?.items) ? raw.items : []);
    } catch {
      const arrayMatch = result.match(/\[[\s\S]*?\]/);
      if (arrayMatch) {
        try { parsed = JSON.parse(arrayMatch[0]); } catch { /* fallback */ }
      }
    }

    // Pad/trim to match items length
    while (parsed.length < items.length) parsed.push({ cleaned: null, en: null, catId: null });
    parsed = parsed.slice(0, items.length);

    const resultItems = items.map((item, idx) => {
      const p = parsed[idx] || { cleaned: null, en: null, catId: null };
      const validCatId = p.catId && validCategories.some(c => c.id === p.catId) ? p.catId : null;
      // Trust the AI's cleaned name as long as it's a non-empty string
      // that's reasonably close in length to the original (rejects
      // hallucinations where the model rewrites the receipt).
      const rawCleaned = (p.cleaned || '').trim();
      const cleaned = rawCleaned.length >= 2 && rawCleaned.length <= 80 ? rawCleaned : null;
      return {
        ...item,
        nameClean: cleaned,
        nameTranslated: p.en || null,
        category_id: validCatId,
      };
    });

    const assignedCount = resultItems.filter(r => r.category_id !== null).length;
    const cleanedCount = resultItems.filter(r => r.nameClean !== null).length;
    log(`[GPT] ✅ categorizeAndTranslate: ${assignedCount}/${items.length} categorized, ${cleanedCount}/${items.length} cleaned, lang=${detectedLanguage}`);

    return { items: resultItems, detectedLanguage };
  } catch (error) {
    console.error('[GPT] ❌ categorizeAndTranslateItems error:', error);
    return {
      items: items.map(item => ({ ...item, nameClean: null, nameTranslated: null, category_id: null })),
      detectedLanguage,
    };
  }
}

/// Tier 3 merchant extractor — used as a last resort when both Azure's
/// MerchantName field and the regex-based STORE_PATTERNS scan failed.
///
/// Polish receipts almost always contain the chain name SOMEWHERE in
/// the OCR text (header logo line, NIP/REGON banner, loyalty programme
/// reference, payment-terminal merchant ID), but Azure's
/// prebuilt-receipt model and pattern matching can both miss it on:
///   - photos of crumpled / smudged thermal prints
///   - receipts where the chain name is rendered as an image rather
///     than text
///   - non-chain stores (small local groceries, bakeries) that have
///     unique names not in our STORE_PATTERNS list
///
/// We feed the top ~25 lines of OCR text to an LLM (top of the
/// receipt = headers, where merchant info lives) and ask for the most
/// likely store name. Returns null if the model can't determine one
/// confidently — the caller falls back to "Unknown Store".
export async function extractMerchantWithAI(rawText: string | null | undefined): Promise<string | null> {
  if (!rawText || typeof rawText !== 'string') return null;
  const ai = getAIClient();
  if (!ai) return null;

  // Trim to first 25 lines (chain names live at the top of receipts).
  // This also caps token usage — a full receipt can be 60+ lines.
  const headerText = rawText.split('\n').slice(0, 25).join('\n').slice(0, 1500);
  if (headerText.trim().length < 10) return null;

  try {
    const completion = await chatWithEffortRetry<Completion>(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (params) => ai.client.chat.completions.create(params as any),
      {
      ...chatParams({ model: ai.model, maxTokens: 200, json: { type: 'json_object' } }),
      messages: [
        {
          role: 'system',
          content: `Extract the store/merchant name from receipt OCR text.

Return STRICTLY: {"name":"Store Name"} or {"name":null} if you can't determine it.

Rules:
- Return the canonical chain name if recognised (e.g. "Lidl", "Biedronka", "Kaufland", "Rossmann", "Auchan", "Carrefour", "Netto", "Aldi", "Dino", "Żabka", "Stokrotka", "Tesco", "Polo Market", "Hebe", "Super-Pharm", "Pepco", "Action", "Castorama", "Leroy Merlin", "OBI", "IKEA", "Decathlon", "Media Expert", "RTV Euro AGD", "MediaMarkt", "Empik", "CCC", "Reserved", "Cropp", "Sinsay").
- For non-chain stores (local bakeries, small shops): return the actual business name from the receipt header.
- Ignore addresses, NIP/REGON numbers, dates, payment terminal IDs, "PARAGON FISKALNY" headers.
- Return null if the text contains no identifiable merchant name.
- Never invent a name. Use only what's literally in the text (or its OCR-corrupted form recognised back to its canonical chain).`,
        },
        {
          role: 'user',
          content: `Receipt OCR (first 25 lines):\n${headerText}`,
        },
      ],
    });

    const { text: result } = readContent(completion);
    if (!result) return null;
    let parsed: { name?: string | null } = {};
    try {
      parsed = JSON.parse(result);
    } catch {
      return null;
    }
    const name = (parsed.name || '').trim();
    if (!name || name.length < 2 || name.length > 60) return null;
    log(`[GPT] ✅ extractMerchantWithAI: "${name}"`);
    return name;
  } catch (error) {
    console.error('[GPT] ❌ extractMerchantWithAI error:', error);
    return null;
  }
}
