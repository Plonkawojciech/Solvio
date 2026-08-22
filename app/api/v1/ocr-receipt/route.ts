// app/api/v1/ocr-receipt/route.ts — orkiestracja skanu paragonu.
//
// Sama robota (Azure/Vision, ekstrakcja pól, kursy, kategoryzacja) siedzi
// w `lib/ocr/*`. Tutaj zostaje to, co jest naprawdę trasą HTTP: autoryzacja,
// limit, pętla po plikach i atomowy zapis paragonu razem z wydatkiem.
import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth-compat';
import { rateLimitPersistent } from '@/lib/rate-limit';
import { db, receipts, expenses, categories, userSettings } from '@/lib/db';
import { eq, and } from 'drizzle-orm';
import { put } from '@vercel/blob';
import { findStoreInText, normalizeStoreName } from '@/lib/stores';
import { dbBatch } from '@/lib/db/batch'
import { resolveCategory, syncExpenseWithCrm } from '@/lib/expense-core'
import { AZURE_ENDPOINT, AZURE_KEY, json, log, OCR_ERROR_CODES } from '@/lib/ocr/shared'
import { processAzureOCR, processVisionOCR } from '@/lib/ocr/providers'
import { getExchangeRate, getExchangeRates } from '@/lib/ocr/fx'
import { extractReceiptData } from '@/lib/ocr/extract'
import { categorizeAndTranslateItems, extractMerchantWithAI } from '@/lib/ocr/enrich'

export const runtime = 'nodejs';
export const maxDuration = 60;

