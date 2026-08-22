// Wydzielone z `app/api/v1/ocr-receipt/route.ts` (1598 linii w jednym pliku).
// Trasa jest teraz wyłącznie orkiestracją: uwierzytelnienie, pętla po plikach
// i zapis. Cała robota siedzi w `lib/ocr/*`, gdzie da się ją czytać i testować
// bez podnoszenia handlera HTTP.

// --- EXCHANGE RATES ---
// Cache exchange rates in-memory (1 hour)
let rateCache: { rates: Record<string, number>; ts: number } | null = null;

export async function getExchangeRates(): Promise<Record<string, number>> {
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

export function getExchangeRate(fromCurrency: string, toCurrency: string, rates: Record<string, number>): number | null {
  if (!fromCurrency || fromCurrency === toCurrency) return null;
  // rates is EUR-based: to convert from X to Y = rates[Y] / rates[X]
  const toRate = toCurrency === 'EUR' ? 1 : rates[toCurrency];
  const fromRate = fromCurrency === 'EUR' ? 1 : rates[fromCurrency];
  if (!toRate || !fromRate) return null;
  return toRate / fromRate;
}
