# Solvio Performance Audit Report

**Date:** 2026-03-18
**Auditor:** Claude opus-4.6 via Claude Code
**Scope:** API routes, DB schema/indexes, bundle sizes, client-side rendering

---

## CRITICAL Findings

### 1. N+1 Query in `business/team` GET — 1 query per member
**File:** `app/api/business/team/route.ts:59-79`

After fetching all company members, the code runs `Promise.all(members.map(async (member) => { ... }))` with a **separate SUM query per member** to calculate monthly spending. For a company with 50 employees this fires 50+ individual queries to Neon.

**Fix:** Replace the N+1 loop with a single grouped aggregate:
```ts
const spendingByUser = await db.select({
  userId: expenses.userId,
  total: sql<string>`COALESCE(SUM(${expenses.amount}::numeric), 0)::text`,
}).from(expenses)
  .where(and(
    inArray(expenses.userId, members.filter(m => m.userId).map(m => m.userId)),
    sql`${expenses.date} >= ${monthStart}`,
    sql`${expenses.date} <= ${monthEnd}`,
  ))
  .groupBy(expenses.userId)

const spendingMap = new Map(spendingByUser.map(s => [s.userId, s.total]))
```

### 2. Sequential category rename in `settings` POST
**File:** `app/api/data/settings/route.ts:86-91`

When language changes, each default category is renamed with an **individual `await db.update()`** in a `for...of` loop. With 10 default categories this produces 10 sequential round-trips to Neon.

**Fix:** Parallelize:
```ts
await Promise.all(
  userCats
    .filter(cat => map[cat.name])
    .map(cat =>
      db.update(categories).set({ name: map[cat.name]! }).where(eq(categories.id, cat.id))
    )
)
```

### 3. Sequential receipt cleanup in `expenses` DELETE
**File:** `app/api/data/expenses/route.ts:198-227`

When deleting expenses referencing receipts, orphan cleanup runs **sequentially per receipt** in a `for...of` loop: check remaining refs (1 query) -> delete items (1 query) -> fetch image URL (1 query) -> delete receipt (1 query) -> delete blob (1 HTTP call). Deleting 5 expenses linked to 5 receipts = ~20 sequential DB calls + 5 blob calls.

**Fix:** Wrap the loop body in `Promise.all(receiptIdsToCheck.map(async (receiptId) => { ... }))` to parallelize per-receipt cleanup.

---

## HIGH Findings

### 4. SELECT * on `receipts` returns `rawOcr` JSONB (50-200 KB per row)
**Files:**
- `app/api/data/receipts/route.ts:30` — GET returns full receipt including `rawOcr` to client
- `app/api/data/receipts/insights/route.ts:18` — fetches ALL columns for 90 days of receipts
- `app/api/prices/compare/route.ts:39` — fetches full receipts (up to 30) for price comparison

The `rawOcr` column stores the complete Azure Document Intelligence response (50-200 KB per receipt). The insights route can fetch hundreds of receipts. At 100 receipts x 100 KB = **10 MB of wasted data transfer** from Neon on every call.

Note: `audit/generate` already does column-selective query for receipts (lines 46-51) -- follow that pattern everywhere.

**Fix per file:**
```ts
// receipts/insights/route.ts:18 — only needs id, vendor, date, total, items
const userReceipts = await db.select({
  id: receipts.id, vendor: receipts.vendor, date: receipts.date,
  total: receipts.total, items: receipts.items,
}).from(receipts).where(...)

// prices/compare/route.ts:39 — only needs vendor, date, items
const recentReceipts = await db.select({
  id: receipts.id, vendor: receipts.vendor, date: receipts.date,
  total: receipts.total, items: receipts.items,
}).from(receipts).where(...)

// data/receipts/route.ts:30 — exclude rawOcr from GET response
// Either select specific columns or strip rawOcr before returning
```

