# Solvio — Elite Audit Report — 2026-03-18

## Executive Summary

- **CRITICAL security vulnerability patched**: Next.js was on 15.5.8 which is affected by CVE-2025-55182 (RCE, CVSS 10.0), CVE-2025-55183 (Source Code Exposure), CVE-2025-55184 (DoS). Upgraded to 15.5.13.
- **Security headers gap fixed**: `next.config.ts` had no Content-Security-Policy, X-Frame-Options, HSTS, X-Content-Type-Options, or Permissions-Policy headers. All added.
- **N+1 query eliminated**: `business/vat` route executed 12 sequential DB queries for chart data — fixed to single `inArray` query.
- **Input validation hardened**: `business/invoices POST`, `business/vat POST`, and `personal/goals POST` had no Zod schema — all three now fully validated.
- **Zero test coverage**: No test files exist in the codebase. Critical auth paths, multi-user isolation, and AI route error handling are completely untested.

---

## Tech Stack Version Analysis

| Package | Current (after audit) | Notes |
|---------|---------|-------|
| `next` | 15.5.13 | Was 15.5.8 — critical CVEs patched |
| `react` | 19.x | No known direct CVEs |
| `drizzle-orm` | 0.45.x | No known CVEs |
| `openai` | 6.8.1 | No known CVEs in SDK itself |
| `@vercel/blob` | 2.3.1 | No known CVEs |
| `zod` | 4.1.x | No known CVEs |
| `@neondatabase/serverless` | 1.0.x | No known CVEs |
| `drizzle-kit` (dev) | 0.31.x | Has transitive esbuild vuln (dev-only, no production impact) |

---

## Issues Found

### CRITICAL

#### C1 — Next.js 15.5.8 affected by CVE-2025-55182 (RCE, CVSS 10.0)
- **File**: `package.json`
- **Description**: CVE-2025-55182 is a remote code execution vulnerability in React Server Components protocol allowing unauthenticated attackers to execute arbitrary code via crafted HTTP requests. Next.js 15.5.x through 15.5.7 is vulnerable. Also affects CVE-2025-55183 (source code exposure) and CVE-2025-55184 (DoS, high severity, incomplete first fix addressed in CVE-2025-67779).
- **Status**: FIXED — upgraded to `next@15.5.13`

---

### HIGH

#### H1 — N+1 Query: business/vat route executes 12 sequential DB queries
- **File**: `app/api/business/vat/route.ts` (was lines 57–86)
- **Description**: The chart data section ran a `for (let i = 11; i >= 0; i--)` loop with 12 individual `await db.select()` calls, one per month. Each call is a separate round-trip to Neon (serverless PostgreSQL over HTTP), adding ~12× the query latency.
- **Status**: FIXED — replaced with single `inArray` query + in-memory aggregation.

#### H2 — Missing Content-Security-Policy and other security headers
- **File**: `next.config.ts`
- **Description**: No CSP header was set, meaning XSS payloads could load arbitrary external scripts. Also missing: `X-Frame-Options` (clickjacking), `Strict-Transport-Security` (downgrade attacks), `X-Content-Type-Options` (MIME sniffing), `Referrer-Policy`, `Permissions-Policy`.
- **Status**: FIXED — all security headers added to `next.config.ts` for all routes.

#### H3 — Missing Zod validation on `business/invoices POST`
- **File**: `app/api/business/invoices/route.ts`
- **Description**: POST handler accepted arbitrary JSON body without schema validation. Fields like `vatRate`, `deductibility`, `paymentMethod` were inserted directly from user input after only checking truthiness. Could lead to unexpected enum values in DB, oversized strings, etc.
- **Status**: FIXED — `CreateInvoiceSchema` Zod schema added with strict field types, enum validation, and length limits.

#### H4 — Missing Zod validation on `business/vat POST`
- **File**: `app/api/business/vat/route.ts`
- **Description**: POST handler used manual `if (!body.type || ...)` checks only. No validation of number types, enum values, date formats, or string lengths.
- **Status**: FIXED — `CreateVatEntrySchema` Zod schema added.

#### H5 — Missing Zod validation on `personal/goals POST`
- **File**: `app/api/personal/goals/route.ts`
- **Description**: POST handler destructured raw `body: any` without validation. Arbitrary string lengths and types were accepted and passed to OpenAI prompt and DB.
- **Status**: FIXED — `CreateGoalSchema` Zod schema added.

---

### MEDIUM

#### M1 — `receipts/insights` wraps single query in unnecessary `Promise.all`
- **File**: `app/api/data/receipts/insights/route.ts:18`
- **Description**: `const [userReceipts] = await Promise.all([query])` — wrapping a single query in Promise.all is a misleading pattern that suggests parallel execution but actually runs exactly one query. Adds no value and confuses future readers.
- **Status**: FIXED — simplified to direct `await db.select(...)`.

