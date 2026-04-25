// app/api/v1/ocr-receipt/route.ts - Azure Document Intelligence
import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth-compat';
import { rateLimit } from '@/lib/rate-limit';
import { db, receipts, expenses, categories, userSettings } from '@/lib/db';
import { eq, and } from 'drizzle-orm';
import { put } from '@vercel/blob';
import { getAIClient } from '@/lib/ai-client';
import { normalizeStoreName, findStoreInText } from '@/lib/stores';

export const runtime = 'nodejs';
export const maxDuration = 60; // Vercel Hobby plan limit

// Helper do logowania (mniej verbose w produkcji)
const isProduction = process.env.NODE_ENV === 'production';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const log = (message: string, ...args: any[]) => {
  if (!isProduction || message.includes('✅') || message.includes('❌') || message.includes('ERROR')) {
    console.log(message, ...args);
  }
};

const AZURE_ENDPOINT = process.env.AZURE_OCR_ENDPOINT;
const AZURE_KEY = process.env.AZURE_OCR_KEY;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// Parses locale-aware decimal strings (Polish "1.234,56" or English "1,234.56" or "12,50").
// Returns null if input is unparseable.
function parseLocaleDecimal(raw: string): number | null {
  if (!raw || typeof raw !== 'string') return null;
  const cleaned = raw.replace(/[^\d.,-]/g, '').trim();
  if (!cleaned) return null;
  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');
  let normalized: string;
  if (lastComma === -1 && lastDot === -1) {
    normalized = cleaned;
  } else if (lastComma > lastDot) {
    const afterComma = cleaned.slice(lastComma + 1);
    if (afterComma.length === 3 && lastDot === -1) {
      // "1,200" — comma is thousands separator, not decimal
      normalized = cleaned.replace(/,/g, '');
    } else {
      // "1.234,56" or "12,50" — comma is decimal separator
      normalized = cleaned.replace(/\./g, '').replace(',', '.');
    }
  } else {
    const afterDot = cleaned.slice(lastDot + 1);
    if (afterDot.length === 3 && lastComma === -1) {
      // "1.200" — dot is thousands separator (European)
      normalized = cleaned.replace(/\./g, '');
    } else {
      // "1,234.56" — dot is decimal separator
      normalized = cleaned.replace(/,/g, '');
    }
  }
  const parsed = parseFloat(normalized);
  return isNaN(parsed) ? null : parsed;
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

  // Krok 2: Polling - Czekaj na wynik (max 30 prób)
  // Aggressive polling: 150ms × 3, 300ms × 4, then 600ms — typically finishes in 1-3s
  let attempts = 0;
  const maxAttempts = 30;

  while (attempts < maxAttempts) {
    attempts++;
    if (attempts % 5 === 0 || attempts <= 2) {
      log(`[Azure] Polling attempt ${attempts}/${maxAttempts}...`);
    }

    const pollInterval = attempts <= 3 ? 150 : attempts <= 7 ? 300 : 600;
    await new Promise(resolve => setTimeout(resolve, pollInterval));

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



// --- EXCHANGE RATES ---
// Cache exchange rates in-memory (1 hour)
let rateCache: { rates: Record<string, number>; ts: number } | null = null;

async function getExchangeRates(): Promise<Record<string, number>> {
  const now = Date.now();
  if (rateCache && now - rateCache.ts < 60 * 60 * 1000) return rateCache.rates;
  try {
    const res = await fetch('https://api.frankfurter.app/latest?base=EUR&symbols=PLN,USD,GBP,CHF,CZK,SEK,NOK,DKK,HUF,RON', {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) throw new Error('rate fetch failed');
    const data = await res.json() as { rates: Record<string, number> };
    rateCache = { rates: { EUR: 1, ...data.rates }, ts: now };
    return rateCache.rates;
  } catch {
    return rateCache?.rates ?? {};
  }
}

function getExchangeRate(fromCurrency: string, toCurrency: string, rates: Record<string, number>): number | null {
  if (!fromCurrency || fromCurrency === toCurrency) return null;
  // rates is EUR-based: to convert from X to Y = rates[Y] / rates[X]
  const toRate = toCurrency === 'EUR' ? 1 : rates[toCurrency];
  const fromRate = fromCurrency === 'EUR' ? 1 : rates[fromCurrency];
  if (!toRate || !fromRate) return null;
  return toRate / fromRate;
}

// --- EKSTRAKCJA DANYCH ---
// eslint-disable-next-line @typescript-eslint/no-explicit-any
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
      total = parseLocaleDecimal(fields.Total.valueString);
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
  // Currency detection: Azure returns valueCurrency on currency-typed fields
  // Try multiple fields to detect currency, then fall back to text-based detection
  let currency: string = 'PLN';
  const currencyFromTotal = fields.Total?.valueCurrency?.currencyCode
    ?? fields.Total?.valueCurrency
    ?? null;
  const currencyFromSubtotal = fields.Subtotal?.valueCurrency?.currencyCode
    ?? fields.Subtotal?.valueCurrency
    ?? null;
  const currencyFromAmountDue = fields.AmountDue?.valueCurrency?.currencyCode
    ?? fields.AmountDue?.valueCurrency
    ?? null;

  if (typeof currencyFromTotal === 'string' && currencyFromTotal.length === 3) {
    currency = currencyFromTotal.toUpperCase();
  } else if (typeof currencyFromSubtotal === 'string' && currencyFromSubtotal.length === 3) {
    currency = currencyFromSubtotal.toUpperCase();
  } else if (typeof currencyFromAmountDue === 'string' && currencyFromAmountDue.length === 3) {
    currency = currencyFromAmountDue.toUpperCase();
  } else {
    // Fallback: detect currency from raw text
    const rawContent = (azureResult.analyzeResult?.content || '').toUpperCase();
    if (/\bEUR\b|€/.test(rawContent)) currency = 'EUR';
    else if (/\bUSD\b|\$\s*\d/.test(rawContent)) currency = 'USD';
    else if (/\bGBP\b|£/.test(rawContent)) currency = 'GBP';
    else if (/\bCHF\b/.test(rawContent)) currency = 'CHF';
    else if (/\bCZK\b|Kč/.test(rawContent)) currency = 'CZK';
    else if (/\bSEK\b/.test(rawContent)) currency = 'SEK';
    else if (/\bNOK\b/.test(rawContent)) currency = 'NOK';
    else if (/\bDKK\b/.test(rawContent)) currency = 'DKK';
    else if (/\bHUF\b|Ft\b/.test(rawContent)) currency = 'HUF';
    else if (/\bRON\b/.test(rawContent)) currency = 'RON';
    // else keep PLN default
  }
  log(`[Currency Detection] Detected currency: ${currency} (fromTotal=${currencyFromTotal}, fromSubtotal=${currencyFromSubtotal}, fromAmountDue=${currencyFromAmountDue})`);

  // Three-tier merchant extraction:
  //   (1) Azure MerchantName field — works ~70% of the time on clean
  //       Polish receipts but fails on smudged thermal prints, rotated
  //       photos, and chains where the brand is in a logo image rather
  //       than printed text.
  //   (2) STORE_PATTERNS scan over the FULL raw OCR text — every Polish
  //       chain repeats its name in headers, footers, NIP banners and
  //       loyalty-program lines, so even when (1) misses we usually find
  //       it via substring scan. OCR-tolerant patterns handle digit/letter
  //       confusions ("B1EDRONKA" → Biedronka).
  //   (3) AI fallback (deferred to processing pipeline) — only invoked
  //       when (1) AND (2) both fail, using top ~15 lines as context.
  //
  // The extracted name is normalised via `normalizeStoreName` so we
  // always store the canonical form ("Lidl", not "LIDL POLSKA SP. Z O.O.")
  // — this matters because price comparison, audits and promotions all
  // group/compare by chain name string-equality.
  let extractedMerchant = merchant;
  log(`[Store Extraction] Oryginalna nazwa z Azure: "${extractedMerchant}"`);

  if (extractedMerchant) {
    extractedMerchant = extractedMerchant
      .replace(/^OWT\s*/i, '')
      .replace(/^STOWT\s*/i, '')
      .trim();
  }

  // Tier 1: try Azure's MerchantName via canonical normaliser
  let normalizedFromAzure: string | null = null;
  if (extractedMerchant && extractedMerchant.length >= 2) {
    const normalised = normalizeStoreName(extractedMerchant);
    // normalizeStoreName returns the input unchanged if no pattern matches,
    // so we re-check whether it actually became a canonical chain name.
    const isCanonical = findStoreInText(normalised) === normalised;
    if (isCanonical) {
      normalizedFromAzure = normalised;
      log(`[Store Extraction] Tier 1 (Azure → canonical): "${normalizedFromAzure}"`);
    } else {
      log(`[Store Extraction] Tier 1 returned non-canonical "${normalised}" — trying tier 2`);
    }
  }

  // Tier 2: scan the whole raw OCR content for any known chain name.
  // Works when Azure missed the merchant field entirely or returned an
  // address line, payment-terminal ID, or NIP number instead.
  let normalizedFromText: string | null = null;
  if (!normalizedFromAzure) {
    const rawContent = azureResult.analyzeResult?.content ?? '';
    normalizedFromText = findStoreInText(rawContent);
    if (normalizedFromText) {
      log(`[Store Extraction] Tier 2 (raw-text scan): "${normalizedFromText}"`);
    }
  }

  // Final preliminary merchant — AI tier-3 fallback runs later in the
  // pipeline (parallel with categorization) only when both tiers above
  // returned nothing, so we don't pay the AI cost for ~95% of receipts.
  if (normalizedFromAzure) {
    merchant = normalizedFromAzure;
  } else if (normalizedFromText) {
    merchant = normalizedFromText;
  } else if (extractedMerchant && extractedMerchant.length >= 2) {
    // Keep the raw Azure string as a hint for the AI fallback to refine.
    merchant = extractedMerchant;
  } else {
    merchant = 'Unknown Store';
  }

  log(`[Store Extraction] Preliminary merchant (pre-AI-fallback): "${merchant}"`);

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

      // CRITICAL: never push items where Azure failed to extract a name.
      // Persisting "Nieznany produkt" pollutes price comparison, audit
      // aggregation, and the receipt detail view — better to drop the
      // line entirely. (The total still includes it because total comes
      // from the document-level Total field, not item summation.)
      if (!name || name.length < 2) {
        continue;
      }

      // Clean OCR noise from item name
      name = name
        .replace(/[#|@*_{}[\]~`^\\]/g, '')  // Remove OCR garbage characters
        .replace(/\d+[.,]\d{2}\s*(zł|PLN|EUR|€|\$|£|USD|GBP|CHF|CZK|SEK|NOK|DKK|HUF|RON)\b/gi, '')  // Remove price+currency from name
        .replace(/\b(zł|PLN|EUR|€|\$|£)\b/gi, '')  // Remove standalone currency symbols
        .replace(/\(\s*\)/g, '')  // Remove empty parens
        .replace(/\s+/g, ' ')
        .trim();

      // Post-cleanup re-check — the noise stripper sometimes empties
      // out names that were 100% currency/digits/garbage.
      if (!name || name.length < 2) {
        continue;
      }

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
        let unitPrice: number | null = null;
        if (itemObj.Price?.valueNumber !== undefined && itemObj.Price?.valueNumber !== null) {
          unitPrice = itemObj.Price.valueNumber;
        } else if (itemObj.Price?.valueString && typeof itemObj.Price.valueString === 'string') {
          try {
            const priceStr = itemObj.Price.valueString.replace(/[^\d.,-]/g, '').replace(',', '.');
            unitPrice = parseFloat(priceStr) || null;
          } catch {
            unitPrice = null;
          }
        }
        if (unitPrice !== null && quantity !== null && quantity > 1) {
          price = Math.round(unitPrice * quantity * 100) / 100;
        } else {
          price = unitPrice;
        }
      }

      items.push({ name, quantity, price });
    }
  }

  // Filter out non-item lines (subtotals, tax, payment info)
  const NON_ITEM_PATTERNS = [
    /^(sub)?total$/i, /^suma$/i, /^razem$/i, /^łącznie$/i,
    /^vat\b/i, /^tax\b/i, /^podatek/i, /^iva\b/i,
    /^discount/i, /^rabat/i, /^zniżka/i, /^upust/i,
    /^change\b/i, /^reszta$/i, /^wydano$/i,
    /^cash\b/i, /^card\b/i, /^karta\b/i, /^gotówka$/i,
    /^payment/i, /^płatność/i, /^zapłacono/i,
    /^(visa|mastercard|maestro|blik)\b/i,
    /^paragon\b/i, /^receipt\b/i, /^faktura\b/i,
    /^nr\s*(paragonu|kasy|trans)/i,
    /^nip\b/i, /^regon\b/i,
    /^(podsuma|subtotal|zwrot|return|refund)/i,
  ];

  const filteredItems = items.filter(item => {
    const name = item.name.trim();
    if (!name || name.length < 2) return false;  // Remove empty/tiny items
    if (NON_ITEM_PATTERNS.some(p => p.test(name))) return false;
    return true;
  });

  // Extract quantity from name if not detected by Azure
  for (const item of filteredItems) {
    if (item.quantity === null || item.quantity === undefined || item.quantity === 1) {
      // Match patterns: "2x ", "2 x ", "x2 ", "2szt", "2 szt"
      const qtyMatch = item.name.match(/^(\d+)\s*[xX×]\s+(.+)/) ||
                       item.name.match(/^(\d+)\s*szt\.?\s+(.+)/i);
      if (qtyMatch) {
        item.quantity = parseInt(qtyMatch[1], 10);
        item.name = qtyMatch[2].trim();
      }
    }
  }

  // Extract trailing price from name if price is null
  for (const item of filteredItems) {
    if (item.price === null || item.price === 0) {
      // Match trailing price: "Milk 3.99" or "Bread 2,50"
      const priceMatch = item.name.match(/\s(\d+[.,]\d{2})\s*$/);
      if (priceMatch) {
        item.price = parseFloat(priceMatch[1].replace(',', '.'));
        item.name = item.name.slice(0, -priceMatch[0].length).trim();
      }
    }
  }

  // Final cleanup: remove items with no useful data.
  // Stricter than before — also drops items where the name is almost
  // certainly garbage (single letters, all digits, or sub-3-char names
  // with no price), which used to leak through as confusing line entries.
  const cleanItems = filteredItems.filter(item => {
    const n = item.name.trim();
    if (n.length === 0) return false;
    if (n.length < 3 && (item.price === null || item.price === 0)) return false;
    if (/^[\d\s.,€$£/-]+$/.test(n)) return false;  // pure digits/punctuation
    return item.price === null || item.price >= 0;
  });

  if (cleanItems.length === 0 && azureResult.analyzeResult?.content) {
    log('[Azure] No items found in structured data, trying to extract from raw text...');
  }

  // --- Promotion / discount detection -----------------------------------
  // Polish receipts add discount lines BELOW the discounted item, in a
  // format like:
  //    "RABAT BLIK -2,00"     (Lidl Plus discount)
  //    "OPUST -1,50"          (manual cashier discount)
  //    "PROMOCJA -3,99"       (chain promotion)
  //    "ZNIŻKA -10%"          (percentage discount)
  // These get filtered out as non-items above (because they look like
  // header rows), but they're crucial for two reasons:
  //   (1) The user can see how much they saved with promotions —
  //       this becomes the "promotional savings" KPI on the receipt
  //       detail and feeds into the Savings hub's deal-tracking.
  //   (2) Audit/promotions AI prompts can use the discount evidence
  //       to learn which chains the user shops promotional offers at,
  //       improving personalised deal recommendations.
  const promotions: Array<{ label: string; amount: number | null }> = [];
  const rawContent = azureResult.analyzeResult?.content ?? '';
  if (rawContent && typeof rawContent === 'string') {
    const promoLineRegex = /^.*\b(rabat|opust|promocja|zni[żz]ka|discount|promo|akcja\s*cenowa)\b[^\n]*$/gim;
    const matches = rawContent.match(promoLineRegex) || [];
    for (const lineRaw of matches) {
      const line = lineRaw.trim();
      // Skip header-only lines like "RABATY:" with no amount
      const amountMatch = line.match(/-?\s*\d+[.,]\d{2}/);
      const pctMatch = line.match(/-?\s*\d+\s*%/);
      let amount: number | null = null;
      if (amountMatch) {
        amount = parseLocaleDecimal(amountMatch[0]);
        if (amount !== null) amount = -Math.abs(amount);  // discounts are negative
      } else if (pctMatch) {
        // Percentage discount — store amount as null, label retains "−10%"
        amount = null;
      } else {
        continue;
      }
      // Cap label at 80 chars so we don't store paragraph-long noise
      promotions.push({ label: line.slice(0, 80), amount });
    }
  }
  const totalSaved = promotions
    .filter(p => p.amount !== null)
    .reduce((sum, p) => sum + (p.amount ?? 0), 0);

  log(`[Azure] Extracted data: Merchant="${merchant}", Total=${total} ${currency}, Date=${date}, Items=${cleanItems.length}, Promotions=${promotions.length}${totalSaved < 0 ? `, Saved=${totalSaved.toFixed(2)}` : ''}`);

  return { total, merchant, date, time, currency, items: cleanItems, promotions, totalSaved };
}

// --- LANGUAGE DETECTION + CATEGORIZATION + TRANSLATION ---
function detectLanguage(rawText: string): string {
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

async function categorizeAndTranslateItems(
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
    const completion = await ai.client.chat.completions.create({
      model: ai.model,
      temperature: 0,
      max_tokens: 1400,
      response_format: { type: 'json_object' },
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

    const result = completion.choices[0]?.message?.content?.trim() ?? null;
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
async function extractMerchantWithAI(rawText: string | null | undefined): Promise<string | null> {
  if (!rawText || typeof rawText !== 'string') return null;
  const ai = getAIClient();
  if (!ai) return null;

  // Trim to first 25 lines (chain names live at the top of receipts).
  // This also caps token usage — a full receipt can be 60+ lines.
  const headerText = rawText.split('\n').slice(0, 25).join('\n').slice(0, 1500);
  if (headerText.trim().length < 10) return null;

  try {
    const completion = await ai.client.chat.completions.create({
      model: ai.model,
      temperature: 0,
      max_tokens: 80,
      response_format: { type: 'json_object' },
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

    const result = completion.choices[0]?.message?.content?.trim() ?? '';
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

// --- GŁÓWNY ENDPOINT ---
export async function POST(req: NextRequest) {
  log('\n[OCR] 🧾 AZURE DOCUMENT INTELLIGENCE OCR - request received');

  // AUTH CHECK
  const { userId: authUserId } = await auth();
  if (!authUserId) {
    return json({ error: 'Unauthorized' }, 401);
  }

  // RATE LIMIT: 30 requests per hour per userId
  const rlOcr = rateLimit(`ocr:receipt:${authUserId}`, { maxRequests: 30, windowMs: 60 * 60 * 1000 })
  if (!rlOcr.allowed) {
    return json({ error: 'OCR rate limit exceeded. Try again later.' }, 429)
  }

  // WERYFIKACJA ZMIENNYCH ŚRODOWISKOWYCH
  const missingEnvVars: string[] = [];
  if (!process.env.AZURE_OCR_ENDPOINT) missingEnvVars.push('AZURE_OCR_ENDPOINT');
  if (!process.env.AZURE_OCR_KEY) missingEnvVars.push('AZURE_OCR_KEY');
  // AI client: either Azure OpenAI or OpenAI direct — checked inside categorizeAndTranslateItems via getAIClient()
  if (!process.env.OPENAI_API_KEY && !(process.env.AZURE_OPENAI_ENDPOINT && process.env.AZURE_OPENAI_API_KEY && process.env.AZURE_OPENAI_DEPLOYMENT)) missingEnvVars.push('OPENAI_API_KEY or AZURE_OPENAI_*');
  if (!process.env.DATABASE_URL) missingEnvVars.push('DATABASE_URL');

  if (missingEnvVars.length > 0) {
    // SECURITY FIX: Don't expose env var names in errors — log server-side only
    console.error('[OCR] ❌ Missing environment variables:', missingEnvVars);
    return json({
      error: 'Service configuration error',
      success: false,
    }, 500);
  }

  log('[OCR] ✅ Environment variables verified');

  let receiptId: string | null = null;
  const userId: string | null = authUserId;

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

    // 2. Pobierz kategorie i ustawienia użytkownika
    const [cats, [userSettingsRow]] = await Promise.all([
      db.select().from(categories).where(eq(categories.userId, userId)),
      db.select({ currency: userSettings.currency }).from(userSettings).where(eq(userSettings.userId, userId)).limit(1),
    ]);
    const accountCurrency = userSettingsRow?.currency?.toUpperCase() || 'PLN';

    log(`[OCR] ✅ Loaded ${cats?.length || 0} categories, account currency: ${accountCurrency}`);
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
          } else if (fileName.match(/\.hei[cf]$/)) {
            results.push({ file: file.name, success: false, error: 'heic_needs_conversion', message: 'HEIC files must be converted first via /api/v1/convert-heic' });
            continue;
          } else {
            mimeType = 'image/jpeg';
          }
        }

        if (mimeType === 'image/heic' || mimeType === 'image/heif') {
          results.push({ file: file.name, success: false, error: 'heic_needs_conversion', message: 'HEIC files must be converted first via /api/v1/convert-heic' });
          continue;
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

        // Magic-byte validation
        const header = buffer.slice(0, 12);
        if (mimeType.startsWith('image/')) {
          const isValidImage =
            (header[0] === 0xFF && header[1] === 0xD8) || // JPEG
            (header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4E && header[3] === 0x47) || // PNG
            (header[0] === 0x52 && header[1] === 0x49 && header[2] === 0x46 && header[3] === 0x46
              && header[8] === 0x57 && header[9] === 0x45 && header[10] === 0x42 && header[11] === 0x50); // WebP (RIFF + WEBP)
          if (!isValidImage) {
            console.warn(`[File ${i + 1}] Rejected: File header doesn't match declared type ${mimeType}`);
            results.push({
              file: file.name,
              success: false,
              error: 'invalid_format',
              message: 'Invalid file format',
            });
            continue;
          }
        } else if (mimeType === 'application/pdf') {
          if (!(header[0] === 0x25 && header[1] === 0x50 && header[2] === 0x44 && header[3] === 0x46)) {
            console.warn(`[File ${i + 1}] Rejected: Not a valid PDF`);
            results.push({ file: file.name, success: false, error: 'invalid_format', message: 'Invalid PDF file' });
            continue;
          }
        }

        // 4+5. Parallel: Upload to Vercel Blob + Azure OCR
        const [imageUrl, azureResult] = await Promise.all([
          put(`receipts/${userId}/${currentReceiptId}/${file.name}`, buffer, { access: 'public', contentType: mimeType }).then(r => r.url).catch((blobErr) => {
            console.warn(`[File ${i + 1}] ⚠️ Blob upload failed (non-fatal):`, blobErr);
            return null;
          }),
          processAzureOCR(buffer, mimeType),
        ]);
        if (imageUrl) {
          log(`[File ${i + 1}] ✅ Uploaded to Blob: ${imageUrl}`);
        }

        const { total, merchant: preliminaryMerchant, date, time, currency, items, promotions, totalSaved } = await extractReceiptData(azureResult);

        // 6-8. PARALLEL: exchange rate + duplicate check + categorization
        const finalTotal = total ?? 0;
        const finalDate = date || new Date().toISOString().split('T')[0];

        // Three-tier merchant resolution. extractReceiptData already ran
        // tiers 1-2 (Azure field + raw-text scan); here we kick off
        // tier 3 (AI fallback) ONLY if both upstream tiers failed.
        // The AI call is gated to keep latency low — ~95% of receipts
        // resolve in tiers 1-2, so we don't pay the AI roundtrip for
        // them.
        const rawTextForLang = azureResult?.analyzeResult?.content ?? '';
        const isAlreadyCanonical = preliminaryMerchant && preliminaryMerchant !== 'Unknown Store' && findStoreInText(preliminaryMerchant) === preliminaryMerchant;
        const aiMerchantPromise: Promise<string | null> = isAlreadyCanonical
          ? Promise.resolve(null)
          : extractMerchantWithAI(rawTextForLang).catch((err) => {
            console.warn(`[File ${i + 1}] AI merchant extraction failed:`, err);
            return null;
          });

        const catsForCategorization = (cats || []).map(c => ({ id: c.id, name: c.name }));

        log(`[File ${i + 1}] Running exchange rate + duplicate check + categorization + AI merchant in parallel...`);

        const categorizationTimeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 8000));

        const [rates, existingReceiptsRaw, categorizationResult, aiMerchant] = await Promise.all([
          currency !== accountCurrency ? getExchangeRates() : Promise.resolve({}),
          // Pull recent receipts (not just same-vendor) — we'll filter
          // post-resolution because the AI fallback might rename a
          // receipt from "Unknown Store" to "Lidl" after this query.
          db.select({
            id: receipts.id,
            date: receipts.date,
            total: receipts.total,
            vendor: receipts.vendor,
            createdAt: receipts.createdAt,
          }).from(receipts)
            .where(and(
              eq(receipts.userId, userId),
              eq(receipts.status, 'processed')
            ))
            .limit(50),
          Promise.race([
            categorizeAndTranslateItems(items, catsForCategorization, rawTextForLang, preliminaryMerchant),
            categorizationTimeout,
          ]),
          // Tier 3 AI merchant fallback — capped at 4s so a slow LLM
          // doesn't block the whole receipt save.
          Promise.race([
            aiMerchantPromise,
            new Promise<null>((resolve) => setTimeout(() => resolve(null), 4000)),
          ]),
        ]);

        // Resolve final merchant: AI fallback wins if it found a known
        // chain that the upstream tiers missed; otherwise use whatever
        // tiers 1-2 produced.
        const finalMerchant = aiMerchant
          ? normalizeStoreName(aiMerchant)
          : normalizeStoreName(preliminaryMerchant || 'Unknown Store');
        if (aiMerchant && aiMerchant !== preliminaryMerchant) {
          log(`[File ${i + 1}] [Store Extraction] Tier 3 AI fallback: "${preliminaryMerchant}" → "${finalMerchant}"`);
        }

        const exchangeRate = getExchangeRate(currency, accountCurrency, rates);

        // Duplicate check — filter to same-vendor + same-date + same-total
        const matchingReceipt = existingReceiptsRaw.find(r => {
          if (r.vendor !== finalMerchant) return false;
          const rTotal = parseFloat(r.total || '0');
          return r.date === finalDate && Math.abs(rTotal - finalTotal) < 0.01;
        });

        if (matchingReceipt) {
          const existingExpenses = await db.select().from(expenses)
            .where(and(
              eq(expenses.receiptId, matchingReceipt.id),
              eq(expenses.userId, userId)
            ))
            .limit(1);

          if (existingExpenses.length > 0) {
            log(`[File ${i + 1}] [Duplicate Check] DUPLICATE FOUND!`);
            await db.delete(receipts).where(eq(receipts.id, currentReceiptId));
            results.push({
              file: file.name,
              success: false,
              error: 'duplicate',
              message: `This receipt was already uploaded on ${new Date(matchingReceipt.createdAt).toLocaleDateString()}`,
            });
            continue;
          } else {
            log(`[File ${i + 1}] [Duplicate Check] Receipt exists but was deleted - allowing re-upload`);
          }
        }

        log(`[File ${i + 1}] [Duplicate Check] No active duplicates found`);

        const categorizedItems = categorizationResult?.items ?? items.map(item => ({ ...item, nameClean: null, nameTranslated: null, category_id: null }));
        const detectedLang = categorizationResult?.detectedLanguage ?? 'en';

        log(`[File ${i + 1}] Parallel GPT done (merchant="${finalMerchant}", lang=${detectedLang})`);

        // --- Keyword-based fallback for items without category ---
        const keywordMap: Record<string, string[]> = {
          'food': ['pizza', 'burger', 'sandwich', 'restaurant', 'bar', 'cafe', 'coffee', 'lunch', 'dinner', 'meal', 'sushi', 'kebab', 'wrap', 'salad'],
          'jedzenie': ['pizza', 'burger', 'sandwich', 'restauracja', 'bar', 'kawiarnia', 'kawa', 'obiad', 'kolacja', 'śniadanie', 'kebab', 'zupa'],
          'groceries': ['milk', 'bread', 'cheese', 'meat', 'fruit', 'vegetable', 'eggs', 'butter', 'sugar', 'flour', 'rice', 'pasta', 'chicken', 'water', 'juice', 'yogurt', 'banana', 'apple', 'potato', 'onion', 'tomato', 'cream', 'oil', 'cereal', 'fish', 'salmon', 'pork', 'beef', 'ham', 'sausage'],
          'spożywcze': ['mleko', 'chleb', 'ser', 'mięso', 'owoce', 'warzywa', 'jajka', 'masło', 'cukier', 'mąka', 'ryż', 'makaron', 'kurczak', 'woda', 'sok', 'jogurt', 'banan', 'jabłk', 'ziemniak', 'cebul', 'pomidor', 'śmietan', 'olej', 'szynk', 'kiełbas', 'bułk', 'rogal', 'czekolad', 'piwo', 'wino', 'wódk', 'alkohol', 'napój', 'chipsy', 'herbat', 'lizak', 'ciastk'],
          'health': ['pharmacy', 'medicine', 'vitamin', 'pill', 'bandage', 'aspirin', 'ibuprofen', 'paracetamol', 'shampoo', 'toothpaste'],
          'zdrowie': ['apteka', 'lek', 'witamin', 'tabletk', 'bandaż', 'aspiryn', 'paracetamol', 'szampon', 'pasta', 'krem', 'maść'],
          'transport': ['fuel', 'petrol', 'diesel', 'paliwo', 'benzyn', 'nafta', 'parking', 'taxi', 'uber', 'bolt', 'bilet', 'ticket', 'train', 'bus', 'lpg', 'autogaz'],
          'shopping': ['clothes', 'shoes', 'shirt', 'pants', 'dress', 'jacket', 'hat', 'sweater', 'socks'],
          'zakupy': ['ubrania', 'buty', 'koszul', 'spodnie', 'sukienk', 'kurtk', 'skarpet', 'sweter', 'czapk'],
          'electronics': ['phone', 'laptop', 'computer', 'cable', 'charger', 'battery', 'headphones', 'adapter', 'usb', 'hdmi'],
          'elektronika': ['telefon', 'laptop', 'komputer', 'kabel', 'ładowark', 'bateri', 'słuchawk', 'adapter'],
          'home & garden': ['detergent', 'soap', 'tissue', 'towel', 'cleaning', 'sponge', 'trash bag', 'bleach'],
          'dom': ['detergent', 'mydło', 'chusteczk', 'ręcznik', 'czyszcz', 'gąbk', 'worek', 'proszek', 'płyn', 'worki'],
          'entertainment': ['cinema', 'movie', 'game', 'concert', 'book', 'magazine', 'spotify', 'netflix'],
          'rozrywka': ['kino', 'film', 'gra', 'koncert', 'książk', 'czasopismo'],
          'bills & utilities': ['electricity', 'internet', 'phone bill', 'rent', 'subscription'],
          'rachunki': ['prąd', 'internet', 'czynsz', 'abonament'],
        };

        // Fuzzy match: category name "Zakupy spożywcze" matches keyword group "zakupy spożywcze",
        // "Spożywcze", "groceries", etc. via substring containment both ways.
        const catList = (cats || []).map(c => ({ id: c.id, lower: c.name.toLowerCase() }));
        function findCatId(groupKey: string): string | null {
          const gk = groupKey.toLowerCase();
          for (const c of catList) {
            if (c.lower === gk || c.lower.includes(gk) || gk.includes(c.lower)) return c.id;
          }
          return null;
        }

        function fallbackCategorize(itemName: string): string | null {
          const tokens = itemName.toLowerCase().replace(/[^a-ząćęłńóśźż\s]/g, '').split(/\s+/);
          for (const [groupKey, keywords] of Object.entries(keywordMap)) {
            const catId = findCatId(groupKey);
            if (!catId) continue;
            for (const kw of keywords) {
              if (tokens.some(t => t.includes(kw) || kw.includes(t))) return catId;
            }
          }
          return findCatId('groceries') || findCatId('spożywcze') || findCatId('zakupy') || null;
        }

        // Apply fallback to uncategorized items
        const finalItems = categorizedItems.map(item => {
          if (!item.category_id) {
            return { ...item, category_id: fallbackCategorize(item.name) };
          }
          return item;
        });

        const fallbackCount = finalItems.filter((fi, idx) => fi.category_id && !categorizedItems[idx].category_id).length;
        if (fallbackCount > 0) {
          log(`[File ${i + 1}] 🔄 Keyword fallback assigned categories to ${fallbackCount}/${finalItems.length} items`);
        }

        // Wyznacz najlepszą kategorię dla expense (kategoria najdroższego itemu)
        const withCat = finalItems.filter(it => it.category_id);
        const bestCategoryId: string | null = withCat.length > 0
          ? ([...withCat].sort((a, b) => (b.price ?? 0) - (a.price ?? 0))[0].category_id ?? null)
          : null;

        // 9-11. PARALLEL: Update receipt + delete old expenses, then insert new expense
        await Promise.all([
          db.update(receipts)
            .set({
              status: 'processed',
              vendor: finalMerchant,
              date: finalDate,
              total: String(finalTotal),
              currency: currency,
              imageUrl: imageUrl,
              exchangeRate: exchangeRate ? String(exchangeRate) : null,
              detectedLanguage: detectedLang,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              items: finalItems as any,
              // Persist promotion/discount lines into rawOcr so audits
              // and the personalised-deals AI prompts can read them.
              // Storing as a structured object inside the existing
              // jsonb column means no schema migration; future readers
              // can ignore the field if they don't care about it.
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              rawOcr: { promotions, totalSaved } as any,
            })
            .where(and(eq(receipts.id, currentReceiptId), eq(receipts.userId, userId))),
          db.delete(expenses).where(
            and(
              eq(expenses.receiptId, currentReceiptId),
              eq(expenses.userId, userId)
            )
          ),
        ]);

        await db.insert(expenses).values({
          userId,
          receiptId: currentReceiptId,
          title: `${finalMerchant}`,
          amount: String(finalTotal),
          currency: currency,
          date: finalDate,
          vendor: finalMerchant,
          categoryId: bestCategoryId,
        });

        log(`[File ${i + 1}] ✅ Receipt updated + expense created (categoryId=${bestCategoryId})`);

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
            exchangeRate,
            detectedLanguage: detectedLang,
            items: finalItems,
            items_count: finalItems.length,
            // Surfaced in the receipt confirmation toast on iOS so the
            // user sees "you saved 12,40 zł in promotions" right after
            // scanning, instead of having to dig through the receipt
            // detail to find the discount lines.
            promotions,
            totalSaved,
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

    // SECURITY FIX: Don't expose env var names in errors — generic message for clients
    console.error('[OCR] Unhandled error:', error);
    return json(
      {
        error: 'OCR processing failed. Please try again.',
        success: false
      },
      500
    );
  }
}