### 5. SELECT * on `expenses` in report routes and AI analysis
**Files:**
- `app/api/reports/generate/route.ts:64` — `.select().from(expenses)` fetches all 20+ columns
- `app/api/reports/custom/route.ts:69` — same pattern
- `app/api/analysis/ai/route.ts:44` — same pattern

Reports only need `id`, `title`, `amount`, `date`, `categoryId`, `currency`, `vendor`. The business-specific fields (`deductibility`, `vatRate`, `vatAmount`, `netAmount`, `departmentId`, `invoiceId`, `approvalStatus`, `bankTransactionId`, `notes`, `tags[]`) are all fetched but never used.

**Fix:** Use column-selective queries matching the `expenses` GET route pattern at `data/expenses/route.ts:101-113` which already does this correctly.

### 6. Missing database indexes — 9 tables affected

**Tables with WHERE clause columns but no index:**

| Table | Missing index | Queried in |
|---|---|---|
| `weekly_summaries` | `userId` | `personal/promotions/route.ts:164` |
| `companies` | `ownerId` | `data/onboarding/route.ts:37` |
| `departments` | `companyId` | `business/team/route.ts:52` |
| `invoices` | `userId` | `business/invoices/route.ts:58,95` |
| `company_members` | `companyId` | `business/team/route.ts:46,128` (only `userId` indexed) |
| `bank_transactions` | `accountId` | `bank/transactions/route.ts:44` |
| `receipt_items` | `userId` | `data/receipts/insights` (only `receiptId` indexed) |
| `receipts` | composite `(userId, date)` | dashboard, insights, prices, audit routes |

The existing `idx_receipts_user_id` index helps filter by userId, but the common pattern `WHERE userId=? AND date >= ?` would benefit from a composite `(userId, date)` index to avoid a subsequent date scan on the userId-filtered rows.

**Fix in `lib/db/schema.ts`:**
```ts
// weeklySummaries — add index callback
(t) => [index('idx_weekly_summaries_user_id').on(t.userId)]

// companies — add index callback
(t) => [index('idx_companies_owner_id').on(t.ownerId)]

// departments — add index callback
(t) => [index('idx_departments_company_id').on(t.companyId)]

// invoices — add index callback
(t) => [index('idx_invoices_user_id').on(t.userId)]

// companyMembers — add companyId to existing callback
index('idx_company_members_company_id').on(t.companyId)

// bankTransactions — add accountId to existing callback
index('idx_bank_transactions_account_id').on(t.accountId)

// receiptItems — add userId to existing callback
index('idx_receipt_items_user_id').on(t.userId)

// receipts — add composite index to existing callback
index('idx_receipts_user_date').on(t.userId, t.date)
```
Then `npm run db:push`.

---

## MEDIUM Findings

### 7. Expenses page: 30+ `useState` hooks in a single component
**File:** `app/(protected)/expenses/page.tsx`

The component declares 30+ individual `useState` hooks (lines 125-175) covering: list data, 6 filter/search states, 2 sort states, pagination, inline expense editing (6 states), inline receipt-item editing (6 states), receipt image dialog (5 states), bulk selection (3 states), and more.

Any state change re-renders the **entire** ~900-line component. The `useMemo` on `filteredExpenses` and `sortedExpenses` helps, but the sheer number of state variables means React's reconciliation runs on every keystroke in any input.

**Fix (incremental):**
- Extract inline-edit state into `useInlineEdit()` custom hook
- Extract filter/sort/search state into `useExpenseFilters()` custom hook
- Extract receipt image/share state into `useReceiptViewer()` custom hook
- Consider `useReducer` for the edit-form states

### 8. Duplicate settings fetch in budget page
**File:** `app/(protected)/budget/client-page.tsx:77-107`

Two separate `useEffect`s fire on mount:
1. `fetch('/api/data/settings')` (line 78) -- only to get `currency`
2. `fetchBudget()` (line 105) -- calls `/api/personal/budget`

