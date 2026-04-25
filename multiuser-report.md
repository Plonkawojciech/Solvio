# Solvio Multi-User Isolation Audit Report

**Date:** 2026-03-18
**Auditor:** Claude Opus 4.6 (automated)
**Scope:** All 64 API route handlers across 44 route files in `app/api/`

---

## Executive Summary

The codebase demonstrates **strong overall multi-user isolation**. Every API route calls `auth()` (or `getHubAuth()` as a secondary path) and checks for a valid `userId` before proceeding. The `userId` is always derived server-side from the HMAC-signed session cookie via `getSession()` -- never from request body or URL params.

**Critical findings: 0 | Medium findings: 2 | Low findings: 4 | Informational: 3**

No exploitable IDOR vulnerabilities were found. All findings are defense-in-depth improvements or access-pattern inconsistencies.

---

## 1. Auth Architecture (PASS)

- `userId` is derived deterministically from `sha256(email)` inside `lib/session.ts:emailToUserId()`.
- Session cookie is HMAC-signed with `SESSION_SECRET` and verified via constant-time comparison (`crypto.timingSafeEqual`).
- Legacy unsigned cookies are rejected in production.
- `auth()` in `lib/auth-compat.ts` wraps `getSession()` -- userId is **never** sourced from request body/params/headers (except the Hub integration path, see below).

### Hub Integration Path

`getHubAuth(request)` in `lib/auth-compat.ts` accepts `userId` from the `X-Hub-User-Id` header, but **only** when `X-Hub-Secret` matches `HUB_INTEGRATION_SECRET`. This is a server-to-server trust mechanism. Used in: `expenses`, `dashboard`, `budget`, `financial-health`, `subscriptions`.

**Verdict:** Acceptable if `HUB_INTEGRATION_SECRET` is a strong, unique secret and never exposed client-side.

---

## 2. Route-by-Route Audit

### 2.1 Data CRUD Routes (ALL PASS)

| Route | Methods | userId Filtering | Verdict |
|-------|---------|-----------------|---------|
| `/api/data/categories` | POST, PUT, DELETE | All ops include `eq(categories.userId, userId)` | PASS |
| `/api/data/expenses` | GET, POST, PUT, DELETE | All ops include `eq(expenses.userId, userId)` | PASS |
| `/api/data/receipts` | GET, PUT | Both ops include `eq(receipts.userId, userId)` | PASS |
| `/api/data/receipts/insights` | GET | Filters `eq(receipts.userId, userId)`; receipt_items queried via `inArray(receiptItems.receiptId, receiptIds)` (transitive isolation) | PASS |
| `/api/data/settings` | GET, POST | All ops scoped by `userId` | PASS |
| `/api/data/dashboard` | GET | All queries filtered by `userId` | PASS |
| `/api/data/onboarding` | POST | Uses `auth()`, scoped by `userId` | PASS |
| `/api/data/switch-product` | POST | Uses `auth()`, updates `where(eq(userSettings.userId, userId))` | PASS |

### 2.2 Auth Routes (PASS -- by design no user-data filtering needed)

| Route | Methods | Notes |
|-------|---------|-------|
| `/api/auth/session` | POST, DELETE | Login/logout -- creates session, no user-data access |
| `/api/auth/session/me` | GET | Returns current session from cookie |
| `/api/auth/magic-login` | POST | Dev-only, gated by `DEV_MAGIC_LOGIN` env var |
| `/api/auth/demo` | GET | Sets demo session cookie |
| `/api/auth/demo/reset` | POST | All deletes filtered by `eq(*.userId, userId)` | PASS |

### 2.3 Group Routes

