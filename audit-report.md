# Solvio Code Audit Report

**Date:** 2026-03-18
**Auditor:** Claude Opus 4.6 (automated static analysis)
**Codebase:** 252 files, ~51,600 lines (app/, components/, lib/)
**Stack:** Next.js 15.5.8, React 19, TypeScript, Neon/Drizzle, OpenAI, Azure OCR

---

## 1. Build & Tooling Results

### TypeScript (`npx tsc --noEmit`)
**PASS** -- zero type errors.

### ESLint (`npm run lint`)
**5 warnings, 0 errors:**
- 4x `react-hooks/exhaustive-deps` -- missing `t` dependency in useCallback (budget, challenges, expenses, promotions)
- 1x unused eslint-disable directive in `app/api/v1/ocr-receipt/route.ts:612`

### Production Build (`npm run build`)
**PASS** -- all routes compile and output successfully.

---

## 2. Findings

### CRITICAL

#### C1. No input validation on 67% of API routes
- **64 total API route files**, only **21 use Zod** (or any schema validation).
- 43 routes accept `request.json()` or query params with no structural validation.
- Affected routes include:
  - `app/api/personal/budget/afford/route.ts`
  - `app/api/personal/challenges/route.ts`
  - `app/api/personal/loyalty/route.ts`
  - `app/api/personal/promotions/route.ts`, `promotions/scan/route.ts`
  - `app/api/personal/weekly-summary/route.ts`
  - `app/api/groups/[id]/settlements/route.ts`
  - `app/api/groups/[id]/receipts/route.ts`
  - `app/api/groups/splits/[splitId]/settle/route.ts`
  - All `app/api/bank/` routes
  - `app/api/audit/generate/route.ts`
  - `app/api/groups/ai-suggest/route.ts`
- **Risk:** Malformed input can cause unhandled DB errors, OpenAI API failures, or data corruption.
- **Fix:** Add Zod schemas to all POST/PUT/DELETE handlers; centralize in a shared `parseBody()` helper.

#### C2. `i18n.ts` is 3,224 lines -- single monolithic translation file
- `lib/i18n.ts` contains ~400+ keys for both PL and EN in one flat object, plus the `useTranslation` hook.
- Any change to any translation requires touching this massive file.
- **Fix:** Split into `lib/i18n/pl.ts`, `lib/i18n/en.ts`, and `lib/i18n/hook.ts`. Or adopt namespace-per-feature.

---

### HIGH

#### H1. God components -- 8 files exceed 700 lines

| File | Lines | Issue |
|------|-------|-------|
| `app/(protected)/expenses/page.tsx` | 1,884 | Full CRUD + table + filters + dialogs + share/QR in one file |
| `app/(protected)/analysis/page.tsx` | 1,278 | Charts + AI analysis + data fetching mixed together |
| `app/api/v1/ocr-receipt/route.ts` | 1,246 | Azure OCR + GPT categorization + DB writes + blob upload + validation |
| `components/protected/dashboard/scan-receipt-sheet.tsx` | 1,151 | Camera + compression + orientation + upload + UI |
| `app/(protected)/savings/client-page.tsx` | 948 | Full savings dashboard in one component |
| `app/(protected)/groups/[id]/page.tsx` | 904 | Group detail with receipts + splits + settlements |
| `app/(protected)/dashboard/page.tsx` | 865 | Dashboard with 6+ widget sections |
| `components/protected/dashboard/add-expense-sheet.tsx` | 841 | Expense form with autocomplete + category picker |

- **Risk:** Hard to maintain, test, or extend. A single bug fix requires understanding hundreds of lines of unrelated logic.
- **Fix:** Extract sub-components. E.g., `expenses/page.tsx` -> `ExpenseTable`, `ExpenseFilters`, `ExpenseShareDialog`, `ExpenseBulkActions`.

#### H2. 29 `as any` type assertions across production code

Breakdown by cause:
- **Framer Motion easing arrays** (12 instances): `[0.22, 1, 0.36, 1] as any` -- type mismatch with framer-motion. Fix: typed constant `const EASE_OUT: [number, number, number, number] = [0.22, 1, 0.36, 1]`.
- **Animation variant objects** (4 instances in settings/page.tsx, groups/page.tsx, quick-split-sheet.tsx, categories-manager.tsx, settings-form.tsx): `} as any` on motion variants. Fix: type as `Variants` from framer-motion.
- **OpenAI API responses** (5 instances in audit/generate, prices/compare, promotions/scan): `(response as any).output_text`. Fix: define a proper response interface or use type guards.
- **Drizzle/DB inserts** (3 instances): `items: finalItems as any` in ocr-receipt, `as any[]` in prices/compare and receipts/insights. Fix: align Drizzle schema types with actual data shapes.
- **i18n key access** (1 instance): `t(\`challenges.templates.${tmpl.key}\` as any)`.

