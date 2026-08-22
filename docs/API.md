# Solvio API v1

Publiczne API Solvio. Powstało po to, żeby **zakładka Finanse w
`crm.programo.pl`** widziała wydatki z Solvio i mogła nimi sterować.
Konwencje (nagłówki, `since`, `limit`/`cursor`, kształt błędów) są celowo
identyczne z API CRM-a — integracja po obu stronach wygląda tak samo.

- Adres: `https://solvio.programo.pl`
- Format: JSON, UTF-8
- Kody: `200` OK, `201` utworzono, `400` złe dane, `401` brak autoryzacji,
  `403` klucz tylko do odczytu, `404` nie znaleziono, `502` CRM niedostępny
- Błąd zawsze wygląda tak: `{ "error": "opis po polsku" }`

## Autoryzacja

Klucz API wystawiasz w Solvio: **Ustawienia → Klucze API**. Jawny klucz
pokazuje się RAZ, przy tworzeniu — w bazie leży wyłącznie SHA-256, więc nie
da się go odzyskać. Zgubiony klucz unieważniasz i wystawiasz nowy.

Klucz podajesz w jednym z dwóch nagłówków:

```
X-Api-Key: slvk_1a2b3c4d_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
Authorization: Bearer slvk_1a2b3c4d_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

Zakresy: **READ** przepuszcza tylko `GET`/`HEAD`/`OPTIONS`, **WRITE**
wszystko. Klucz READ na `POST` dostaje `403`, nie `401` — to jest różnica
między „nie wiem, kim jesteś" a „wiem i nie wolno ci".

Klucz jest przypisany do konta, które go wystawiło, i widzi wyłącznie jego
dane. Nie ma klucza „globalnego".

## Paginacja i przyrosty

Wspólne dla wszystkich list:

| Parametr | Znaczenie |
|---|---|
| `limit` | 1–500. Bez niego dostajesz całą przefiltrowaną listę. |
| `cursor` | Nieprzezroczysty kursor z pola `nextCursor` poprzedniej strony. Wymaga `limit`. |
| `since` | ISO 8601. Zwraca to, co zmieniło się PO tym momencie — porównywane z `updated_at`, nie `created_at`, żeby zedytowany stary wiersz też wrócił. Zła data to `400`, nigdy po cichu zignorowany filtr. |

`nextCursor: null` znaczy „to była ostatnia strona".

---

## `GET /api/v1/health`

Puls bez autoryzacji — do monitoringu.

```bash
curl https://solvio.programo.pl/api/v1/health
# {"ok":true,"service":"solvio","api":"v1"}
```

---

## `GET /api/v1/expenses`

Lista wydatków, malejąco po dacie (`id` rosnąco jako rozstrzygacz).

Filtry: `from`, `to` (`YYYY-MM-DD`), `categoryId` (uuid), `q` (szuka w
tytule i sprzedawcy), plus `since` / `limit` / `cursor`.

```bash
curl -H "X-Api-Key: $SOLVIO_KEY" \
  "https://solvio.programo.pl/api/v1/expenses?from=2026-08-01&to=2026-08-31&limit=50"
```

```json
{
  "expenses": [
    {
      "id": "3f2b…",
      "title": "Zakupy spożywcze",
      "amount": "122.61",
      "currency": "PLN",
      "date": "2026-08-17",
      "categoryId": "9c1e…",
      "categoryName": "Zakupy spożywcze",
      "vendor": "Biedronka",
      "notes": null,
      "receiptId": null,
      "crmEntryId": null,
      "createdAt": "2026-08-17T09:12:44.000Z",
      "updatedAt": "2026-08-17T09:12:44.000Z"
    }
  ],
  "nextCursor": "MjAyNi0wOC0xN3wzZjJi…"
}
```

`amount` jest STRINGIEM. Kwoty to `numeric` w bazie i tak wychodzą na
zewnątrz — parsowanie ich jako float po drodze gubi grosze.

## `POST /api/v1/expenses`

Tworzy wydatek. Wymaga klucza WRITE.

| Pole | Typ | Uwagi |
|---|---|---|
| `title` | string | wymagane, ≤ 200 znaków |
| `amount` | number \| string | wymagane, > 0. `"12,50"` też przejdzie |
| `date` | string | wymagane, `YYYY-MM-DD` |
| `categoryId` | uuid \| null | **pominięte = kategoryzuje AI** (reguła sprzedawcy → model) |
| `vendor` | string \| null | |
| `notes` | string \| null | ≤ 2000 znaków |
| `currency` | string | 3 znaki, domyślnie `PLN` |
| `tags` | string[] \| null | maks. 5 |
| `receiptId` | uuid \| null | powiązanie ze zeskanowanym paragonem |
| `pushToCrm` | bool | `true` = wypchnij do Finansów CRM-a; `false` = nie; pominięte = wg ustawienia `autoPush` połączenia |

```bash
curl -X POST -H "X-Api-Key: $SOLVIO_KEY" -H "content-type: application/json" \
  -d '{"title":"Paliwo","amount":"214.91","date":"2026-08-15","vendor":"Orlen"}' \
  https://solvio.programo.pl/api/v1/expenses
