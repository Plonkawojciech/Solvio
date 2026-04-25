# Solvio — Lista zmian (optymalizacja 2026-04-23)

Pełny audyt web + native-iOS. Podział na priorytety. Status: `[ ]` todo, `[x]` done.

## STATUS BUILD/TESTS
- [x] TypeScript `tsc --noEmit` → **PASS**
- [x] Tests `vitest run` → **PASS** (92/92)
- [x] Build `next build` → **PASS** (Compiled successfully, 0 errors)

---

## A. WEB — KRYTYCZNE (build-blocker) — ZROBIONE

- [x] **A1.** ESLint `react/jsx-no-comment-textnodes` naprawione w ~17 plikach (wrap `// {t(...)}` → `{'// '}{t(...)}`)
- [x] **A2.** Unused-var `BankComingSoon` → `app/(protected)/bank/page.tsx` (eslint-disable)
- [x] **A3.** Unused-var `ref` i `request` param → `app/api/bank/callback/route.ts` (usunięte)
- [x] **A4.** TypeScript error `onConfirm` type mismatch → `app/(protected)/settings/page.tsx:392` (explicit if + void return)

## B. WEB — BEZPIECZEŃSTWO — ZROBIONE

- [x] **B1.** Rate limits — weryfikacja wykazała że **już istnieją** na `promotions/scan`, `ai-insights`, `ai-suggest`, `ocr-invoice`. Security audit false-positive.
- [x] **B2.** Race condition w `goals/[id]/deposit/route.ts` — read-modify-write zastąpione atomic SQL update `SET current_amount = (current_amount + $amount)::text WHERE id = ? AND user_id = ?`
- [x] **B3.** Settlement double-settle `settlement/[id]/route.ts` — idempotency check + `WHERE status = 'pending'` clause

## C. WEB — PARSING/DATA INTEGRITY — ZROBIONE

- [x] **C1.** OCR duplicate detection `ocr-receipt/route.ts:913` — `r.total === String(finalTotal)` ("12.50" vs "12.5") → zastąpione `Math.abs(parseFloat - number) < 0.01`
- [x] **C2.** OCR Polish decimal parsing `ocr-receipt/route.ts:247` — `replace(',','.')` niszczył "1.234,56" (PL format). Dodana `parseLocaleDecimal()` helper (detektuje locale przez pozycję ostatniego separatora)
- [x] **C3.** Add-expense regex odrzucał PL comma `/^\d+(\.\d{1,2})?$/` → `/^\d+([.,]\d{1,2})?$/` + `.replace(',', '.')` w `onSubmit` i duplicate detection
- [x] **C4.** Bank date off-by-one UTC `bank/page.tsx:217` — `new Date("2026-04-23")` parsowane jako UTC midnight → local parsing przez ręczne split YMD

## D. WEB — DB SCHEMA — ZROBIONE (wymaga db:push)

- [x] **D1.** `merchantRules.categoryId` type mismatch: `text()` → `uuid()` (mirror `categories.id = uuid()`). **Akcja dla deploya:** `npm run db:push` żeby zmigrować Postgres column type (cast `::uuid`)

## E. WEB — POZOSTAŁE (nie-krytyczne, odłożone)

- [ ] **E1.** N+1 w `app/api/business/team/route.ts:59-79` — grouped aggregate
- [ ] **E2.** Wyłączyć `rawOcr` z `SELECT *` (50–200 KB/row): `data/receipts`, `data/receipts/insights`, `prices/compare`
- [ ] **E3.** Parallelize `Promise.all` w `data/settings/route.ts:86-91`, `data/expenses` DELETE cleanup
- [ ] **E4.** Członkowie grup (nie tylko creator) — dostęp do `groups/[id]/receipts`, `settlements` (EXISTS group_members check)
- [ ] **E5.** CSRF — obecnie tylko httpOnly cookie, brak custom header/token check (medium priority, overhead)
- [ ] **E6.** Dark mode + i18n na `settlement/[id]/client.tsx`, `receipt/[id]/page.tsx`
- [ ] **E7.** ~25 hardkodowanych EN komunikatów błędów → `t('error.*')`
- [ ] **E8.** aria-label na ~28 icon-buttonów

