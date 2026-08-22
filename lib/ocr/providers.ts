// Wydzielone z `app/api/v1/ocr-receipt/route.ts` (1598 linii w jednym pliku).
// Trasa jest teraz wyłącznie orkiestracją: uwierzytelnienie, pętla po plikach
// i zapis. Cała robota siedzi w `lib/ocr/*`, gdzie da się ją czytać i testować
// bez podnoszenia handlera HTTP.

import { getAIClient } from '@/lib/ai-client'
import { AZURE_ENDPOINT, AZURE_KEY, log, OCR_ERROR_CODES } from './shared'

// --- AZURE OCR ---
export async function processAzureOCR(buffer: Buffer, mimeType: string) {
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
      let errorJson: { error?: { message?: string } } | null = null
      try {
        errorJson = JSON.parse(errorText);
      } catch {
        // Not JSON, use raw text
      }
      if (errorJson?.error?.message?.includes('invalid') || errorJson?.error?.message?.includes('type')) {
        throw new Error(OCR_ERROR_CODES.invalidFormat);
      }
    }

    throw new Error(OCR_ERROR_CODES.uploadFailed);
  }

  // Pobierz URL do sprawdzania statusu
  const operationLocation = postResponse.headers.get('Operation-Location');
  if (!operationLocation) {
    throw new Error(OCR_ERROR_CODES.missingOperation);
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
      throw new Error(OCR_ERROR_CODES.pollFailed);
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
      console.error('[Azure] OCR failed payload:', result.error || result);
      throw new Error(OCR_ERROR_CODES.failed);
    }

    // Status: running, notStarted - kontynuuj polling
  }

  throw new Error(OCR_ERROR_CODES.timeout);
}

// --- VISION OCR (fallback bez Azure) ---
// Używa klienta AI z obsługą obrazów (Gemini darmowy tier / GPT-4o-mini) do
// odczytania paragonu i zwraca wynik W KSZTAŁCIE odpowiedzi Azure, żeby cały
// dalszy pipeline (extractReceiptData, wykrywanie sieci, kategoryzacja)
// działał bez zmian.
export async function processVisionOCR(buffer: Buffer, mimeType: string) {
  const ai = getAIClient();
  if (!ai) throw new Error('No AI provider configured for vision OCR');
  if (mimeType === 'application/pdf') {
    throw new Error('PDF receipts require Azure Document Intelligence — upload a photo (JPG/PNG) instead');
  }

  log(`[VisionOCR] Using ${ai.backend}/${ai.model}, buffer: ${(buffer.length / 1024).toFixed(1)}KB`);
  const startTime = Date.now();
  const dataUri = `data:${mimeType};base64,${buffer.toString('base64')}`;

  const completion = await ai.client.chat.completions.create({
    model: ai.model,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: [
              'Read this retail receipt image (likely Polish). Return ONLY valid JSON, no markdown fences:',
              '{',
              '  "merchant": string|null,        // store name, e.g. "Biedronka"',
              '  "date": "YYYY-MM-DD"|null,      // transaction date',
              '  "total": number|null,           // final amount paid',
              '  "currency": "PLN"|"EUR"|...,    // 3-letter code, default PLN',
              '  "items": [ { "name": string, "quantity": number|null, "unit_price": number|null, "total_price": number|null } ],',
              '  "raw_text": string              // full receipt text, line by line',
              '}',
              'Rules: item names exactly as printed; total_price = final line price after discounts; skip deposit/loyalty/VAT summary lines.',
            ].join('\n'),
          },
          { type: 'image_url', image_url: { url: dataUri } },
        ],
      },
    ],
    max_tokens: 4000,
    temperature: 0,
  });

  const raw = completion.choices[0]?.message?.content || '';
  const jsonText = raw.replace(/```json\s*/gi, '').replace(/```/g, '').trim();
  let parsed: {
    merchant?: string | null;
    date?: string | null;
    total?: number | null;
    currency?: string | null;
    items?: Array<{ name?: string; quantity?: number | null; unit_price?: number | null; total_price?: number | null }>;
    raw_text?: string;
  };
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    const match = jsonText.match(/\{[\s\S]*\}/);
    if (!match) throw new Error(`Vision OCR returned unparseable output: ${raw.slice(0, 200)}`);
    parsed = JSON.parse(match[0]);
  }

  log(`[VisionOCR] ✅ Done in ${Date.now() - startTime}ms — merchant="${parsed.merchant}", total=${parsed.total}, items=${parsed.items?.length ?? 0}`);

  // Synteza odpowiedzi w kształcie Azure prebuilt-receipt
  const currencyCode = (parsed.currency || 'PLN').toUpperCase().slice(0, 3);
  return {
    analyzeResult: {
      content: parsed.raw_text || '',
      documents: [
        {
          fields: {
            MerchantName: parsed.merchant ? { valueString: parsed.merchant } : undefined,
            TransactionDate: parsed.date ? { valueDate: parsed.date } : undefined,
            Total: parsed.total != null
              ? { valueNumber: parsed.total, valueCurrency: { currencyCode } }
              : undefined,
            Items: {
              valueArray: (parsed.items || [])
                .filter((it) => it && it.name)
                .map((it) => ({
                  valueObject: {
                    Description: { valueString: String(it.name) },
                    Quantity: it.quantity != null ? { valueNumber: it.quantity } : undefined,
                    Price: it.unit_price != null ? { valueNumber: it.unit_price } : undefined,
                    TotalPrice: it.total_price != null ? { valueNumber: it.total_price } : undefined,
                  },
                })),
            },
          },
        },
      ],
    },
  };
}
