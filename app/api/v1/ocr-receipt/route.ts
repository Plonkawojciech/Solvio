// app/api/v1/ocr-receipt/route.ts - Azure Document Intelligence
import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth-compat';
import { db, receipts, expenses, categories } from '@/lib/db';
import { eq, and } from 'drizzle-orm';
import { put } from '@vercel/blob';
import OpenAI from 'openai';

export const runtime = 'nodejs';
export const maxDuration = 60; // Vercel Hobby plan limit

// Helper do logowania (mniej verbose w produkcji)
const isProduction = process.env.NODE_ENV === 'production';
const log = (message: string, ...args: any[]) => {
  if (!isProduction || message.includes('✅') || message.includes('❌') || message.includes('ERROR')) {
    console.log(message, ...args);
  }
};

const AZURE_ENDPOINT = process.env.AZURE_OCR_ENDPOINT;
const AZURE_KEY = process.env.AZURE_OCR_KEY;
const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// --- AZURE OCR ---
async function processAzureOCR(buffer: Buffer, mimeType: string) {
  if (!AZURE_ENDPOINT || !AZURE_KEY) {
    throw new Error('AZURE_OCR_ENDPOINT or AZURE_OCR_KEY not configured');
  }

  log(`[Azure] Starting OCR, buffer size: ${(buffer.length / 1024).toFixed(1)}KB`);
  const startTime = Date.now();

  // Krok 1: POST - Wyślij dokument do analizy
  const analyzeUrl = `${AZURE_ENDPOINT}formrecognizer/documentModels/prebuilt-receipt:analyze?api-version=2023-07-31`;

  log('[Azure] POST:', analyzeUrl);

  const postResponse = await fetch(analyzeUrl, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': AZURE_KEY,
      'Content-Type': mimeType,
    },
    body: new Uint8Array(buffer),
  });

  if (!postResponse.ok) {
    const errorText = await postResponse.text();
    console.error('[Azure] POST Error:', postResponse.status, errorText);
    console.error('[Azure] MIME type used:', mimeType);
    console.error('[Azure] Buffer size:', buffer.length);

    // Check for specific error types
    if (postResponse.status === 400) {
      try {
        const errorJson = JSON.parse(errorText);
        if (errorJson.error?.message?.includes('invalid') || errorJson.error?.message?.includes('type')) {
          throw new Error(`Invalid file type or format. Azure rejected the file. MIME type: ${mimeType}, Error: ${errorJson.error.message}`);
        }
      } catch {
        // Not JSON, use raw text
      }
    }

    throw new Error(`Azure POST failed: ${postResponse.status} - ${errorText}`);
  }

  // Pobierz URL do sprawdzania statusu
  const operationLocation = postResponse.headers.get('Operation-Location');
  if (!operationLocation) {
    throw new Error('Azure did not return Operation-Location header');
  }

  log('[Azure] Operation-Location:', operationLocation);

  // Krok 2: Polling - Czekaj na wynik (max 50 prób, co 1 sek = max 50 sek)
  // Vercel ma timeout 60s, więc zostawiamy margines
  let attempts = 0;
  const maxAttempts = 50;

  while (attempts < maxAttempts) {
    attempts++;
    if (attempts % 5 === 0 || attempts <= 3) {
      log(`[Azure] Polling attempt ${attempts}/${maxAttempts}...`);
    }

    await new Promise(resolve => setTimeout(resolve, 1000)); // Czekaj 1 sek

    const getResponse = await fetch(operationLocation, {
      method: 'GET',
      headers: {
        'Ocp-Apim-Subscription-Key': AZURE_KEY,
      },
    });

    if (!getResponse.ok) {
      const errorText = await getResponse.text();
      console.error('[Azure] GET Error:', errorText);
      throw new Error(`Azure GET failed: ${getResponse.status} - ${errorText}`);
    }

    const result = await getResponse.json();
    const status = result.status;

    log(`[Azure] Status: ${status}`);

    if (status === 'succeeded') {
      const duration = Date.now() - startTime;
      log(`[Azure] ✅ OCR succeeded in ${duration}ms (${attempts} attempts)`);
      return result;
    }

    if (status === 'failed') {
      throw new Error(`Azure OCR failed: ${JSON.stringify(result.error || result)}`);
    }

    // Status: running, notStarted - kontynuuj polling
  }

  throw new Error('Azure OCR timeout - exceeded max polling attempts');
}

