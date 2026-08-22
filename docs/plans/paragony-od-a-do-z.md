# Paragony od A do Z + zakładka „Prywatne" w CRM

Zlecenie Wojtka (2026-08-22): przetestować i zoptymalizować cały tor paragonów
— parsery, odczyt, analizę, kategoryzację i „generowanie online paragonów" —
a potem zbudować w `crm.programo.pl` zakładkę **Prywatne**, która pokazuje
prywatne finanse dokładnie tak jak Solvio i dokłada do tego paragony.

## Stan zastany (audyt 2026-08-22)

Produkcja Solvio ma w środowisku **wyłącznie `OPENAI_API_KEY`**. Nie ma Azure
Document Intelligence ani `BLOB_READ_WRITE_TOKEN`. Z tego wynikają trzy fakty,
których nie widać w kodzie:

1. **OCR idzie ścieżką vision** (`processVisionOCR`, `gpt-4o-mini`), nie Azure.
   Cała gałąź Azure w `lib/ocr/*` jest na produkcji martwa.
2. **Zdjęcie paragonu nigdy nie jest zapisywane.** Upload leci do Vercel Blob,
   a bez tokenu `put()` w ogóle się nie wykonuje — `receipts.image_url`
   zostaje `NULL`. Solvio stoi na Coolify, więc Blob nie wróci.
3. **Kolumna `receipts.hash` nigdy nie dostaje wartości**, choć istnieje.
   Deduplikacja opiera się wyłącznie na trójce sprzedawca+data+kwota, a więc
   ten sam plik wysłany dwa razy przechodzi OCR (i kosztuje) dwukrotnie,
   jeśli tylko OCR odczyta go choćby minimalnie inaczej.

Do tego:

- `rawOcr` trzyma wyłącznie promocje — **surowy tekst OCR jest wyrzucany**,
  więc nie da się ani zdiagnozować złego odczytu, ani przeliczyć paragonu
  ponownie bez płacenia za OCR jeszcze raz.
- Mapa słów kluczowych do kategoryzacji istnieje **dwa razy**: w
  `lib/categorize.ts` i skopiowana w `app/api/v1/ocr-receipt/route.ts`.
- `/api/v1/ocr-receipt` uwierzytelnia się przez `auth()` (tylko sesja), choć
  leży w `/api/v1/*`, czyli na powierzchni kluczy API. Integracja kluczem
  `slvk_` nie może zeskanować paragonu.
- Nie ma **żadnego** testu na parsery paragonów.
- Tabela `receipt_items` nie jest zapisywana przez nic (pozycje żyją w
  `receipts.items` jako JSONB). Zostaje w schemacie — patrz landmina
  `drizzle-kit push` — ale nie udajemy, że jest źródłem prawdy.

## Cel

### Solvio

- Zdjęcie paragonu **zapisuje się i da się je obejrzeć** — na telefonie i w CRM.
- Ten sam plik wysłany drugi raz jest odrzucany **przed** wywołaniem OCR.
- Surowy odczyt zostaje w bazie, więc analizę da się powtórzyć bez OCR.
- Model vision jest **wybrany pomiarem**, nie na wyczucie, i da się go zmienić
  zmienną środowiskową bez deployu kodu.
- Parsery mają testy jednostkowe na fixturach (bez sieci) i benchmark
  end-to-end na wygenerowanych paragonach.
- `/api/v1/receipts` — pełna powierzchnia dla integracji na kluczu.

### CRM

- Zakładka **Prywatne** (tylko konto właściciela) z trzema sekcjami:
  Podsumowanie, Wydatki, Paragony.
- Pełny CRUD wydatków i paragonów, na żywo, przez API Solvio.
- Podgląd zdjęcia paragonu, pozycji, promocji i surowego odczytu.

## Kryteria weryfikacji

1. `npx vitest run` — zielone, z nowymi testami parsera.
2. `npx tsc --noEmit` i `npm run lint` — czyste w obu repo.
3. Benchmark OCR (`scripts/ocr-bench.mjs`) na 8 wygenerowanych paragonach
   podaje trafność sprzedawcy / kwoty / daty / pozycji per model.
4. Na produkcji: skan paragonu z iPhone'a → zdjęcie widoczne w CRM.
5. W CRM: dodanie, edycja i usunięcie wydatku prywatnego jest widoczne
   w Solvio bez restartu apki.

## Poza zakresem

- Powrót Azure Document Intelligence (nie ma go w env i nie ma po co).
- Odzyskanie zdjęć paragonów zeskanowanych przed tą zmianą — ich nie ma.
- Tabela `receipt_items` jako drugie źródło prawdy.

---

## Wynik (2026-08-22, wieczór)

**Benchmark modeli** (`OCR_BENCH=1 npx vitest run tests/ocr-bench.test.ts`,
8 wygenerowanych paragonów, ta sama seria dla każdego modelu):

| model | sklep | suma | data | pozycje | mediana |
|---|---|---|---|---|---|
| gpt-4o-mini | 88% | 100% | 88% | 100% | 6415 ms |
| gpt-4.1-mini | 88% | 100% | 100% | 100% | 6335 ms |
| gpt-4.1 | 88% | 100% | 100% | 100% | 4323 ms |
| **gpt-5.4-mini** | 88% → **100%** | 100% | 100% | 100% | **3263 ms** |

Nietrafiony sklep był we wszystkich przypadkach TEN SAM paragon (Orlen) i nie
był winą modelu — w `lib/stores.ts` nie było ani jednej stacji paliw. Po
dołożeniu wzorców gpt-5.4-mini ma 100% na całej ósemce.

**Weryfikacja na produkcji** (klucz `slvk_`, `solvio.programo.pl`):

- skan `zabka-cztery-pozycje.jpg` → 7,3 s, „Żabka", 23,76 zł, 4 pozycje
  z rozwiniętymi nazwami („Woda Zywiec Zdroj 0,5L" → „Woda Żywiec Zdrój 0,5L")
  i kategoriami;
- `GET /api/v1/receipts/{id}/image` → 200, `image/jpeg`, 57 729 B;
- ten sam plik wysłany drugi raz → `duplicate` **bez** wywołania modelu;
- `DELETE` paragonu skasował wydatek i plik z wolumenu (katalog paragonu
  sprzątnięty).

**Testy:** 168 przechodzi, 1 pominięty (benchmark, wymaga sieci i pieniędzy).

**Znalezione przy okazji, nietknięte:** `app/api/personal/receipt-analyze`
(371 linii) to porównywarka cen z wyciętego modułu Oszczędności — nic jej nie
woła. Do decyzji Wojtka, czy wraca, czy znika.
