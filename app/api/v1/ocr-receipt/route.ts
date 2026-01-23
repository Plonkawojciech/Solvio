// app/api/v1/ocr-receipt/route.ts - Azure Document Intelligence
import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
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

  console.log(`[Azure] Starting OCR, buffer size: ${(buffer.length / 1024).toFixed(1)}KB`);
  const startTime = Date.now();

  // Krok 1: POST - Wyślij dokument do analizy
  const analyzeUrl = `${AZURE_ENDPOINT}formrecognizer/documentModels/prebuilt-receipt:analyze?api-version=2023-07-31`;
  
  console.log('[Azure] POST:', analyzeUrl);
  
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

  console.log('[Azure] Operation-Location:', operationLocation);

  // Krok 2: Polling - Czekaj na wynik (max 50 prób, co 1 sek = max 50 sek)
  // Vercel ma timeout 60s, więc zostawiamy margines
  let attempts = 0;
  const maxAttempts = 50;
  
  while (attempts < maxAttempts) {
    attempts++;
    if (attempts % 5 === 0 || attempts <= 3) {
      console.log(`[Azure] Polling attempt ${attempts}/${maxAttempts}...`);
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

    console.log(`[Azure] Status: ${status}`);

    if (status === 'succeeded') {
      const duration = Date.now() - startTime;
      console.log(`[Azure] ✅ OCR succeeded in ${duration}ms (${attempts} attempts)`);
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
  // Używamy regex, który znajdzie nazwę nawet w środku tekstu (np. "STOWT LIDL" → "Lidl")
  const storePatterns: Array<[RegExp, string]> = [
    [/lidl/i, 'Lidl'], // Rozpozna "LIDL", "lidl", "Lidl" nawet w "STOWT LIDL" czy "OWT LIDL SP. Z O.O."
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
  
  // Sprawdź czy nazwa zawiera wzorzec popularnej sieci
  for (const [pattern, storeName] of storePatterns) {
    if (pattern.test(normalized)) {
      return storeName;
    }
  }
  
  // Jeśli nie znaleziono popularnej sieci, zwróć oryginalną (po czyszczeniu)
  return merchant;
}

// --- GPT EKSTRAKCJA NAZWY SKLEPU Z TEKSTU ---
async function extractStoreNameWithGPT(rawText: string): Promise<string | null> {
  if (!openai || !rawText || rawText.trim().length < 10) {
    return null;
  }

  try {
    console.log('[GPT Store Extraction] Próbuję wyciągnąć nazwę sklepu z tekstu...');
    
    // Weź pierwsze 1000 znaków tekstu (zwykle tam jest nazwa sklepu)
    const textSample = rawText.substring(0, 1000).trim();
    
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      temperature: 0,
      max_tokens: 100, // Zwiększone, aby GPT miało więcej miejsca na odpowiedź
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

6. Jeśli nie rozpoznajesz znanej sieci, zwróć najczystszą możliwą nazwę sklepu:
   - Usuń formy prawne: "sp. z o.o.", "S.A.", "sp.k."
   - Usuń prefiksy błędów OCR: "OWT", "STOWT"
   - Usuń sufiksy: "- Zakupy", "- Paragon", "Zakupy", "Paragon"
   - Usuń adresy, kody pocztowe, NIP, REGON
   - Zwróć tylko główną nazwę sklepu

7. Jeśli NAPRAWDĘ nie możesz znaleźć nazwy sklepu, zwróć "null"

PRZYKŁADY POPRAWNEJ EKSTRAKCJI:
- "STOWT LIDL SP. Z O.O. ul. Warszawska 123" → "Lidl"
- "OWT LIDL" → "Lidl"
- "BIEDRONKA - Zakupy" → "Biedronka"
- "ŻABKA 123" → "Żabka"
- "Kaufland Polska Sp. z o.o." → "Kaufland"
- "Carrefour Market" → "Carrefour"
- "ABC Delikatesy" → "ABC"
- "Sklep XYZ sp. z o.o." → "Sklep XYZ" (jeśli to nie znana sieć)

ZWRÓĆ TYLKO NAZWĘ SKLEPU - bez dodatkowych słów, bez wyjaśnień.`,
        },
        {
          role: 'user',
          content: `Znajdź i zweryfikuj nazwę sklepu w tym tekście paragonu. Zwróć TYLKO czystą nazwę sklepu (bez form prawnych, bez błędów OCR, bez dodatkowych słów):

${textSample}

Nazwa sklepu:`,
        },
      ],
    });

    const response = completion.choices[0]?.message?.content?.trim() || null;
    
    if (response && response.toLowerCase() !== 'null' && response.length > 1 && response.length < 100) {
      console.log(`[GPT Store Extraction] ✅ Znaleziono nazwę sklepu: "${response}"`);
      return response;
    }
    
    console.log(`[GPT Store Extraction] ❌ Nie znaleziono nazwy sklepu (odpowiedź: "${response}")`);
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

  // Total - KWOTA FINALNA DO ZAPŁATY (po podatku)
  // Priorytet: Total (kwota finalna) > Subtotal + TotalTax > Subtotal
  let total: number | null = null;
  
  // 1. Priorytet: Total (kwota finalna do zapłaty - PO PODATKU)
  if (fields.Total?.valueNumber !== undefined && fields.Total?.valueNumber !== null) {
    total = fields.Total.valueNumber;
    console.log(`[Total Extraction] Użyto Total (kwota finalna): ${total}`);
  } else if (fields.Total?.valueString && typeof fields.Total.valueString === 'string') {
    try {
      const totalStr = fields.Total.valueString.replace(/[^\d.,-]/g, '').replace(',', '.');
      total = parseFloat(totalStr) || null;
      if (total !== null) {
        console.log(`[Total Extraction] Użyto Total (kwota finalna) z stringa: ${total}`);
      }
    } catch {
      total = null;
    }
  }
  
  // 2. Fallback: Jeśli Total nie istnieje, użyj Subtotal + TotalTax (kwota przed podatkiem + podatek = kwota finalna)
  if (total === null) {
    const subtotal = fields.Subtotal?.valueNumber ?? null;
    const totalTax = fields.TotalTax?.valueNumber ?? null;
    
    if (subtotal !== null && totalTax !== null) {
      total = subtotal + totalTax;
      console.log(`[Total Extraction] Użyto Subtotal (${subtotal}) + TotalTax (${totalTax}) = ${total}`);
    } else if (subtotal !== null) {
      // Jeśli nie ma podatku, użyj Subtotal (może być to już kwota finalna)
      total = subtotal;
      console.log(`[Total Extraction] Użyto Subtotal jako kwota finalna: ${total}`);
    }
  }
  
  // 3. Ostateczny fallback: sprawdź czy są inne pola z kwotą finalną
  if (total === null) {
    // Sprawdź inne możliwe pola (np. AmountDue, FinalAmount, itp.)
    const amountDue = fields.AmountDue?.valueNumber ?? null;
    if (amountDue !== null) {
      total = amountDue;
      console.log(`[Total Extraction] Użyto AmountDue: ${total}`);
    }
  }
  
  // ULEPSZONA EKSTRAKCJA NAZWY SKLEPU - sprawdź wszystkie możliwe źródła
  let merchant = null;
  
  // Priorytet 1: MerchantName (główna nazwa) - sprawdź wszystkie możliwe pola
  merchant = fields.MerchantName?.valueString || 
             fields.MerchantName?.content ||
             fields.MerchantName?.valueContent?.content;
  
  // Priorytet 2: MerchantAddress (często zawiera nazwę na początku)
  if (!merchant && fields.MerchantAddress) {
    const addr = fields.MerchantAddress.valueString || 
                 fields.MerchantAddress.content || 
                 fields.MerchantAddress.valueContent?.content ||
                 '';
    // Weź pierwszą linię adresu (często to nazwa sklepu)
    const firstLine = addr.split(/[,\n]/)[0]?.trim();
    if (firstLine && firstLine.length > 2 && firstLine.length < 60) {
      merchant = firstLine;
    }
  }
  
  // Priorytet 3: Sprawdź cały tekst dokumentu (rawText) - szukaj na początku
  if (!merchant && azureResult.analyzeResult?.content) {
    const content = azureResult.analyzeResult.content;
    const lines = content.split('\n').filter(l => l.trim().length > 0);
    // Pierwsze 5 linii często zawierają nazwę sklepu
    for (let i = 0; i < Math.min(5, lines.length); i++) {
      const line = lines[i].trim();
      // Pomiń linie z datą, godziną, NIP, REGON, kodami pocztowymi
      if (!line.match(/^\d{2}[.\-/]\d{2}[.\-/]\d{2,4}/) && // Data
          !line.match(/^\d{2}:\d{2}/) && // Godzina
          !line.match(/NIP|REGON|KRS/i) && // Numery prawne
          !line.match(/^\d{2}-\d{3}$/) && // Kod pocztowy
          !line.match(/^[A-Z]{2,3}\s*\d+/) && // Kody (np. "PL 123")
          line.length > 2 && 
          line.length < 60 &&
          !line.match(/^[A-Z\s]{20,}$/)) { // Tylko wielkie litery (prawdopodobnie nie nazwa sklepu)
        merchant = line;
        break;
      }
    }
  }
  
  const date = fields.TransactionDate?.valueDate ?? null;
  const time = fields.TransactionTime?.valueTime ?? null;
  const currency = fields.Total?.valueCurrency?.currencyCode ?? 'PLN';

  // EKSTRAKCJA I WERYFIKACJA NAZWY SKLEPU - ZAWSZE używamy AI do sprawdzenia
  let extractedMerchant = merchant;
  console.log(`[Store Extraction] Oryginalna nazwa z Azure: "${extractedMerchant}"`);
  
  // 1. Podstawowe czyszczenie przed wysłaniem do AI
  if (extractedMerchant) {
    extractedMerchant = extractedMerchant
      .replace(/^OWT\s*/i, '')
      .replace(/^STOWT\s*/i, '')
      .trim();
  }
  
  // 2. ZAWSZE użyj GPT do weryfikacji i poprawienia nazwy sklepu
  if (azureResult.analyzeResult?.content) {
    console.log(`[Store Extraction] 🔍 Wysyłam do GPT do weryfikacji nazwy sklepu...`);
    const gptStoreName = await extractStoreNameWithGPT(azureResult.analyzeResult.content);
    
    if (gptStoreName && gptStoreName !== 'Unknown Store' && gptStoreName.toLowerCase() !== 'null') {
      merchant = gptStoreName;
      console.log(`[Store Extraction] ✅ GPT zweryfikował i poprawił nazwę sklepu: "${merchant}"`);
    } else if (extractedMerchant && extractedMerchant.length >= 2) {
      // Jeśli GPT nie znalazło, ale mamy coś z Azure, użyj tego (po normalizacji)
      merchant = normalizeStoreName(extractedMerchant);
      console.log(`[Store Extraction] GPT nie znalazło, używam znormalizowanej nazwy z Azure: "${merchant}"`);
    } else {
      merchant = 'Unknown Store';
      console.log(`[Store Extraction] ❌ Nie znaleziono nazwy sklepu`);
    }
  } else if (extractedMerchant && extractedMerchant.length >= 2) {
    // Jeśli nie ma rawText, użyj normalizacji
    merchant = normalizeStoreName(extractedMerchant);
    console.log(`[Store Extraction] Brak rawText, używam znormalizowanej nazwy: "${merchant}"`);
  } else {
    merchant = 'Unknown Store';
    console.log(`[Store Extraction] ❌ Brak danych do ekstrakcji nazwy sklepu`);
  }
  
  // 3. Ostateczna normalizacja (na wypadek gdyby GPT zwróciło coś co można jeszcze znormalizować)
  if (merchant && merchant !== 'Unknown Store') {
    const finalNormalized = normalizeStoreName(merchant);
    if (finalNormalized !== merchant && finalNormalized !== 'Unknown Store') {
      merchant = finalNormalized;
      console.log(`[Store Normalization] ✅ Finalna normalizacja: "${merchant}"`);
    }
  }
  
  console.log(`[Store Extraction] ✅ Finalna nazwa sklepu: "${merchant}"`);

  // ULEPSZONA EKSTRAKCJA PRODUKTÓW - sprawdź wszystkie możliwe pola
  const items: Array<{
    name: string;
    quantity: number | null;
    price: number | null;
  }> = [];

  const itemsField = fields.Items?.valueArray;
  if (itemsField && Array.isArray(itemsField)) {
    for (const item of itemsField) {
      const itemObj = item.valueObject || {};
      
      // ULEPSZONA EKSTRAKCJA NAZWY - sprawdź wszystkie możliwe pola w kolejności priorytetu
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
      
      // Jeśli nadal brak nazwy, spróbuj z rawText (cały tekst linii)
      if (!name || name.length < 2) {
        // Sprawdź czy jest jakiś tekst w innych polach
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
      
      // Fallback
      if (!name || name.length < 2) {
        name = 'Nieznany produkt';
      }
      
      // Oczyść nazwę produktu
      name = name
        .replace(/\s+/g, ' ') // Usuń wielokrotne spacje
        .trim();
      
      // ULEPSZONA EKSTRAKCJA ILOŚCI I CENY
      let quantity = itemObj.Quantity?.valueNumber ?? null;
      
      // Jeśli quantity nie jest number, spróbuj sparsować ze stringa
      if (quantity === null && itemObj.Quantity?.valueString && typeof itemObj.Quantity.valueString === 'string') {
        try {
          quantity = parseFloat(itemObj.Quantity.valueString.replace(',', '.')) || null;
        } catch {
          quantity = null;
        }
      }
      
      // Cena finalna - ZAWSZE używaj TotalPrice (cena za linię/cena finalna z paragonu)
      // NIE obliczaj ceny - używaj dokładnie tego, co jest na paragonie
      let price: number | null = null;
      
      // Priorytet 1: TotalPrice (cena finalna za linię)
      if (itemObj.TotalPrice?.valueNumber !== undefined && itemObj.TotalPrice?.valueNumber !== null) {
        price = itemObj.TotalPrice.valueNumber;
      } else if (itemObj.TotalPrice?.valueString && typeof itemObj.TotalPrice.valueString === 'string') {
        // Jeśli TotalPrice jest stringiem, sparsuj go
        try {
          const priceStr = itemObj.TotalPrice.valueString.replace(/[^\d.,-]/g, '').replace(',', '.');
          price = parseFloat(priceStr) || null;
        } catch {
          price = null;
        }
      }
      
      // Priorytet 2: Price (tylko jeśli TotalPrice nie istnieje)
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
      
      // NIE wykonuj żadnych obliczeń - używaj dokładnie tego, co jest na paragonie
      
      items.push({ name, quantity, price });
    }
  }
  
  // Jeśli Azure nie zwróciło itemów, ale mamy rawText, spróbuj wyciągnąć z tekstu
  if (items.length === 0 && azureResult.analyzeResult?.content) {
    console.log('[Azure] No items found in structured data, trying to extract from raw text...');
    // To można rozszerzyć o prosty parser regex, ale na razie zostawiamy puste
  }

  console.log('[Azure] Extracted data:');
  console.log(`  Merchant: ${merchant}`);
  console.log(`  Total: ${total} ${currency}`);
  console.log(`  Date: ${date}`);
  console.log(`  Time: ${time}`);
  console.log(`  Items: ${items.length} produktów`);

  return { total, merchant, date, time, currency, items };
}

// --- KATEGORYZACJA WSZYSTKICH ITEMS JEDNYM WYWOŁANIEM ---
async function categorizeAllItems(
  items: Array<{ name: string; quantity: number | null; price: number | null }>,
  categories: Array<{ id: string; name: string }>
): Promise<Array<{ name: string; quantity: number | null; price: number | null; category_id: string | null }>> {
  if (!openai) {
    console.warn('[GPT] OpenAI client not available - OPENAI_API_KEY missing?');
    return items.map(item => ({ ...item, category_id: null }));
  }
  
  if (!categories.length) {
    console.warn('[GPT] ⚠️ No categories available - cannot categorize items');
    return items.map(item => ({ ...item, category_id: null }));
  }
  
  if (items.length === 0) {
    console.log('[GPT] No items to categorize');
    return items.map(item => ({ ...item, category_id: null }));
  }

  try {
    console.log(`[GPT] 🎯 Kategoryzacja ${items.length} produktów (batch)...`);
    console.log(`[GPT] Available categories: ${categories.length}`);
    console.log(`[GPT] Categories: ${categories.map(c => c.name).join(', ')}`);
    console.log(`[GPT] OpenAI client initialized: ${!!openai}`);
    console.log(`[GPT] OPENAI_API_KEY present: ${!!process.env.OPENAI_API_KEY}`);
    
    if (!openai) {
      console.error('[GPT] ❌ OpenAI client is null!');
      console.error('[GPT] Check if OPENAI_API_KEY is set in Vercel environment variables');
      return items.map(item => ({ ...item, category_id: null }));
    }
    
    // Walidacja kategorii - sprawdź czy mają poprawne UUID
    const validCategories = categories.filter(c => c.id && c.name);
    if (validCategories.length !== categories.length) {
      console.warn(`[GPT] ⚠️ Some categories are invalid. Valid: ${validCategories.length}/${categories.length}`);
    }
    
    if (validCategories.length === 0) {
      console.error('[GPT] ❌ No valid categories available!');
      return items.map(item => ({ ...item, category_id: null }));
    }
    
    // Użyj tylko poprawnych kategorii
    const categoriesToUse = validCategories.length > 0 ? validCategories : categories;
    
    const categoryMap = categoriesToUse.map(c => `${c.name}: ${c.id}`).join('\n');
    const itemsList = items.map((item, idx) => `${idx + 1}. ${item.name}`).join('\n');
    
    console.log(`[GPT] Sending request to OpenAI (model: gpt-4o, items: ${items.length}, categories: ${categoriesToUse.length})...`);
    
    const startTime = Date.now();
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o', // Lepszy model dla dokładniejszej kategoryzacji
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
   - Przykłady: "Pizza Margherita", "Kebab", "Obiad w restauracji", "Kawa latte", "McDonald's", "KFC", "Zapiekanka"
   - NIE: produkty spożywcze z supermarketu (to GROCERIES!)

🛒 GROCERIES - Wszystkie produkty spożywcze i artykuły z supermarketu/sklepu:
   - Mięso, wędliny, ryby, owoce morza (krewetki, kraby, małże, kalmary, śledzie, makrele)
   - Nabiał: mleko, ser, jogurt, masło, śmietana, jajka, twaróg, kefir, maślanka
   - Warzywa, owoce, pieczywo (chleb, bułki, bagietki, rogale)
   - Produkty sypkie: mąka, cukier, sól, skrobia, drożdże, ryż, makaron, kasza, płatki, otręby
   - Napoje: woda, soki, napoje gazowane, mleko roślinne, kawa w sklepie, herbata w sklepie
   - Olej, oliwa, ocet, przyprawy, sosy, ketchup, majonez, musztarda
   - Artykuły gospodarstwa domowego: papier toaletowy, ręczniki papierowe, worki, folie, zapałki
   - Środki czystości: mydło, proszki do prania, płyny, gąbki, ścierki, płyny do naczyń
   - Przykłady: "Chleb", "Mleko 3.2%", "Jajka 10szt", "Pomidory", "Woda mineralna", "Skrobia ziemniaczana", "Krewetki", "Banany", "Mąka pszenna", "Jajko niespodzianka", "Kawa mielona", "Herbata"

💊 HEALTH - Apteka, leki, kosmetyki pielęgnacyjne:
   - Apteka, leki, witaminy, suplementy, probiotyki
   - Produkty medyczne: plastry, bandaże, termometry, strzykawki, rękawiczki
   - Kosmetyki do pielęgnacji: kremy, żele, szampony, pasty do zębów, mydła, balsamy, toniki
   - Przykłady: "Aspiryna", "Witamina D", "Krem do twarzy", "Szampon", "Pasta do zębów", "Bandaż", "Mydło"

🚗 TRANSPORT - Paliwo, transport, samochód:
   - Paliwo: benzyna, diesel, LPG, CNG
   - Płyny eksploatacyjne: olej silnikowy, płyn do spryskiwaczy, płyn chłodniczy
   - Bilety komunikacji miejskiej, parking, myjnia
   - Taksówki, Uber, Bolt, przejazdy
   - Naprawa samochodu, części samochodowe, opony
   - Przykłady: "Benzyna 95", "Bilet miesięczny", "Parking", "Olej silnikowy", "Uber"

🛍️ SHOPPING - Ubrania, moda, kosmetyki dekoracyjne:
   - Ubrania, buty, torebki, akcesoria modowe, paski
   - Perfumy, wody toaletowe
   - Kosmetyki dekoracyjne: szminka, tusz do rzęs, podkład, cienie, lakier do paznokci
   - Biżuteria, zegarki, okulary
   - Przykłady: "Koszula", "Buty sportowe", "Perfumy", "Tusz do rzęs", "Zegarek"

📱 ELECTRONICS - Elektronika i akcesoria:
   - Telefony, smartfony, tablety, smartwatche
   - Komputery, laptopy, monitory, drukarki
   - Akcesoria: ładowarki, kable, słuchawki, baterie, powerbanki
   - Przykłady: "iPhone", "Ładowarka USB-C", "Słuchawki bezprzewodowe", "Laptop"

🏠 HOME & GARDEN - Dom, ogród, wyposażenie:
   - Meble, dekoracje, dywany, zasłony
   - Narzędzia, farby, pędzle, wkrętarki
   - Rośliny, nasiona, nawozy, ziemia
   - AGD: pralki, lodówki, zmywarki, odkurzacze
   - RTV: telewizory, głośniki, radia
   - Przykłady: "Krzesło", "Farba biała", "Roślina doniczkowa", "Pralka"

🎬 ENTERTAINMENT - Rozrywka, hobby, sport:
   - Kino, teatr, koncerty, wydarzenia
   - Gry komputerowe, konsolowe, planszowe
   - Streaming: Netflix, Spotify, HBO, Disney+
   - Książki, czasopisma, komiksy
   - Hobby, sport, sprzęt sportowy, siłownia
   - Przykłady: "Bilet do kina", "Netflix", "Książka", "Piłka nożna", "Gry wideo"

💡 BILLS & UTILITIES - Rachunki, abonamenty:
   - Prąd, woda, gaz, ogrzewanie
   - Internet, telefon, TV, streaming (abonamenty)
   - Czynsz, ubezpieczenia, podatki
   - Przykłady: "Rachunek za prąd", "Internet", "Ubezpieczenie samochodu", "Czynsz"

📦 OTHER - Wszystko inne:
   - Usługi, naprawy, konsultacje
   - Różne, niepasujące do powyższych
   - Przykłady: "Usługa", "Naprawa", "Konsultacja"

KRYTYCZNE ZASADY (PRZESTRZEGAJ ICH!):
1. Produkty spożywcze z supermarketu → GROCERIES (NIE Food!)
2. Restauracje, fast food, jedzenie na wynos → FOOD
3. Kosmetyki pielęgnacyjne (kremy, szampony, mydła, pasty do zębów) → HEALTH
4. Kosmetyki dekoracyjne (szminka, tusz, podkład, cienie) → SHOPPING
5. Woda, soki, napoje z supermarketu → GROCERIES
6. Kawa/herbata w kawiarni → FOOD, kawa/herbata w sklepie → GROCERIES
7. Owoce morza (krewetki, kraby, małże) → GROCERIES (to jedzenie!)
8. Skrobia, mąka, cukier, sól → GROCERIES
9. Jeśli produkt pasuje do kilku kategorii, wybierz NAJLEPIEJ PASUJĄCĄ
10. Jeśli nie jesteś pewien, wybierz kategorię która najlepiej pasuje (nie zostawiaj null jeśli możesz wybrać)
11. Analizuj nazwę produktu dokładnie - "jajko niespodzianka" to GROCERIES, "krewetki" to GROCERIES

ZWRÓĆ TYLKO tablicę JSON z UUID kategorii w tej samej kolejności co produkty:
["uuid1", "uuid2", null, "uuid3", ...]

Każdy element tablicy odpowiada produktowi w tej samej pozycji. Jeśli nie możesz przypisać kategorii, użyj null.`
        },
        { 
          role: 'user', 
          content: `Przypisz kategorię do każdego produktu z paragonu. Zwróć tablicę JSON z UUID kategorii w tej samej kolejności co produkty.

Produkty do kategoryzacji:
${itemsList}

Pamiętaj o kluczowych zasadach:
- Produkty spożywcze z supermarketu (chleb, mleko, jajka, warzywa, owoce, mięso, ryby, owoce morza, napoje, przyprawy) → GROCERIES
- Restauracje/fast food/jedzenie na wynos → FOOD
- Kosmetyki pielęgnacyjne (kremy, szampony, mydła, pasty do zębów) → HEALTH
- Kosmetyki dekoracyjne (szminka, tusz, podkład) → SHOPPING
- Skrobia, mąka, cukier, sól → GROCERIES
- Krewetki, kraby, małże → GROCERIES (to jedzenie!)
- Kawa/herbata w sklepie → GROCERIES

Analizuj każdy produkt dokładnie i wybierz NAJLEPIEJ PASUJĄCĄ kategorię.

Zwróć TYLKO tablicę JSON: ["uuid1", "uuid2", null, "uuid3", ...]`
        },
      ],
    });

    const duration = Date.now() - startTime;
    console.log(`[GPT] ✅ OpenAI response received in ${duration}ms`);
    
    const result = completion.choices[0]?.message?.content?.trim() ?? null;
    if (!result) {
      console.error('[GPT] ❌ No response from OpenAI');
      console.error('[GPT] Completion object:', JSON.stringify(completion, null, 2));
      return items.map(item => ({ ...item, category_id: null }));
    }
    
    console.log(`[GPT] Raw response length: ${result.length} chars`);
    console.log(`[GPT] Raw response (first 500 chars): ${result.substring(0, 500)}`);
    
    // Try to extract JSON from response (GPT sometimes adds markdown or extra text)
    let jsonStr = result;
    
    // Remove markdown code blocks if present
    if (jsonStr.includes('```')) {
      console.log('[GPT] Found markdown code blocks, extracting JSON...');
      const match = jsonStr.match(/```(?:json)?\s*(\[.*?\])\s*```/s);
      if (match) {
        jsonStr = match[1];
        console.log('[GPT] Extracted JSON from markdown code block');
      } else {
        // Try to find JSON array in the text
        const arrayMatch = jsonStr.match(/\[.*?\]/s);
        if (arrayMatch) {
          jsonStr = arrayMatch[0];
          console.log('[GPT] Extracted JSON array from text');
        }
      }
    }
    
    let categoryIds: (string | null)[] = [];
    try {
      categoryIds = JSON.parse(jsonStr) as (string | null)[];
      console.log(`[GPT] ✅ Parsed ${categoryIds.length} category IDs`);
      
      // Walidacja - sprawdź czy są poprawne UUID
      const validCategoryIds = categoryIds.filter(id => 
        id === null || (typeof id === 'string' && categoriesToUse.some(c => c.id === id))
      );
      
      if (validCategoryIds.length !== categoryIds.length) {
        console.warn(`[GPT] ⚠️ Some category IDs are invalid. Valid: ${validCategoryIds.length}/${categoryIds.length}`);
        // Zastąp nieprawidłowe ID null
        categoryIds = categoryIds.map(id => 
          (id === null || (typeof id === 'string' && categoriesToUse.some(c => c.id === id))) ? id : null
        );
      }
    } catch (parseError) {
      console.error('[GPT] ❌ JSON parse error:', parseError);
      console.error('[GPT] Failed to parse JSON string:', jsonStr);
      console.error('[GPT] Full response:', result);
      
      // Spróbuj jeszcze raz z bardziej agresywnym ekstraktowaniem
      try {
        // Szukaj pierwszej tablicy JSON w tekście
        const arrayMatch = result.match(/\[[\s\S]*?\]/);
        if (arrayMatch) {
          categoryIds = JSON.parse(arrayMatch[0]) as (string | null)[];
          console.log('[GPT] ✅ Recovered JSON using fallback extraction');
        } else {
          throw new Error('No JSON array found in response');
        }
      } catch (fallbackError) {
        console.error('[GPT] ❌ Fallback extraction also failed:', fallbackError);
        return items.map(item => ({ ...item, category_id: null }));
      }
    }
    
    // Validate length
    if (categoryIds.length !== items.length) {
      console.warn(`[GPT] ⚠️ Category count mismatch: expected ${items.length}, got ${categoryIds.length}`);
      // Pad with nulls if too short, truncate if too long
      while (categoryIds.length < items.length) {
        categoryIds.push(null);
      }
      categoryIds = categoryIds.slice(0, items.length);
      console.log(`[GPT] Fixed array length to ${categoryIds.length}`);
    }
    
    const categorized = items.map((item, idx) => {
      const catId = categoryIds[idx] || null;
      // Walidacja - sprawdź czy category_id istnieje w dostępnych kategoriach
      const validCatId = catId && categoriesToUse.some(c => c.id === catId) ? catId : null;
      return {
        ...item,
        category_id: validCatId,
      };
    });
    
    const assignedCount = categorized.filter(c => c.category_id !== null).length;
    const validCount = categorized.filter(c => {
      if (!c.category_id) return false;
      return categoriesToUse.some(cat => cat.id === c.category_id);
    }).length;
    
    console.log(`[GPT] ✅ Assigned categories to ${assignedCount}/${items.length} items (${validCount} valid)`);
    
    if (assignedCount === 0) {
      console.warn('[GPT] ⚠️ WARNING: No categories were assigned! This might indicate a problem with GPT response or category matching.');
      console.warn('[GPT] Categories available:', categoriesToUse.map(c => `${c.name} (${c.id})`).join(', '));
      console.warn('[GPT] Items to categorize:', items.map(i => i.name).join(', '));
      console.warn('[GPT] Category IDs from GPT:', categoryIds);
    }
    
    return categorized;
    
  } catch (error) {
    console.error('[GPT] ❌ Batch categorization error:', error);
    
    if (error instanceof Error) {
      console.error('[GPT] Error name:', error.name);
      console.error('[GPT] Error message:', error.message);
      
      // Sprawdź specyficzne błędy OpenAI
      if (error.message.includes('rate limit') || error.message.includes('RateLimitError')) {
        console.error('[GPT] ⚠️ Rate limit exceeded - OpenAI API rate limit reached');
      } else if (error.message.includes('timeout') || error.message.includes('Timeout')) {
        console.error('[GPT] ⚠️ Timeout - OpenAI API request timed out');
      } else if (error.message.includes('401') || error.message.includes('Unauthorized')) {
        console.error('[GPT] ⚠️ Unauthorized - Check OPENAI_API_KEY in Vercel environment variables');
      } else if (error.message.includes('429')) {
        console.error('[GPT] ⚠️ Too many requests - OpenAI API quota exceeded');
      }
      
      if (process.env.NODE_ENV === 'development') {
        console.error('[GPT] Error stack:', error.stack);
      }
    } else {
      console.error('[GPT] Unknown error type:', typeof error, error);
    }
    
    return items.map(item => ({ ...item, category_id: null }));
  }
}

