# Solvio — redesign do 2 ekranów + API dla crm.programo.pl

Data: 2026-08-22. Zlecenie: Wojtek, pełna autonomia.

## Cel

1. Solvio to **prosta, szybka apka iOS** o dwóch ekranach: **Panel** i **Wydatki**.
2. Wygląd mobilki = wygląd weba (**Notes Classic**: papier `#f7f5f0`, białe karty,
   ciepły pomarańcz `#c85a3a`, Inter + JetBrains Mono, miękkie cienie, kropkowana siatka).
   Stary neobrutalizm (czarne ramki, twarde offsety, `// NAGŁÓWEK` mono) leci w całości.
3. Wydatki: dodawanie z paragonu (OCR) i ręczne, edycja, usuwanie. Nic więcej.
4. Solvio wystawia **publiczne API `/api/v1/*`** (klucz API), z którego korzysta
   `crm.programo.pl` — zakładka Finanse w CRM widzi finanse z Solvio.
5. Solvio potrafi **pisać do CRM** (`FinanceEntry`) — CRUD na finansach firmy z poziomu apki.

## Decyzje architektoniczne

- **Solvio zostaje źródłem prawdy dla wydatków osobistych.** CRM zostaje źródłem prawdy
  dla finansów firmy. Most jest dwukierunkowy, spięty po ID (`expenses.crm_entry_id`).
- **Auth dla integracji = klucz API** (`slv_...`, SHA-256 w bazie, scope READ/WRITE),
  konwencja 1:1 z CRM (`src/lib/api-keys-core.ts`), żeby kod po stronie CRM był identyczny.
  Nagłówek `X-Api-Key` albo `Authorization: Bearer`.
- **Apka nadal chodzi na ciasteczku sesji** — klucze API są wyłącznie dla integracji.
- **Nie kasujemy tabel w prodzie.** Kod nieużywanych modułów znika, ale definicje tabel
  przenoszą się do `lib/db/schema-legacy.ts` i są dalej eksportowane, bo
  `drizzle-kit push` w `docker-entrypoint.sh` DROPnąłby wszystko, czego nie ma w schemacie.
  Faktyczne usunięcie danych = osobna, świadoma decyzja Wojtka.

## Zakres — co zostaje

Web (backend + dev playground):
- `/(auth)/login`, `/(marketing)`, `/(protected)/dashboard`, `/(protected)/expenses`
- `/api/auth/*`, `/api/data/*`, `/api/personal/{budget,incomes,receipt-analyze}`, `/api/v1/*`, `/api/crm/*`

iOS:
- `Panel` (hero + budżet + podział + ostatnie wydatki), `Wydatki` (lista + filtr + szczegóły),
  FAB skanowania paragonu na środku paska, arkusz dodawania/edycji, arkusz ustawień.

## Zakres — co wylatuje

Grupy, bank, subskrypcje, oszczędności/cele, wyzwania, lojalność, ceny, promocje/okazje,
raporty, analizy, audyt, faktury, VAT, zespół, akceptacje, doradca zakupowy, wyszukiwarka
produktów, sklepy w pobliżu, onboarding, tryb business.

## Kryteria weryfikacji

- `npx tsc --noEmit` i `npm run lint` zielone; `npx vitest run` zielone.
- `xcodebuild` na symulatorze zielony, apka odpalona przez XcodeBuildMCP, oba ekrany
  przeklikane na screenshotach (dodanie wydatku, edycja, usunięcie).
- `curl` na produkcji: `/api/v1/health`, `/api/v1/expenses` (GET/POST/PATCH/DELETE)
  z prawdziwym kluczem — kody 200/201 i realne dane.
- Push do CRM: wpis utworzony w Solvio pojawia się w `crm.programo.pl` w Finansach.
- Deploy przez Coolify, `https://solvio.programo.pl` odpowiada po deployu.

## Poza zakresem

Android (Solvio jest iOS-only), fizyczne kasowanie tabel w prodzie, App Store submission.