#### H3. OpenAI client instantiated 11 times across API routes
- `new OpenAI({ apiKey: process.env.OPENAI_API_KEY })` repeated in 11 separate files:
  - `ocr-receipt`, `goals`, `weekly-summary`, `promotions/scan`, `promotions`, `budget/afford`, `prices/compare`, `analysis/ai`, `groups/ai-suggest`, `groups/[id]/ai-insights`, `audit/generate`
- No centralized error handling for missing API key, no shared config.
- **Fix:** Create `lib/openai.ts` exporting a singleton (like the existing `lib/db/index.ts` pattern).

#### H4. 12 silently swallowed `.catch(() => {})` blocks
Locations:
- `app/(protected)/prices/page.tsx:444`
- `app/(protected)/challenges/client-page.tsx:103`
- `app/(protected)/subscriptions/client-page.tsx:115`
- `app/(protected)/audit/page.tsx:287`
- `app/(protected)/promotions/client-page.tsx:167`
- `app/(protected)/budget/client-page.tsx:81`
- `app/api/auth/demo/reset/route.ts:20`
- `app/api/data/expenses/route.ts:207`
- `components/protected/personal/financial-health-score.tsx:30`
- `components/protected/groups/split-expense-sheet.tsx:94`
- `components/protected/dashboard/scan-receipt-sheet.tsx:385`
- `components/sw-register.tsx:8`

- **Risk:** Errors silently discarded -- failed fetches leave stale UI state with no user feedback.
- **Fix:** At minimum log to console; ideally show a toast or set error state.

#### H5. OpenAI-calling routes without rate limiting
These endpoints invoke OpenAI but have no `rateLimit()` guard:
- `app/api/personal/goals/route.ts` (POST)
- `app/api/personal/weekly-summary/route.ts` (POST)
- `app/api/personal/promotions/route.ts` (POST)
- `app/api/personal/promotions/scan/route.ts` (POST)
- `app/api/personal/budget/afford/route.ts` (POST)

Compare: `analysis/ai`, `audit/generate`, `prices/compare` do have `rateLimit()`.
- **Risk:** Unbounded OpenAI API costs from abuse or loops.
- **Fix:** Add `rateLimit()` to all OpenAI-calling routes.

#### H6. No shared type definitions -- `Expense` interface defined 3 times
- `app/(protected)/dashboard/page.tsx`
- `app/(protected)/expenses/page.tsx`
- `app/(protected)/analysis/page.tsx`

Same pattern for `Category`, `Receipt` and other DTOs -- redefined locally in each page.
- **Fix:** Create `lib/types.ts` with shared interfaces.

#### H7. `formatAmount` / `formatDate` duplicated across 7+ files
Despite `lib/format.ts` existing, local copies of these helpers appear in:
- `dashboard/page.tsx`, `expenses/page.tsx`, `invoices/page.tsx` (2x), `savings/client-page.tsx` (2x), `vat/page.tsx`, `settlement/[id]/client.tsx`, `receipt/[id]/page.tsx`
- **Fix:** Remove local definitions, import from `lib/format.ts` everywhere.

---

### MEDIUM

#### M1. Mixed API response patterns
- Most routes use `NextResponse.json()`, but `ocr-receipt/route.ts` and `ocr-invoice/route.ts` use raw `new Response(JSON.stringify(...))`.
- `convert-heic/route.ts` mixes both in the same file (4x `new Response` + 2x `NextResponse`).
- **Fix:** Standardize on `NextResponse.json()` or create a shared `jsonResponse()` helper.

#### M2. 4 missing `useCallback` dependencies (lint warnings)
- `t` (translation function) missing from dependency arrays in:
  - `app/(protected)/budget/client-page.tsx:103`
  - `app/(protected)/challenges/client-page.tsx:117`
  - `app/(protected)/expenses/page.tsx:368`
  - `app/(protected)/promotions/client-page.tsx:195`
- Low severity because language changes trigger full page reload, but still a correctness issue.