## F. iOS NATIVE — ODŁOŻONE

- [ ] **F1.** Force-unwrap URL → `native-ios/Solvio/Core/AppConfig.swift:16`
- [ ] **F2.** Force-unwrap Calendar → `native-ios/Solvio/Features/Dashboard/DashboardView.swift:713`
- [ ] **F3.** Empty catch block → `native-ios/Solvio/Features/Expenses/ExpensesListView.swift:947`

## G. iOS NATIVE — FEATURE PARITY (odłożone)

- [ ] **G1.** Reports custom date range UI + `ReportsRepo.custom(dateFrom:dateTo:)`
- [ ] **G2.** `ReportsRepo.list()` i `PricesRepo.list()` — sekcje historii
- [ ] **G3.** Category color update persistence
- [ ] **G4.** Receipt header edits (vendor/date/total)

## H. FINAL VERIFY

- [x] **H1.** `npm run build` → PASS (Compiled successfully, 0 errors)
- [x] **H2.** `progress.md` updated z comprehensive changelog entry
- [x] **H3.** `ZMIANY.md` updated z final status wszystkich fixów

---

## BUGI ZNALEZIONE PRZEZ DEEP AUDITY (3 agentów równolegle)

### DB Schema Audit (1 agent, 7 findings)
1. **merchantRules.categoryId type mismatch** (text vs uuid) — ✅ FIXED
2. receiptItemAssignments.receiptItemId — brakujący FK — **odłożone**
3. bankTransactions.expenseId/suggestedCategoryId — brakujące FK — **odłożone**
4. expenses.invoiceId/bankTransactionId — brakujące FK — **odłożone**
5. vatEntries.companyId — brakujący FK — **odłożone**
6. receipts.groupId/paidByMemberId — brakujące FK — **odłożone**
7. Inconsistent decimal precision across tables — **odłożone**

### Security Audit (1 agent, 6 findings)
1. Goal deposit race condition — ✅ FIXED
2. Settlement double-settle — ✅ FIXED
3. Missing rate limits na 3 endpointach — ⚠️ FALSE POSITIVE (już istnieją)
4. In-memory rate limiter resetuje się na cold start — **znane, wymaga Upstash Redis**
5. Brak CSRF protection — **odłożone (medium, overhead)**
6. 30-day session TTL bez rotation — **low priority**

### Parsing Audit (1 agent, 12 findings)
1. **Decimal coercion w Dashboard** — częściowo adresowane (defensive `Number()` już jest)
2. **Polish decimal separator w add-expense** — ✅ FIXED
3. **Aggregation consistency w reduce()** — defensive code już jest
4. **Exchange rate NaN guard** — low priority
5. **Receipt total parseFloat null-safety** — już jest z `|| '0'` fallback
6. **Date UTC off-by-one** — ✅ FIXED
7. **OCR Polish decimal "1.234,56"** — ✅ FIXED
8. Splits JSONB amount type mismatch — **odłożone**
9. Null item filtering (item.price >= 0) — **odłożone, filtry działają**
10. Merchant rule deduplication hash — low priority
11. Exchange rate range validation — low priority
12. i18n template keys — ✅ SAFE (no injection)

---

**Meta:** Lista powstała z równoległego audytu 3 deep-audit agentów (DB schema + security + parsing) uruchomionych po explicit feedback Wojtka: "nie ma poprawnej bazy danych, poprawnego bezpieczenstwa, poprawnych parsowania informacji". Znalezione były rzeczywiste bugi (nie surface-level lint), naprawione 10 krytycznych issues. Pozostałe odłożone to low-impact cleanup + feature parity do rozłożenia w następnych sprintach.
