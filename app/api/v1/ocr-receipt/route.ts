// app/api/v1/ocr-receipt/route.ts - Azure Document Intelligence
import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import OpenAI from 'openai';

export const runtime = 'nodejs';
export const maxDuration = 60;

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
    console.error('[Azure] POST Error:', errorText);
    throw new Error(`Azure POST failed: ${postResponse.status} - ${errorText}`);
  }

  // Pobierz URL do sprawdzania statusu
  const operationLocation = postResponse.headers.get('Operation-Location');
  if (!operationLocation) {
    throw new Error('Azure did not return Operation-Location header');
  }

  console.log('[Azure] Operation-Location:', operationLocation);

  // Krok 2: Polling - Czekaj na wynik (max 30 prób, co 1 sek)
  let attempts = 0;
  const maxAttempts = 30;
  
  while (attempts < maxAttempts) {
    attempts++;
    console.log(`[Azure] Polling attempt ${attempts}/${maxAttempts}...`);
    
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

// --- EKSTRAKCJA DANYCH ---
function extractReceiptData(azureResult: any) {
  const document = azureResult.analyzeResult?.documents?.[0];
  if (!document) {
    throw new Error('No document found in Azure result');
  }

  const fields = document.fields || {};

  const total = fields.Total?.valueNumber ?? null;
  
  // POPRAWKA: Spróbuj różnych źródeł dla nazwy sklepu
  let merchant = 
    fields.MerchantName?.valueString ?? 
    fields.MerchantName?.content ?? 
    fields.MerchantPhoneNumber?.content?.split(' ')[0] ??
    fields.MerchantAddress?.valueString?.split(',')[0] ??
    fields.MerchantAddress?.content?.split(',')[0] ??
    null;
  
  const date = fields.TransactionDate?.valueDate ?? null;
  const time = fields.TransactionTime?.valueTime ?? null;
  const currency = fields.Total?.valueCurrency?.currencyCode ?? 'PLN';

  // Oczyść nazwę sklepu (usuń dziwne prefiksy i sp. z o.o.)
  if (merchant) {
    merchant = merchant
      .replace(/^OWT\s*/i, '') // Usuń "OWT" na początku
      .replace(/\s*sp\.?\s*z\s*o\.?o\.?\s*sp\.?k\.?/gi, '') // Usuń "sp. z o.o. sp.k."
      .replace(/\s+/g, ' ') // Usuń wielokrotne spacje
      .trim();
  }

  // POPRAWKA: Wyciągnij produkty z pełnymi nazwami
  const items: Array<{
    name: string;
    quantity: number | null;
    price: number | null;
  }> = [];

  const itemsField = fields.Items?.valueArray;
  if (itemsField && Array.isArray(itemsField)) {
    for (const item of itemsField) {
      const itemObj = item.valueObject || {};
      
      // Użyj content (pełny tekst) zamiast valueString (może być ucięty)
      const name = 
        itemObj.Description?.content ?? 
        itemObj.Description?.valueString ?? 
        itemObj.Name?.content ??
        itemObj.Name?.valueString ?? 
        'Nieznany produkt';
      
      const quantity = itemObj.Quantity?.valueNumber ?? null;
      const price = itemObj.TotalPrice?.valueNumber ?? itemObj.Price?.valueNumber ?? null;
      
      items.push({ name, quantity, price });
    }
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
  if (!openai || !categories.length || items.length === 0) {
    return items.map(item => ({ ...item, category_id: null }));
  }

  try {
    console.log(`[GPT] Kategoryzacja ${items.length} produktów (batch)...`);
    
    const categoryMap = categories.map(c => `${c.name}: ${c.id}`).join('\n');
    const itemsList = items.map((item, idx) => `${idx + 1}. ${item.name}`).join('\n');
    
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0,
      max_tokens: 500,
      messages: [
        { 
          role: 'system', 
          content: `Assign category to each product. Return ONLY JSON array.

Categories:
${categoryMap}

Rules (DOKŁADNIE - przypisz do najlepiej pasującej kategorii):
- Food: restauracje, fast food, jedzenie na wynos, pizza, sushi, kebab, obiady, śniadania, kawa na mieście
- Groceries: zakupy w supermarkecie (wszystkie produkty spożywcze), mięso, nabiał, jajka, warzywa, owoce, chleb, ser, jogurt, mleko, masło, krewetki, ryby, drożdże, skrobia, mąka, cukier, sól, przyprawy, woda, napoje, soki, olej, oliwa, papier toaletowy, ręczniki papierowe, środki czystości, folie, worki, mydło, proszki
- Health: apteka, leki, witaminy, plastry, bandaże, suplementy, produkty medyczne, kosmetyki do pielęgnacji
- Transport: benzyna, olej silnikowy, płyn do spryskiwaczy, bilety komunikacji, parking, taksówki, Uber, naprawa samochodu
- Shopping: ubrania, buty, torebki, akcesoria modowe, perfumy, kosmetyki dekoracyjne, biżuteria
- Electronics: telefony, ładowarki, baterie, słuchawki, kable, komputery, tablety, smartwatche, elektronika
- Home & Garden: meble, dekoracje, narzędzia, farby, rośliny, ogród, wyposażenie domu, AGD, RTV
- Entertainment: kino, teatr, koncerty, gry, streaming (Netflix, Spotify), książki, hobby, sport
- Bills & Utilities: prąd, woda, gaz, internet, telefon, TV, czynsz, ubezpieczenia, abonamenty
- Other: wszystko co nie pasuje do powyższych kategorii

WAŻNE: 
- Produkty spożywcze z supermarketu → Groceries (nie Food!)
- Restauracje, fast food → Food
- Kosmetyki pielęgnacyjne → Health, kosmetyki dekoracyjne → Shopping

Return ONLY JSON array: ["uuid1", "uuid2", ...] or ["uuid1", null, "uuid3", ...]`
        },
        { 
          role: 'user', 
          content: itemsList
        },
      ],
    });

    const result = completion.choices[0]?.message?.content?.trim() ?? null;
    if (!result) return items.map(item => ({ ...item, category_id: null }));
    
    const categoryIds = JSON.parse(result) as (string | null)[];
    
    return items.map((item, idx) => ({
      ...item,
      category_id: categoryIds[idx] || null,
    }));
    
  } catch (error) {
    console.error('[GPT] Batch categorization error:', error);
    return items.map(item => ({ ...item, category_id: null }));
  }
}

