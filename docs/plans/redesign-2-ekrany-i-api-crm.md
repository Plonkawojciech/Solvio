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

---

## Analiza `/finanse` w crm.programo.pl (2026-08-22)

Co pokazuje ekran CRM-a i co Solvio musiało dobudować, żeby dało się nim sterować:

| Element CRM-a | Skąd dane | Stan po stronie Solvio |
|---|---|---|
| Kafelki: Przychody, Koszty, Wynik, MRR, Łącznie | `GET /api/v1/finance/summary` | ✅ `GET /api/crm/entries` zwraca to w polu `summary` |
| Lista wpisów miesiąca | `GET /api/v1/finance` | ✅ `GET /api/crm/entries` |
| Dodanie wpisu | `POST /api/v1/finance` | ✅ `POST /api/crm/entries` |
| Edycja / „zapłacone" | `PATCH /api/v1/finance/{id}` | ✅ `PATCH /api/crm/entries/{id}` |
| Usunięcie wpisu | `DELETE /api/v1/finance/{id}` | ✅ `DELETE /api/crm/entries/{id}` |
| Przypisanie klienta | `GET /api/v1/clients` | ✅ `GET /api/crm/context` |
| Zobowiązania cykliczne | `GET /api/v1/recurring-commitments` | ✅ `GET /api/crm/context` (tylko odczyt) |
| Stan konta + oś czasu | `GET /api/v1/account-balance` | ⚠️ funkcja `listBalances` gotowa, brak trasy — nie ma dziś ekranu, który by to pokazał |
| Wykresy roczne | `getYearSummary` w `summary` | ⚠️ dane wracają, brak wizualizacji w apce |
| Analiza Claude | `AskClaudeButton` w CRM-ie | ❌ poza zakresem — zostaje w CRM-ie |

**Wniosek.** Warstwa danych jest kompletna: z apki da się dziś zrobić pełny
CRUD na Finansach CRM-a plus przełączyć „zapłacone", czyli najczęstszą
operację na tym ekranie. Czego NIE ma, to trzeciego ekranu, który by to
pokazał — bo Wojtek świadomie ograniczył apkę do Panelu i Wydatków.
Gdy przyjdzie czas na zakładkę „Firma", nie trzeba będzie dokładać backendu.

**Świadomie pominięte:** stan konta i wykresy roczne (brak odbiorcy w UI),
tworzenie i edycja zobowiązań cyklicznych (rzadka operacja, wygodniejsza
na dużym ekranie), analiza Claude (żyje w CRM-ie i tam ma zostać).
