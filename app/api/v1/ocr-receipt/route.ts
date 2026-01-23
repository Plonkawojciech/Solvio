// app/api/v1/ocr-receipt/route.ts
import { NextRequest } from 'next/server';
import OpenAI from 'openai';
import { z } from 'zod';
import { zodResponseFormat } from 'openai/helpers/zod';
import { createClient } from '@/lib/supabase/server';
import sharp from 'sharp';

export const runtime = 'nodejs';

// --- SCHEMAT DANYCH ---
function createReceiptSchema(categories: Array<{ id: string; name: string }>) {
  const categoryIds = categories.map(c => c.id);
  const categoryNames = categories.map(c => c.name).join(', ');
  
  return z.object({
    vendor: z.string().describe("Store name (e.g. Biedronka, Lidl)").nullable().optional(),
    date: z.string().describe("Date in YYYY-MM-DD format").nullable().optional(),
    currency: z.string().describe("ISO 4217 currency code (PLN, EUR, USD)").nullable().optional(),
    total: z.number().describe("FINAL amount to pay (gross/brutto). After discounts. Use dots for decimals.").nullable().optional(),
    items: z.array(
      z.object({
        name: z.string().describe("Product name from receipt"),
        quantity: z.number().nullable().optional().describe("Quantity purchased (default 1)"),
        price: z.number().nullable().optional().describe("Price for this line item. Use dots for decimals."),
        category_id: z.string()
          .nullable()
          .optional()
          .describe(`Category ID from available categories. Must be one of: ${categoryIds.join(', ')} or null if uncertain.`)
          .refine((val) => !val || categoryIds.includes(val), {
            message: `category_id must be one of: ${categoryIds.join(', ')} or null`,
          }),
      })
    ).default([]),
    ocrText: z.string().default('').describe("Raw OCR text from receipt"),
  });
}
type Receipt = z.infer<ReturnType<typeof createReceiptSchema>>;

const openai = process.env.OPENAI_API_KEY 
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// --- OPTYMALIZACJA OBRAZU (Sharp) - BALANS PRĘDKOŚĆ/JAKOŚĆ ---
async function optimizeImage(buffer: Buffer): Promise<Buffer> {
  try {
    const optimized = await sharp(buffer)
      .resize(1200, 1200, { // Większy rozmiar dla lepszej czytelności
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ 
        quality: 75, // Wyższa jakość dla lepszego OCR
        progressive: false,
        mozjpeg: true,
      })
      .toBuffer();
    console.log(`[OCR] Image optimized: ${(buffer.length / 1024).toFixed(1)}KB -> ${(optimized.length / 1024).toFixed(1)}KB`);
    return optimized;
  } catch (error) {
    console.warn('[OCR] Image optimization failed, using original:', error);
    return buffer;
  }
}

// --- KONWERSJA HEIC (jeśli potrzebna) ---
async function loadHeicConvert(): Promise<((options: { buffer: Buffer; format: 'PNG' | 'JPEG'; quality?: number }) => Promise<Buffer>) | null> {
  try {
    // @ts-expect-error - heic-convert nie ma typów
    const heicConvertModule = await import('heic-convert');
    const convertFn = heicConvertModule.default || heicConvertModule;
    return convertFn as (options: { buffer: Buffer; format: 'PNG' | 'JPEG'; quality?: number }) => Promise<Buffer>;
  } catch (e) {
    return null;
  }
}

async function convertHeicToJpeg(buffer: Buffer): Promise<Buffer> {
  const heicConvert = await loadHeicConvert();
  if (heicConvert) {
    try {
      const output = await heicConvert({ buffer, format: 'JPEG', quality: 0.9 });
      return Buffer.isBuffer(output) ? output : Buffer.from(output);
    } catch (e) {
      // Fallback do sharp
    }
  }
  try {
    return await sharp(buffer).jpeg({ quality: 90 }).toBuffer();
  } catch (error) {
    throw new Error('HEIC conversion failed. Install heic-convert.');
  }
}

async function normalizeImage(buffer: Buffer, mime: string, filename?: string): Promise<{ buffer: Buffer; mime: string }> {
  const isHeic = mime?.includes('heic') || mime?.includes('heif') || filename?.match(/\.(heic|heif|hif)$/i);
  
  if (isHeic) {
    console.log('[OCR] Converting HEIC to JPEG...');
    const converted = await convertHeicToJpeg(buffer);
    return { buffer: converted, mime: 'image/jpeg' };
  }
  
  return { buffer, mime };
}