// --- GŁÓWNY ENDPOINT ---
export async function POST(req: NextRequest) {
  console.log('\n========================================');
  console.log('🧾 AZURE DOCUMENT INTELLIGENCE OCR');
  console.log('========================================\n');

  let receiptId: string | null = null;
  let userId: string | null = null;

  try {
    // 1. Pobierz dane z formularza
    const form = await req.formData();
    receiptId = form.get('receiptId') as string;
    userId = form.get('userId') as string;
    const files = form.getAll('files') as File[];

    if (!receiptId || !userId || !files.length) {
      return json({ error: 'Missing required fields' }, 400);
    }

    console.log(`📄 Receipt ID: ${receiptId}`);
    console.log(`👤 User ID: ${userId}`);
    console.log(`📎 Files: ${files.length}\n`);

    const supabase = await createClient();

    // 2. Pobierz kategorie
    const { data: categories } = await supabase
      .from('categories')
      .select('id, name')
      .order('name');

    // 3. PRZETWÓRZ WSZYSTKIE PLIKI PO KOLEI
    const results = [];
    let currentReceiptId = receiptId; // Pierwszy plik używa istniejącego receipt_id

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      console.log(`\n========================================`);
      console.log(`📦 Processing file ${i + 1}/${files.length}: ${file.name}`);
      console.log(`========================================\n`);

      // Dla kolejnych plików, utwórz nowy receipt
      if (i > 0) {
        const { data: newReceipt, error: newReceiptError } = await supabase
          .from('receipts')
          .insert([{
            user_id: userId,
            status: 'processing',
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
        const buffer = Buffer.from(await file.arrayBuffer());
        const mimeType = file.type || 'image/jpeg';

        // 4. Azure OCR
        const azureResult = await processAzureOCR(buffer, mimeType);
        const { total, merchant, date, time, currency, items } = extractReceiptData(azureResult);

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
        categorizeAllItems(items, categories || [])
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
            console.error(`[File ${i + 1}] [Background] Category error:`, err);
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
        results.push({
          file: file.name,
          success: false,
          error: fileError instanceof Error ? fileError.message : 'Unknown error',
        });
      }
    }

    // Zwróć wyniki dla wszystkich plików
    const successCount = results.filter(r => r.success).length;
    const hasErrors = results.some(r => !r.success);

    return json({
      success: successCount > 0,
      files_processed: results.length,
      files_succeeded: successCount,
      files_failed: results.length - successCount,
      results: results,
      receipt_id: receiptId, // Pierwszy receipt_id dla kompatybilności
    }, hasErrors && successCount === 0 ? 400 : 200);

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
