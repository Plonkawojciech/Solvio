# Solvio

AI-powered expense tracking SaaS — receipt OCR, group splitting, price comparison, financial reports. Bilingual PL/EN. iOS-first product with Next.js backend + landing.

**Production:** [https://solvio-lac.vercel.app](https://solvio-lac.vercel.app)

> 100% AI codebase — built and maintained by Claude (opus / sonnet) via Claude Code. Update [`progress.md`](./progress.md) after every change.

---

## Surfaces

- **iOS app** (`native-ios/Solvio/`) — SwiftUI, primary product surface. Distributed via TestFlight / App Store.
- **Next.js app** (`app/`) — backend API + marketing landing page. Web is **not** the product UX surface.
- **Backend services** — Neon Postgres + Drizzle, Vercel Blob (reports/receipts), Azure OpenAI (categorization/analysis), Azure Document Intelligence (OCR), GoCardless (PSD2 bank import).

For full architecture see [`docs/architecture.md`](./docs/architecture.md).

---

## Features

- **Receipt scanning (OCR)** — Azure Document Intelligence extracts vendor, total, line items. iOS supports multi-image background queue.
- **Manual + virtual receipts** — quick-entry forms for cash purchases without paper paragon.
- **Categories & budgets** — per-user categories with hash-based color palette, monthly category budgets.
- **Expense list & analysis** — filter, search, AI-powered spending analysis (Recharts).
- **Shopping audit** — periodic AI audit of where the user could have saved (web search + AI).
- **Price comparison** — AI suggests where the same product is cheaper.
- **Reports** — generate CSV / PDF / DOCX over arbitrary date ranges, stored in Vercel Blob.
- **Groups & splits** — multi-member expense splitting with payment requests and settlement tracking.
- **Goals** — savings goals with deposit tracking and deadline-aware monthly-needed projections.
- **Bilingual** — full PL/EN coverage, every user-facing string goes through `useTranslation()` (`lib/i18n.ts`).

For competitor positioning see [`docs/competitor-matrix.md`](./docs/competitor-matrix.md).
For 2026 best-in-class research see [`docs/research-round1.md`](./docs/research-round1.md).

---

## Tech stack

| Layer | Technology |
|---|---|
| iOS app | SwiftUI + Combine, Swift 5.10, iOS 17+ target |
| Web framework | Next.js 15.5.8, React 19, TypeScript (strict) |
| Styling | Tailwind CSS v4, framer-motion v12, shadcn/ui (Radix primitives) |
| Database | Neon (serverless PostgreSQL, eu-central-1) |
| ORM | Drizzle ORM + drizzle-kit |
| Auth | Custom cookie-based session (`solvio_session`, sha256 email→userId) |
| File storage | Vercel Blob (`@vercel/blob`) |
| AI | Azure OpenAI (primary) with OpenAI fallback, unified via `lib/ai-client.ts` |
| OCR | Azure Document Intelligence |
| Bank import | GoCardless Bank Account Data (Nordigen, PSD2) |
| Reports | pdf-lib, pdfkit, docx |

---

## Quick start

```bash
npm install

cp .env.example .env.local       # fill in values — see Environment variables below
npm run db:push                  # push Drizzle schema to Neon

npm run dev                      # http://localhost:3000
npm run build                    # production build
npm run db:studio                # open Drizzle Studio
```

For the iOS app:

```bash
cd native-ios/Solvio
xcodebuild -project Solvio.xcodeproj -scheme Solvio -destination generic/platform=iOS
# Or open Solvio.xcodeproj in Xcode 26+ and Cmd+R
```

---

## Environment variables

Required in `.env.local`:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Neon PostgreSQL connection string |
| `SESSION_SECRET` | 32+ char random string for HMAC-signing session cookies (required in prod) |
| `AZURE_OPENAI_ENDPOINT` | Azure OpenAI resource endpoint (`https://<resource>.openai.azure.com/`) |
| `AZURE_OPENAI_API_KEY` | Azure OpenAI resource key |
| `AZURE_OPENAI_DEPLOYMENT` | Deployment name (e.g. `gpt-4o-mini`) |
| `AZURE_OPENAI_API_VERSION` | Optional, defaults to `2024-10-21` |
| `OPENAI_API_KEY` | Fallback — only used if Azure OpenAI vars are not set |
| `AZURE_OCR_ENDPOINT` | Azure Document Intelligence endpoint |
| `AZURE_OCR_KEY` | Azure Document Intelligence key |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob token (reports + receipts storage) |
| `GOCARDLESS_SECRET_ID` | GoCardless Bank Account Data secret ID |
| `GOCARDLESS_SECRET_KEY` | GoCardless Bank Account Data secret key |

Optional:

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_APP_URL` | App base URL (falls back to `VERCEL_URL`) |
| `HUB_INTEGRATION_SECRET` | Shared secret for Programo Hub server-to-server API calls |
| `PKO_ENCRYPTION_KEY` | Legacy — used for direct PSD2, kept for backward compat |

---

## Project structure

```
app/                              # Next.js App Router
  (auth)/                         # Login + auth error pages
  (marketing)/                    # Landing page route group
  (protected)/                    # Authenticated app — server-side session check
    dashboard/                    # Financial dashboard
    expenses/                     # Expense list + CRUD
    analysis/                     # AI spending analysis
    audit/                        # Shopping audit
    reports/                      # Report generation
    settings/                     # User settings, categories, budgets
    groups/[id]/                  # Group expense splitting
    prices/                       # Price comparison
  api/                            # API routes (see CLAUDE.md for full list)
components/
  ui/                             # shadcn/ui primitives
  protected/                      # Authenticated app components (sidebar, dashboard, charts...)
  landing_page/                   # Marketing landing
lib/
  db/                             # Drizzle schema + lazy Neon singleton
  i18n.ts                         # PL/EN translations (~1050 lines)
  session.ts / auth-compat.ts     # Cookie session helpers
  ai-client.ts                    # Azure OpenAI / OpenAI unified client
native-ios/Solvio/                # iOS app (SwiftUI) — primary product
  Features/                       # One folder per screen domain
  Core/                           # Shared services (ApiClient, ToastCenter, L10n, ...)
docs/                             # Architecture, competitor matrix, research notes
```

For the full database schema (11 tables) and complete API route list, see [`CLAUDE.md`](./CLAUDE.md).

---

## Deployment

- **Web**: Vercel project `solvio` (team `plonkawojciechs-projects`).
- **DB**: Neon project `solvio` (`still-surf-97743103`), region `aws-eu-central-1`.
- **Blob**: store `solvio-reports` (`store_AvSDzhNckgVnFOs2`).
- **iOS**: TestFlight via App Store Connect (build via WiFi to Wojtek's iPhone — see `progress.md` for ECID).
- **Function timeout**: 60s (Vercel Hobby) or 300s (Vercel Pro).

---

## Documentation

| File | Purpose |
|---|---|
| [`CLAUDE.md`](./CLAUDE.md) | Authoritative codebase guide for AI agents |
| [`progress.md`](./progress.md) | Semantic changelog — every change documented |
| [`docs/architecture.md`](./docs/architecture.md) | iOS ↔ Next.js API architecture |
| [`docs/competitor-matrix.md`](./docs/competitor-matrix.md) | Solvio vs Copilot/Monarch/YNAB/Splitwise/etc. |
| [`docs/research-round1.md`](./docs/research-round1.md) | 2026 best-in-class research + prioritized backlog |
| [`docs/research-round2.md`](./docs/research-round2.md) | PL fintech taxonomy, OCR benchmark, Solvio Agent design |
| [`docs/research-round3.md`](./docs/research-round3.md) | Subscription detection, landing SEO/a11y, receipt-line splitting |
| [`docs/research-round4.md`](./docs/research-round4.md) | Apple Watch + Vision Pro, push notifications, GDPR/RODO export+deletion+Privacy Manifest |
| [`docs/watch-vision-roadmap.md`](./docs/watch-vision-roadmap.md) | 5-day Watch app v1 plan + Live Activity pattern + Vision Pro defer reasoning |
| [`docs/push-strategy.md`](./docs/push-strategy.md) | iOS push notifications: provisional auth, interruption levels, APNs payload |
| [`docs/gdpr-export-deletion.md`](./docs/gdpr-export-deletion.md) | RODO/GDPR export + account deletion + `PrivacyInfo.xcprivacy` template |
| [`AUDIT_REPORT.md`](./AUDIT_REPORT.md), [`audit-report.md`](./audit-report.md) | Past code audits |
| [`security-report.md`](./security-report.md) | Security audit |
| [`perf-report.md`](./perf-report.md) | Performance audit |
| [`ux-report.md`](./ux-report.md) | UX audit |
| [`multiuser-report.md`](./multiuser-report.md) | Multi-user isolation audit |
| [`research-phase1.md`](./research-phase1.md) | Earlier security/dependency research |

---

## Ownership

Programo s.j. — equal partnership between **Wojciech Płonka** (`Plonkawojciech`) and **Bartosz Kolaj** (`bkolaj`). Both have full admin rights to code, infra, and product decisions.