#### M3. Dead code
- `components/protected/dashboard/monthly-spending-chart.tsx` -- exports `MonthlySpendingChart`, not imported anywhere.
- `categorizeAllItems()` in `ocr-receipt/route.ts` -- defined but never called (has `eslint-disable` comment).
- Unused eslint-disable directive at `ocr-receipt/route.ts:612`.
- **Fix:** Remove unused files and dead functions.

#### M4. `console.log`/`warn` in client-side code
- 2x `console.warn` in `components/protected/dashboard/scan-receipt-sheet.tsx` (lines 175, 245) -- image processing fallbacks running in the browser.
- ~30 console statements in API routes (server-side, acceptable for debugging but noisy).
- **Fix:** Remove or gate client-side console statements; consider a structured logger for server routes.

#### M5. `any`-typed function parameters in critical API routes
- `app/api/v1/ocr-invoice/route.ts:82` -- `function extractInvoiceData(azureResult: any)`
- `app/api/v1/ocr-receipt/route.ts:302` -- `async function extractReceiptData(azureResult: any)`
- **Fix:** Define Azure Document Intelligence response types (even partial).

#### M6. Repeated framer-motion easing constant
- The cubic-bezier `[0.22, 1, 0.36, 1]` appears with `as any` in 12+ locations.
- **Fix:** Define once in `lib/motion.ts`: `export const easeOutExpo: [number, number, number, number] = [0.22, 1, 0.36, 1]`

#### M7. In-memory rate limiter ineffective in serverless
- `lib/rate-limit.ts` uses an in-process `Map`. On Vercel serverless, each cold start resets the state.
- Acceptable for MVP/hobby tier, but not production-grade.
- **Fix:** Document the limitation or migrate to Upstash Redis.

#### M8. `auth-compat.ts` is a thin unnecessary wrapper
- All 58+ API routes import `auth()` from `lib/auth-compat.ts`, which just delegates to `getSession()`.
- Legacy shim from Clerk removal (2026-03-16).
- **Fix:** Replace with direct `getSession()` imports or rename to `lib/auth.ts`.

---

## 3. What Looks Good

- **Zero TypeScript errors** -- strict mode compiles cleanly.
- **Zero ESLint errors** -- only 5 minor warnings.
- **Build succeeds** -- no broken pages or missing dependencies.
- **Auth is solid** -- HMAC-signed session cookies with constant-time comparison, legacy cookie rejection in production.
- **All API routes have auth guards** -- every non-auth endpoint checks session. No unprotected routes found.
- **Proper cleanup** -- all `setInterval` and `addEventListener` calls have corresponding cleanup in `useEffect` return functions.
- **No hardcoded secrets** -- all sensitive values sourced from `process.env`.
- **No TODO/FIXME/HACK comments** -- codebase is clean of debt markers.
- **DB lazy-init pattern** prevents build-time connection errors via Proxy.
- **Consistent file naming** -- all kebab-case throughout (except legacy `landing_page/` directory).
- **Session security** -- HMAC signing, timing-safe comparison, production-only enforcement.
- **Middleware auth gating** -- protected routes properly redirect to login.

---

## 4. Summary

| Severity | Count | Key Items |
|----------|-------|-----------|
| CRITICAL | 2 | Input validation coverage (C1), monolithic i18n (C2) |
| HIGH | 7 | God components (H1), `as any` sprawl (H2), OpenAI singleton (H3), swallowed errors (H4), missing rate limits (H5), no shared types (H6), duplicated helpers (H7) |
| MEDIUM | 8 | Mixed response patterns (M1), missing deps (M2), dead code (M3), client console.log (M4), any-typed params (M5), repeated constants (M6), in-memory rate limiter (M7), unnecessary wrapper (M8) |

**Recommended priority order:**
1. **C1** -- Add Zod validation to remaining 43 API routes (security + reliability)
2. **H5** -- Add rate limiting to all OpenAI-calling routes (cost protection)
3. **H4** -- Replace `.catch(() => {})` with proper error handling (reliability)
4. **H3** -- Extract OpenAI singleton to `lib/openai.ts` (quick win, 11 files)
5. **H6 + H7** -- Create `lib/types.ts` and deduplicate formatAmount/formatDate (consistency)
6. **H2 + M6** -- Fix `as any` assertions with proper types + shared easing constant (type safety)
7. **H1** -- Decompose the 8 largest components (maintainability)
8. **C2** -- Split i18n file into per-language modules (developer experience)