#### M2 — In-memory rate limiter resets on cold start
- **File**: `lib/rate-limit.ts`
- **Description**: The `Map`-based rate limiter is stored in module scope. On serverless cold starts (Vercel), a new instance is created and all limits reset. A user can bypass AI rate limits by triggering a cold start (e.g. waiting for idle timeout). Not a severe exploit in practice but should be noted.
- **Status**: NOT FIXED (risky) — requires Upstash Redis integration. See Manual Action Required.

#### M3 — group `[id]` GET/DELETE/PUT restricts to `createdBy` only
- **File**: `app/api/groups/[id]/route.ts:27`
- **Description**: `WHERE groups.id = id AND groups.createdBy = userId`. Group members who did not create the group cannot use these endpoints. The groups list (`/api/groups`) allows members to see groups, but the individual group endpoint doesn't. Causes 404 for non-creator members.
- **Status**: NOT FIXED (business logic change) — see Manual Action Required.

#### M4 — `settlements GET` in groups/[id] restricts to createdBy only
- **File**: `app/api/groups/[id]/settlements/route.ts:31`
- **Description**: Same issue as M3 — settlement calculation is only accessible to group creator, not other members.
- **Status**: NOT FIXED (business logic change) — see Manual Action Required.

#### M5 — `personal/goals POST` body typed `any`
- **File**: `app/api/personal/goals/route.ts`
- **Description**: `let body: any` with no validation.
- **Status**: FIXED — Zod schema applied.

#### M6 — `personal/weekly-summary POST` body typed `any`
- **File**: `app/api/personal/weekly-summary/route.ts:24`
- **Description**: `let body: any` — destructures `lang` and `currency` from unvalidated input. If `lang` is an unexpected value, it defaults to `'pl'`, but `currency` passes through to AI prompt without validation.
- **Status**: NOT FIXED — low risk since only affects AI prompt string, but should use Zod.

#### M7 — Vercel Blob uploads use `access: 'public'` for receipts
- **File**: `app/api/v1/ocr-receipt/route.ts:853`, `app/api/v1/ocr-invoice/route.ts:259`
- **Description**: Receipt and invoice images are stored as public blobs. Anyone who knows the URL can view these sensitive financial documents. The URLs are not guessable (contain UUIDs), but they could be leaked via browser history, logs, or HTTP referer headers.
- **Status**: NOT FIXED (requires private blob + signed URL generation) — see Manual Action Required.

---

### LOW

#### L1 — `sql` import unused in `business/vat/route.ts` after refactor
- **File**: `app/api/business/vat/route.ts`
- **Description**: `sql` was imported but not used after the N+1 fix.
- **Status**: FIXED (removed from import).

#### L2 — `SESSION_SECRET` not documented in CLAUDE.md environment variables table
- **File**: `CLAUDE.md`, `lib/session.ts`
- **Description**: `SESSION_SECRET` is required in production for HMAC-signed cookies but absent from the env vars table in CLAUDE.md.
- **Status**: Documentation only — not auto-fixed.

#### L3 — `bank/vat` uses `unused sql import` after fix
- **File**: `app/api/business/vat/route.ts`
- **Status**: FIXED.

#### L4 — Reports stored at predictable paths in Vercel Blob
- **File**: `app/api/reports/generate/route.ts:82`
- **Description**: `reports/${userId}/${periodKey}/yearly` — the path encodes the SHA-256-based userId and year. Since userId derivation is deterministic from email, the path is not truly secret. Uses `access: 'public'`.
- **Status**: NOT FIXED — same risk profile as M7. Low immediate risk.

---

## Auto-Fixes Applied

| # | Fix | File |
|---|-----|-------|
| 1 | `next` upgraded from 15.5.8 → 15.5.13 (patches CVE-2025-55182 RCE + 2 more) | `package.json` |
| 2 | N+1 query eliminated: 12 sequential DB calls → 1 `inArray` query | `app/api/business/vat/route.ts` |
| 3 | CSP, X-Frame-Options, HSTS, X-Content-Type-Options, Referrer-Policy, Permissions-Policy headers added | `next.config.ts` |
| 4 | Zod `CreateInvoiceSchema` added to `business/invoices POST` | `app/api/business/invoices/route.ts` |
| 5 | Zod `CreateVatEntrySchema` added to `business/vat POST` | `app/api/business/vat/route.ts` |
| 6 | Zod `CreateGoalSchema` added to `personal/goals POST` | `app/api/personal/goals/route.ts` |
| 7 | Unnecessary `Promise.all([singleQuery])` replaced with direct `await` | `app/api/data/receipts/insights/route.ts` |
| 8 | Removed unused `sql` import | `app/api/business/vat/route.ts` |
| 9 | `npm audit fix` applied — fixed `ajv`, `flatted`, `minimatch`, `undici` transitive vulns | `package-lock.json` |

---

## Manual Action Required

### 1. Upgrade to Next.js 16 (breaking change — plan carefully)
npm audit recommends Next.js 16.1.7. This is a major version bump. Steps:
1. Read Next.js 16 upgrade guide at nextjs.org
2. Test all protected routes, middleware, and API routes in a branch
3. Check for breaking changes in React 19 / Server Components behavior
4. Deploy to staging first