**Fix:** Include `currency` in the `/api/personal/budget` response to eliminate the extra round-trip.

### 9. Expenses page bundle = 309 kB First Load JS (heaviest route)
**Build output:**

| Route | Page JS | First Load JS |
|---|---|---|
| `/expenses` | **17.9 kB** | **309 kB** |
| `/dashboard` | 9.73 kB | 252 kB |
| `/savings` | 15.4 kB | 247 kB |
| `/groups/[id]/receipts` | 13.1 kB | 250 kB |
| Shared chunks | - | 103 kB |

The expenses page statically imports `AddExpenseTrigger` and `ScanReceiptButton` (lines 30-31) instead of lazy-loading them.

**Fix:**
```ts
const AddExpenseTrigger = dynamic(
  () => import('@/components/protected/dashboard/add-expense-trigger')
    .then(m => ({ default: m.AddExpenseTrigger })),
  { ssr: false }
)
const ScanReceiptButton = dynamic(
  () => import('@/components/protected/dashboard/scan-receipt-button')
    .then(m => ({ default: m.ScanReceiptButton })),
  { ssr: false }
)
```

### 10. Middleware at 34.5 kB
The middleware bundle is 34.5 kB, which is high for a cookie-check middleware. This likely includes crypto imports for HMAC session verification. Consider whether the full session validation is needed in middleware vs. a lighter cookie-existence check (with full validation deferred to the API route).

---

## Positive Findings (already well optimized)

1. **Dashboard API** (`data/dashboard/route.ts`) uses `Promise.all` for 7 parallel queries with column-selective expense fetches and `COUNT(*)` for receipts
2. **Groups list** (`groups/route.ts`) batch-fetches members and splits with `inArray()` instead of N+1, with O(1) Map lookups
3. **Analysis charts** are lazy-loaded with `next/dynamic` + skeleton loaders in analysis, dashboard, and group detail pages
4. **Dashboard widgets** (6 components) are all lazy-loaded with proper `loading` skeletons
5. **`optimizePackageImports`** covers lucide-react, framer-motion, recharts, date-fns, react-day-picker, and 6 Radix primitives
6. **Expenses GET** uses column-selective query (lines 101-113) -- good pattern
7. **Audit/generate** selects only needed receipt columns (lines 46-51) -- correct exclusion of `rawOcr`
8. **Groups detail GET** uses `Promise.all` for members + splits fetch
9. **Report generation** parallelizes both report building and blob uploads with `Promise.all`
10. **Static asset caching** headers are properly configured (immutable for `_next/static`, 30-day for `.ico`)

---

## Priority Summary

| # | Severity | Finding | Est. Impact | Fix Effort |
|---|---|---|---|---|
| 1 | CRITICAL | N+1 query in business/team | N queries per team member | 15 min |
| 2 | CRITICAL | Sequential category rename | 10 round-trips | 5 min |
| 3 | CRITICAL | Sequential receipt cleanup loop | 3-5 queries per receipt | 20 min |
| 4 | HIGH | SELECT * returns rawOcr (50-200KB/row) | 1-10 MB wasted per call | 15 min |
| 5 | HIGH | SELECT * on expenses in reports/AI | Unnecessary data transfer | 10 min |
| 6 | HIGH | 8+ missing DB indexes | Full table scans on queries | 15 min + db:push |
| 7 | MEDIUM | 30+ useState in expenses page | Re-render overhead | 45 min |
| 8 | MEDIUM | Duplicate settings fetch in budget | Extra API call on mount | 10 min |
| 9 | MEDIUM | Expenses page 309 kB bundle | Slow initial load | 10 min |
| 10 | MEDIUM | Middleware 34.5 kB | Slow edge function cold start | 30 min |

**Total estimated fix time:** ~3 hours for all items
**Highest ROI (fix first):** #4 (rawOcr exclusion), #6 (missing indexes), #1 (N+1 team query)
