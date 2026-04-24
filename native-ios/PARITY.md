# iOS ↔ PWA Feature Parity

Tracks how close the native iOS app is to the PWA at
`https://solvio-lac.vercel.app`. **Bank-related features are intentionally
dropped** — Wojtek doesn't use them.

Legend: ✅ fully ported · 🟡 partial · 🔲 not started · ❌ intentionally skipped

## Tabs

| PWA route | iOS | Status | Notes |
|-----------|-----|--------|-------|
| `/dashboard` | `DashboardView` | ✅ | Full client-side aggregation (fx conversion, momChange, forecast, wellness, anomalies, over-budget, savings rate) — mirrors web's `calculatedData` memo |
| `/expenses` | `ExpensesListView` + `ExpenseDetailView` | ✅ | Search, category filter chips, date-range chips, tags, CRUD (minus isRecurring/receiptId) |
| `/groups` | `GroupsListView` + `GroupDetailView` | ✅ | Emoji + currency picker, dynamic member rows with color swatches, **Quick Split sheet** (equal/percent/custom modes, multi-select, sum validation) |
| `/groups/[id]/receipts` | `GroupReceiptsView` | ✅ | Expandable cards with item assignments + member color chips |
| `/groups/[id]/settle` | `GroupSettlementsView` | ✅ | 4-tile stats, "who owes whom" with inline settle, per-person balance (±), payment request status pills |
| Hub shortcuts | `MoreView` | ✅ | Includes new "Savings" hub entry |

## More-screen features

| PWA route | iOS | Status | Notes |
|-----------|-----|--------|-------|
| `/savings` | `SavingsHubView` | ✅ | **NEW** 4-tab hub (goals/budget/challenges/deals), KPI strip, financial-health score, AI tip banner, parallel `TaskGroup` loading |
| `/receipts` | `ReceiptsListView` | ✅ | **MAIN FEATURE** — prominent scan + virtual CTAs, OCR confirm sheet with editable items, swipe delete |
| `/receipts/new` | `VirtualReceiptCreateView` | ✅ | **NEW** manual-entry flow, dynamic items, auto-total or override |
| `/receipts/[id]` | `ReceiptDetailView` | ✅ | Hero, image, line items with category lookup, QR code linking public `/receipt/[id]` URL, delete |
| `/goals` | `GoalsListView` + `GoalDetailView` | ✅ | Uses new shape (emoji, targetAmount, currentAmount, deposits[]), deposit sheet, AI tips section, deposits history |
| `/challenges` | `ChallengesView` | ✅ | KPI strip, active + collapsible completed sections, create sheet with type/category/date-range |
| `/loyalty` | `LoyaltyView` | ✅ | Auto-detected barcode format (EAN13/Code128/QR), color palette, copy-to-clipboard |
| `/prices` | `PricesView` | ✅ | Receipt-based compare (backend pulls last 60 days), expandable per-store prices, savings summary |
| `/audit` | `AuditView` | ✅ | Period picker, KPI card (spent + potential savings), AI summary, best-store, top stores/products, price comparisons, promotions |
| `/analysis` | `AnalysisView` | ✅ | Summary, predicted monthly spend, insights, recommendations (priority tag), anomalies, Swift Charts horizontal `BarMark` for category trends, bank stats |
| `/reports` | `ReportsView` | 🟡 | Yearly + monthly multipart POST, PDF/CSV/DOCX `Link` rows — custom date range + list history pending repo methods |
| `/settings` | `SettingsView` | ✅ | Discriminated-union API (`updateSettings`/`addCategory`/`upsertBudget`), categories CRUD via `CategoriesRepo`, budgets list with add/edit |

## Explicitly dropped

| PWA feature | Reason |
|-------------|--------|
| `/bank` | ❌ Not used in prod — PKO PSD2 + GoCardless dormant |
| `/approvals` | ❌ Admin-only, not needed on phone |
| `/subscriptions` | ❌ Personal use, not tracked |
| `/invoices`, `/vat`, `/team` | ❌ Business-tier features, not in v1 scope |
| `/export/csv` (standalone) | Folded into Reports |
| Landing page | ❌ App is gated behind login |
| Dark mode | 🟡 Locked to Light for v1 (colour assets ready) |
| Stripe / billing | ❌ Solvio not monetised |
| Magic link email | 🟡 PWA supports `/api/auth/magic-login`; iOS uses direct `POST /api/auth/session` |

## Design system

| Token | iOS | PWA equivalent |
|-------|-----|----------------|
| Background #f5f0eb | `Theme.background` / `Color("Background")` | `--background` |
| Foreground #1a1a1a | `Theme.foreground` | `--foreground` |
| Border 2px | `Theme.Border.width` | `border-2 border-foreground` |
| Hard shadow | `NBShadow` + `.nbCard()` | `shadow-[4px_4px_0]` |
| Inter + JetBrains Mono | `AppFont.*` | Tailwind custom fonts |
| Eyebrow `// SECTION` | `NBEyebrow` | `<span class="text-[11px] tracking-widest">` |
| Primary button | `NBPrimaryButtonStyle` | shadcn `default` variant |
| Secondary button | `NBSecondaryButtonStyle` | shadcn `outline` variant |
| Destructive button | `NBDestructiveButtonStyle` | shadcn `destructive` variant |

## API surface

Every iOS call goes through `ApiClient.shared` which:

- Sends `solvio_session` cookie from `HTTPCookieStorage.shared`
- Sets `Accept-Language` from `Locale.preferredLanguages`
- Sets `User-Agent: Solvio-iOS/<version>`
- Maps HTTP status to `ApiError` (401 → `.unauthorized`, etc.)
- Provides `.upload()` for multipart file POST (OCR) and `.postForm()` for text-only multipart (Reports)

All endpoints listed in `../CLAUDE.md` are covered by one of the repositories
in `Core/Network/Repositories.swift`. New personal-finance repos added
2026-04-23: `BudgetRepo`, `FinancialHealthRepo`, `PromotionsRepo`.

## Known gaps

- **`ReportsRepo.custom(dateFrom:dateTo:)`** — web has `/api/reports/custom`; iOS repo doesn't yet expose it, so custom-range UI omitted.
- **`ReportsRepo.list()` / `PricesRepo.list()`** — no list-past-reports / list-past-comparisons methods, so history sections omitted.
- **`ChallengesRepo.complete(id:)` / `.delete(id:)`** — backend exposes no PATCH/DELETE on challenges, so iOS has no completion/deletion UI (matches web).
- **`SettingsRepo.deleteCategory/updateCategory/deleteBudget`** — missing from iOS repo; falls back to `CategoriesRepo.update/delete` and omits budget delete.
- **`CategoriesRepo.update` color field** — only id/name/icon persisted on edit; color change on existing category not supported.
- **Header-field edit on receipts** — OCR confirm sheet persists items via `updateItems`; vendor/date/total edits stay local (no PUT header endpoint).
- **Offline cache** — no persistent store yet (cookie + UserDefaults profile only)
- **Push notifications** — not set up