// --- GŁÓWNY ENDPOINT ---
export async function POST(req: NextRequest) {
  log('\n[OCR] 🧾 AZURE DOCUMENT INTELLIGENCE OCR - request received');

  // AUTH CHECK
  const { userId: authUserId } = await auth();
  if (!authUserId) {
    return json({ error: 'Unauthorized' }, 401);
  }

  // RATE LIMIT: 30 requests per hour per userId
  const rlOcr = await rateLimitPersistent(`ocr:receipt:${authUserId}`, { maxRequests: 30, windowMs: 60 * 60 * 1000 })
  if (!rlOcr.allowed) {
    return json({ error: 'OCR rate limit exceeded. Try again later.' }, 429)
  }

  // WERYFIKACJA ZMIENNYCH ŚRODOWISKOWYCH
  // OCR: Azure Document Intelligence (preferowane) LUB vision przez klienta AI
  // (np. darmowy Gemini) — patrz processVisionOCR.
  const missingEnvVars: string[] = [];
  const hasAzureOcr = !!(process.env.AZURE_OCR_ENDPOINT && process.env.AZURE_OCR_KEY);
  const hasAnyAI = !!(
    process.env.OPENAI_API_KEY ||
    process.env.GEMINI_API_KEY ||
    (process.env.AZURE_OPENAI_ENDPOINT && process.env.AZURE_OPENAI_API_KEY && process.env.AZURE_OPENAI_DEPLOYMENT)
  );
  if (!hasAzureOcr && !hasAnyAI) missingEnvVars.push('AZURE_OCR_* or an AI provider (OPENAI_API_KEY / GEMINI_API_KEY / AZURE_OPENAI_*)');
  if (!hasAnyAI) missingEnvVars.push('OPENAI_API_KEY or GEMINI_API_KEY or AZURE_OPENAI_*');
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

        // 4+5. Parallel: Upload to Vercel Blob + OCR
        // Azure Document Intelligence gdy skonfigurowane; inaczej vision OCR
        // przez klienta AI (np. darmowy Gemini) — patrz processVisionOCR.
        const useAzureOcr = !!(AZURE_ENDPOINT && AZURE_KEY);
        const [imageUrl, azureResult] = await Promise.all([
          process.env.BLOB_READ_WRITE_TOKEN
            ? put(`receipts/${userId}/${currentReceiptId}/${file.name}`, buffer, { access: 'public', contentType: mimeType }).then(r => r.url).catch((blobErr) => {
                console.warn(`[File ${i + 1}] ⚠️ Blob upload failed (non-fatal):`, blobErr);
                return null;
              })
            : Promise.resolve(null),
          useAzureOcr ? processAzureOCR(buffer, mimeType) : processVisionOCR(buffer, mimeType),
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

        // Kategoria wydatku = ta, na którą poszło NAJWIĘCEJ pieniędzy, a nie
        // kategoria najdroższej pojedynczej pozycji. Paragon z ośmioma
        // produktami spożywczymi i jedną drogą żarówką lądował wcześniej
        // w „Dom i ogród".
        const spendByCategory = new Map<string, number>();
        for (const item of finalItems) {
          if (!item.category_id) continue;
          spendByCategory.set(item.category_id, (spendByCategory.get(item.category_id) ?? 0) + (item.price ?? 0));
        }
        let bestCategoryId: string | null = null;
        let bestSpend = -1;
        for (const [id, spend] of spendByCategory) {
          if (spend > bestSpend) { bestSpend = spend; bestCategoryId = id; }
        }

        // Żadna pozycja nie dostała kategorii — zostaje sprzedawca. Ta sama
        // ścieżka, którą idzie ręcznie dodany wydatek (reguła sprzedawcy →
        // model), więc paragon z rozpoznanego sklepu nigdy nie ląduje bez
        // kategorii tylko dlatego, że OCR nie poradził sobie z pozycjami.
        if (!bestCategoryId && finalMerchant) {
          bestCategoryId = await resolveCategory(userId, finalMerchant, finalMerchant);
          if (bestCategoryId) {
            log(`[File ${i + 1}] 🏷️ Kategoria z nazwy sklepu "${finalMerchant}"`);
          }
        }

        // 9-11. ATOMIC: update receipt + delete prior expenses + insert new expense.
        // Neon HTTP driver doesn't support db.transaction(async tx) but it does
        // support db.batch([...]) which runs all statements inside a single
        // server-side transaction with automatic rollback on any failure. This
        // prevents partial-failure states where the receipt is marked
        // "processed" but the expense row never lands (or vice versa, where a
        // re-scan deletes the prior expense but the new one fails to insert).
        await dbBatch((x) => [
          x.update(receipts)
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
          x.delete(expenses).where(
            and(
              eq(expenses.receiptId, currentReceiptId),
              eq(expenses.userId, userId)
            )
          ),
          x.insert(expenses).values({
            userId,
            receiptId: currentReceiptId,
            title: `${finalMerchant}`,
            amount: String(finalTotal),
            currency: currency,
            date: finalDate,
            vendor: finalMerchant,
            categoryId: bestCategoryId,
          }),
        ]);

        // Klient potrzebuje id wydatku, żeby po skanie od razu otworzyć ekran
        // potwierdzenia. Bez tego musiałby zgadywać, który wiersz przed chwilą
        // powstał — a przy dwóch paragonach z tego samego sklepu tego samego
        // dnia zgadłby źle.
        const [createdExpense] = await db.select({ id: expenses.id })
          .from(expenses)
          .where(and(eq(expenses.receiptId, currentReceiptId), eq(expenses.userId, userId)))
          .limit(1);

        // Most do CRM-a. Paragon rodzi wydatek tą samą drogą co ręczne
        // dodanie, więc `autoPush` musi zadziałać także tutaj.
        if (createdExpense?.id) {
          try {
            await syncExpenseWithCrm(userId, createdExpense.id);
          } catch (crmError) {
            console.error('[OCR] CRM sync failed (nie blokuje skanu):', crmError);
          }
        }

        log(`[File ${i + 1}] ✅ Receipt updated + expense created (categoryId=${bestCategoryId}, expenseId=${createdExpense?.id})`);

        results.push({
          file: file.name,
          success: true,
          receipt_id: currentReceiptId,
          expense_id: createdExpense?.id ?? null,
          data: {
            merchant: finalMerchant,
            total: finalTotal,
            currency,
            // Kategoria wybrana przez backend (najczęstsza wśród pozycji).
            // Bez niej ekran potwierdzenia musiałby jej szukać w liście
            // wydatków, która w tym momencie jeszcze się nie odświeżyła.
            category_id: bestCategoryId,
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

          if (errorMessage === OCR_ERROR_CODES.invalidFormat) {
            errorType = 'azure_invalid_format';
            errorMessage = 'Azure rejected the file format. The image may be corrupted or in an unsupported format.';
          } else if (errorMessage === OCR_ERROR_CODES.uploadFailed || errorMessage === OCR_ERROR_CODES.pollFailed || errorMessage === OCR_ERROR_CODES.failed) {
            errorType = 'ocr_failed';
            errorMessage = 'Receipt OCR failed. Please retry with a clearer photo.';
          } else if (errorMessage === OCR_ERROR_CODES.timeout || errorMessage === OCR_ERROR_CODES.missingOperation) {
            errorType = 'ocr_timeout';
            errorMessage = 'Receipt OCR timed out. Please retry in a moment.';
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