// --- NORMALIZACJA NAZW SKLEPÓW ---
function normalizeStoreName(merchant: string | null): string {
  if (!merchant) return 'Unknown Store';

  const normalized = merchant.toLowerCase().trim();

  // Popularne sieci sklepów - rozpoznaj i znormalizuj
  const storePatterns: Array<[RegExp, string]> = [
    [/lidl/i, 'Lidl'],
    [/biedronka/i, 'Biedronka'],
    [/żabka|zabka/i, 'Żabka'],
    [/dino/i, 'Dino'],
    [/kaufland/i, 'Kaufland'],
    [/carrefour/i, 'Carrefour'],
    [/tesco/i, 'Tesco'],
    [/auchan/i, 'Auchan'],
    [/real/i, 'Real'],
    [/leclerc/i, 'Leclerc'],
    [/selgros/i, 'Selgros'],
    [/makro/i, 'Makro'],
    [/castorama/i, 'Castorama'],
    [/leroy.?merlin/i, 'Leroy Merlin'],
    [/obi/i, 'OBI'],
    [/ikea/i, 'IKEA'],
    [/mediamarkt|media.?markt/i, 'MediaMarkt'],
    [/rtv.?euro.?agd/i, 'RTV Euro AGD'],
    [/empik/i, 'Empik'],
    [/rossmann/i, 'Rossmann'],
    [/hebe/i, 'Hebe'],
    [/super.?pharm/i, 'Super-Pharm'],
    [/apteka/i, 'Apteka'],
    [/ziko/i, 'Ziko Apteka'],
    [/stokrotka/i, 'Stokrotka'],
    [/polo.?market/i, 'Polo Market'],
    [/abc/i, 'ABC'],
    [/delikatesy/i, 'Delikatesy'],
    [/spar/i, 'SPAR'],
    [/netto/i, 'Netto'],
    [/aldi/i, 'Aldi'],
    [/penny/i, 'Penny'],
    [/rewe/i, 'REWE'],
    [/e.?leclerc/i, 'E.Leclerc'],
    [/intermarche/i, 'Intermarché'],
  ];

  for (const [pattern, storeName] of storePatterns) {
    if (pattern.test(normalized)) {
      return storeName;
    }
  }

  return merchant;
}

// --- GPT EKSTRAKCJA NAZWY SKLEPU Z TEKSTU ---
async function extractStoreNameWithGPT(rawText: string): Promise<string | null> {
  if (!openai || !rawText || rawText.trim().length < 10) {
    return null;
  }

  try {
    log('[GPT Store Extraction] Próbuję wyciągnąć nazwę sklepu z tekstu...');

    const textSample = rawText.substring(0, 1000).trim();

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      temperature: 0,
      max_tokens: 100,
      messages: [
        {
          role: 'system',
          content: `Jesteś ekspertem w rozpoznawaniu i weryfikowaniu nazw sklepów z paragonów polskich. Twoim zadaniem jest ZAWSZE znaleźć dokładną, czystą nazwę sklepu w tekście paragonu.

KRYTYCZNE ZASADY:
1. Nazwa sklepu jest ZAWSZE na początku paragonu (pierwsze 3-5 linii)
2. Zwróć TYLKO czystą nazwę sklepu - bez form prawnych, bez adresów, bez "Zakupy", "Paragon", etc.
3. Rozpoznaj i zwróć dokładną nazwę popularnych sieci (używaj dokładnie tych nazw):
   - Lidl (NIE "LIDL", "lidl", "Lidl Market" - TYLKO "Lidl")
   - Biedronka (NIE "BIEDRONKA" - TYLKO "Biedronka")
   - Żabka (NIE "ZABKA", "ŻABKA" - TYLKO "Żabka")
   - Dino, Kaufland, Carrefour, Tesco, Auchan, Real, Leclerc, Selgros, Makro
   - Castorama, Leroy Merlin, OBI, IKEA, MediaMarkt, RTV Euro AGD
   - Empik, Rossmann, Hebe, Super-Pharm, Stokrotka, Polo Market, ABC, SPAR, Netto, Aldi, Penny, REWE

4. WAŻNE - rozpoznawanie błędów OCR:
   - "STOWT LIDL" → "Lidl" (STOWT to błąd OCR)
   - "OWT LIDL" → "Lidl" (OWT to błąd OCR)
   - "LIDL SP. Z O.O." → "Lidl"
   - "BIEDRONKA - Zakupy" → "Biedronka"
   - "ŻABKA 123" → "Żabka"

5. Jeśli widzisz znaną sieć (nawet z błędami OCR), ZAWSZE zwróć jej poprawną nazwę
6. Jeśli nie rozpoznajesz, zwróć najczystszą możliwą nazwę sklepu
7. Jeśli NAPRAWDĘ nie możesz znaleźć nazwy sklepu, zwróć "null"

ZWRÓĆ TYLKO NAZWĘ SKLEPU - bez dodatkowych słów, bez wyjaśnień.`,
        },
        {
          role: 'user',
          content: `Znajdź i zweryfikuj nazwę sklepu w tym tekście paragonu. Zwróć TYLKO czystą nazwę sklepu:

${textSample}

Nazwa sklepu:`,
        },
      ],
    });

    const response = completion.choices[0]?.message?.content?.trim() || null;

    if (response && response.toLowerCase() !== 'null' && response.length > 1 && response.length < 100) {
      log(`[GPT Store Extraction] ✅ Znaleziono nazwę sklepu: "${response}"`);
      return response;
    }

    log(`[GPT Store Extraction] ❌ Nie znaleziono nazwy sklepu (odpowiedź: "${response}")`);
    return null;
  } catch (error) {
    console.error('[GPT Store Extraction] Błąd:', error);
    return null;
  }
}

