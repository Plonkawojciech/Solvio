# Solvio — Expense Tracking App
---

## Ownership — Programo s.c.

> **Programo s.c.** to spółka cywilna dwóch **równych wspólników**:
>
> | Wspólnik | GitHub | Rola |
> |----------|--------|------|
> | **Wojciech Płonka** | `Plonkawojciech` | Co-founder, full admin |
> | **Bartosz Kolaj** | `bkolaj` | Co-founder, full admin |
>
> Obaj mają **identyczne uprawnienia** do tego projektu — code review, merge, deploy, konfiguracja, architektura. Żaden nie jest nadrzędny. Decyzje podejmowane wspólnie.

## 100% AI Codebase — Instrukcja dla agentów
AI-powered expense tracking SaaS with receipt scanning, group splitting, price comparison, and financial reporting. Full PL/EN bilingual support.

Production URL: `https://solvio-lac.vercel.app`

## Tech Stack

- **Framework**: Next.js 15.5.8, React 19, TypeScript (strict)
- **Styling**: Tailwind CSS v4, tailwindcss-animate, framer-motion v12
- **UI**: shadcn/ui (Radix primitives), Lucide icons, Sonner toasts, Recharts
- **Database**: PostgreSQL — dwa drivery wybierane automatycznie w `lib/db/index.ts`:
  Neon HTTP dla URL-i `*.neon.tech` (deploy Vercel), `node-postgres` dla zwykłego
  Postgresa (self-host Docker/Coolify). Wymuszenie: `DATABASE_PROVIDER=neon|postgres`.
- **ORM**: Drizzle ORM + drizzle-kit
- **Auth**: Custom cookie-based session (`solvio_session` — base64-encoded email, 30-day expiry). Uses `lib/session.ts` + `lib/auth-compat.ts`
- **File Storage**: Vercel Blob (`@vercel/blob`) for reports/receipts
- **AI**: OpenAI direct (`OPENAI_API_KEY`, ten sam klucz co Estalo) — tak stoi produkcja od 22.08.2026. `lib/ai-client.ts` wybiera backend w kolejności Azure → OpenAI → Gemini, więc wystarczy nie ustawiać zmiennych Azure. Gemini zostaje w kodzie jako darmowy wariant awaryjny. Unified via `lib/ai-client.ts` → `getAIClient()`.
- **OCR**: Azure Document Intelligence (receipt scanning)
- **Reports**: pdf-lib, pdfkit, docx (CSV/PDF/DOCX generation)
- **Theme**: next-themes (light/dark), Geist font

## Quick Start

```bash
npm install
npm run dev          # http://localhost:3000
npm run build        # production build
npm run db:push      # push Drizzle schema do bazy z DATABASE_URL
npm run db:studio    # open Drizzle Studio
```

## Environment Variables

Required in `.env.local`:

```
DATABASE_URL=           # Neon PostgreSQL connection string
SESSION_SECRET=         # 32+ char random string for HMAC-signing session cookies (required in prod)
# AI — set one of:
# Option A (preferred): Azure OpenAI
AZURE_OPENAI_ENDPOINT=     # https://<resource>.openai.azure.com/
AZURE_OPENAI_API_KEY=      # Azure OpenAI resource key
AZURE_OPENAI_DEPLOYMENT=   # Deployment name (e.g. gpt-4o-mini)
AZURE_OPENAI_API_VERSION=  # Optional, defaults to 2024-10-21
# Option B (fallback): OpenAI direct
OPENAI_API_KEY=            # Used only if Azure vars not set
# Option C (free, self-host): Google Gemini — OCR paragonów + AI bez kosztów
GEMINI_API_KEY=            # https://aistudio.google.com/apikey (darmowy tier)
GEMINI_MODEL=              # Optional, defaults to gemini-2.5-flash
AZURE_OCR_ENDPOINT=     # Azure Document Intelligence endpoint
AZURE_OCR_KEY=          # Azure Document Intelligence key
BLOB_READ_WRITE_TOKEN=  # Vercel Blob token (reports storage)
GOCARDLESS_SECRET_ID=   # GoCardless Bank Account Data (Nordigen) secret ID
GOCARDLESS_SECRET_KEY=  # GoCardless Bank Account Data (Nordigen) secret key
```

Optional:
```
NEXT_PUBLIC_APP_URL=    # App base URL (falls back to VERCEL_URL)
HUB_INTEGRATION_SECRET= # Shared secret for Programo Hub server-to-server API calls
PKO_ENCRYPTION_KEY=     # Legacy — was used for PKO direct PSD2, kept for backward compat
```