# 201 {"expense":{…}}
```

## `GET /api/v1/expenses/{id}`
## `PATCH /api/v1/expenses/{id}`
## `DELETE /api/v1/expenses/{id}`

`PATCH` przyjmuje dowolny podzbiór pól z `POST`. Jeśli wydatek ma już
`crmEntryId`, edycja **dociąga wpis w CRM-ie** zamiast tworzyć duplikat;
usunięcie kasuje go również tam.

```bash
curl -X PATCH -H "X-Api-Key: $SOLVIO_KEY" -H "content-type: application/json" \
  -d '{"amount":"219.00"}' \
  https://solvio.programo.pl/api/v1/expenses/3f2b…
```

## `DELETE /api/v1/expenses`

Usuwanie hurtem: `{ "ids": ["uuid", "uuid"] }` → `{ "ok": true, "deleted": 2 }`.

---

## `GET /api/v1/categories`
## `POST /api/v1/categories`

```json
{ "categories": [ { "id": "…", "name": "Transport", "icon": "car", "color": "#3f9c74", "isDefault": true } ] }
```

`icon` trzyma **nazwę ikony lucide** (`"shopping-cart"`), nie emoji. Klient
natywny musi to zmapować na własny zestaw — inaczej wyświetli słowo.

`POST` przyjmuje `{ name, icon?, color? }`; `color` w formacie `#rrggbb`.

---

## `GET /api/v1/summary`

Agregaty miesiąca — ten sam kształt, którym karmi się Panel w apce, żeby
zakładka Finanse w CRM-ie pokazywała dokładnie te liczby, co telefon.

Parametry: `year`, `month` (1–12). Bez nich — bieżący miesiąc.

```json
{
  "period": { "year": 2026, "month": 8, "from": "2026-08-01", "to": "2026-08-31" },
  "total": "2873.15",
  "count": 26,
  "budget": "3500.00",
  "byCategory": [
    { "categoryId": "…", "name": "Zakupy spożywcze", "color": "#e2493a", "total": "1198.72", "count": 9 }
  ]
}
```

---

# Most do Finansów CRM-a

Ścieżki `/api/crm/*` obsługują **sesję zalogowanego użytkownika**, nie klucz
API — wpina je człowiek z poziomu apki albo weba. Klucz CRM-a nigdy nie
trafia na telefon: leży zaszyfrowany (AES-256-GCM) po stronie Solvio.

### Połączenie

| Metoda | Ścieżka | Co robi |
|---|---|---|
| `GET` | `/api/crm/connection` | stan połączenia (bez sekretu — tylko 4 ostatnie znaki) |
| `PUT` | `/api/crm/connection` | zapisuje `{ baseUrl?, apiKey, autoPush?, defaultCategory? }`; **najpierw sprawdza klucz** i odmawia zapisu, jeśli CRM go odrzuci |
| `DELETE` | `/api/crm/connection` | rozłącza |

### Sterowanie Finansami

Odwzorowanie ekranu `/finanse` w CRM-ie. Wpis to `FinanceEntry`:
`{ id, type: INCOME|EXPENSE, date, amount, title, category, paid, note, client }`.

| Metoda | Ścieżka | Co robi |
|---|---|---|
| `GET` | `/api/crm/entries` | wpisy (`from`, `to`, `type`, `limit`) plus podsumowanie miesiąca/roku/MRR |
| `POST` | `/api/crm/entries` | nowy wpis — `{ type, date, amount, title, category?, paid?, note?, clientId? }` |
| `PATCH` | `/api/crm/entries/{id}` | dowolny podzbiór pól. **`{"paid": true}` to najczęstsza operacja** na tym ekranie |
| `DELETE` | `/api/crm/entries/{id}` | usuwa wpis |
| `GET` | `/api/crm/context` | klienci (do przypisania wpisu) + zobowiązania cykliczne |
| `POST` | `/api/crm/push` | `{ ids: [...] }` — wypycha wskazane wydatki Solvio do Finansów |

```bash
# oznacz fakturę jako zapłaconą
curl -X PATCH -b cookies.txt -H "content-type: application/json" \
  -d '{"paid":true}' https://solvio.programo.pl/api/crm/entries/clx123
```

### Rejestry: zobowiązania cykliczne, klienci, stan konta

Wszystko, co w CRM-ie opisuje wpisy albo je generuje. Pełny CRUD — zmiana
zrobiona przez Solvio jest widoczna w `crm.programo.pl` od razu, bo po naszej
stronie nie istnieje żadna kopia tych danych.

