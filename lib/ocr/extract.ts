// Wydzielone z `app/api/v1/ocr-receipt/route.ts` (1598 linii w jednym pliku).
// Trasa jest teraz wyłącznie orkiestracją: uwierzytelnienie, pętla po plikach
// i zapis. Cała robota siedzi w `lib/ocr/*`, gdzie da się ją czytać i testować
// bez podnoszenia handlera HTTP.

import { normalizeStoreName, findStoreInText } from '@/lib/stores'
import { log, parseLocaleDecimal } from './shared'

// --- EKSTRAKCJA DANYCH ---
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function extractReceiptData(azureResult: any) {
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