## Platformy

**Solvio jest produktowo aplikacją iOS.** Web Next.js to backend API,
dev playground i landing — nie produkt końcowy. Każda zmiana UX/feature
idzie do `native-ios/Solvio/`.

Katalog `android/` (Compose, 59 plików) usunięty 2026-08-22: był w tyle
o cały redesign i wołał endpointy, których już nie ma. Historia w gicie,
gdyby kiedyś wrócił.

## Directory Structure

Po redesignie 2026-08-22 aplikacja ma **dwa ekrany produktowe** (Panel,
Wydatki) plus Ustawienia jako narzędzie. Wszystko inne zostało usunięte —
patrz `docs/plans/redesign-2-ekrany-i-api-crm.md`.

```
app/
  layout.tsx                   # Root layout
  globals.css                  # Tokeny Tailwind v4 — motyw "Notes Classic"
  (auth)/login/                # Logowanie (e-mail + hasło)
  (marketing)/                 # Landing + privacy + terms
  (protected)/
    layout.tsx                 # Sidebar + dolna nawigacja + auto-seed
    dashboard/                 # Panel
    expenses/                  # Lista wydatków + CRUD
    settings/                  # Waluta, kategorie, CRM, klucze API
  api/                         # Trasy API (niżej)
components/
  ui/                          # Prymitywy shadcn/ui
  protected/
    main/                      # sidebar, mobile-bottom-nav, header, skróty
    dashboard/                 # Widżety panelu + arkusze dodawania/skanu
    settings/                  # Formularze, crm-connection.tsx, api-keys.tsx
lib/
  db/{index,schema,batch}.ts   # Drizzle: wybór sterownika, schemat, dbBatch
  expense-core.ts              # JEDYNE miejsce tworzenia/edycji/usuwania wydatku
  crm/{connection,http,finance,registry,route-helpers}.ts
                               # Most do Finansów crm.programo.pl
  api-keys.ts / api-auth.ts    # Klucze API (slvk_) i bramka /api/v1/*
  api-query.ts                 # since / limit / cursor — kontrakt jak w CRM
  crypto-box.ts                # AES-256-GCM dla sekretu CRM-a
  session.ts, categorize.ts, format.ts, i18n.ts
native-ios/Solvio/
  Core/Theme/Theme.swift       # Design system "Notes Classic"
  Core/UI/Components.swift     # SectionLabel, PaperCard, StatTile, BudgetBar…
  Core/AppDataStore.swift      # Cache SWR — jeden slajs (panel)
  Core/Network/Repositories.swift
  Features/{Dashboard,Expenses,Auth,Root,Settings}/
docs/
  API.md                       # Publiczne API v1 + most do CRM-a
  plans/                       # Plany wielopikowych zadań
```

## Database Schema (Drizzle)

> **Nie usuwaj definicji tabel z `schema.ts`.** `docker-entrypoint.sh` odpala
> `drizzle-kit push` przy starcie kontenera, więc tabela wycięta ze schematu
> znika z produkcji razem z danymi. Po redesignie 2026-08-22 wiele tabel
> (grupy, bank, subskrypcje, cele, wyzwania…) nie jest już czytanych przez
> żaden kod, ale ich definicje zostają celowo. Faktyczne skasowanie danych
> to osobna decyzja Wojtka, nie efekt uboczny sprzątania kodu.

### Szczegóły (Drizzle + Neon)

All tables defined in `lib/db/schema.ts`. UUIDs for primary keys, `user_id` (text) for row-level isolation.

| Table | Purpose | Key columns |
|---|---|---|
| `user_settings` | Per-user preferences | userId (unique), currency, language |
| `categories` | Expense categories | userId, name, icon, color, isDefault |
| `receipts` | Scanned receipts | userId, vendor, date, total, imageUrl, items (jsonb), rawOcr (jsonb), hash |
| `receipt_items` | Individual receipt line items | receiptId, name, quantity, unitPrice, totalPrice, categoryId |
| `expenses` | Manual + receipt-linked expenses | userId, title, amount, date, categoryId, receiptId, vendor, notes, tags[], isRecurring |
| `category_budgets` | Monthly/periodic budgets per category | userId, categoryId, amount, period; unique(userId, categoryId, period) |
| `reports` | Generated report files | userId, type, periodStart/End, format, fileUrl, metadata (jsonb) |
| `audits` | Shopping audit results | userId, periodStart/End, totalSpent, potentialSaving, bestStore, data (jsonb) |
| `groups` | Expense-splitting groups | id, name, description, createdBy, currency, emoji |
| `group_members` | Group membership | groupId (FK), userId (nullable for external), displayName, email, color |
| `expense_splits` | Split expenses within groups | groupId (FK), expenseId (FK), paidByMemberId (FK), totalAmount, splits (jsonb[]) |
| `payment_requests` | Settlement requests | splitId (FK), fromMemberId, toMemberId, amount, status (pending/settled/declined) |
| `price_comparisons` | Price comparison results | userId, productName, currentStore/Price, bestStore/Price, savingsAmount/Percent, allPrices (jsonb[]) |