| Metoda | Ścieżka | Co robi |
|---|---|---|
| `GET` | `/api/crm/commitments` | serie cykliczne (abonamenty, ZUS, serwery) |
| `POST` | `/api/crm/commitments` | `{ title, type, amount, startDate, category?, note?, clientId?, intervalMonths?, active? }` |
| `PATCH` | `/api/crm/commitments/{id}` | podzbiór pól; `{"active": false}` wstrzymuje serię |
| `DELETE` | `/api/crm/commitments/{id}` | kasuje serię — wpisy, które już z niej powstały, **zostają** |
| `GET` | `/api/crm/clients` | klienci (źródło MRR) |
| `POST` | `/api/crm/clients` | `{ name, service?, status?, monthlyFee?, projectValue?, contactName?, phone?, email?, notes? }` |
| `PATCH` | `/api/crm/clients/{id}` | podzbiór tych samych pól |
| `DELETE` | `/api/crm/clients/{id}` | usuwa klienta |
| `GET` | `/api/crm/balances` | odczyty stanu konta (`months`, `forward`) plus oś czasu z CRM-a |
| `POST` | `/api/crm/balances` | `{ at, amount, note? }` — nowy ręczny odczyt |
| `DELETE` | `/api/crm/balances/{id}` | usuwa odczyt |

`intervalMonths` to liczba miesięcy między uderzeniami serii: `1` = co miesiąc,
`3` = co kwartał, `12` = rocznie. Apka pokazuje gotowe wybory zamiast pola
liczbowego.

**Wyłączenie serii to nie to samo co jej usunięcie.** `active: false` zatrzymuje
kolejne materializacje i zostawia historię nietkniętą; `DELETE` kasuje samą
serię, a CRM odpina od niej wpisy przez `onDelete: SetNull`. W obu przypadkach
pieniądze, które już przeszły, zostają w Finansach.

Kwoty klienta (`monthlyFee`, `projectValue`) przychodzą z CRM-a jako **stringi**,
a kwoty wpisów i zobowiązań jako **liczby**. To nie pomyłka po ich stronie
i nie prostujemy tego u siebie — klienty API muszą umieć oba.

Podsumowanie z `GET /api/crm/entries` jest **miękkie**: gdy endpoint sum
w CRM-ie padnie, lista wpisów i tak wraca, a `summary` jest `null`. Padnięty
agregat nie ma prawa zabrać użytkownikowi danych, które już mamy.

`/api/crm/context` też degraduje się częściowo — sami klienci bez zobowiązań
wystarczą, żeby przypisać wpis.

Wydatek wypchnięty do CRM-a staje się tam wierszem `FinanceEntry` typu
`EXPENSE`, a jego id ląduje w `expenses.crm_entry_id`. To powiązanie jest
całą mechaniką: dzięki niemu edycja dociąga, a usunięcie sprząta.

**Awaria CRM-a nigdy nie unieważnia operacji w Solvio.** Nieudany push
zapisuje się w `crm_connections.last_error` i widać go w ustawieniach —
wydatek zostaje.

## Klucz po stronie CRM-a

W `crm.programo.pl`: **Ustawienia → Klucze API**, zakres **WRITE** (push
tworzy i edytuje wiersze). Klucz zaczyna się od `crmk_`. Wklejasz go w
Solvio: **Ustawienia → CRM Programo**.

---

## Hasło konta

| Metoda | Ścieżka | Co robi |
|---|---|---|
| `POST` | `/api/auth/password` | `{ currentPassword, newPassword }` — zmiana hasła |

Wymaga **bieżącego hasła** mimo aktywnej sesji: samo ciasteczko nie wystarczy,
bo przejęta sesja mogłaby wtedy przejąć konto na stałe. Limit 5 prób na godzinę.

> **Landmina projektowa:** logowanie na adres, który nie ma jeszcze wpisu
> w `user_credentials`, **zajmuje konto** dowolnym podanym hasłem. Konto
> z zaseedowanymi danymi, na które nikt się jeszcze nie zalogował, może
> przejąć każdy, kto zna adres e-mail. Zmiana tego zachowania to osobna
> decyzja — dziś to jedyny sposób ustawienia pierwszego hasła.

## Zarządzanie kluczami Solvio

Ścieżki na sesji, nie na kluczu — klucza nie da się wystawić kluczem.

| Metoda | Ścieżka | Co robi |
|---|---|---|
| `GET` | `/api/keys` | lista (bez sekretów) |
| `POST` | `/api/keys` | `{ name, scope: "READ"\|"WRITE", expiresAt? }` → jedyna odpowiedź z jawnym kluczem |
| `DELETE` | `/api/keys/{id}` | unieważnia; wiersz zostaje jako ślad audytowy |
