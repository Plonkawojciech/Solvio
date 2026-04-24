# Solvio iOS — Pass 2 task list (from Wojtek 2026-04-24)

Źródło: wiadomość Wojtka 2026-04-24. Każdy punkt musi działać **e2e**, bez demo data, optymalnie. Iść krok po kroku, testować po każdym kroku.

---

## Blokujące (najpilniej)

### 1. Skanowanie paragonu nie odpala kamery
- Kliknięcie FAB "camera.fill" lub "Dodaj zdjęciem" powinno **od razu** otwierać natywną kamerę.
- Obecnie — nie otwiera się.
- Hipotezy: brak `NSCameraUsageDescription` w `Info.plist`, albo ScanFabSheet pokazuje najpierw menu zamiast odpalać `UIImagePickerController(sourceType: .camera)`.
- Fix: zdiagnozować `ScanFabSheet.swift`, `Info.plist`, permission flow. Upewnić się, że po "Zrób zdjęcie" kamera pokazuje się natychmiast.

---

## Dashboard

### 2. Interaktywny chart codziennych wydatków (na dole, przed AI Insights)
- Słupkowy, dzienny, **stacked po kategoriach** (każdy segment słupka = kolor kategorii).
- Tap na słupek → popover/sheet: data, suma, lista wydatków tego dnia, kategorie, liczba transakcji.
- Picker zakresu: 7 / 14 / 30 / 90 dni.
- Legenda klikalna (filtr kategorii).
- Respektuje `Theme.chart*` palette.
- Payload dla sheetu: `date -> [Expense]`.

### 3. Usunąć wszelkie demo / hardcoded liczby
- Audyt `DashboardDisplay` i widoków: `wellnessScore`, scores, forecast, thisWeek, momChange, itp. Wszystko ma być liczone z realnych danych, fallback = brak widżetu, NIE placeholder "65/100" czy "30%" gdy dane puste.
- Jeśli brak danych (np. income == 0, brak prev period) — ukryj widget zamiast pokazywać "—" albo 0.
- Sprawdzić też Savings / Goals / Challenges.

---

## Expenses / OCR

### 4. Jakość kategoryzacji po OCR i ręcznym dodaniu
- E2E test: dodać paragon (Biedronka/Lidl), zweryfikować że pozycje dostały właściwe kategorie.
- Jeśli źle → sprawdzić prompt na backendzie `/api/v1/ocr-receipt` i kategoryzator ręczny.
- Kategoryzacja musi respektować **własne** kategorie usera.

### 5. Miejsce do podglądu/edycji kategorii pozycji paragonu
- ExpenseDetailView powinno pokazywać pozycje z ich kategoriami i pozwalać zmienić kategorię pozycji (inline tap → picker).
- Po zmianie: persist + odświeżenie analityki.

---

## Groups / Split

### 6. Szybki podział **bez grupy**
- Obecnie wymaga utworzenia grupy — to łamie sens "szybkiego podziału".
- Flow: user klika "Szybki podział" → bottomsheet → wpisuje kwotę + wybiera/dodaje uczestników (kontakty / ręcznie imię + email) → generuje rozliczenie → wysyła "żądanie płatności" bez grup tabeli.
- Storage: osobna tabela `quick_splits` lub ad-hoc grupa oznaczona `isQuick=true`.

### 7. Opcja szybkiego podziału po wgraniu paragonu
- Po OCR: na karcie wyniku przycisk "Podziel ten paragon" → ten sam flow co #6, ale pre-fill kwoty i pozycji z paragonu.

---

## Savings (4 osobne page słabo działają)

### 8. Naprawić Savings hub + 4 podstrony
- Podstrony: Goals, Challenges, Loyalty, Deals/Promotions.
- Każda ma konkretny, działający cel:
  - **Goals**: cele oszczędzania z kategoriami, postęp liczony z realnych wydatków, tap → detail z historią wpłat, edycją, usunięciem.
  - **Challenges**: wyzwania (np. "nie kupuj kawy 7 dni"), auto-progress z wydatków.
  - **Loyalty**: punkty / cashbacki (jeśli nie ma danych → ukryć sekcję, nie fake).
  - **Promotions/Deals**: lista sugestii AI z gazetek (placeholder „Wkrótce" jeśli brak integracji).
- Hub: podsumowanie wszystkich 4 sekcji.

### 9. AI analizy w savings
- Każdy cel/challenge ma mini-analizę „ile zaoszczędzisz jeśli…".

---

## Categories

### 10. Custom categories w Settings
- Lista defaultowych + userowych.
- Dodaj / edytuj / usuń kategorię.
- AI (OCR i manual) musi respektować custom cat.
- Backend: `POST/PUT/DELETE /api/data/categories` (jest).

---

## AI / Analysis

### 11. Sprawdzić analizę AI
- `/api/analysis/ai` → walidacja że zwraca sensowne insights, nie generyczne.
- UI Analysis tab — realne dane, działające wykresy.

---

## Performance

### 12. Profiler pass
- Dashboard load < 1s po cache.
- Listy > 50 items — LazyVStack (SwiftUI `LazyVStack` w ScrollView, nie VStack).
- Chart Samples: nie re-compute w `body`, tylko w ViewModel.

---

## E2E test checklist

Przed oddaniem userowi:
- [ ] Odpal aplikację, zaloguj się
- [ ] Dashboard: wszystkie widgety renderują się, dane realne
- [ ] Tap FAB → kamera odpala się natychmiast
- [ ] Zrób zdjęcie paragonu → OCR → wynik z pozycjami + kategoriami
- [ ] Na wyniku OCR widać opcję "Szybki podział"
- [ ] Szybki podział bez grupy → generuje rozliczenie
- [ ] Dodaj cel savings → widzę postęp z realnych wydatków
- [ ] Wejdź w 4 podstrony savings → każda renderuje się i ma sensowną treść
- [ ] Analysis tab → AI zwraca insighty
- [ ] Settings → dodaj custom kategorię → widać ją w pickerach
- [ ] Daily chart na dashboard: słupki kolorami, tap na słupek pokazuje detail, picker zakresu działa
- [ ] Nigdzie nie ma hardcoded wartości (wellness, forecast, savings rate) gdy brak danych
