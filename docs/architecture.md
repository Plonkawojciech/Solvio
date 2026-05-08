# Solvio Architecture

How the **iOS app** (primary product surface) and the **Next.js backend** fit together.

---

## High-level topology

```
┌──────────────────────────────────────┐         ┌────────────────────────────────────┐
│                                      │         │                                    │
│   iOS App  (SwiftUI, native-ios/)    │  HTTPS  │   Next.js  15.5  (Vercel)         │
│                                      │ ──────▶ │                                    │
│   - Features/  (per-screen views)    │  JSON   │   app/(marketing)/  landing only   │
│   - Core/ApiClient.swift             │         │   app/(protected)/  legacy web UI  │
│   - Core/AppDataStore.swift  cache   │         │   app/api/         the only API   │
│   - Core/L10n.swift          PL/EN   │         │                                    │
│                                      │         │   middleware.ts    auth guard     │
└──────────────────────────────────────┘         └────────────────────────────────────┘
                  │                                              │
                  │                                              │
            session cookie                                       ▼
            solvio_session                          ┌──────────────────────────────┐
                                                    │  Neon Postgres (eu-central-1) │
                                                    │  Drizzle ORM                  │
                                                    │  11 tables, userId-isolated   │
                                                    └──────────────────────────────┘
                                                                  │
                                                                  ▼
                                       ┌──────────────────────────────────────────────┐
                                       │  External services                           │
                                       │  - Azure OpenAI       (categorization, AI)   │
                                       │  - Azure DocIntel     (receipt OCR)          │
                                       │  - Vercel Blob        (reports, receipts)    │
                                       │  - GoCardless         (PSD2 bank import)     │
                                       └──────────────────────────────────────────────┘
```

---

## Surface boundaries

### iOS app (`native-ios/Solvio/`) — the product