// --- EKSTRAKCJA DANYCH ---
async function extractReceiptData(azureResult: any) {
  const document = azureResult.analyzeResult?.documents?.[0];
  if (!document) {
    throw new Error('No document found in Azure result');
  }

  const fields = document.fields || {};

  let total: number | null = null;

  if (fields.Total?.valueNumber !== undefined && fields.Total?.valueNumber !== null) {
    total = fields.Total.valueNumber;
    log(`[Total Extraction] Użyto Total (kwota finalna): ${total}`);
  } else if (fields.Total?.valueString && typeof fields.Total.valueString === 'string') {
    try {
      const totalStr = fields.Total.valueString.replace(/[^\d.,-]/g, '').replace(',', '.');
      total = parseFloat(totalStr) || null;
      if (total !== null) {
        log(`[Total Extraction] Użyto Total (kwota finalna) z stringa: ${total}`);
      }
    } catch {
      total = null;
    }
  }

  if (total === null) {
    const subtotal = fields.Subtotal?.valueNumber ?? null;
    const totalTax = fields.TotalTax?.valueNumber ?? null;

    if (subtotal !== null && totalTax !== null) {
      total = subtotal + totalTax;
      log(`[Total Extraction] Użyto Subtotal (${subtotal}) + TotalTax (${totalTax}) = ${total}`);
    } else if (subtotal !== null) {
      total = subtotal;
      log(`[Total Extraction] Użyto Subtotal jako kwota finalna: ${total}`);
    }
  }

  if (total === null) {
    const amountDue = fields.AmountDue?.valueNumber ?? null;
    if (amountDue !== null) {
      total = amountDue;
      log(`[Total Extraction] Użyto AmountDue: ${total}`);
    }
  }

  let merchant = null;

  merchant = fields.MerchantName?.valueString ||
             fields.MerchantName?.content ||
             fields.MerchantName?.valueContent?.content;

  if (!merchant && fields.MerchantAddress) {
    const addr = fields.MerchantAddress.valueString ||
                 fields.MerchantAddress.content ||
                 fields.MerchantAddress.valueContent?.content ||
                 '';
    const firstLine = addr.split(/[,\n]/)[0]?.trim();
    if (firstLine && firstLine.length > 2 && firstLine.length < 60) {
      merchant = firstLine;
    }
  }

  if (!merchant && azureResult.analyzeResult?.content) {
    const content = azureResult.analyzeResult.content;
    const lines = content.split('\n').filter((l: string) => l.trim().length > 0);
    for (let i = 0; i < Math.min(5, lines.length); i++) {
      const line = lines[i].trim();
      if (!line.match(/^\d{2}[.\-/]\d{2}[.\-/]\d{2,4}/) &&
          !line.match(/^\d{2}:\d{2}/) &&
          !line.match(/NIP|REGON|KRS/i) &&
          !line.match(/^\d{2}-\d{3}$/) &&
          !line.match(/^[A-Z]{2,3}\s*\d+/) &&
          line.length > 2 &&
          line.length < 60 &&
          !line.match(/^[A-Z\s]{20,}$/)) {
        merchant = line;
        break;
      }
    }
  }

  const date = fields.TransactionDate?.valueDate ?? null;
  const time = fields.TransactionTime?.valueTime ?? null;
  const currency = fields.Total?.valueCurrency?.currencyCode ?? 'PLN';

  let extractedMerchant = merchant;
  log(`[Store Extraction] Oryginalna nazwa z Azure: "${extractedMerchant}"`);

  if (extractedMerchant) {
    extractedMerchant = extractedMerchant
      .replace(/^OWT\s*/i, '')
      .replace(/^STOWT\s*/i, '')
      .trim();
  }

  if (azureResult.analyzeResult?.content) {
    log(`[Store Extraction] 🔍 Wysyłam do GPT do weryfikacji nazwy sklepu...`);
    const gptStoreName = await extractStoreNameWithGPT(azureResult.analyzeResult.content);

    if (gptStoreName && gptStoreName !== 'Unknown Store' && gptStoreName.toLowerCase() !== 'null') {
      merchant = gptStoreName;
      log(`[Store Extraction] ✅ GPT zweryfikował i poprawił nazwę sklepu: "${merchant}"`);
    } else if (extractedMerchant && extractedMerchant.length >= 2) {
      merchant = normalizeStoreName(extractedMerchant);
      log(`[Store Extraction] GPT nie znalazło, używam znormalizowanej nazwy z Azure: "${merchant}"`);
    } else {
      merchant = 'Unknown Store';
      log(`[Store Extraction] ❌ Nie znaleziono nazwy sklepu`);
    }
  } else if (extractedMerchant && extractedMerchant.length >= 2) {
    merchant = normalizeStoreName(extractedMerchant);
    log(`[Store Extraction] Brak rawText, używam znormalizowanej nazwy: "${merchant}"`);
  } else {
    merchant = 'Unknown Store';
    log(`[Store Extraction] ❌ Brak danych do ekstrakcji nazwy sklepu`);
  }

  if (merchant && merchant !== 'Unknown Store') {
    const finalNormalized = normalizeStoreName(merchant);
    if (finalNormalized !== merchant && finalNormalized !== 'Unknown Store') {
      merchant = finalNormalized;
      log(`[Store Normalization] ✅ Finalna normalizacja: "${merchant}"`);
    }
  }

  log(`[Store Extraction] ✅ Finalna nazwa sklepu: "${merchant}"`);

  const items: Array<{
    name: string;
    quantity: number | null;
    price: number | null;
  }> = [];

  const itemsField = fields.Items?.valueArray;
  if (itemsField && Array.isArray(itemsField)) {
    for (const item of itemsField) {
      const itemObj = item.valueObject || {};

      let name =
        itemObj.Description?.content ??
        itemObj.Description?.valueString ??
        itemObj.Name?.content ??
        itemObj.Name?.valueString ??
        itemObj.ProductName?.content ??
        itemObj.ProductName?.valueString ??
        itemObj.ItemDescription?.content ??
        itemObj.ItemDescription?.valueString ??
        null;

      if (!name || name.length < 2) {
        const allText = [
          itemObj.Description?.content,
          itemObj.Description?.valueString,
          itemObj.Name?.content,
          itemObj.Name?.valueString,
        ].filter(Boolean).join(' ');

        if (allText.trim().length > 0) {
          name = allText.trim();
        }
      }

      if (!name || name.length < 2) {
        name = 'Nieznany produkt';
      }

      name = name
        .replace(/\s+/g, ' ')
        .trim();

      let quantity = itemObj.Quantity?.valueNumber ?? null;

      if (quantity === null && itemObj.Quantity?.valueString && typeof itemObj.Quantity.valueString === 'string') {
        try {
          quantity = parseFloat(itemObj.Quantity.valueString.replace(',', '.')) || null;
        } catch {
          quantity = null;
        }
      }

      let price: number | null = null;

      if (itemObj.TotalPrice?.valueNumber !== undefined && itemObj.TotalPrice?.valueNumber !== null) {
        price = itemObj.TotalPrice.valueNumber;
      } else if (itemObj.TotalPrice?.valueString && typeof itemObj.TotalPrice.valueString === 'string') {
        try {
          const priceStr = itemObj.TotalPrice.valueString.replace(/[^\d.,-]/g, '').replace(',', '.');
          price = parseFloat(priceStr) || null;
        } catch {
          price = null;
        }
      }

      if (price === null) {
        if (itemObj.Price?.valueNumber !== undefined && itemObj.Price?.valueNumber !== null) {
          price = itemObj.Price.valueNumber;
        } else if (itemObj.Price?.valueString && typeof itemObj.Price.valueString === 'string') {
          try {
            const priceStr = itemObj.Price.valueString.replace(/[^\d.,-]/g, '').replace(',', '.');
            price = parseFloat(priceStr) || null;
          } catch {
            price = null;
          }
        }
      }

      items.push({ name, quantity, price });
    }
  }

  if (items.length === 0 && azureResult.analyzeResult?.content) {
    log('[Azure] No items found in structured data, trying to extract from raw text...');
  }

  log(`[Azure] Extracted data: Merchant="${merchant}", Total=${total} ${currency}, Date=${date}, Items=${items.length}`);

  return { total, merchant, date, time, currency, items };
}

