# Solvio — Expense Tracking App

AI-powered expense tracking SaaS with receipt scanning, group splitting, price comparison, and financial reporting. Full PL/EN bilingual support.

Production URL: `https://solvio-lac.vercel.app`

## Tech Stack

- **Framework**: Next.js 15.5.8, React 19, TypeScript (strict)
- **Styling**: Tailwind CSS v4, tailwindcss-animate, framer-motion v12
- **UI**: shadcn/ui (Radix primitives), Lucide icons, Sonner toasts, Recharts
- **Database**: Neon (serverless PostgreSQL, eu-central-1)
- **ORM**: Drizzle ORM + drizzle-kit
- **Auth**: Custom cookie-based session (`solvio_session` — base64-encoded email, 30-day expiry). Uses `lib/session.ts` + `lib/auth-compat.ts`
- **File Storage**: Vercel Blob (`@vercel/blob`) for reports/receipts
- **AI**: OpenAI API (categorization, analysis, audit)
- **OCR**: Azure Document Intelligence (receipt scanning)
- **Reports**: pdf-lib, pdfkit, docx (CSV/PDF/DOCX generation)
- **Theme**: next-themes (light/dark), Geist font

## Quick Start

```bash
npm install
npm run dev          # http://localhost:3000
npm run build        # production build
npm run db:push      # push Drizzle schema to Neon
npm run db:studio    # open Drizzle Studio
```

## Environment Variables

Required in `.env.local`:

```
DATABASE_URL=           # Neon PostgreSQL connection string
OPENAI_API_KEY=         # OpenAI API key (analysis, categorization, audit)
AZURE_OCR_ENDPOINT=     # Azure Document Intelligence endpoint
AZURE_OCR_KEY=          # Azure Document Intelligence key
BLOB_READ_WRITE_TOKEN=  # Vercel Blob token (reports storage)
```

Optional:
```
NEXT_PUBLIC_APP_URL=    # App base URL (falls back to VERCEL_URL)
```

## Directory Structure

```
app/
  layout.tsx                   # Root layout (ThemeProvider, Geist font)
  globals.css                  # Tailwind v4 theme tokens (light/dark)
  error.tsx                    # Root error boundary
  not-found.tsx                # Branded 404 page
  (auth)/
    login/                     # Login page
    error/                     # Auth error page
  (marketing)/                 # Landing page route group
  (protected)/                 # Authenticated app — server-side session check + redirect
    layout.tsx                 # Sidebar + mobile nav + keyboard shortcuts + auto-seed
    dashboard/                 # Financial dashboard
    expenses/                  # Expense list + CRUD
    analysis/                  # AI spending analysis (Recharts)
    audit/                     # Shopping audit (web search + AI)
    reports/                   # Report generation (CSV/PDF/DOCX)
    settings/                  # User settings, categories, budgets
    groups/                    # Group expense splitting
      [id]/                    # Individual group detail
    prices/                    # Price comparison tool
  (standalone)/
    welcome/                   # Onboarding welcome page
  receipt/
    [id]/                      # Public receipt view
  api/                         # API routes (see below)
components/
  ui/                          # shadcn/ui primitives (29 components)
  protected/
    main/
      sidebar.tsx              # App sidebar navigation
      app-mobile-header.tsx    # Sticky mobile header (md:hidden)
      mobile-bottom-nav.tsx    # Bottom tab bar (mobile)
      keyboard-shortcuts.tsx   # Global hotkeys + help modal
    dashboard/                 # Dashboard widgets (9 components)
    analysis/                  # Analysis charts (Recharts, lazy-loaded)
    groups/                    # Group splitting components
    reports/                   # Report UI components
    settings/                  # Settings forms
  landing_page/
    landing-page.tsx           # Full marketing landing page
    join_access_list.tsx       # Waitlist form
  auth-layout.tsx              # Auth page layout wrapper
  login-form.tsx               # Login form component
  header.tsx / footer.tsx      # Marketing header/footer
  language-switcher.tsx        # PL/EN language toggle
  dark-mode-toggle.tsx         # Theme toggle
  theme-switcher.tsx           # Mobile theme switcher
lib/
  db/
    index.ts                   # Lazy Neon DB singleton (Proxy pattern)
    schema.ts                  # Drizzle schema (11 tables)
    seed-user.ts               # Auto-seed default categories on first login
  i18n.ts                      # PL/EN translations (~1050 lines, ~400+ keys)
  session.ts                   # Session cookie helpers (getSession, emailToUserId)
  auth-compat.ts               # auth() wrapper returning { userId }
  use-session.ts               # Client-side useSession() hook
  category-colors.ts           # Hash-based category color palette (10 colors)
  reports/builders.ts          # CSV/PDF/DOCX report builders
  utils.ts                     # cn() helper (clsx + tailwind-merge)
hooks/
  use-mobile.ts                # Mobile breakpoint detection hook
scripts/
  seed-demo.mjs                # Demo data seeder
```

## Database Schema (Drizzle + Neon)

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

## Auth System

The app uses a **custom cookie-based session**:

1. Login: user submits email -> `POST /api/auth/session` sets `solvio_session` cookie (base64 JSON with email)
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

- **Platform**: Vercel (project: `solvio`, team: plonkawojciechs-projects)
- **Database**: Neon project "solvio" (still-surf-97743103), aws-eu-central-1
- **Blob Store**: `solvio-reports` (store_AvSDzhNckgVnFOs2) for generated reports
- **Build**: `next build` (TS and ESLint errors ignored in config for CI)
- **Webpack externals**: canvas, pdf-parse, sharp (server-side only)
- **Function timeout**: 60s (Vercel Hobby) or 300s (Pro)

## Design Principles

- Professional SaaS aesthetic with generous framer-motion animations
- Full PL/EN bilingual everywhere — use `t()` hook
- Dark + Light mode with toggle in sidebar (desktop) and mobile header
- Mobile-first responsive with bottom tab navigation on small screens
- Feature additions welcome without explicit permission