| Route | Methods | userId Filtering | Verdict |
|-------|---------|-----------------|---------|
| `/api/groups` | GET | Queries groups where user is `createdBy` OR has `groupMembers.userId` match | PASS |
| `/api/groups` | POST | Sets `createdBy: userId` on new group | PASS |
| `/api/groups/[id]` | GET | Checks `createdBy === userId` OR `groupMembers.userId === userId` | PASS |
| `/api/groups/[id]` | PUT | `where(eq(groups.createdBy, userId))` -- only creator can update | PASS |
| `/api/groups/[id]` | DELETE | `where(eq(groups.createdBy, userId))` -- only creator can delete | PASS |
| `/api/groups/[id]/dashboard` | GET | Creator OR member check | PASS |
| `/api/groups/[id]/receipts` | GET, POST | **Creator-only check -- see Finding #1** | **MEDIUM** |
| `/api/groups/[id]/receipts/[receiptId]/assign` | PUT | Creator-only check (same pattern) | **MEDIUM** |
| `/api/groups/[id]/settlements` | GET | Creator OR member check | PASS |
| `/api/groups/[id]/settlements` | POST | Creator OR member check | PASS |
| `/api/groups/[id]/settlements/[requestId]` | GET, PUT | **Creator-only check -- see Finding #2** | **MEDIUM** |
| `/api/groups/[id]/ai-insights` | GET | Creator OR member check | PASS |
| `/api/groups/ai-suggest` | POST | Auth check only (no DB data access -- processes client-sent items) | PASS |
| `/api/groups/splits` | POST | Verifies `groupMembers.userId === userId` before insert | PASS |
| `/api/groups/splits/[splitId]/settle` | PATCH | Verifies `groupMembers.userId === userId` before update | PASS |

### 2.4 Settlement Public Route (PASS)

| Route | Methods | Verdict |
|-------|---------|---------|
| `/api/settlement/[id]` | GET | Requires valid `shareToken` OR auth + group membership | PASS |
| `/api/settlement/[id]` | PUT | Requires valid `shareToken` OR auth + group membership | PASS |

### 2.5 Bank Routes (ALL PASS)

| Route | Methods | userId Filtering | Verdict |
|-------|---------|-----------------|---------|
| `/api/bank/connect` | POST | `userId` from auth, stored in `bankConnections.userId` | PASS |
| `/api/bank/callback` | GET | Filters pending connections by `eq(bankConnections.userId, userId)` | PASS |
| `/api/bank/accounts` | GET | Filters by `eq(bankConnections.userId, userId)` and `eq(bankAccounts.userId, userId)` | PASS |
| `/api/bank/data` | GET | All queries filtered by `userId` | PASS |
| `/api/bank/disconnect` | POST | `where(and(eq(bankConnections.id, ...), eq(bankConnections.userId, userId)))` | PASS |
| `/api/bank/sync` | POST | `where(and(eq(bankAccounts.id, ...), eq(bankAccounts.userId, userId)))` | PASS |
| `/api/bank/transactions` | GET | `eq(bankTransactions.userId, userId)` in all conditions | PASS |
| `/api/bank/match` | POST | Verifies transaction ownership, creates expenses with `userId` | PASS |

### 2.6 Business Routes (ALL PASS)

| Route | Methods | userId Filtering | Verdict |
|-------|---------|-----------------|---------|
| `/api/business/team` | GET, POST | Scoped via `companyMembers.userId -> companyId` chain + role check | PASS |
| `/api/business/team/[memberId]` | PUT, DELETE | Verifies target member in same company + role check | PASS |
| `/api/business/approvals` | GET, POST | Scoped via company membership + role check; expense verified with `eq(expenses.userId, userId)` | PASS |
| `/api/business/approvals/[id]` | PUT | Verifies approval belongs to user's company + role check | PASS |
| `/api/business/invoices` | GET, POST | `eq(invoices.userId, userId)` | PASS |
| `/api/business/vat` | GET, POST | Scoped via company membership | PASS |
| `/api/business/jpk` | POST | Scoped via company membership + role check | PASS |

### 2.7 Personal Routes (ALL PASS)