// --- KATEGORYZACJA WSZYSTKICH ITEMS JEDNYM WYWOŁANIEM ---
async function categorizeAllItems(
  items: Array<{ name: string; quantity: number | null; price: number | null }>,
  cats: Array<{ id: string; name: string }>
): Promise<Array<{ name: string; quantity: number | null; price: number | null; category_id: string | null }>> {
  if (!openai) {
    console.warn('[GPT] OpenAI client not available - OPENAI_API_KEY missing?');
    return items.map(item => ({ ...item, category_id: null }));
  }

  if (!cats.length) {
    console.warn('[GPT] ⚠️ No categories available - cannot categorize items');
    return items.map(item => ({ ...item, category_id: null }));
  }

  if (items.length === 0) {
    log('[GPT] No items to categorize');
    return items.map(item => ({ ...item, category_id: null }));
  }

  try {
    log(`[GPT] 🎯 Kategoryzacja ${items.length} produktów (batch)...`);

    const validCategories = cats.filter(c => c.id && c.name);
    if (validCategories.length === 0) {
      console.error('[GPT] ❌ No valid categories available!');
      return items.map(item => ({ ...item, category_id: null }));
    }

    const categoriesToUse = validCategories;

    const categoryMap = categoriesToUse.map(c => `${c.name}: ${c.id}`).join('\n');
    const itemsList = items.map((item, idx) => `${idx + 1}. ${item.name}`).join('\n');

    log(`[GPT] Sending request to OpenAI (model: gpt-4o, items: ${items.length}, categories: ${categoriesToUse.length})...`);

    const startTime = Date.now();
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      temperature: 0,
      max_tokens: 1000,
      messages: [
        {
          role: 'system',
          content: `Jesteś ekspertem w kategoryzacji produktów z paragonów polskich sklepów. Twoim zadaniem jest przypisanie każdego produktu do NAJLEPIEJ PASUJĄCEJ kategorii.

DOSTĘPNE KATEGORIE (każda ma UUID):
${categoryMap}

INSTRUKCJE KATEGORYZACJI - PRZYPISZ DO NAJLEPIEJ PASUJĄCEJ:

🍔 FOOD - TYLKO jedzenie z restauracji/kawiarni/fast foodów:
   - Restauracje, fast food, jedzenie na wynos, food delivery
   - Pizza, sushi, kebab, burgery, frytki, hot dogi, zapiekanki
   - Obiady, śniadania, kolacje w restauracjach
   - Kawa, herbata, napoje w kawiarniach/restauracjach (NIE woda z supermarketu!)
   - NIE: produkty spożywcze z supermarketu (to GROCERIES!)

🛒 GROCERIES - Wszystkie produkty spożywcze i artykuły z supermarketu/sklepu:
   - Mięso, wędliny, ryby, owoce morza
   - Nabiał: mleko, ser, jogurt, masło, śmietana, jajka
   - Warzywa, owoce, pieczywo
   - Produkty sypkie: mąka, cukier, sól, ryż, makaron, kasza
   - Napoje: woda, soki, napoje gazowane
   - Artykuły gospodarstwa domowego, środki czystości

💊 HEALTH - Apteka, leki, kosmetyki pielęgnacyjne
🚗 TRANSPORT - Paliwo, transport, samochód
🛍️ SHOPPING - Ubrania, moda, kosmetyki dekoracyjne
📱 ELECTRONICS - Elektronika i akcesoria
🏠 HOME & GARDEN - Dom, ogród, wyposażenie
🎬 ENTERTAINMENT - Rozrywka, hobby, sport
💡 BILLS & UTILITIES - Rachunki, abonamenty
📦 OTHER - Wszystko inne

KRYTYCZNE ZASADY:
1. Produkty spożywcze z supermarketu → GROCERIES (NIE Food!)
2. Restauracje, fast food → FOOD
3. Kosmetyki pielęgnacyjne → HEALTH
4. Kosmetyki dekoracyjne → SHOPPING

ZWRÓĆ TYLKO tablicę JSON z UUID kategorii: ["uuid1", "uuid2", null, "uuid3", ...]`
        },
        {
          role: 'user',
          content: `Przypisz kategorię do każdego produktu z paragonu. Zwróć tablicę JSON z UUID kategorii w tej samej kolejności co produkty.

Produkty do kategoryzacji:
${itemsList}

Zwróć TYLKO tablicę JSON: ["uuid1", "uuid2", null, "uuid3", ...]`
        },
      ],
    });

    const duration = Date.now() - startTime;
    log(`[GPT] ✅ OpenAI response received in ${duration}ms`);

    const result = completion.choices[0]?.message?.content?.trim() ?? null;
    if (!result) {
      console.error('[GPT] ❌ No response from OpenAI');
      return items.map(item => ({ ...item, category_id: null }));
    }

    let jsonStr = result;

    if (jsonStr.includes('```')) {
      const match = jsonStr.match(/```(?:json)?\s*(\[[\s\S]*?\])\s*```/);
      if (match) {
        jsonStr = match[1];
      } else {
        const arrayMatch = jsonStr.match(/\[[\s\S]*?\]/);
        if (arrayMatch) {
          jsonStr = arrayMatch[0];
        }
      }
    }

    let categoryIds: (string | null)[] = [];
    try {
      categoryIds = JSON.parse(jsonStr) as (string | null)[];
      log(`[GPT] ✅ Parsed ${categoryIds.length} category IDs`);

      const validCategoryIds = categoryIds.filter(id =>
        id === null || (typeof id === 'string' && categoriesToUse.some(c => c.id === id))
      );

      if (validCategoryIds.length !== categoryIds.length) {
        console.warn(`[GPT] ⚠️ Some category IDs are invalid. Valid: ${validCategoryIds.length}/${categoryIds.length}`);
        categoryIds = categoryIds.map(id =>
          (id === null || (typeof id === 'string' && categoriesToUse.some(c => c.id === id))) ? id : null
        );
      }
    } catch (parseError) {
      console.error('[GPT] ❌ JSON parse error:', parseError);

      try {
        const arrayMatch = result.match(/\[[\s\S]*?\]/);
        if (arrayMatch) {
          categoryIds = JSON.parse(arrayMatch[0]) as (string | null)[];
          log('[GPT] ✅ Recovered JSON using fallback extraction');
        } else {
          throw new Error('No JSON array found in response');
        }
      } catch (fallbackError) {
        console.error('[GPT] ❌ Fallback extraction also failed:', fallbackError);
        return items.map(item => ({ ...item, category_id: null }));
      }
    }

    if (categoryIds.length !== items.length) {
      console.warn(`[GPT] ⚠️ Category count mismatch: expected ${items.length}, got ${categoryIds.length}`);
      while (categoryIds.length < items.length) {
        categoryIds.push(null);
      }
      categoryIds = categoryIds.slice(0, items.length);
    }

    const categorized = items.map((item, idx) => {
      const catId = categoryIds[idx] || null;
      const validCatId = catId && categoriesToUse.some(c => c.id === catId) ? catId : null;
      return {
        ...item,
        category_id: validCatId,
      };
    });

    const assignedCount = categorized.filter(c => c.category_id !== null).length;
    log(`[GPT] ✅ Assigned categories to ${assignedCount}/${items.length} items`);

    return categorized;

  } catch (error) {
    console.error('[GPT] ❌ Batch categorization error:', error);
    return items.map(item => ({ ...item, category_id: null }));
  }
}