DB singleton pattern (avoids build-time initialization):
```typescript
// lib/db/index.ts — lazy Proxy, instantiates on first property access
export const db = new Proxy({} as ReturnType<typeof getDb>, {
  get(_target, prop) {
    if (!_db) _db = getDb()
    return (_db as any)[prop]
  },
})
```

Schema changes: edit `lib/db/schema.ts`, then run `npm run db:push`.

## API Routes

All routes use `auth()` from `lib/auth-compat.ts` for authentication. Returns 401 if no session.

### Data CRUD
| Route | Methods | Purpose |
|---|---|---|
| `/api/data/dashboard` | GET | Dashboard stats (aggregated) |
| `/api/data/expenses` | GET, POST, PUT, DELETE | Full expense CRUD; DELETE accepts `{ ids: [] }` |
| `/api/data/categories` | POST, PUT, DELETE | Category management |
| `/api/data/receipts` | GET, PUT | Receipt items retrieval and updates |
| `/api/data/settings` | GET, POST | User settings + categories + budgets |

### Auth
| Route | Methods | Purpose |
|---|---|---|
| `/api/auth/session` | POST, DELETE | Create/destroy session cookie |
| `/api/auth/session/me` | GET | Get current session (used by useSession hook) |
| `/api/auth/magic-login` | POST | Magic link login |
| `/api/auth/demo` | POST | Demo account login |

### AI & Processing
| Route | Methods | Purpose |
|---|---|---|
| `/api/analysis/ai` | POST | OpenAI spending analysis |
| `/api/audit/generate` | POST | Shopping audit (web search + AI) |
| `/api/v1/ocr-receipt` | POST | Azure OCR receipt scanning |
| `/api/v1/convert-heic` | POST | HEIC to JPEG conversion |
| `/api/v1/seed-categories` | POST | Seed default categories |

### Reports
| Route | Methods | Purpose |
|---|---|---|
| `/api/reports/generate` | POST | Generate report (yearly/monthly) -> Vercel Blob |
| `/api/reports/custom` | POST | Custom date range report |

### Groups & Splitting
| Route | Methods | Purpose |
|---|---|---|
| `/api/groups` | GET, POST | List/create groups |
| `/api/groups/[id]` | GET, PUT, DELETE | Single group CRUD |
| `/api/groups/splits` | GET, POST | List/create expense splits |
| `/api/groups/splits/[splitId]/settle` | POST | Settle a split payment |

### Price Comparison
| Route | Methods | Purpose |
|---|---|---|
| `/api/prices/compare` | POST | AI price comparison |

### API v1 i most do CRM-a

- `/api/v1/{expenses,categories,summary,health}` — publiczne API na kluczu
  `slvk_…` (`X-Api-Key` albo `Authorization: Bearer`), scope READ/WRITE.
  Konwencje 1:1 z `crm.programo.pl` (`since`, `limit`, `cursor`, `{error}`).
- `/api/crm/*` — most w drugą stronę, na sesji użytkownika. Klucz CRM-a leży
  zaszyfrowany po stronie serwera i **nigdy nie trafia na telefon**.
- Powiązanie wydatku z CRM-em trzyma `expenses.crm_entry_id`. Bez niego
  edycja robiłaby duplikat zamiast aktualizacji.
- Pełny kontrakt: `docs/API.md`.

**Wydatek powstaje, zmienia się i znika WYŁĄCZNIE przez `lib/expense-core.ts`.**
Trasy `/api/data/expenses` (sesja) i `/api/v1/expenses` (klucz) mają wspólną
implementację mostu — dwie kopie prędzej czy później przestałyby wypychać do
CRM-a po cichu.

## Auth System

The app uses a **custom cookie-based session**:

1. Login: `POST /api/auth/session` ustawia cookie `solvio_session` podpisane HMAC-em (`SESSION_SECRET`).
   Pierwsze logowanie danym mailem przejmuje konto i zapisuje hash hasła w `user_credentials`
   (`lib/password.ts`); kolejne wymagają hasła. Konto demo zostaje otwarte.
2. `userId` is derived deterministically: `sha256(email)` truncated to 32 chars, prefixed with `u_`
3. Server-side: `getSession()` from `lib/session.ts` reads the cookie
4. API routes: `auth()` from `lib/auth-compat.ts` wraps `getSession()`
5. Client-side: `useSession()` hook fetches `/api/auth/session/me`
6. Middleware (`middleware.ts`): checks cookie presence for protected routes, redirects to `/login`
7. Protected layout: server-side `getSession()` check + redirect, then auto-seeds default categories

## Key Conventions

### Internationalization
- All user-facing text must use the `useTranslation()` hook from `lib/i18n.ts`
- Never use inline `lang === 'pl'` conditionals in JSX for translatable strings
- Translations file has ~400+ keys covering PL and EN
- Add new keys to both `pl` and `en` objects in `lib/i18n.ts`

### Styling
- Tailwind CSS v4 with CSS-variable-based theming in `globals.css`
- shadcn/ui components in `components/ui/` — use `cn()` from `lib/utils.ts` for class merging
- Dark mode via `next-themes` (class strategy)
- Mobile-first responsive design; bottom nav on mobile, sidebar on desktop
- framer-motion for page transitions and micro-animations

### Database
- **NIGDY `db.batch([...])` ani `db.transaction(...)` wprost.** Żaden driver nie ma obu:
  `batch` istnieje tylko w Neon HTTP, `transaction` tylko w node-postgres. `lib/db/index.ts`
  rzutuje instancję pg na typ Neona, więc TypeScript tego NIE złapie — wywali się dopiero
  w runtime. Wsad zawsze przez `dbBatch()` z `lib/db/batch.ts`; przy czystych odczytach
  dodaj `{ atomic: false }`.
- All field names use camelCase in Drizzle schema (maps to snake_case in PostgreSQL)
- Row-level isolation by `userId` text column (not FK to any users table)
- Amounts stored as `decimal(12,2)` text — parse with `parseFloat()` when needed
- `receipts.items` is jsonb (array), not JSON string
- DB lazy-initialized via Proxy to avoid build-time connection errors

### Performance
- Recharts lazy-loaded via `next/dynamic` in analysis + dashboard
- `optimizePackageImports` in next.config.ts for: lucide-react, framer-motion, recharts, date-fns
- Dashboard uses COUNT(*) for receipts, column-selective queries for expenses

### Error Handling
- Error boundaries at root (`app/error.tsx`) and protected layout (`app/(protected)/error.tsx`)
- Branded 404 page at `app/not-found.tsx`
- All error pages are bilingual (PL/EN)

## Deployment

- **Self-host (docelowo)**: Docker + Coolify — `Dockerfile` w rootcie (multi-stage, Next
  standalone, port 3000), schemat dociągany przy starcie kontenera przez `drizzle-kit push`
  w `docker-entrypoint.sh` (wyłącznik `SKIP_DB_PUSH=1`). Pełna instrukcja: `docs/DEPLOY-COOLIFY.md`.
- **Vercel (wariant zastany)**: project `solvio`, team plonkawojciechs-projects
- **Database**: zwykły Postgres na VM (self-host) albo Neon "solvio" (still-surf-97743103), aws-eu-central-1
- **Blob Store**: `solvio-reports` (store_AvSDzhNckgVnFOs2) for generated reports
- **Build**: `next build` (TS and ESLint errors ignored in config for CI)
- **Webpack externals**: canvas, pdf-parse, sharp (server-side only)
- **Function timeout**: 60s (Vercel Hobby) or 300s (Pro)

## Design Principles

- **Zero emotek w UI.** Kolumny `emoji` w bazie trzymają NAZWY IKON lucide
  (`briefcase`, `target`, `globe`), nie znaki emoji — renderuje je `<AppIcon>` z `lib/app-icons.tsx`.
- Professional SaaS aesthetic with generous framer-motion animations
- Full PL/EN bilingual everywhere — use `t()` hook
- Dark + Light mode with toggle in sidebar (desktop) and mobile header
- Mobile-first responsive with bottom tab navigation on small screens
- Feature additions welcome without explicit permission