| Route | Methods | userId Filtering | Verdict |
|-------|---------|-----------------|---------|
| `/api/personal/budget` | GET, POST | `eq(monthlyBudgets.userId, userId)` | PASS |
| `/api/personal/budget/afford` | POST | `eq(expenses.userId, userId)`, `eq(savingsGoals.userId, userId)` | PASS |
| `/api/personal/goals` | GET, POST | `eq(savingsGoals.userId, userId)` | PASS |
| `/api/personal/goals/[id]` | PUT, DELETE | `and(eq(savingsGoals.id, id), eq(savingsGoals.userId, userId))` | PASS |
| `/api/personal/goals/[id]/deposit` | POST | Verifies goal belongs to user before deposit | PASS |
| `/api/personal/challenges` | GET, POST | `eq(financialChallenges.userId, userId)` | PASS |
| `/api/personal/challenges/[id]` | PUT, DELETE | `and(eq(id), eq(userId))` | PASS |
| `/api/personal/financial-health` | GET | All queries filtered by `userId` | PASS |
| `/api/personal/loyalty` | GET, POST, DELETE | `eq(loyaltyCards.userId, userId)` on all ops | PASS |
| `/api/personal/subscriptions` | GET | `eq(expenses.userId, userId)` | PASS |
| `/api/personal/merchant-rules` | GET, POST, DELETE | `eq(merchantRules.userId, userId)` on all ops | PASS |
| `/api/personal/weekly-summary` | POST | `eq(expenses.userId, userId)`, stores with `userId` | PASS |
| `/api/personal/promotions` | POST | `eq(receipts.userId, userId)`, `eq(expenses.userId, userId)` | PASS |
| `/api/personal/promotions/scan` | POST | Auth check only (no user data queried from DB) | PASS |
| `/api/personal/export-data` | GET | All queries filtered by `eq(*.userId, userId)` | PASS |

### 2.8 AI/Processing Routes (ALL PASS)

| Route | Methods | userId Filtering | Verdict |
|-------|---------|-----------------|---------|
| `/api/analysis/ai` | POST | All queries filtered by `userId` | PASS |
| `/api/audit/generate` | POST | All queries filtered by `userId` | PASS |
| `/api/prices/compare` | POST, GET | All queries filtered by `userId`, saves with `userId` | PASS |
| `/api/reports/generate` | POST | `eq(expenses.userId, userId)` | PASS |
| `/api/reports/custom` | POST | `eq(expenses.userId, userId)` | PASS |
| `/api/v1/ocr-receipt` | POST | Auth check, all DB ops use `userId` | PASS |
| `/api/v1/ocr-invoice` | POST | Auth check, all DB ops use `userId` | PASS |
| `/api/v1/convert-heic` | POST | Auth check only (no DB ops) | PASS |
| `/api/v1/seed-categories` | POST | Auth check, seeds for `userId` | PASS |

---

## 3. Detailed Findings

### FINDING #1 (MEDIUM): Group Receipts & Assign -- Creator-Only Check Excludes Members

**Files:**
- `app/api/groups/[id]/receipts/route.ts` lines 15, 102
- `app/api/groups/[id]/receipts/[receiptId]/assign/route.ts` line 21

The GET and POST handlers only check if the user is the **creator** of the group:
```typescript
const [group] = await db.select().from(groups)
  .where(and(eq(groups.id, id), eq(groups.createdBy, userId)))
```

Group members who are not the creator get a 404 even though they have legitimate access. Compare with `groups/[id]/dashboard/route.ts` and `groups/[id]/settlements/route.ts` which correctly check both creator and member.

**Impact:** Not a data leak (too restrictive, not too permissive). But functionally broken for non-creator group members attempting to view receipts.

**Recommendation:** Use the creator-OR-member pattern used in other group routes:
```typescript
const [group] = await db.select().from(groups).where(eq(groups.id, id))
if (!group) return NextResponse.json({ error: 'Not found' }, { status: 404 })
if (group.createdBy !== userId) {
  const [membership] = await db.select({ id: groupMembers.id })
    .from(groupMembers)
    .where(and(eq(groupMembers.groupId, id), eq(groupMembers.userId, userId)))
    .limit(1)
  if (!membership) return NextResponse.json({ error: 'Not found' }, { status: 404 })
}
```

