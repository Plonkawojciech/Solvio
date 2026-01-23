# Vercel Deployment Guide

Ten dokument opisuje, jak skonfigurować aplikację na Vercel, aby działała dokładnie tak samo jak lokalnie.

## Wymagane zmienne środowiskowe

Upewnij się, że wszystkie następujące zmienne są skonfigurowane w Vercel Dashboard (Settings → Environment Variables):

### Azure Document Intelligence
- `AZURE_OCR_ENDPOINT` - Endpoint Azure Document Intelligence (np. `https://your-resource.cognitiveservices.azure.com/`)
- `AZURE_OCR_KEY` - Klucz API Azure Document Intelligence

### OpenAI
- `OPENAI_API_KEY` - Klucz API OpenAI (dla kategoryzacji produktów i ekstrakcji nazw sklepów)

### Supabase
- `NEXT_PUBLIC_SUPABASE_URL` - URL twojego projektu Supabase
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` - Publishable (anon) key z Supabase

### Inne (jeśli używane)
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key (jeśli potrzebny dla niektórych operacji)

## Konfiguracja w Vercel

1. **Przejdź do projektu w Vercel Dashboard**
2. **Settings → Environment Variables**
3. **Dodaj wszystkie wymagane zmienne:**
   - Dla każdej zmiennej wybierz środowiska: Production, Preview, Development
   - Upewnij się, że wartości są poprawne (bez spacji na początku/końcu)

## Weryfikacja konfiguracji

Po wdrożeniu, aplikacja automatycznie weryfikuje wszystkie zmienne środowiskowe. Jeśli jakiejś brakuje, zobaczysz błąd w logach Vercel z listą brakujących zmiennych.

## Limity Vercel

- **Function Timeout**: 60 sekund (dla Hobby plan) lub 300 sekund (Pro plan)
- **Body Size Limit**: 4.5 MB (dla Hobby plan) lub 50 MB (Pro plan)
- **Request Timeout**: 10 sekund (Edge) lub 60 sekund (Serverless)

Aplikacja jest skonfigurowana z `maxDuration: 60` dla API routes, co jest zgodne z limitami Vercel.

## Troubleshooting

### Problem: "Missing environment variables"
**Rozwiązanie**: Sprawdź w Vercel Dashboard, czy wszystkie zmienne są ustawione i czy są dostępne dla odpowiedniego środowiska (Production/Preview).

### Problem: "Azure POST failed: 400"
**Rozwiązanie**: 
- Sprawdź czy `AZURE_OCR_ENDPOINT` ma poprawny format (kończy się na `/`)
- Sprawdź czy `AZURE_OCR_KEY` jest poprawny
- Sprawdź czy plik nie jest zbyt duży (max 4.5 MB dla Hobby plan)

### Problem: "OpenAI API error"
**Rozwiązanie**:
- Sprawdź czy `OPENAI_API_KEY` jest poprawny
- Sprawdź czy masz wystarczające limity w OpenAI
- Sprawdź logi Vercel dla szczegółów błędu

### Problem: "Supabase error"
**Rozwiązanie**:
- Sprawdź czy `NEXT_PUBLIC_SUPABASE_URL` i `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` są poprawne
- Sprawdź czy Supabase project jest aktywny
- Sprawdź czy RLS (Row Level Security) nie blokuje zapytań

## Sprawdzanie logów

1. Przejdź do Vercel Dashboard → Twój projekt → Logs
2. Filtruj po funkcji `/api/v1/ocr-receipt`
3. Szukaj błędów zaczynających się od `[OCR]`, `[Azure]`, `[GPT]`

## Testowanie po wdrożeniu

1. Przetestuj skanowanie paragonu
2. Sprawdź logi Vercel pod kątem błędów
3. Sprawdź czy dane są zapisywane w Supabase
4. Sprawdź czy kategorie są przypisywane

## Najczęstsze problemy

1. **Zmienne środowiskowe nie są ustawione** - Sprawdź Vercel Dashboard
2. **Timeout** - Zwiększ plan Vercel lub zoptymalizuj kod
3. **Body size limit** - Pliki są zbyt duże, użyj kompresji obrazów (już zaimplementowane)
4. **Cold start** - Pierwsze wywołanie może być wolniejsze, to normalne