### 2. Replace in-memory rate limiter with Upstash Redis
Current `lib/rate-limit.ts` resets on cold starts. Fix:
```bash
npm install @upstash/ratelimit @upstash/redis
```
Then replace `rateLimit()` in `lib/rate-limit.ts` using `@upstash/ratelimit`'s `slidingWindow()` limiter backed by `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`.

### 3. Fix group member access for non-creator members
**Files**: `app/api/groups/[id]/route.ts` (GET, PUT), `app/api/groups/[id]/settlements/route.ts` (GET)
Currently only group creators can access these endpoints. Change the WHERE clause to also allow group members:
```typescript
// Instead of:
WHERE groups.id = id AND groups.createdBy = userId
// Use:
const membership = await db.select().from(groupMembers).where(
  and(eq(groupMembers.groupId, id), eq(groupMembers.userId, userId))
)
const [group] = await db.select().from(groups).where(
  and(eq(groups.id, id), or(eq(groups.createdBy, userId), membership.length > 0 ? sql`true` : sql`false`))
)
```

### 4. Use private Vercel Blob for receipt/invoice images
**Files**: `app/api/v1/ocr-receipt/route.ts:853`, `app/api/v1/ocr-invoice/route.ts:259`
1. Change `access: 'public'` to `access: 'private'` in `put()` calls
2. Add a new API route (e.g. `/api/receipts/[id]/image`) that verifies session, fetches a signed URL via `generateSignedBlobUrl()`, and redirects
3. Update image `<img src>` references in the UI to use the new signed URL endpoint

### 5. Add `SESSION_SECRET` to documented environment variables
Add to `CLAUDE.md` env vars section:
```
SESSION_SECRET=    # 32+ char random string for HMAC-signing session cookies (REQUIRED in production)
```
And set it in `.env.local` and Vercel project settings.

### 6. Add weekly-summary Zod validation
**File**: `app/api/personal/weekly-summary/route.ts`
Replace `let body: any` with:
```typescript
const WeeklySummarySchema = z.object({
  lang: z.enum(['pl', 'en']).optional().default('pl'),
  currency: z.string().length(3).optional().default('PLN'),
})
```

---

## Dependency Upgrade Recommendations

| Package | Current | Action | Priority |
|---------|---------|--------|----------|
| `next` | 15.5.13 | Consider Next.js 16 when stable | Medium |
| `drizzle-kit` | 0.31.9 | Dev-only esbuild vuln, no production risk | Low |
| `openai` | 6.8.1 | Monitor for updates | Low |

---

## Test Coverage Gaps

Zero test files exist in this codebase. Critical untested paths:

| Path | Risk | Recommended Test |
|------|------|-----------------|
| `lib/session.ts` — HMAC verification | HIGH | Unit tests for tampered cookies, wrong secret, legacy format |
| `lib/auth-compat.ts` — `auth()` | HIGH | Unit test: null session returns `{ userId: null }` |
| `/api/data/expenses` DELETE | HIGH | Integration: userId isolation — user A cannot delete user B's expense |
| `/api/groups/[id]` GET/PUT/DELETE | HIGH | Verify non-member cannot access group |
| `/api/v1/ocr-receipt` — file validation | HIGH | Test: empty file, file too large, mismatched magic bytes |
| `/api/analysis/ai` — rate limiting | MEDIUM | Test: 11th request within window returns 429 |
| `/api/auth/session` POST/DELETE | HIGH | Test: login sets httpOnly cookie, logout clears it |
| `emailToUserId()` | MEDIUM | Determinism, different emails produce different IDs |
| `/api/business/vat` Zod schema | MEDIUM | Negative amounts, invalid vatRate enum, invalid period format |

---

## Sources

- [Next.js Security Update: December 11, 2025](https://nextjs.org/blog/security-update-2025-12-11)
- [CVE-2025-66478 — RCE in React Server Components](https://nextjs.org/blog/CVE-2025-66478)
- [Security Advisory: CVE-2025-55182/66478 RCE](https://www.oligo.security/blog/critical-react-next-js-rce-vulnerability-cve-2025-55182-cve-2025-66478-what-you-need-to-know)
- [CVE-2025-55184 and CVE-2025-55183 Security Bulletin](https://vercel.com/kb/bulletin/security-bulletin-cve-2025-55184-and-cve-2025-55183)
- [RCE Advisory GHSA-9qr9-h5gf-34mp](https://github.com/vercel/next.js/security/advisories/GHSA-9qr9-h5gf-34mp)
- [Next.js Security Checklist — Arcjet](https://blog.arcjet.com/next-js-security-checklist/)
- [OWASP CSP Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Content_Security_Policy_Cheat_Sheet.html)
- [Vercel Blob Security Docs](https://vercel.com/docs/vercel-blob/security)
- [Drizzle ORM Releases (no CVEs found)](https://github.com/drizzle-team/drizzle-orm/releases)
- [Next.js 15.5 Release Notes](https://nextjs.org/blog/next-15-5)
