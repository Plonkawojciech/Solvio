// Wydzielone z `app/api/v1/ocr-receipt/route.ts` (1598 linii w jednym pliku).
// Trasa jest teraz wyłącznie orkiestracją: uwierzytelnienie, pętla po plikach
// i zapis. Cała robota siedzi w `lib/ocr/*`, gdzie da się ją czytać i testować
// bez podnoszenia handlera HTTP.

import { AZURE_ENDPOINT, AZURE_KEY, log, OCR_ERROR_CODES } from './shared'

// --- AZURE OCR ---
// Ścieżka nieaktywna na produkcji: `AZURE_OCR_*` nie są ustawione, więc
// paragony idą przez `lib/ocr/vision.ts`. Zostaje, bo Azure czyta PDF-y,
// czego model vision nie robi.
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