---

### FINDING #2 (MEDIUM): Settlement Request GET/PUT -- Creator-Only Check

**File:** `app/api/groups/[id]/settlements/[requestId]/route.ts` lines 27, 84

Both handlers check group access with creator-only pattern:
```typescript
const [group] = await db.select().from(groups)
  .where(and(eq(groups.id, groupId), eq(groups.createdBy, userId)))
```

This is inconsistent with the parent settlements route (`settlements/route.ts` lines 34-41) which correctly checks both creator and member.

**Impact:** Non-creator members cannot view or update individual payment requests, even though they can see the settlements list.

**Recommendation:** Use the creator-OR-member pattern.

---

### FINDING #3 (LOW): Deposit Update Missing userId in WHERE Clause

**File:** `app/api/personal/goals/[id]/deposit/route.ts` line 59

```typescript
await db.update(savingsGoals).set({ ... }).where(eq(savingsGoals.id, id))
```

After verifying the goal belongs to the user (lines 32-34 with `and(eq(id), eq(userId))`), the subsequent UPDATE uses only `eq(savingsGoals.id, id)` without `eq(savingsGoals.userId, userId)`.

**Impact:** Not exploitable (ownership verified before update). Defense-in-depth gap.

**Recommendation:** `where(and(eq(savingsGoals.id, id), eq(savingsGoals.userId, userId)))`

---

### FINDING #4 (LOW): OCR Receipt Duplicate Delete Missing userId

**File:** `app/api/v1/ocr-receipt/route.ts` line 1010

```typescript
await db.delete(receipts).where(eq(receipts.id, currentReceiptId));
```

When deleting a duplicate receipt, the WHERE clause does not include `eq(receipts.userId, userId)`. The `currentReceiptId` was just created by this same request with the correct userId, so not exploitable.

**Recommendation:** `where(and(eq(receipts.id, currentReceiptId), eq(receipts.userId, userId)))`

---

### FINDING #5 (LOW): Bank Match Expense Update Without userId

**File:** `app/api/bank/match/route.ts` line 92

```typescript
await db.update(expenses).set({ bankTransactionId: transaction.id })
  .where(eq(expenses.id, expenseId))
```

The `expenseId` was obtained from a userId-filtered query (line 76), so not exploitable.

**Recommendation:** Add `eq(expenses.userId, userId)` to the WHERE clause.

---

### FINDING #6 (LOW): Payment Request Update Without groupId

**File:** `app/api/groups/[id]/settlements/[requestId]/route.ts` lines 94-106

```typescript
await db.update(paymentRequests).set({ status: 'settled', ... })
  .where(eq(paymentRequests.id, requestId))
```

After verifying the request belongs to the group (line 90), the UPDATE uses only the requestId. Should also include `eq(paymentRequests.groupId, groupId)` for defense-in-depth.

**Recommendation:** Add `eq(paymentRequests.groupId, groupId)` to both settle and decline UPDATE WHERE clauses.

---

### FINDING #7 (INFORMATIONAL): Vercel Blob URLs Are Public and Unauthenticated

**Files:** `app/api/reports/generate/route.ts`, `app/api/v1/ocr-receipt/route.ts`, `app/api/v1/ocr-invoice/route.ts`

All `put()` calls use `access: 'public'`. Vercel Blob generates URLs with random tokens, making them unguessable (~128 bits of entropy), but anyone with the URL can access the file.

**Affected data:**
- Generated reports (CSV, PDF, DOCX) at `reports/{userId}/{period}/*`
- Receipt images at `receipts/{userId}/{receiptId}/{filename}`
- Invoice images at `invoices/{userId}/{timestamp}_{filename}`

**Assessment:** URLs are practically unguessable. Risk is limited to URL leakage scenarios (browser history, shared links, logging).

**Recommendation:** Consider `access: 'private'` with server-side proxy for sensitive financial documents, or accept the risk.

---

### FINDING #8 (INFORMATIONAL): receiptItems Queried by receiptId (Transitive Isolation)