// --- GŁÓWNA FUNKCJA PRZETWARZANIA ---
async function processImage(
  opts: { buffer: Buffer; filename: string; mime: string },
  openai: OpenAI,
  categories: Array<{ id: string; name: string }>
): Promise<Receipt> {
  let { buffer, mime } = opts;

  // 1. Normalizacja (HEIC -> JPEG jeśli potrzeba)
  try {
    const normalized = await normalizeImage(buffer, mime, opts.filename);
    buffer = normalized.buffer;
    mime = normalized.mime;
  } catch (error) {
    if (mime.includes('heic') || opts.filename.match(/\.heic$/i)) {
      throw error;
    }
  }

  // 2. OPTYMALIZACJA: Zmniejszenie i konwersja do JPEG
  buffer = await optimizeImage(buffer);
  mime = 'image/jpeg';

  const b64 = buffer.toString('base64');
  const dataUrl = `data:${mime};base64,${b64}`;

  // 3. Utworzenie schematu z kategoriami
  const ReceiptZ = createReceiptSchema(categories);
  
  // Formatowanie listy kategorii dla promptu: "Nazwa Kategorii: [UUID]"
  const categoryList = categories.map(c => `${c.name}: [${c.id}]`).join('\n');

  try {
    const completion = await openai.chat.completions.parse({
      model: 'gpt-4o', // Lepszy model dla dokładności OCR
      temperature: 0,
      max_tokens: 4000, // Więcej tokenów żeby nie ucinał produktów
      response_format: zodResponseFormat(ReceiptZ, 'receipt'),
      messages: [
        {
          role: 'system',
          content: `You are a Polish receipt OCR specialist. Extract ALL items and data accurately.

EXTRACTION RULES:

1. PRODUCT NAMES:
   - Copy product names EXACTLY as written on receipt
   - Include full names, don't abbreviate or shorten
   - If name is cut off on receipt, include what you can see
   - Preserve Polish characters (ą, ć, ę, ł, ń, ó, ś, ź, ż)

2. PRICES (CRITICAL - READ CAREFULLY):
   - 'price' field = TOTAL LINE PRICE (already includes quantity)
   - Example: Receipt shows "Woda 6x 0,99 = 5,94" → price = 5.94 (NOT 0.99)
   - Example: Receipt shows "Chleb 3,50" → price = 3.50
   - Example: Receipt shows "Mleko 2x 4,99" and line total is "9,98" → price = 9.98 (NOT 4.99)
   - ALWAYS use the FINAL LINE TOTAL shown on receipt
   - NEVER multiply unit price × quantity - the receipt already did that
   - Convert Polish commas to dots: "12,99" → 12.99
   - If price is unclear, use null (don't guess)

3. QUANTITY:
   - Extract the number: "6x" → 6, "2 szt" → 2, "1" → 1
   - If no quantity shown, use 1

4. TOTAL:
   - Find "DO ZAPŁATY", "SUMA PLN", "RAZEM", "SUMA" (gross total after discounts)
   - Ignore "Suma Netto" or "Podatek VAT"
   - If discount present, use final amount AFTER discount

5. VENDOR:
   - Extract store name from top of receipt (e.g., "Biedronka", "Lidl", "Żabka")

6. DATE:
   - Format: YYYY-MM-DD
   - Extract from receipt header or footer

7. CATEGORIES:
   - Food: all edible items (fruits, vegetables, meat, seafood, dairy, bread, drinks, snacks, prepared food)
   - Groceries: non-food household items (cleaning products, personal care, toilet paper)
   - Transport: fuel, tickets, parking
   - Entertainment: cinema, games, books, streaming
   - Utilities: bills (electricity, gas, water, internet, phone)
   - Health: medicine, medical services
   - Other: everything else

Available categories: ${categoryList}

IMPORTANT: Extract ALL items from receipt. Don't skip any products. If receipt has 20 items, return all 20.`,
        },
        {
          role: 'user',
          content: [
            { 
              type: 'text', 
              text: `Analyze this Polish receipt image. Extract ALL products with their exact names and prices. 
              
For prices: Use the LINE TOTAL (final price for that line item). If receipt shows "6x 0,99 = 5,94", the price is 5.94, NOT 0.99.
              
Extract every single item - don't skip or abbreviate anything.` 
            },
            { type: 'image_url', image_url: { url: dataUrl, detail: 'auto' } }, // 'auto' = balans prędkość/jakość
          ],
        },
      ],
    });

    const parsed = completion.choices[0]?.message?.parsed;
    if (!parsed) {
      throw new Error('No data parsed from OpenAI');
    }
    return parsed;
  } catch (error) {
    console.error('[OCR] OpenAI error:', error);
    throw error;
  }
}