// --- GŁÓWNY ENDPOINT ---
export async function POST(req: NextRequest) {
  log('\n[OCR] 🧾 AZURE DOCUMENT INTELLIGENCE OCR - request received');

  // AUTH CHECK
  const { userId: authUserId } = await auth();
  if (!authUserId) {
    return json({ error: 'Unauthorized' }, 401);
  }

  // WERYFIKACJA ZMIENNYCH ŚRODOWISKOWYCH
  const missingEnvVars: string[] = [];
  if (!process.env.AZURE_OCR_ENDPOINT) missingEnvVars.push('AZURE_OCR_ENDPOINT');
  if (!process.env.AZURE_OCR_KEY) missingEnvVars.push('AZURE_OCR_KEY');
  if (!process.env.OPENAI_API_KEY) missingEnvVars.push('OPENAI_API_KEY');
  if (!process.env.DATABASE_URL) missingEnvVars.push('DATABASE_URL');

  if (missingEnvVars.length > 0) {
    console.error('[OCR] ❌ Missing environment variables:', missingEnvVars);
    return json({
      error: 'Server configuration error',
      message: `Missing environment variables: ${missingEnvVars.join(', ')}. Please configure them in Vercel dashboard.`,
      missing: missingEnvVars
    }, 500);
  }

  log('[OCR] ✅ Environment variables verified');

  let receiptId: string | null = null;
  let userId: string | null = authUserId;

  try {
    // 1. Pobierz dane z formularza
    const form = await req.formData();
    receiptId = form.get('receiptId') as string;
    const files = form.getAll('files') as File[];

    log(`[OCR] Form data received: receiptId=${receiptId}, files=${files.length}`);

    if (!files.length) {
      console.error('[OCR] Missing required field: files');
      return json({ error: 'Missing required fields', missing: ['files'] }, 400);
    }

    // If no receiptId provided, create one now
    if (!receiptId) {
      const [newReceipt] = await db.insert(receipts).values({
        userId,
        status: 'processing',
      }).returning();
      if (!newReceipt) {
        return json({ error: 'Failed to create receipt record' }, 500);
      }
      receiptId = newReceipt.id;
      log(`[OCR] Auto-created receipt ID: ${receiptId}`);
    }

    log(`[OCR] Processing ${files.length} file(s) for receipt ${receiptId}`);

    // 2. Pobierz kategorie
    const cats = await db.select().from(categories).where(eq(categories.userId, userId));

    log(`[OCR] ✅ Loaded ${cats?.length || 0} categories`);
    if (!cats || cats.length === 0) {
      console.warn('[OCR] ⚠️ No categories found in database!');
    }

    // 3. PRZETWÓRZ WSZYSTKIE PLIKI PO KOLEI
    const results = [];
    let currentReceiptId = receiptId; // Pierwszy plik używa istniejącego receipt_id

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      log(`[OCR] 📦 Processing file ${i + 1}/${files.length}: ${file.name}`);

      // Dla kolejnych plików, utwórz nowy receipt
      if (i > 0) {
        const [newReceipt] = await db.insert(receipts).values({
          userId,
          status: 'processing',
        }).returning();

        if (!newReceipt) {
          console.error(`[File ${i + 1}] Failed to create receipt`);
          results.push({ file: file.name, success: false, error: 'Failed to create receipt' });
          continue;
        }

        currentReceiptId = newReceipt.id;
        log(`[File ${i + 1}] Created new receipt ID: ${currentReceiptId}`);
      }

      try {
        // Validate file size first
        if (file.size === 0) {
          console.error(`[File ${i + 1}] File is empty: ${file.name}`);
          results.push({
            file: file.name,
            success: false,
            error: 'empty_file',
            message: 'File is empty (0 bytes)'
          });
          continue;
        }

        if (file.size > 10 * 1024 * 1024) { // 10MB hard limit
          console.error(`[File ${i + 1}] File too large: ${file.name}, size: ${(file.size / 1024 / 1024).toFixed(2)}MB`);
          results.push({
            file: file.name,
            success: false,
            error: 'file_too_large',
            message: `File is too large: ${(file.size / 1024 / 1024).toFixed(2)}MB. Maximum is 10MB.`
          });
          continue;
        }

        const buffer = Buffer.from(await file.arrayBuffer());

        if (buffer.length === 0) {
          console.error(`[File ${i + 1}] Buffer is empty after conversion: ${file.name}`);
          results.push({
            file: file.name,
            success: false,
            error: 'empty_buffer',
            message: 'File buffer is empty'
          });
          continue;
        }

        // Validate and normalize MIME type
        let mimeType = file.type || 'image/jpeg';
        const fileName = file.name.toLowerCase();

        if (!mimeType || mimeType === 'application/octet-stream') {
          if (fileName.match(/\.(jpg|jpeg)$/)) {
            mimeType = 'image/jpeg';
          } else if (fileName.match(/\.png$/)) {
            mimeType = 'image/png';
          } else if (fileName.match(/\.webp$/)) {
            mimeType = 'image/webp';
          } else if (fileName.match(/\.pdf$/)) {
            mimeType = 'application/pdf';
          } else {
            mimeType = 'image/jpeg';
          }
        }

        const supportedTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
        if (!supportedTypes.includes(mimeType)) {
          console.error(`[File ${i + 1}] Unsupported file type: ${mimeType} for file ${file.name}`);
          results.push({
            file: file.name,
            success: false,
            error: 'invalid_type',
            message: `Unsupported file type: ${mimeType}. Supported: JPEG, PNG, WebP, PDF.`
          });
          continue;
        }

        log(`[File ${i + 1}] File type: ${mimeType}, size: ${(buffer.length / 1024).toFixed(1)}KB`);

        // Basic image header validation
        if (mimeType.startsWith('image/')) {
          const header = buffer.slice(0, 4);
          const isValidImage =
            (header[0] === 0xFF && header[1] === 0xD8) || // JPEG
            (header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4E && header[3] === 0x47) || // PNG
            (header[0] === 0x52 && header[1] === 0x49 && header[2] === 0x46 && header[3] === 0x46); // WebP (RIFF)

          if (!isValidImage) {
            console.warn(`[File ${i + 1}] Warning: File header doesn't match declared type ${mimeType}, but continuing...`);
          }
        }

        // 4. Upload to Vercel Blob for storage
        let imageUrl: string | null = null;
        try {
          const blobResult = await put(`receipts/${userId}/${currentReceiptId}/${file.name}`, buffer, {
            access: 'public',
            contentType: mimeType,
          });
          imageUrl = blobResult.url;
          log(`[File ${i + 1}] ✅ Uploaded to Blob: ${imageUrl}`);
        } catch (blobErr) {
          console.warn(`[File ${i + 1}] ⚠️ Blob upload failed (non-fatal):`, blobErr);
        }

        // 5. Azure OCR
        const azureResult = await processAzureOCR(buffer, mimeType);
        const { total, merchant, date, time, currency, items } = await extractReceiptData(azureResult);

        // 6. Przygotuj dane do zapisu
        const finalTotal = total ?? 0;
        const finalDate = date || new Date().toISOString().split('T')[0];
        const finalMerchant = merchant || 'Unknown Store';

        // 7. WYKRYWANIE DUPLIKATÓW
        log(`[File ${i + 1}] [Duplicate Check] Checking for duplicates...`);

        const existingReceipts = await db.select().from(receipts)
          .where(and(
            eq(receipts.userId, userId),
            eq(receipts.vendor, finalMerchant),
            eq(receipts.status, 'processed')
          ))
          .limit(10);

        const matchingReceipt = existingReceipts.find(r =>
          r.total === String(finalTotal) && r.date === finalDate
        );

        if (matchingReceipt) {
          // Sprawdź czy istnieje aktywny expense dla tego receipt
          const existingExpenses = await db.select().from(expenses)
            .where(and(
              eq(expenses.receiptId, matchingReceipt.id),
              eq(expenses.userId, userId)
            ))
            .limit(1);

          if (existingExpenses.length > 0) {
            log(`[File ${i + 1}] [Duplicate Check] ❌ DUPLICATE FOUND!`);

            // Delete current receipt (duplicate)
            await db.delete(receipts).where(eq(receipts.id, currentReceiptId));

            results.push({
              file: file.name,
              success: false,
              error: 'duplicate',
              message: `This receipt was already uploaded on ${new Date(matchingReceipt.createdAt).toLocaleDateString()}`,
            });
            continue;
          } else {
            log(`[File ${i + 1}] [Duplicate Check] ⚠️ Receipt exists but was deleted - allowing re-upload`);
          }
        }

        log(`[File ${i + 1}] [Duplicate Check] ✅ No active duplicates found`);

        log(`[File ${i + 1}] 💾 Saving to database...`);

        // 8. Update receipt record
        await db.update(receipts)
          .set({
            status: 'processed',
            vendor: finalMerchant,
            date: finalDate,
            total: String(finalTotal),
            currency: currency,
            imageUrl: imageUrl,
            items: items.map(item => ({ ...item, category_id: null })) as any,
          })
          .where(and(eq(receipts.id, currentReceiptId), eq(receipts.userId, userId)));

        log(`[File ${i + 1}] ✅ Receipt updated`);

        // 9. Delete old expenses for this receipt
        await db.delete(expenses).where(
          and(
            eq(expenses.receiptId, currentReceiptId),
            eq(expenses.userId, userId)
          )
        );

        // 10. Insert new expense
        await db.insert(expenses).values({
          userId,
          receiptId: currentReceiptId,
          title: `${finalMerchant} - Zakupy`,
          amount: String(finalTotal),
          date: finalDate,
          vendor: finalMerchant,
          categoryId: null,
        });

        log(`[File ${i + 1}] ✅ Expense created`);

        // 11. KATEGORIE W TLE (nie czekamy!)
        const categoriesForCategorization = cats || [];
        log(`[File ${i + 1}] [Background] Starting categorization for ${items.length} items...`);

        categorizeAllItems(items, categoriesForCategorization.map(c => ({ id: c.id, name: c.name })))
          .then(async (categorizedItems) => {
            log(`[File ${i + 1}] [Background] ✅ Kategorie gotowe - aktualizacja...`);

            await db.update(receipts)
              .set({ items: categorizedItems as any })
              .where(eq(receipts.id, currentReceiptId));

            log(`[File ${i + 1}] [Background] ✅ Kategorie zapisane!`);
          })
          .catch((err) => {
            console.error(`[File ${i + 1}] [Background] ❌ Category error:`, err);
          });

        // AI enrichment — categorize items and suggest metadata (non-blocking)
        let aiEnrichment = null;
        try {
          if (openai && items.length > 0) {
            const itemsList = items.map((item: any, i: number) =>
              `${i + 1}. ${item.name} - ${item.price ?? 0} ${currency}`
            ).join('\n');

            const aiRes = await openai.chat.completions.create({
              model: 'gpt-4o-mini',
              messages: [{
                role: 'user',
                content: `Analyze this receipt from "${finalMerchant}". Categorize each item and suggest metadata.\n\nItems:\n${itemsList}\n\nReturn JSON: {"items": [{"index": 1, "suggestedCategory": "Food/Groceries/Health/Transport/Shopping/Electronics/Home/Entertainment/Bills/Other", "confidence": 0.0}], "vendor": "normalized store name", "receiptType": "grocery/pharmacy/restaurant/clothing/electronics/other", "tags": ["tag1","tag2"]}`,
              }],
              response_format: { type: 'json_object' },
              max_tokens: 600,
              temperature: 0.2,
            });
            aiEnrichment = JSON.parse(aiRes.choices[0]?.message?.content || '{}');
          }
        } catch {
          /* non-critical */
        }

        results.push({
          file: file.name,
          success: true,
          receipt_id: currentReceiptId,
          data: {
            merchant: finalMerchant,
            total: finalTotal,
            currency,
            date: finalDate,
            time,
            items_count: items.length,
            items: items,
            aiEnrichment,
          },
        });

        log(`[File ${i + 1}] ✅ SUCCESS!`);

      } catch (fileError) {
        console.error(`[File ${i + 1}] ❌ ERROR:`, fileError);

        let errorMessage = 'Unknown error';
        let errorType = 'unknown';

        if (fileError instanceof Error) {
          errorMessage = fileError.message;

          if (errorMessage.includes('Azure POST failed: 400')) {
            errorType = 'azure_invalid_format';
            errorMessage = 'Azure rejected the file format. The image may be corrupted or in an unsupported format.';
          } else if (errorMessage.includes('Invalid file type')) {
            errorType = 'invalid_type';
          } else if (errorMessage.includes('empty')) {
            errorType = 'empty_file';
          } else if (errorMessage.includes('too large')) {
            errorType = 'file_too_large';
          }
        }

        results.push({
          file: file.name,
          success: false,
          error: errorType,
          message: errorMessage,
        });
      }
    }

    // Zwróć wyniki dla wszystkich plików
    const successCount = results.filter(r => r.success).length;

    const allFailed = successCount === 0 && results.length > 0;
    const criticalError = allFailed && results.some((r: any) =>
      r.error === 'empty_file' ||
      r.error === 'file_too_large' ||
      r.error === 'invalid_type' ||
      r.error === 'azure_invalid_format'
    );

    return json({
      success: successCount > 0,
      files_processed: results.length,
      files_succeeded: successCount,
      files_failed: results.length - successCount,
      results: results,
      receipt_id: receiptId,
    }, criticalError ? 400 : 200);

  } catch (error) {
    console.error('[OCR] ❌ Unhandled error:', error);

    // Mark receipt as failed
    if (receiptId && userId) {
      try {
        await db.update(receipts)
          .set({
            status: 'failed',
          })
          .where(and(eq(receipts.id, receiptId), eq(receipts.userId, userId)));
      } catch (updateError) {
        console.error('[DB] Failed to update receipt status:', updateError);
      }
    }

    return json(
      {
        error: error instanceof Error ? error.message : 'Unknown error',
        success: false
      },
      500
    );
  }
}