**Files:** `app/api/data/receipts/insights/route.ts`, `app/api/groups/[id]/receipts/route.ts`, `app/api/groups/[id]/settlements/route.ts`

`receiptItems` are queried via `inArray(receiptItems.receiptId, receiptIds)` where `receiptIds` come from userId-filtered queries. This is correct transitive isolation. The `receiptItems` table does not have a direct `userId` column for redundant filtering.

**Assessment:** Not a vulnerability -- architectural decision.

---

### FINDING #9 (INFORMATIONAL): receiptItemAssignments Scoped by groupId

The `receiptItemAssignments` table uses `groupId` for scoping rather than `userId`. Access control is enforced through group membership verification before any assignment operations.

**Assessment:** Correct for group-shared data.

---

## 4. Summary Table

| # | Severity | Finding | Exploitable? |
|---|----------|---------|-------------|
| 1 | MEDIUM | Group receipts GET/POST/assign: creator-only check (blocks members) | No (too restrictive) |
| 2 | MEDIUM | Settlement request GET/PUT: creator-only check (inconsistent) | No (too restrictive) |
| 3 | LOW | Deposit update missing userId in WHERE | No (prior ownership check) |
| 4 | LOW | OCR duplicate receipt delete missing userId in WHERE | No (receipt just created) |
| 5 | LOW | Bank match expense update missing userId in WHERE | No (ID from filtered query) |
| 6 | LOW | Payment request update missing groupId in WHERE | No (ID verified against group) |
| 7 | INFO | Vercel Blob URLs public (unguessable but unauthenticated) | Only if URL leaked |
| 8 | INFO | receiptItems queried by receiptId (transitive isolation) | No |
| 9 | INFO | receiptItemAssignments scoped by groupId, not userId | No |

---

## 5. Positive Observations

1. **Consistent auth pattern**: Every single route file calls `auth()` as the first operation and returns 401 if no userId. Zero exceptions found across all 64 route handlers.

2. **userId never from request**: The `userId` is always derived server-side from the signed session cookie. The only exception is the Hub integration path, which requires a shared secret.

3. **Strong defense-in-depth on UPDATE/DELETE**: Most UPDATE/DELETE operations include `eq(*.userId, userId)` in the WHERE clause even when the record was already verified. Notable examples:
   - `expenses` PUT: `where(and(eq(expenses.id, data.id), eq(expenses.userId, userId)))`
   - `categories` DELETE: `where(and(eq(categories.id, id), eq(categories.userId, userId)))`
   - `groups` DELETE: `where(and(eq(groups.id, id), eq(groups.createdBy, userId)))`
   - OCR receipt update (line 1124): `where(and(eq(receipts.id, currentReceiptId), eq(receipts.userId, userId)))`

4. **Group membership verification**: Split creation and settlement operations verify group membership before allowing writes.

5. **HMAC-signed session cookies**: Session tampering is prevented by HMAC-SHA256 with constant-time comparison.

6. **Rate limiting**: All AI/OpenAI-powered endpoints are rate-limited per userId.

7. **Input validation**: Extensive use of Zod schemas for request body validation across routes.

8. **Business role-based access**: Business routes enforce role hierarchy (owner > admin > manager > employee) for sensitive operations.

---

## 6. Recommendations (Priority Order)

1. **Fix Findings #1 and #2**: Add "creator OR member" pattern to group receipts and settlement request routes for functional consistency. These currently block legitimate group members from accessing shared data.

2. **Fix Findings #3-#6**: Add userId/groupId to WHERE clauses in UPDATE/DELETE operations for defense-in-depth. None are exploitable today, but adding the guard prevents future regressions.

3. **Evaluate Finding #7**: Consider `access: 'private'` for Vercel Blob if financial document confidentiality is a hard requirement. Current risk is low due to URL entropy.

4. **Consider adding a `userId` column to `receiptItems`**: Would enable direct userId filtering instead of relying on transitive isolation through receiptId. Low priority -- current approach is correct.