export async function POST(req: NextRequest) {
  if (!openai) return json({ error: 'OpenAI API key missing' }, 500);

  const form = await req.formData().catch(() => null);
  if (!form) return json({ error: 'Invalid form data' }, 400);

  const receiptId = form.get('receiptId') as string;
  const userId = form.get('userId') as string;
  const files = form.getAll('files') as File[];

  if (!receiptId || !userId || !files.length) {
    return json({ error: 'Missing required fields (receiptId, userId, files)' }, 400);
  }

  const supabase = await createClient();

  // Pobranie kategorii z bazy
  const { data: categories, error: categoriesError } = await supabase
    .from('categories')
    .select('id, name')
    .order('name');

  if (categoriesError) {
    console.error('[OCR] Failed to fetch categories:', categoriesError);
    return json({ error: 'Failed to fetch categories' }, 500);
  }

  if (!categories || categories.length === 0) {
    return json({ error: 'No categories available. Please create categories first.' }, 400);
  }

  const file = files[0];
  const buffer = Buffer.from(await file.arrayBuffer());

  console.log(`[OCR] Processing receipt: ${receiptId}, file: ${file.name} (${(buffer.length / 1024).toFixed(1)} KB)`);

  let parsedData: Receipt | null = null;
  
  try {
    parsedData = await processImage(
      { buffer, filename: file.name, mime: file.type },
      openai,
      categories
    );
  } catch (err) {
    await supabase.from('receipts').update({ 
      status: 'failed', 
      notes: `AI Error: ${err instanceof Error ? err.message : 'Unknown'}` 
    }).eq('id', receiptId).eq('user_id', userId);
    return json({ error: 'AI processing failed' }, 500);
  }

  if (!parsedData) {
    return json({ error: 'No data parsed' }, 500);
  }

  // OBSŁUGA BŁĘDÓW: Jeśli brak totala, zsumuj ceny produktów
  // WAŻNE: item.price to już cena całkowita za linię (nie mnożymy przez quantity!)
  let finalTotal = parsedData.total || 0;
  const calculatedSum = parsedData.items.reduce((sum, item) => sum + (item.price || 0), 0);
  
  // Używamy totala z paragonu jeśli istnieje, w przeciwnym razie sumę produktów
  if (finalTotal === 0 && calculatedSum > 0) {
    console.log(`[OCR] Total missing, using sum: ${calculatedSum}`);
    finalTotal = Number(calculatedSum.toFixed(2));
  } else if (finalTotal > 0) {
    // Zawsze używamy totala z paragonu - jest bardziej wiarygodny
    // (może zawierać opłaty, które nie są w pozycjach)
  }

  // ZAPIS DO BAZY - SEKWENCJA OPERACJI
  try {
    // a) Zaktualizuj receipts
    const receiptUpdatePayload: any = {
      status: 'processed',
      notes: JSON.stringify({
        items: parsedData.items,
        ocr_preview: (parsedData.ocrText || '').substring(0, 1000),
        ai_total: finalTotal,
        ai_date: parsedData.date,
      }, null, 2),
    };

    if (parsedData.vendor) receiptUpdatePayload.vendor = parsedData.vendor;
    if (parsedData.date) receiptUpdatePayload.date = parsedData.date;
    if (finalTotal > 0) receiptUpdatePayload.total = finalTotal;

    const { error: receiptError } = await supabase
      .from('receipts')
      .update(receiptUpdatePayload)
      .eq('id', receiptId)
      .eq('user_id', userId);

    if (receiptError) {
      console.error('[OCR] Receipts update error:', receiptError);
      return json({ error: receiptError.message }, 500);
    }

    // b) Usuń stare wpisy z expenses dla tego receipt_id
    const { error: deleteError } = await supabase
      .from('expenses')
      .delete()
      .eq('receipt_id', receiptId)
      .eq('user_id', userId);

    if (deleteError) {
      console.error('[OCR] Expenses delete error:', deleteError);
      // Kontynuuj mimo błędu - może nie było starych wpisów
    }

    // c) Wstaw JEDEN wiersz do expenses reprezentujący cały paragon
    const { data: existingExpense } = await supabase
      .from('expenses')
      .select('id')
      .eq('receipt_id', receiptId)
      .eq('user_id', userId)
      .maybeSingle();

    const expensePayload = {
      title: parsedData.vendor ? `${parsedData.vendor} - Receipt` : 'Receipt',
      amount: finalTotal,
      date: parsedData.date || new Date().toISOString().split('T')[0],
      vendor: parsedData.vendor || null,
    };

    if (existingExpense) {
      const { error: updateError } = await supabase
        .from('expenses')
        .update(expensePayload)
        .eq('id', existingExpense.id)
        .eq('user_id', userId);
      
      if (updateError) {
        console.error('[OCR] Expenses update error:', updateError);
        return json({ error: `Failed to update expense: ${updateError.message}` }, 500);
      }
      console.log('[OCR] Successfully updated receipt expense');
    } else {
      const { error: insertError } = await supabase.from('expenses').insert([{
        user_id: userId,
        receipt_id: receiptId,
        ...expensePayload,
        quantity: 1,
        source: 'ocr',
        category_id: null, // Paragon bez kategorii (produkty mają swoje kategorie w notes)
      }]);
      
      if (insertError) {
        console.error('[OCR] Expenses insert error:', insertError);
        return json({ error: `Failed to save expense: ${insertError.message}` }, 500);
      }
      console.log('[OCR] Successfully inserted receipt expense');
    }

    return json({ 
      success: true, 
      data: parsedData,
      stats: {
        itemsCount: parsedData.items.length,
        itemsWithCategories: parsedData.items.filter(i => i.category_id).length,
        total: finalTotal,
      }
    });
  } catch (error) {
    console.error('[OCR] Database error:', error);
    return json({ 
      error: error instanceof Error ? error.message : 'Database operation failed' 
    }, 500);
  }
}