- SwiftUI, iOS 17+ target.
- Communicates with the backend exclusively over HTTPS / JSON.
- Local state in `Core/AppDataStore.swift` (per-tab caching — tab switches don't re-fetch).
- Translations in `Core/L10n.swift` mirror the web `lib/i18n.ts`.
- Session cookie (`solvio_session`) is stored in the URLSession cookie jar; it survives app relaunches.

**Where new product UX lands:** `native-ios/Solvio/Features/<domain>/<view>.swift`. A view's data flow is:

```
View  ──reads──▶  AppDataStore  ──serves cache or calls──▶  ApiClient
                                                                │
                                                                ▼
                                                          Next.js /api/...
```

### Next.js (`app/`) — backend + landing

- **Marketing landing** (`app/(marketing)/`) — the only public web surface. Performance-critical for SEO.
- **Protected web UI** (`app/(protected)/`) — legacy. Still works (Wojtek + Bartek use it occasionally) but **not** the place for new product features.
- **API routes** (`app/api/`) — the contract between iOS and the backend. Every iOS feature ships paired with one or more routes here.
- **Middleware** (`middleware.ts`) — checks the session cookie on protected paths and redirects to `/login` when missing.

**Where new product UX does NOT land:** `app/(protected)/...`. Web UI is treated as a backend-debug tool, not a customer surface.

---

## Authentication flow

```
┌────────┐                              ┌──────────────────┐                      ┌──────┐
│  iOS   │   POST /api/auth/session     │   Next.js API    │                      │ Neon │
│        │ ──{ email }──────────────▶   │                  │                      │      │
│        │                              │  set-cookie:     │                      │      │
│        │ ◀──{ ok: true }────set-cookie│  solvio_session= │                      │      │
│        │                              │  base64(JSON)    │                      │      │
│        │                              │                  │                      │      │
│        │   GET /api/auth/session/me   │                  │                      │      │
│        │ ──cookie────────────────────▶│  getSession()    │                      │      │
│        │                              │  decode cookie   │                      │      │
│        │                              │  userId =        │                      │      │
│        │                              │   "u_" +         │                      │      │
│        │                              │   sha256(email)  │                      │      │
│        │                              │   .slice(0,32)   │                      │      │
│        │                              │                  │                      │      │
│        │   GET /api/data/dashboard    │                  │  SELECT * FROM       │      │
│        │ ──cookie────────────────────▶│  auth() →userId  │  expenses            │      │
│        │                              │                  │  WHERE user_id = ?   │      │
│        │ ◀────────────────────────────│                  │ ◀────────────────────│      │
└────────┘                              └──────────────────┘                      └──────┘
```

**Key points:**

- No third-party auth provider. No Clerk (removed 2026-03-16). No NextAuth, no JWT.
- `userId` is **deterministic** — `sha256(email).slice(0, 32)` prefixed with `u_`. Same email always maps to the same userId, even after re-signup. This means **email change = new account**.
- Row-level isolation is enforced by `WHERE user_id = ?` in every query. There is **no** Postgres RLS — all isolation is application-level. (See `multiuser-report.md`.)
- Session cookie payload is HMAC-signed with `SESSION_SECRET` (required in prod). Without the secret, the cookie is unsigned and the server refuses to mint cookies on `NODE_ENV=production`.

---

## Data flow: scanning a receipt (end-to-end)

```
iOS user taps  "Scan Receipt"
        │
        ▼
┌────────────────────────────┐
│ ScanFlowViewModel          │  Resize image (max 2048px) + progressive JPEG
│ resizeForUpload()          │  compression (0.75 → 0.55 → 0.35 → 0.20)
│ compressForUpload()        │  Target ≤ 8 MB to fit backend's 10 MB limit
└────────────────────────────┘
        │
        ▼ HTTPS multipart POST
┌────────────────────────────┐
│  /api/v1/ocr-receipt       │
│                            │  1. Forward image to Azure DocIntel
│  app/api/v1/ocr-receipt/   │     (prebuilt-receipt model)
│  route.ts                  │  2. Get back { vendor, total, items[], confidence }
│                            │  3. Optionally normalize / categorize via Azure OpenAI
│                            │  4. Return JSON to iOS
└────────────────────────────┘
        │
        ▼  JSON
┌────────────────────────────┐
│ iOS confirm sheet          │  User reviews/edits parsed items
│ ReceiptConfirmView         │
└────────────────────────────┘
        │
        ▼ HTTPS POST
┌────────────────────────────┐
│  /api/data/expenses or     │  INSERT receipt + receipt_items rows
│  bespoke save endpoint     │  WHERE user_id = ?
└────────────────────────────┘
        │
        ▼
┌────────────────────────────┐
│  Vercel Blob               │  Upload original image (optional, future)
└────────────────────────────┘
        │
        ▼
   Receipt visible in
   ReceiptsListView via
   AppDataStore refresh
```

---

## Data flow: AI spending analysis

```
iOS Analysis tab
        │
        ▼
┌────────────────────────────┐
│  /api/analysis/ai          │  1. Read user's expenses + categories (period-bounded)
│                            │  2. Build prompt with totals + category breakdown
│                            │  3. Call Azure OpenAI (or OpenAI fallback)
│                            │  4. Parse structured JSON response
│                            │  5. Return { summary, insights[], recommendations[] }
└────────────────────────────┘
        │
        ▼
┌────────────────────────────┐
│  Recharts on web           │  Lazy-loaded charts (web side)
│  Native Charts on iOS      │  Apple Charts framework on iOS
└────────────────────────────┘
```

Cache: results are stored on the analysis row keyed by `(userId, period)` so a re-tap of the same period doesn't re-spend tokens.

---

## Database highlights

11 tables, all defined in `lib/db/schema.ts`. Row isolation by a `user_id` text column (no FK to a `users` table — userIds are derived from email hash).

| Table | Why it exists |
|---|---|
| `user_settings` | Per-user currency, language, defaults |
| `categories` | Expense categories (auto-seeded on first login) |
| `receipts` + `receipt_items` | Scanned and virtual receipts with line items |
| `expenses` | Manual + receipt-linked expenses (the central transaction table) |
| `category_budgets` | Periodic per-category spend caps |
| `reports` | Generated CSV/PDF/DOCX files (URL points to Vercel Blob) |
| `audits` | AI shopping audits (period summary + savings opportunities) |
| `groups` + `group_members` | Multi-person expense splitting |
| `expense_splits` + `payment_requests` | Splits + settlement tracking |
| `price_comparisons` | AI price-comparison results |

DB connection is lazy via a Proxy (`lib/db/index.ts`) — no DB call happens at module-import time, so build-time pre-rendering doesn't hit Neon.

---

## External service integration

### Azure OpenAI (primary AI provider)

- Wrapped in `lib/ai-client.ts` → `getAIClient()`. Returns an `OpenAI` SDK client configured with the Azure deployment.
- Set `AZURE_OPENAI_*` envs to use Azure. If those are missing, the wrapper falls back to direct OpenAI with `OPENAI_API_KEY`.
- Used by: `app/api/analysis/ai/route.ts`, `app/api/audit/generate/route.ts`, `app/api/prices/compare/route.ts`, plus parts of OCR post-processing.

### Azure Document Intelligence (OCR)

- Direct REST calls to the prebuilt-receipt model.
- Endpoint + key in `AZURE_OCR_ENDPOINT` / `AZURE_OCR_KEY`.
- Single route uses it: `app/api/v1/ocr-receipt/route.ts`.

### Vercel Blob (file storage)

- Token: `BLOB_READ_WRITE_TOKEN`.
- Used for generated reports (CSV/PDF/DOCX) and (planned) receipt image archive.
- Public URLs are unguessable but un-authenticated. Treat blob URLs as bearer tokens.

### GoCardless Bank Account Data (PSD2 / Open Banking)

- Formerly Nordigen.
- `GOCARDLESS_SECRET_ID` / `GOCARDLESS_SECRET_KEY`.
- Fetches PL/EU bank transactions on the user's behalf after the user authorizes via the institution's flow.
- Active in `app/api/...` routes related to bank import.
- PKO PSD2 direct integration was scoped earlier (see `pko-psd2-api.md`) but Solvio currently goes through GoCardless rather than direct.

---

## What can break across the boundary

When iOS and Next.js are deployed independently (the iOS app is shipped via TestFlight/App Store; the web is auto-deployed on push to `main`), version skew is the #1 risk. Specifically:

- **Adding a required field to a request body** → old iOS clients break. Always make new fields optional with a sensible default for at least one TestFlight release.
- **Removing a response field** → iOS decoder fails (Swift `Codable` is strict by default). Either keep the field with a deprecation note for one release, or guarantee all installed clients have already been updated past the deprecation.
- **Changing an enum value** → same as above. The iOS enum decode will fail and the screen will show an error.
- **Renaming a JSON key** → always nuclear. Avoid, or send both keys for one release.

The convention is to bump `Info.plist` `CFBundleShortVersionString` for any breaking iOS-side change and gate behavior on `User-Agent` server-side if needed.

---

## See also

- [`CLAUDE.md`](../CLAUDE.md) — full codebase reference
- [`docs/competitor-matrix.md`](./competitor-matrix.md) — Solvio vs market
- [`docs/research-round1.md`](./research-round1.md) — 2026 research + prioritized backlog
- [`progress.md`](../progress.md) — every change ever made