// --- GŁÓWNY ENDPOINT ---
export async function POST(req: NextRequest) {
  console.log('\n========================================');
  console.log('🧾 AZURE DOCUMENT INTELLIGENCE OCR');
  console.log('========================================\n');

  // WERYFIKACJA ZMIENNYCH ŚRODOWISKOWYCH (ważne dla Vercel!)
  const missingEnvVars: string[] = [];
  if (!process.env.AZURE_OCR_ENDPOINT) missingEnvVars.push('AZURE_OCR_ENDPOINT');
  if (!process.env.AZURE_OCR_KEY) missingEnvVars.push('AZURE_OCR_KEY');
  if (!process.env.OPENAI_API_KEY) missingEnvVars.push('OPENAI_API_KEY');
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) missingEnvVars.push('NEXT_PUBLIC_SUPABASE_URL');
  if (!process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) missingEnvVars.push('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY');
  
  if (missingEnvVars.length > 0) {
    console.error('[OCR] ❌ Missing environment variables:', missingEnvVars);
    return json({ 
      error: 'Server configuration error', 
      message: `Missing environment variables: ${missingEnvVars.join(', ')}. Please configure them in Vercel dashboard.`,
      missing: missingEnvVars 
    }, 500);
  }

  console.log('[OCR] ✅ Environment variables verified');
  console.log(`[OCR] Azure endpoint: ${AZURE_ENDPOINT ? '✅ Set' : '❌ Missing'}`);
  console.log(`[OCR] Azure key: ${AZURE_KEY ? '✅ Set' : '❌ Missing'}`);
  console.log(`[OCR] OpenAI: ${openai ? '✅ Initialized' : '❌ Missing'}`);
  console.log(`[OCR] Supabase URL: ${process.env.NEXT_PUBLIC_SUPABASE_URL ? '✅ Set' : '❌ Missing'}`);
  console.log(`[OCR] Supabase Key: ${process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ? '✅ Set' : '❌ Missing'}`);

  let receiptId: string | null = null;
  let userId: string | null = null;

  try {
    // 1. Pobierz dane z formularza
    const form = await req.formData();
    receiptId = form.get('receiptId') as string;
    userId = form.get('userId') as string;
    const files = form.getAll('files') as File[];

    console.log('[OCR] Form data received:');
    console.log('  receiptId:', receiptId);
    console.log('  userId:', userId);
    console.log('  files count:', files.length);
    
    if (files.length > 0) {
      files.forEach((f, i) => {
        console.log(`  file[${i}]: name=${f.name}, type=${f.type}, size=${f.size} bytes`);
      });
    }

    if (!receiptId || !userId || !files.length) {
      const missing = [];
      if (!receiptId) missing.push('receiptId');
      if (!userId) missing.push('userId');
      if (!files.length) missing.push('files');
      console.error('[OCR] Missing required fields:', missing);
      return json({ error: 'Missing required fields', missing }, 400);
    }

    console.log(`📄 Receipt ID: ${receiptId}`);
    console.log(`👤 User ID: ${userId}`);
    console.log(`📎 Files: ${files.length}\n`);

    const supabase = await createClient();

    // 2. Pobierz kategorie
    const { data: categories, error: categoriesError } = await supabase
      .from('categories')
      .select('id, name')
      .order('name');
    
    if (categoriesError) {
      console.error('[OCR] ❌ Failed to fetch categories:', categoriesError);
      return json({ error: 'Failed to fetch categories', details: categoriesError.message }, 500);
    }
    
    console.log(`[OCR] ✅ Loaded ${categories?.length || 0} categories`);
    if (categories && categories.length > 0) {
      console.log(`[OCR] Categories: ${categories.map(c => c.name).join(', ')}`);
    } else {
      console.warn('[OCR] ⚠️ No categories found in database!');
    }

    // 3. PRZETWÓRZ WSZYSTKIE PLIKI PO KOLEI
    const results = [];
    let currentReceiptId = receiptId; // Pierwszy plik używa istniejącego receipt_id

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      console.log(`\n========================================`);
      console.log(`📦 Processing file ${i + 1}/${files.length}: ${file.name}`);
      console.log(`========================================\n`);

      // Dla kolejnych plików, utwórz nowy receipt (bez statusu - użyj wartości domyślnej z bazy)
      if (i > 0) {
        const { data: newReceipt, error: newReceiptError } = await supabase
          .from('receipts')
          .insert([{
            user_id: userId,
            // Nie ustawiamy statusu - użyj wartości domyślnej z bazy (tak jak przy pierwszym pliku)
          }])
          .select()
          .single();

        if (newReceiptError || !newReceipt) {
          console.error(`[File ${i + 1}] Failed to create receipt:`, newReceiptError);
          results.push({ file: file.name, success: false, error: 'Failed to create receipt' });
          continue;
        }

        currentReceiptId = newReceipt.id;
        console.log(`[File ${i + 1}] Created new receipt ID: ${currentReceiptId}`);
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
        
        // If type is missing or invalid, infer from filename
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
            mimeType = 'image/jpeg'; // default
          }
        }
        
        // Validate that it's a supported type
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

        console.log(`[File ${i + 1}] File type: ${mimeType}, size: ${(buffer.length / 1024).toFixed(1)}KB`);
        
        // Validate buffer is valid image data (basic check - first few bytes)
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

        // 4. Azure OCR
        const azureResult = await processAzureOCR(buffer, mimeType);
        const { total, merchant, date, time, currency, items } = await extractReceiptData(azureResult);

        // 5. Przygotuj dane do zapisu
        const finalTotal = total ?? 0;
        const finalDate = date || new Date().toISOString().split('T')[0];
        const finalMerchant = merchant || 'Unknown Store';

        // 6. WYKRYWANIE DUPLIKATÓW (tylko aktywne paragony!)
        console.log(`[File ${i + 1}] [Duplicate Check] Checking for duplicates...`);
        console.log(`  Vendor: ${finalMerchant}`);
        console.log(`  Total: ${finalTotal}`);
        console.log(`  Date: ${finalDate}`);
        
        const { data: existingReceipt } = await supabase
          .from('receipts')
          .select('id, created_at, vendor, total, date')
          .eq('user_id', userId)
          .eq('vendor', finalMerchant)
          .eq('total', finalTotal)
          .eq('date', finalDate)
          .eq('status', 'processed')
          .maybeSingle();

        if (existingReceipt) {
          // Sprawdź czy istnieje aktywny expense dla tego receipt
          const { data: existingExpense } = await supabase
            .from('expenses')
            .select('id')
            .eq('receipt_id', existingReceipt.id)
            .eq('user_id', userId)
            .maybeSingle();

          if (existingExpense) {
            console.log(`[File ${i + 1}] [Duplicate Check] ❌ DUPLICATE FOUND!`);
            console.log('  Existing receipt ID:', existingReceipt.id);
            console.log('  Uploaded on:', existingReceipt.created_at);
            
            // Usuń aktualny receipt (duplikat)
            await supabase
              .from('receipts')
              .delete()
              .eq('id', currentReceiptId);
            
            results.push({
              file: file.name,
              success: false,
              error: 'duplicate',
              message: `This receipt was already uploaded on ${new Date(existingReceipt.created_at).toLocaleDateString()}`,
            });
            continue; // Przejdź do następnego pliku
          } else {
            console.log(`[File ${i + 1}] [Duplicate Check] ⚠️ Receipt exists but was deleted - allowing re-upload`);
          }
        }
        
        console.log(`[File ${i + 1}] [Duplicate Check] ✅ No active duplicates found`);

        console.log(`\n[File ${i + 1}] 💾 Saving to Supabase...\n`);

        // 7. Zaktualizuj receipts (bez kategorii - natychmiast!)
        const { error: receiptError } = await supabase
          .from('receipts')
          .update({
            status: 'processed',
            vendor: finalMerchant,
            date: finalDate,
            total: finalTotal,
            currency: currency,
            notes: JSON.stringify({
              ocr_engine: 'azure_document_intelligence',
              processed_at: new Date().toISOString(),
              items: items.map(item => ({ ...item, category_id: null })),
            }),
          })
          .eq('id', currentReceiptId)
          .eq('user_id', userId);

        if (receiptError) {
          console.error(`[File ${i + 1}] Receipt update error:`, receiptError);
          results.push({ file: file.name, success: false, error: receiptError.message });
          continue;
        }

        console.log(`[File ${i + 1}] ✅ Receipt updated`);

        // 8. Usuń stare expenses dla tego paragonu
        await supabase
          .from('expenses')
          .delete()
          .eq('receipt_id', currentReceiptId)
          .eq('user_id', userId);

        // 9. Wstaw nowy expense
        const { error: expenseError } = await supabase
          .from('expenses')
          .insert([{
            user_id: userId,
            receipt_id: currentReceiptId,
            title: `${finalMerchant} - Zakupy`,
            amount: finalTotal,
            date: finalDate,
            vendor: finalMerchant,
            quantity: 1,
            source: 'ocr',
            category_id: null,
          }]);

        if (expenseError) {
          console.error(`[File ${i + 1}] Expense insert error:`, expenseError);
          results.push({ file: file.name, success: false, error: expenseError.message });
          continue;
        }

        console.log(`[File ${i + 1}] ✅ Expense created`);

        // 10. KATEGORIE W TLE (nie czekamy!)
        const categoriesForCategorization = categories || [];
        console.log(`[File ${i + 1}] [Background] Starting categorization for ${items.length} items with ${categoriesForCategorization.length} categories...`);
        
        if (categoriesForCategorization.length === 0) {
          console.warn(`[File ${i + 1}] [Background] ⚠️ No categories available - skipping categorization`);
        }
        
        categorizeAllItems(items, categoriesForCategorization)
          .then(async (categorizedItems) => {
            console.log(`[File ${i + 1}] [Background] Kategorie gotowe - aktualizacja...`);
            
            const { data: currentReceipt } = await supabase
              .from('receipts')
              .select('notes')
              .eq('id', currentReceiptId)
              .single();
            
            if (currentReceipt?.notes) {
              try {
                const notesData = JSON.parse(currentReceipt.notes);
                notesData.items = categorizedItems;
                
                await supabase
                  .from('receipts')
                  .update({ notes: JSON.stringify(notesData) })
                  .eq('id', currentReceiptId);
                
                console.log(`[File ${i + 1}] [Background] ✅ Kategorie zapisane!`);
              } catch (e) {
                console.error(`[File ${i + 1}] [Background] Error updating categories:`, e);
              }
            }
          })
          .catch((err) => {
            console.error(`[File ${i + 1}] [Background] ❌ Category error:`, err);
            if (err instanceof Error) {
              console.error(`[File ${i + 1}] [Background] Error message:`, err.message);
              console.error(`[File ${i + 1}] [Background] Error name:`, err.name);
              if (err.message.includes('401') || err.message.includes('Unauthorized')) {
                console.error(`[File ${i + 1}] [Background] ⚠️ OpenAI API unauthorized - check OPENAI_API_KEY in Vercel`);
              }
            }
          });

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
          },
        });

        console.log(`[File ${i + 1}] ✅ SUCCESS!\n`);

      } catch (fileError) {
        console.error(`[File ${i + 1}] ❌ ERROR:`, fileError);
        
        let errorMessage = 'Unknown error';
        let errorType = 'unknown';
        
        if (fileError instanceof Error) {
          errorMessage = fileError.message;
          
          // Check for specific error types
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
    const hasErrors = results.some(r => !r.success);

    // Always return 200, but include error info in response
    // Only return 400 if ALL files failed AND it's a critical error
    const allFailed = successCount === 0 && results.length > 0;
    const criticalError = allFailed && results.some(r => 
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
      receipt_id: receiptId, // Pierwszy receipt_id dla kompatybilności
    }, criticalError ? 400 : 200);

  } catch (error) {
    console.error('\n========================================');
    console.error('❌ ERROR');
    console.error('========================================\n');
    console.error('Error:', error);

    // Oznacz paragon jako failed (używamy zapisanych zmiennych)
    if (receiptId && userId) {
      try {
        const supabase = await createClient();
        await supabase
          .from('receipts')
          .update({ 
            status: 'failed', 
            notes: `OCR Error: ${error instanceof Error ? error.message : 'Unknown error'}` 
          })
          .eq('id', receiptId)
          .eq('user_id', userId);
      } catch (updateError) {
        console.error('[Supabase] Failed to update receipt status:', updateError);
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
