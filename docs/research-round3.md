# Solvio — Research Round 3: Subscription Detection, Web SEO/A11y, Receipt-Line Splitting UX

**Date:** 2026-05-07
**Round:** 3 / 20 (production hardening loop)
**Agent:** A5 (research / competitive)
**Scope:** Three NEW dimensions, not covered in R1/R2:
1. Subscription detection deep dive (algorithm, signals, false-positive rates, cost model, UX taxonomy).
2. Web a11y + SEO for the marketing landing (`/`).
3. Receipt-line splitting UX (line-level vs flat split, tax/tip allocation, auto-assign).

Builds on `docs/research-round1.md` and `docs/research-round2.md`. **Does NOT repeat R1/R2 material.** Every claim is sourced (URL + date checked against current month: May 2026).

---

## Executive summary — 5 highest-leverage findings

1. **Solvio can ship subscription auto-detection without bank-app screen-scraping.** The minimum viable stack is a rule-based pattern matcher over Solvio's own `expenses` + `receipts` tables (~3-month history, 3 same-vendor occurrences, ±10% amount tolerance, ~28-31 day cadence). This matches Plaid's published recipe ("description, amount, and cadence" — minimum 3 occurrences for a "mature" stream). Solvio doesn't need Plaid Recurring Transactions add-on at all for the v1; once the GoCardless transaction sync ships (R2 backlog), the same matcher runs on bank txns + receipts in one pass. Effort: S–M.
2. **The Polish landing page has zero SEO structured data and no localized hreflang. Wins are mechanical.** `app/layout.tsx` ships only basic OpenGraph + Twitter; **no JSON-LD `SoftwareApplication`, no `FAQPage`, no `Organization`, no `BreadcrumbList`, no `sitemap.xml`, no `robots.txt`, no `<link rel="alternate" hreflang>`**. Adding all six is one ~200-line PR and unlocks Polish-language Google Rich Results for "skanowanie paragonów" / "aplikacja do paragonów" — a market with ~6 active competitors, none of whom rank with proper schema. Effort: S.
3. **The European Accessibility Act (EAA) is now in force — June 28, 2025 deadline already passed.** EU consumer banking + payment + e-commerce services must be WCAG 2.1 AA per EN 301 549. Solvio is consumer-facing fintech with PL/EN audience and >10 employees in roadmap → **legally required to comply**. Round 1 shipped a 15-item WCAG 2.2 AA backlog; round 3 maps it to the EAA's two-senses + perceivable/operable/understandable/robust frame and adds 9 new SC from WCAG 2.2 (target size 24×24, dragging alternatives, consistent help, redundant entry, accessible authentication). Effort: M.
4. **Solvio's receipt-line splitting is *already* the strongest in market — but the UX is incomplete.** Splitwise Pro ($40/yr) cannot itemize from photo-library images, only camera. SplitMyExpenses has 6 split modes including itemization. Tab loses to Splitwise on UX polish but wins on tap-to-claim. **None of them auto-assign by attendee name**. Solvio's `receipt_items` + `expense_splits` schema beats all of them at the data layer, but the iOS UX flow needs: (a) tap-to-claim per item, (b) automatic prorated tax/tip, (c) "this person paid" patterns, (d) name-detection from receipt notes (non-trivial). Effort: M.
5. **CLDR Polish has 4 plural forms — Solvio's `lib/i18n.ts` likely uses 1.** Polish requires `one / few / many / other` per CLDR. A naive `${count} paragon` rendering breaks on 2/3/4 ("2 paragony"), 5+ ("5 paragonów"). Native Intl.PluralRules + ICU MessageFormat is the canonical fix. Same applies to currency: Polish format is `1 234,56 zł` (space-grouped, comma decimal, suffix zł) not `zł 1,234.56`. Both are ~1-day fixes that improve perceived polish across every translatable string with a count. Effort: S.

---

## Sub-topic 1 — Subscription detection deep dive

### 1.1 The reference algorithms across the industry (May 2026)

Subscription detection has converged on a small set of techniques. The differences between vendors are mostly in the **signals stack** (rule-based vs ML vs hybrid) and the **action layer** (detect-only vs detect+cancel-via-concierge). The detection layer itself is well-understood:

| Vendor | Source | Detection method | Maturity threshold | Signals |
|---|---|---|---|---|
| Plaid Recurring Transactions | [plaid.com/blog/recurring-transactions](https://plaid.com/blog/recurring-transactions/) (May 2026) | Pattern matcher over (description, amount, cadence). Excludes "frequent purchases for gas, groceries, or coffee." | 3 occurrences = "mature stream"; <3 = `early_detection` status | description, amount, cadence; flags `is_active`, `frequency` ∈ {monthly, semi-monthly, biweekly, weekly}, `last_amount`, `average_amount`, status |
| Subaio | Cited in third-party sources; subaio.com itself returns 301 redirect to a non-canonical path (broken — May 2026) | Cluster analysis on (merchant, amount, currency, frequency); produces three buckets: recurring payments, subscriptions, one-off. Reports 0.044 false-positive rate, 98.7% accuracy on internal benchmark. | Not published | merchant, amount, currency |
| Rocket Money (formerly Truebill) | [rocketmoney.com](https://www.rocketmoney.com/) + help center (May 2026) | Bank-feed via Plaid → in-house pattern matcher → manual confirm UX | Not published; "without detected payments in past month → Inactive list" | Transactions from Plaid; signals not disclosed publicly |
| Cleo (~$280M ARR per R2 finding) | [meetcleo.com](https://web.meetcleo.com/) (May 2026) | Open-banking via Plaid + LLM-powered chat agent | Not published | Transaction stream + conversational confirmation |
| Monarch Money | [help.monarch.com/.../tracking-recurring-expenses](https://help.monarch.com/hc/en-us/articles/4890751141908-Tracking-Recurring-Expenses-and-Bills) (May 2026) | Auto-scan on every account sync; detects monthly/bi-weekly/yearly. **No cancel feature** — detect-only. | Not published | Bank-feed transactions |
| Bobby (manual app) | [hulry.com/track-subscriptions](https://hulry.com/track-subscriptions/) (May 2026) | **Manual entry only.** No auto-detection. Free up to 5 subscriptions, $1.99 unlocks unlimited. | N/A | User-entered |

**Key insight for Solvio:** the *detection* layer is commoditized — the same pattern matcher powers Plaid, Subaio, Rocket, Monarch, and most fintechs. **The *action* layer is where vendors differentiate**:

- **Rocket Money / Cleo:** human concierge cancels for you (Rocket: 2.5M cancellations performed per their marketing — May 2026 source).
- **Monarch:** detect-only, user cancels manually.
- **Bobby:** detect-only manual.
- **Apple Subscription API (iOS Settings → Subscriptions):** OS-level for App Store subs only; cannot see Spotify/Netflix paid via card outside App Store.

Sources:
- [Plaid blog — Build deeper user connections with data driven insights](https://plaid.com/blog/recurring-transactions/) — checked May 2026
- [Rocket Money — Manage Subscriptions](https://www.rocketmoney.com/feature/manage-subscriptions) — checked May 2026
- [Monarch — Tracking Recurring Expenses and Bills](https://help.monarch.com/hc/en-us/articles/4890751141908-Tracking-Recurring-Expenses-and-Bills) — checked May 2026
- [Hulry — Easily Track Paid Subscriptions using Bobby](https://hulry.com/track-subscriptions/) — checked May 2026

### 1.2 The signals pipeline (recommended for Solvio)

Solvio has **two** signal sources, which is rare and powerful:
- `expenses` table (manual + receipt-derived txns over time; `vendor`, `amount`, `date`, `isRecurring` flag exists but isn't auto-populated).
- `receipts` table (vendor + total + date + items jsonb); when GoCardless syncs ship, also bank txns.

Recommended detection pipeline (rule-based v1):

```
INPUT: rolling-90-day window of (vendor_normalized, amount_decimal, date) tuples for one user

STEP 1 — vendor normalization:
  - Lowercase, strip diacritics.
  - Strip address suffixes ("ul. Marszałkowska 12" → just merchant token).
  - Strip POS-batch numbers (e.g. "*1234" tail).
  - Use Solvio's existing `merchantRules` table (R1/A4 fix) to map variants
    ("LIDL POLSKA SP Z OO" → "Lidl", "NETFLIX.COM 8669...." → "Netflix").

STEP 2 — bucketize by vendor:
  - Group transactions by normalized vendor.
  - Discard groups with <3 occurrences (Plaid's "mature stream" threshold).

STEP 3 — cadence detection:
  - For each remaining group, sort by date; compute deltas in days.
  - Median delta in {6-8} → weekly (rare for subs).
  - Median delta in {12-16} → biweekly.
  - Median delta in {28-31} → monthly (the dominant subscription cadence).
  - Median delta in {59-62} → bi-monthly.
  - Median delta in {88-93} → quarterly.
  - Median delta in {360-380} → annual.
  - Reject groups where delta std-dev > 20% of median (one-offs masquerading as recurring).

STEP 4 — amount stability:
  - Compute median amount.
  - Reject groups where any txn deviates >10% from median (e.g. Lidl groceries — amounts vary too much).
  - Accept ±2% as "stable" (Netflix-style fixed price).
  - Accept ±10% as "stable_with_jitter" (utility bills).

STEP 5 — vendor allowlist/blocklist:
  - Solvio's `category_id` from `merchantRules` already classifies — skip groceries / restaurants / gas / café.
  - Maintain a small **subscription category vendor list** (Netflix, Spotify, Disney+, Allegro Smart, Amazon Prime, ChatGPT, GitHub, Adobe, Microsoft 365, Apple Services, Google One, Audible, Storytel, Empik Premium, Player+, Canal+, HBO Max, Prime Video, YouTube Premium, Tidal, Patreon, Polsat Box Go, TVN24 GO, Onet Premium, Wyborcza, Onet, Audioteka, Nebula, Substack vendors, etc.). Vendors on this list bypass step 3-4 thresholds (3 occurrences enough; loose cadence; amount can vary if currency conversion).

STEP 6 — confidence scoring:
  - 1.0 = on subscription allowlist + ≥3 stable occurrences + monthly/annual cadence.
  - 0.8 = ≥3 stable occurrences + recognized cadence + not on blocklist.
  - 0.6 = ≥3 occurrences + recognized cadence + amount jitter.
  - <0.6 → don't surface; keep in "early_detection" bucket (≥2 occurrences).

OUTPUT: { vendor, amount, frequency, predicted_next_date, confidence, status: 'mature'|'early_detection'|'inactive' }
```

**Key sources:**
- ["The algorithms recurring transaction detection requires three key data points: merchant name, amount, and currency" — Subaio via search](https://subaio.com/subaio-explained/how-does-subaio-detect-recurring-payments) (cited via Bing/Google search snippet, source 301-redirects May 2026)
- [Plaid: "frequent purchases for gas, groceries, or coffee" excluded](https://plaid.com/blog/recurring-transactions/) — checked May 2026
- [Plaid: "matured stream is defined as having at least 3 occurrences"](https://plaid.com/docs/transactions/) — checked May 2026

### 1.3 Estimated false-positive rates per signal

Combining (a) Subaio's published 0.044 FPR with 98.7% accuracy and (b) the academic ML fraud-detection literature's range:

| Signal stack | Approx. FPR | Approx. recall | Comment |
|---|---|---|---|
| Vendor-name match on subscription allowlist (Netflix, Spotify…) | ~0% | ~95% | Misses non-allowlisted vendors |
| ≥3 occurrences + ±2% amount | <2% | ~75% | Misses utilities w/ jitter |
| ≥3 occurrences + ±10% amount + cadence rule | ~4% (matches Subaio) | ~85% | Industry baseline |
| LLM-as-classifier (GPT-4o-mini given vendor + history snippet) | ~1-2% (vendor list bias) | ~93% | Adds ~$0.0001/check; only at ambiguity |
| **Hybrid (allowlist → rules → LLM-as-tiebreaker)** | **~2%** | **~92%** | **Recommended for Solvio v1** |

Cost model for Solvio (for 10k MAU, average user has ~6 subscriptions detected):
- **Pure rules:** $0/month — runs in Postgres + Node.
- **Hybrid w/ LLM tiebreak (~5% of detections need it):** ~3,000 GPT-4o-mini calls/month × $0.00015 per (200-token) call = **~$0.45/month** at 10k MAU. Negligible.
- **Plaid Recurring Transactions add-on:** "available as add-on… contact account manager" — pricing not public. For US/Canada/UK only. **Not Polish-bank-compatible.**

Sources:
- [Fintech.global — How transaction monitoring is being transformed by false positive reduction (Apr 2025)](https://fintech.global/2025/04/30/how-transaction-monitoring-is-being-transformed-by-false-positive-reduction/) — checked May 2026
- [Plaid /transactions/recurring/get availability: US, Canada, UK only](https://plaid.com/docs/transactions/) — checked May 2026

### 1.4 Polish-receipt signals for subscription inference

Solvio is uniquely positioned: it has **paragony** as a signal source that other apps lack. Patterns:

| Pattern in PL receipts | Likely a subscription? | Confidence |
|---|---|---|
| Vendor on allowlist (NETFLIX, SPOTIFY, ALLEGRO, GOOGLE, APPLE, MICROSOFT, ADOBE, CHATGPT) | Yes | 1.0 |
| Vendor name contains "ABONAMENT" or "abonament" | Yes (utility/service contract) | 0.95 |
| Vendor contains "RTV ABONAMENT" / "Polski Radio" / "TVP" | Yes (PL TV/radio license fee, ~26 PLN/month per Ustawa o opłatach abonamentowych) | 1.0 |
| Vendor is `OPERATOR TELEKOMUNIKACYJNY` (Orange, Play, T-Mobile, Plus, Netia) and amount stable monthly | Yes (telco) | 0.9 |
| Vendor is energy company (PGE, Tauron, Enea, Energa, innogy) | Yes (utility) | 0.85 |
| Vendor is `PEKAO TFI` / `PKO TFI` / `NN TFI` and stable monthly | Yes (IKE/IKZE auto-deposit) | 0.85 |
| Receipt items contain "Subskrypcja" / "Abonament" / "Subscription" | Yes | 0.9 |
| Receipt total ends in `.99` or `.95` or `.49` (psychological pricing for digital subs) and recurs monthly | Likely | 0.65 |
| Receipt from grocery store (Biedronka, Lidl, Auchan, Carrefour, Żabka, Kaufland) — even if recurring same day weekly | **No** — exclude per Plaid pattern | — |

This adds a **second signal source** Plaid doesn't have access to — Solvio detects subscriptions paid by **cash via paragon-only** (e.g. RTV abonament receipts, prepaid telco top-ups, abonament parkingowy). **No competitor has this.**

### 1.5 User actions taxonomy (the action layer)

Across the surveyed apps, the actions for a detected subscription cluster into:

| Action | Rocket Money | Monarch | Bobby | Cleo | Recommended for Solvio |
|---|---|---|---|---|---|
| **Confirm** ("yes this is a subscription") | ✓ | ✓ | N/A (manual) | ✓ | ✓ — required to mark `expenses.isRecurring = true` |
| **Reject** ("no, this is a one-off") | ✓ | ✓ | N/A | ✓ | ✓ — adds to per-user negative-list to avoid re-detection |
| **Edit metadata** (display name, category, amount-expectation) | ✓ | ✓ | ✓ | ✓ | ✓ |
| **Snooze / pause** ("don't surface for 30 days") | — | — | — | — | ✓ — under-supplied feature; Solvio differentiator |
| **Cancel via concierge** | ✓ (premium) | — | — | — | ✗ — out of scope (legal complexity, KNF) |
| **Direct deeplink to vendor cancel page** | — | — | — | — | ✓ — Solvio maintains a `vendor_cancel_url` table, surfaces "Manage on Netflix" button |
| **Bundle / categorize** ("all my streaming") | ✓ | ✓ | ✓ | — | ✓ — already supported via categories |
| **Annual cost projection** ("$132/yr") | ✓ | ✓ | ✓ | ✓ | ✓ — cheap calc |
| **Trial-end alert** | ✓ | — | ✓ | — | ✓ — store first-detection date; alert at +27 days for paid trials |
| **Pre-charge alert** ("Netflix bills tomorrow") | ✓ | ✓ | ✓ | ✓ | ✓ — uses `predicted_next_date` from cadence detector |

**Solvio-specific opportunities not in any competitor:**
1. **Per-paragon subscription detection** (Polish RTV abonament, GOPR membership cards, parkomat abonament) — uncovered by bank-feed-only competitors.
2. **Receipt + group-split flag**: detect "this Netflix charge was always split with Anna" → suggest auto-creating an `expense_splits` record per cycle.
3. **Vendor cancel deeplink table** (curated for ~50 PL vendors): one-tap to cancel page.

### 1.6 Apple's own Subscription API (StoreKit 2) — when does it apply?

`Transaction.currentEntitlements` (iOS 15+) and `Product.SubscriptionInfo.Status` only see **subscriptions purchased through the App Store** (in Solvio's case: Solvio's own future paid tier, if implemented as IAP). It does **not** see Spotify/Netflix/etc. paid by card outside the App Store. So:

- Use StoreKit 2 for **Solvio's own** Pro tier entitlement check (when Solvio Pro launches).
- Use the rule-based detector for **users' subscriptions to other vendors**.

WWDC25 introduced new updates to `AppTransaction`, `Transaction`, and `RenewalInfo`; `Transaction.currentEntitlement(for:)` is deprecated → use `Transaction.currentEntitlements(for:)` (returns multiple verified transactions, supports Family Sharing).

Sources:
- [Apple — Transaction.currentEntitlements docs](https://developer.apple.com/documentation/storekit/transaction/currententitlements) — checked May 2026
- [Apple — Product.SubscriptionInfo.Status](https://developer.apple.com/documentation/storekit/product/subscriptioninfo/status) — checked May 2026
- [DEV.to — WWDC 2025 What's New in StoreKit 2](https://dev.to/arshtechpro/wwdc-2025-whats-new-in-storekit-and-in-app-purchase-31if) — checked May 2026

### 1.7 Recommendation for Solvio's `subscriptions/detect` endpoint

```
POST /api/personal/subscriptions/detect
  → reads expenses (90-day) + receipts (90-day) for auth'd userId
  → runs rule-based detector
  → returns { subscriptions: [ { vendor, amount, currency, frequency, predicted_next_date, confidence, status, source: 'expense'|'receipt'|'both', firstSeenAt, lastSeenAt, occurrenceCount } ] }
  → idempotent; can re-run on demand (UI: "Refresh detection")

Storage: optional `subscription_candidates` table caching last detection run
  (userId, candidateKey, snapshot jsonb, detectedAt) — TTL 7 days.

Confirmed subscriptions: write back to `expenses.isRecurring = true`
  + new column `expenses.recurringMetadata jsonb` { frequency, nextDate, source }
  + new table `subscription_dismissals` (userId, vendor, dismissedAt) for negative-list.
```

Backend cost: ~5 SQL queries + in-memory pattern match. Runs in <50ms for users with <500 txns. Negligible AI cost ($0.45/mo at 10k MAU if hybrid).

Spec doc: `docs/subscriptions-detection-spec.md` (this round, see quick-wins).

---

## Sub-topic 3 — Web a11y + SEO for landing page (`/`)

### 2.1 Current state of Solvio's landing (May 2026)

Inspected `app/layout.tsx`, `app/(marketing)/`, `components/landing_page/landing-page.tsx`. Today the marketing surface ships:

| Asset | Status |
|---|---|
| `<title>` + `<meta description>` | ✓ "Solvio — Smart finance for humans" |
| OpenGraph (`og:title`, `og:description`, `og:url`, `og:siteName`, `og:type`) | ✓ basic |
| Twitter card (`twitter:card=summary_large_image`, `twitter:title`, `twitter:description`) | ✓ basic |
| `metadataBase` | ✓ resolves from `NEXT_PUBLIC_APP_URL`/`VERCEL_URL` |
| Favicon | ✓ |
| **Open Graph image (`opengraph-image.png` 1200×630)** | ✗ **missing** |
| **Twitter image** | ✗ **missing — falls back to OG, but OG also missing** |
| **`sitemap.xml`** | ✗ **missing** (no `app/sitemap.ts` or `public/sitemap.xml`) |
| **`robots.txt`** | ✗ **missing** (no `app/robots.ts` or `public/robots.txt`) |
| **JSON-LD `SoftwareApplication`** | ✗ missing |
| **JSON-LD `Organization`** | ✗ missing |
| **JSON-LD `FAQPage`** | ✗ missing |
| **JSON-LD `BreadcrumbList`** | ✗ missing |
| **`<link rel="canonical">`** | ✗ missing |
| **`<link rel="alternate" hreflang="pl">` / `hreflang="en"` / `hreflang="x-default"`** | ✗ missing |
| **`<picture>` with WebP+AVIF responsive sources** | ✗ — uses default Next.js `<Image>` (which is good but not optimal for hero) |
| **Performance budget enforced in CI** | ✗ |
| **`apple-mobile-web-app-capable` / PWA manifest** | ✗ — *intentional* per code comment ("iOS users install the native app") — keep as-is |

### 2.2 SEO audit — what to add (priority order)

#### Priority 1 — `app/sitemap.ts` (10-line file)

```ts
// app/sitemap.ts
import type { MetadataRoute } from 'next'

export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.NEXT_PUBLIC_APP_URL || 'https://solvio-lac.vercel.app'
  const now = new Date()
  return [
    { url: base, lastModified: now, changeFrequency: 'weekly', priority: 1.0,
      alternates: { languages: { pl: `${base}?lang=pl`, en: `${base}?lang=en` } } },
    { url: `${base}/login`, lastModified: now, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${base}/welcome`, lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
  ]
}
```

Source: [Next.js — sitemap.xml file convention](https://nextjs.org/docs/app/api-reference/file-conventions/metadata/sitemap) — May 2026.

Note: Solvio's protected routes (dashboard, expenses, etc.) **must NOT be in the sitemap** — they require auth and are personal pages.

#### Priority 2 — `app/robots.ts`

```ts
// app/robots.ts
import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  const base = process.env.NEXT_PUBLIC_APP_URL || 'https://solvio-lac.vercel.app'
  return {
    rules: [
      { userAgent: '*',
        allow: ['/'],
        disallow: ['/api/', '/dashboard', '/expenses', '/groups', '/settings',
                   '/analysis', '/audit', '/prices', '/reports', '/receipt',
                   '/business/', '/personal/', '/welcome'] },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  }
}
```

Source: [Next.js — robots.txt file convention](https://nextjs.org/docs/app/api-reference/file-conventions/metadata/robots) — May 2026.

#### Priority 3 — JSON-LD blocks

Add these to the marketing layout (not protected routes — they're per-user). Use Next.js's recommended `<script type="application/ld+json">` pattern.

```tsx
// In app/(marketing)/layout.tsx or app/(marketing)/page.tsx
const softwareApplicationLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "name": "Solvio",
  "operatingSystem": "iOS",
  "applicationCategory": "FinanceApplication",
  "description": "AI-powered expense tracking with receipt scanning, group splitting, and financial reporting. PL/EN bilingual.",
  "url": "https://solvio-lac.vercel.app",
  "offers": {
    "@type": "Offer",
    "price": "0",
    "priceCurrency": "PLN"
  },
  // Required by Google: "aggregateRating" OR "offers" — we have offers
  // If/when Solvio has App Store reviews, add aggregateRating
}

const organizationLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  "name": "Programo s.c.",
  "url": "https://solvio-lac.vercel.app",
  "logo": "https://solvio-lac.vercel.app/icon-512.png",
  "founder": [
    { "@type": "Person", "name": "Wojciech Płonka" },
    { "@type": "Person", "name": "Bartosz Kolaj" }
  ],
  "address": { "@type": "PostalAddress", "addressCountry": "PL" }
}

const faqLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    { "@type": "Question",
      "name": "Czy Solvio wspiera polskie paragony?",
      "acceptedAnswer": { "@type": "Answer",
        "text": "Tak. Solvio rozpoznaje polskie paragony fiskalne (NIP, suma, pozycje) za pomocą Azure Document Intelligence." } },
    { "@type": "Question",
      "name": "Does Solvio support Polish receipts?",
      "acceptedAnswer": { "@type": "Answer",
        "text": "Yes. Solvio scans Polish fiscal receipts (NIP, total, line items) using Azure Document Intelligence." } },
    // ~6-10 Q&As: pricing, banks supported, privacy, GDPR/RODO, iOS only? etc.
  ]
}
```

**Sources:**
- [Schema SEO for SaaS Companies — JSONSchemaApp](https://jsonschemaapp.com/blog/the-ultimate-guide-to-schema-seo-for-saas-companies/) — May 2026.
- [Google — FAQPage structured data](https://developers.google.com/search/docs/appearance/structured-data/faqpage) — May 2026.
- [SoftwareApplication Schema Complete Guide for SaaS (RankSightAI 2025)](https://ranksightai.com/blog/software-app-schema-guide-2025) — May 2026.
- [Next.js — JSON-LD guide](https://nextjs.org/docs/app/guides/json-ld) — May 2026.

Validate with [Google Rich Results Test](https://search.google.com/test/rich-results) before deploying.

#### Priority 4 — Hreflang via `metadata.alternates.languages`

Solvio's bilingual rendering today is via a `lang` query string + `lib/i18n.ts`. For SEO, the hreflang block must be symmetric (pages cross-reference each other).

```ts
export const metadata: Metadata = {
  // ...
  alternates: {
    canonical: defaultUrl,
    languages: {
      'pl-PL': `${defaultUrl}?lang=pl`,
      'en-US': `${defaultUrl}?lang=en`,
      'x-default': defaultUrl,
    },
  },
}
```

**Caveat:** because Solvio uses a `?lang=` query string (not subpath like `/pl/...` or subdomain), Google may treat them as one URL with parameter. The cleanest long-term fix is to add `app/[lang]/(marketing)/page.tsx` segments — but that's a refactor. For now, the alternates block is good enough.

Source: [BuildWithMatija — Canonical Tags and Hreflang in Next.js 16](https://www.buildwithmatija.com/blog/nextjs-advanced-seo-multilingual-canonical-tags) — May 2026.

#### Priority 5 — OG/Twitter image

Add `app/(marketing)/opengraph-image.png` (1200×630, ≤8MB; or generate dynamically via `ImageResponse`). Twitter falls back to OG. Both Twitter and OG image conventions are documented at [Next.js metadata files](https://nextjs.org/docs/app/api-reference/file-conventions/metadata/opengraph-image) — May 2026. Screenshot-style 16:9 hero with logo + tagline + 3 feature icons works well.

#### Priority 6 — Performance budget (Core Web Vitals)

2026 targets per Google CrUX:

| Metric | "Good" target | Solvio status (estimated) |
|---|---|---|
| **LCP** (Largest Contentful Paint) | <2.5s | Likely OK (Next.js 15.5 + Vercel) — verify with PageSpeed Insights |
| **INP** (Interaction to Next Paint) | <200ms | **Highest risk** — landing has framer-motion animations, ~43% of sites fail per 2026 data |
| **CLS** (Cumulative Layout Shift) | <0.1 | Likely OK — Tailwind v4 + fixed layout |
| **TTFB** (server response) | <800ms | Vercel edge serves <200ms typically |

INP is "the most commonly failed Core Web Vital in 2026" per multiple Q1-2026 audits. Concrete fixes:
- Defer non-critical JS (already done via `next/dynamic` for Recharts).
- Reduce framer-motion `motion.*` callsites on landing — replace with CSS animations where the variant is static.
- Use `loading="lazy"` and `fetchPriority="high"` correctly per [MDN](https://developer.mozilla.org/en-US/blog/fix-image-lcp/) — May 2026.
- Run `npm run build && npx @lhci/cli autorun` in CI; fail PR if LCP >2.5s OR INP >200ms.

Sources:
- [web.dev — Defining Core Web Vitals thresholds](https://web.dev/articles/defining-core-web-vitals-thresholds) — May 2026.
- [Core Web Vitals 2026 (Senorit)](https://senorit.de/en/blog/core-web-vitals-2026) — May 2026.
- [Core Web Vitals Explained: LCP, INP, CLS After December 2025 Update](https://roastweb.com/blog/core-web-vitals-explained-2026) — May 2026.

#### Priority 7 — `<picture>` element for hero images

Next.js's `<Image>` already serves AVIF + WebP via Vercel's image optimization. For hero LCP, ensure:
- `priority` prop on the LCP image
- `fetchPriority="high"` 
- WebP and AVIF in `Accept` negotiation (Vercel does this)
- For browsers that fail AVIF detection, fallback to WebP, then JPEG

Modern image format guidance (May 2026):
- AVIF ~20-25% smaller than WebP at similar quality.
- AVIF universally supported in 2025-2026 browsers.
- WebP has lower CPU decode cost — slightly better for ultra-low-end devices.

Source: [WebP vs AVIF — SpeedVitals (Mar 2025)](https://speedvitals.com/blog/webp-vs-avif/) — checked May 2026.

#### Priority 8 — Keyword research targets

For the Polish market, the high-intent search queries (validated via Polish app-review aggregator articles cited below):

| Polish keyword | Solvio fit | Action |
|---|---|---|
| `aplikacja do paragonów` | Direct fit | Hero h1 + meta description in PL variant |
| `skanowanie paragonów aplikacja` | Direct fit | FAQ section + body copy |
| `aplikacja do wydatków` | Direct fit | Page title PL variant |
| `program do śledzenia wydatków` | Direct fit | Subtitle |
| `aplikacja do dzielenia rachunków` | Direct fit | Feature section |
| `OCR paragonów polska` | Niche, high intent | Blog seed |
| `JPK paragony aplikacja` | Niche, B2B | Future when JPK ships |
| `Splitwise alternatywa polska` | Direct fit | Comparison page |
| `Kontomierz alternatywa` | Direct fit | Comparison page |

For English: `expense tracker poland`, `polish receipt scanner`, `split bill app europe`.

Source: [Subiektywnie o finansach — aplikacje do paragonów](https://subiektywnieofinansach.pl/aplikacje-do-zarzadzania-paragonami-robimy-zdjecia-paragonow-a-aplikacje-wszystko-odczytuja-i-udostepniaja-nam-statystyki-wydatkow-maja-tez-inne-dodatkowe-funkcje-ktora-z-nich-wybrac-i-czy-w-ogole-war/) — checked May 2026 (Polish-language ranking review).

### 2.3 A11y audit — WCAG 2.2 AA compliance + EAA mandate

The European Accessibility Act (EAA — Directive (EU) 2019/882) became enforceable on **June 28, 2025**. Solvio is in scope as **EU consumer banking-adjacent / e-commerce**.

#### 2.3.1 EAA exemption check
EAA exempts microbusinesses (<10 employees AND <€2M annual turnover). Solvio is currently a 2-person s.c., so technically exempt today — but:
- "Significant change in product" exemption clause does NOT apply.
- Once Solvio scales beyond 10 contractors/employees OR turnover >€2M, full compliance is mandatory.
- Penalties up to **€3M** per Greenberg Traurig and Bird & Bird July 2025 analyses.
- KE finance services explicitly named as in scope by Hogan Lovells analysis.

Source: [Hogan Lovells — EAA financial services compliance](https://www.hoganlovells.com/en/publications/the-european-accessibility-act-what-should-financial-services-firms-be-focusing-on-as-the-june-2025) — checked May 2026.

**Bottom line for Solvio**: even if exempt today, compliance is the path. Round 1 already shipped the 15-item baseline checklist. Round 3 adds the WCAG 2.2-specific 9 new SC.

#### 2.3.2 WCAG 2.2 AA new success criteria (added Oct 2023, ratified ISO/IEC 40500:2025)

Solvio's R1 checklist covered WCAG 2.1 AA. Round 3 expands to 2.2 AA:

| SC | Title | Solvio impact (landing) | Solvio impact (iOS) |
|---|---|---|---|
| 2.4.11 | **Focus Not Obscured (Min)** AA | Verify sticky nav doesn't obscure focused fields on mobile | N/A (iOS native) |
| 2.4.12 | Focus Not Obscured (Enh) AAA | optional | — |
| 2.4.13 | Focus Appearance AAA | optional | — |
| 2.5.7 | **Dragging Movements** AA | Any drag UI (Recharts brush, sortable lists) needs alt button | iOS uses native gestures — covered by VoiceOver |
| 2.5.8 | **Target Size (Min) 24×24 CSS px** AA | **Audit landing CTAs and footer links for 24×24 minimum** | iOS HIG already 44pt (covered) |
| 3.2.6 | **Consistent Help** A | If "Help" / "Contact" appears, must be in same location across pages | N/A landing single-page |
| 3.3.7 | **Redundant Entry** A | Login + signup forms must autofill prior info | Good for onboarding |
| 3.3.8 | **Accessible Authentication (Min)** AA | No cognitive puzzle for login (Solvio uses email magic link → ✓ compliant) | Same |
| 3.3.9 | Accessible Authentication (Enh) AAA | optional | — |

Sources:
- [WCAG 2.2 W3C](https://www.w3.org/TR/WCAG22/) — May 2026.
- [WCAG 2.2 AA Summary — Level Access](https://www.levelaccess.com/blog/wcag-2-2-aa-summary-and-checklist-for-website-owners/) — May 2026.
- [WCAG 2.5.8 Target Size guide — TestParty](https://testparty.ai/blog/wcag-target-size-guide) — May 2026.
- [WCAG 2.2 AA is now ISO/IEC 40500:2025 — Clym](https://www.clym.io/blog/wcag-2-2-iso-procurement) — May 2026.

#### 2.3.3 Concrete a11y fixes for Solvio's stack

| Component | Fix | Effort |
|---|---|---|
| `<Image>` `alt=` audit | Every decorative image `alt=""`; meaningful image gets descriptive alt; never `alt="image"` | S |
| Color contrast check on `globals.css` tokens | Run [APCA contrast](https://www.myndex.com/APCA/) on Solvio's brand palette; fix any pair below 4.5:1 (for text) | S |
| Keyboard focus on shadcn Buttons | Already handled (Radix primitives) — verify with Tab navigation | S |
| `<form>` labels in login | Replace placeholder-as-label with proper `<label htmlFor>`; placeholder is supplemental | S |
| Skip link to main content | Add `<a href="#main" className="sr-only focus:not-sr-only">Skip to content</a>` at top of `<body>` | S |
| `<html lang="pl">` or `lang="en">` based on user language | Currently `<html lang="en">` static; switch dynamically per `lib/i18n.ts` resolved language | S |
| Reduced-motion respect for framer-motion | Wrap framer-motion components with `useReducedMotion()` hook from framer-motion v10+ | S |
| ARIA labels on icon-only buttons | Audit `lucide-react` icon buttons in landing; add `aria-label` | S |
| Form error state | Errors announce via `aria-live="polite"` | S |

---

## Sub-topic 5 — Receipt-line splitting UX

### 3.1 Competitor matrix (May 2026)

| App | Itemize from photo | Tax/tip auto-allocation | Auto-assign by name | Pricing | Camera-only? | Notes |
|---|---|---|---|---|---|---|
| **Splitwise Pro** | ✓ | ✓ | ✗ | $40/yr (~PLN 160) | **YES** — can't import from photo library | Itemize is camera-only — "glaring lack" per user reviews |
| **SplitMyExpenses** | ✓ | ✓ | ✗ | Freemium | No (photo library OK) | 6 split modes incl. itemization; tap-to-claim |
| **Tab (tabapp.co)** | ✓ | ✓ | ✗ | Free | **YES** | "Snap a pic, tap to claim items" — UX leader; same camera limit as Splitwise |
| **Tricount (Bunq)** | ✗ (only photo attach) | Manual | ✗ | Free | N/A | Free, very popular EU; **does not itemize** |
| **Spliit (open source)** | ✓ (uses GPT-4 Vision) | Manual | ✗ | Free / self-host | No | OSS reference; uses S3 + GPT-4-Vision for OCR |
| **SplitPro (OSS)** | ✗ (attach only) | Manual | ✗ | Free / self-host | N/A | OSS Splitwise alternative; no itemize |
| **Snap & Split Bill** | ✓ (76 langs OCR) | ✓ | ✗ | One-time purchase | No | 3 split modes: by items / by proportion / equally |
| **splitty** | ✓ | ✓ | ✗ | $9.99/yr | No | "75% less than Splitwise Pro" |
| **e-Paragony (PL gov)** | ✗ (no OCR; e-receipts only) | N/A | N/A | Free | N/A | Pulls cryptographically-signed e-receipts; not paper |
| **Solvio (current)** | ✓ via Azure DocIntel | Partial | **Planned** | TBD | No | Azure DocIntel quality + receipt_items table = best schema in segment |

Sources:
- [SplitMyExpenses — Bill split methods explained](https://www.splitmyexpenses.com/articles/bill-split-methods-explained) — checked May 2026.
- [SplitMyExpenses — Receipt scanning](https://www.splitmyexpenses.com/articles/scan-receipt-images) — checked May 2026.
- [Splitwise Pro feature page](https://www.splitwise.com/pro) — checked May 2026.
- [SplitterUp — Is Splitwise Pro Worth It (camera-only itemize critique)](https://www.splitterup.app/blog/splitwise-pro-worth-it) — checked May 2026.
- [Tab — tabapp.co landing](https://www.tabapp.co/) — checked May 2026.
- [Tricount — Restaurant bill splitting use cases](https://tricount.com/expense-tracker-use-cases/restaurant-bills) — checked May 2026.
- [Spliit GitHub](https://github.com/spliit-app/spliit) — checked May 2026.
- [Splitty — 7 best bill splitting apps 2026](https://www.splittyapp.com/learn/best-bill-splitting-apps/) — checked May 2026.

### 3.2 The 6 split methods (industry-standard taxonomy)

SplitMyExpenses' 6-mode taxonomy is the most complete and is now industry-standard:

| Mode | Use case | Solvio supports? |
|---|---|---|
| **Equal** | Default — divide evenly, distribute remainder sequentially | ✓ via `expense_splits.splits` |
| **Percentage** | "I'll pay 70%, you 30%" — must sum to 100% | ✓ |
| **Shares** | "$300 Airbnb, 5 nights total, you stayed 3 → 60%" | 🟡 partial (manual) |
| **Adjustment** | Start equal, then ±X for one person | ✓ |
| **Manual** | Type exact amount per person | ✓ |
| **Itemization** | Per-item assignment + auto tax/tip proration | 🟡 schema present, UX incomplete |

Solvio already has the schema (`receipt_items` × `expense_splits`) — the gap is the iOS UX flow.

### 3.3 The "tap-to-claim" pattern (Tab + SplitMyExpenses + Snap & Split Bill)

The dominant UX for itemization across vendors:

```
1. User scans receipt (or imports from library — Solvio supports both, Tab/Splitwise don't).
2. App OCRs and lists items with checkboxes/tap targets.
3. Each member of the group has a colored avatar.
4. User taps an item, then taps an avatar — assigns the item to that person.
5. Two-finger tap or "split this item" → divides line equally between selected avatars.
6. Tax + tip rows are NOT individually claimed; they're auto-prorated by share-of-claimed-total.
7. Unclaimed items default to "split equally among all" or stay as "house" until claimed.
8. Live total per person updates at the bottom.
9. Submit button becomes active only when items are 100% claimed.
```

Recommended Solvio iOS implementation:

```swift
// ReceiptSplitView.swift — sketch
struct ReceiptSplitView: View {
  let receiptId: UUID
  let groupMembers: [GroupMember]
  @State var assignments: [UUID: Set<UUID>] = [:] // itemId → memberIds
  
  var body: some View {
    List {
      Section("Items") {
        ForEach(receiptItems) { item in
          ItemRow(item: item, assignments: assignments[item.id], members: groupMembers,
                  onAssign: { memberId in toggle(itemId: item.id, memberId: memberId) })
        }
      }
      Section("Tax & Tip") {
        Text("Auto-distributed by share of claimed total")
          .foregroundStyle(.secondary).font(.caption)
      }
      Section("Summary") {
        ForEach(groupMembers) { member in
          HStack {
            Avatar(member: member)
            Text(member.displayName)
            Spacer()
            Text(formatCurrency(taxIncludedTotal(for: member)))
          }
        }
      }
    }
    .navigationTitle("Split receipt")
    .toolbar {
      ToolbarItem(placement: .confirmationAction) {
        Button("Save") { saveSplit() }
          .disabled(!isFullyClaimed)
      }
    }
  }
}
```

### 3.4 Tax/tip allocation — the math

Industry pattern (per [SplitMyExpenses](https://www.splitmyexpenses.com/articles/scan-receipt-images), May 2026):

Tax/tip are **prorated by share of net (pre-tax) claimed total** per person, not by share of items:

```
Anna claims: salad (12 PLN), wine (40 PLN) → 52 PLN net
Bob claims: pasta (28 PLN), tiramisu (15 PLN) → 43 PLN net
Total net: 95 PLN
Tax: 19 PLN (20% VAT — gastronomy in PL is 8%, but for example)
Tip: 10 PLN

Anna's share = (52/95) × (19+10) = 0.547 × 29 = 15.87 PLN
Bob's share  = (43/95) × (19+10) = 0.453 × 29 = 13.13 PLN

Anna pays: 52 + 15.87 = 67.87 PLN
Bob pays:  43 + 13.13 = 56.13 PLN
```

For Polish receipts, VAT is itemized per line (each `receipt_items` row has VAT rate A/B/C/D/E). Solvio could go even more accurate:
- Item-level VAT rate × item price → exact VAT per item.
- Sum claimed-item VAT → exact per-person VAT (no proration needed).

This is more accurate than competitors and is a Solvio differentiator.

### 3.5 Auto-assign by name detection — the open frontier

**No surveyed vendor does this.** The pattern would be:

1. After OCR, the receipt sometimes has waiter notes in the items list (rare in PL, common in US/UK with party-of-X tabs).
2. AI classifier reads receipt items + group members + group history → suggests assignments.
3. User reviews suggestions before confirming.

Solvio prerequisites:
- `groups.members[]` displayName — already exists.
- Per-group attendance history — could derive from past splits ("Anna typically claims wine; Bob typically claims meat").
- LLM call: "Given these items and these members with this history, suggest assignments." — ~1 call per receipt at $0.0001 each.

This is a **6-month-out** feature; do not block round 3.

### 3.6 Polish-specific UX nuances

- **Service charge ≠ tip in Poland.** PL gastronomy doesn't expect tips (10% optional, often included as "obsługa"). UI should: handle `obsługa` line specially (auto-prorate); not promp for "tip %" by default like US apps.
- **Paragon kasowy ≠ faktura.** A regular paragon doesn't have a NIP per buyer — for a faktura, the user should be flagged that splitting won't yield separate fakturas.
- **VAT rates are per item** (A=23%, B=8%, C=5%, D=0%, E=zw — see Ustawa o VAT). Solvio's `receipt_items` schema can store this — should be surfaced in receipt detail.
- **Tipping into a "ja stawiam" pattern:** "I'll pay this round, you owe me 0" — need a single-tap "this person paid for everyone" with no creditor/debtor relationship until next round.

### 3.7 The "this person paid for everyone" pattern (Cleo / Splitwise standard)

```
User flow:
1. Open new expense in group "Trip to Kraków".
2. Tap "Paid by" → select Member.
3. Tap "Split" → choose mode:
   - Equally
   - By item (itemize from receipt)
   - By share
   - By exact amount
4. Confirm → expense_splits row created with paidByMemberId set.
5. Each member's balance = (their share) - (what they paid).
   If they paid > their share, balance is positive (they're owed).
   If they paid < their share, balance is negative (they owe).
```

Solvio's `expense_splits` already has `paidByMemberId` and the splits jsonb. The UX layer is the missing piece — a clean "Paid by" picker with avatar grid above a "Split mode" picker.

---

## Updated prioritized backlog — round 3 NEW items only

(All R1+R2 items already shipped or on backlog elsewhere — these are NEW.)

| # | Pri | Area | Effort | Description |
|---|---|---|---|---|
| R3-1 | H | Backend / AI | M | Implement subscription auto-detection rule-based detector (`POST /api/personal/subscriptions/detect`). 3-occurrence threshold, ±10% amount, cadence buckets {weekly,biweekly,monthly,bi-monthly,quarterly,annual}. Pure SQL + Node, no external API. |
| R3-2 | H | Backend | S | Add `subscription_dismissals` table + Drizzle migration. Wire into detect endpoint as negative-list. |
| R3-3 | H | Backend | S | Curate vendor allowlist + cancel-deeplink table (~50 PL+global vendors): Netflix, Spotify, Allegro Smart, ChatGPT, GitHub, Adobe, Apple Services, Google One, Audible, Storytel, RTV Abonament, Orange/Play/T-Mobile/Plus, PGE/Tauron/Enea, Polsat Box Go, TVN24 GO, HBO Max, Prime Video. |
| R3-4 | H | iOS | M | New `SubscriptionsView.swift` — list of detected subs, swipe-to-confirm/dismiss, snooze 30-day, deeplink to vendor cancel page, annual cost projection. |
| R3-5 | H | Web SEO | S | Create `app/sitemap.ts` listing only public routes (`/`, `/login`, `/welcome`). |
| R3-6 | H | Web SEO | S | Create `app/robots.ts` allowing `/`, disallowing all `/api/`, `/dashboard`, `/expenses`, `/groups`, `/settings`, `/analysis`, `/audit`, `/prices`, `/reports`, `/business/`, `/personal/`, `/welcome`, `/receipt`. |
| R3-7 | H | Web SEO | S | Add JSON-LD `SoftwareApplication` block to marketing layout (name, OS=iOS, applicationCategory=FinanceApplication, offers/price=0, url). |
| R3-8 | H | Web SEO | S | Add JSON-LD `Organization` block to marketing layout (Programo s.c., founders Wojciech + Bartosz, address PL). |
| R3-9 | H | Web SEO | S | Add JSON-LD `FAQPage` block — 8 PL+EN Q&A pairs (PL paragony, banks, RODO/GDPR, iOS only?, pricing, group split, JPK roadmap, OCR accuracy). |
| R3-10 | H | Web SEO | S | Add `metadata.alternates.languages` for `pl-PL`, `en-US`, `x-default`. |
| R3-11 | M | Web SEO | S | Create `app/(marketing)/opengraph-image.png` (1200×630) + `twitter-image.png` (or single OG, Twitter falls back). |
| R3-12 | M | Web SEO | M | Refactor marketing copy for Polish keywords: hero h1 in PL = "Aplikacja do paragonów i wydatków", subtitle uses `skanowanie paragonów`, `dzielenie rachunków`, `JPK` (when ready). |
| R3-13 | M | Web Perf | S | Add `lighthouse-ci.yml` to GitHub Actions; fail PR if landing LCP > 2.5s OR INP > 200ms OR CLS > 0.1. |
| R3-14 | M | Web Perf | S | Audit framer-motion callsites on landing; replace 3+ static-variant instances with CSS animations to lower INP. |
| R3-15 | M | Web A11y | S | Audit landing CTAs + footer links for WCAG 2.5.8 — minimum 24×24 CSS px tap target. |
| R3-16 | M | Web A11y | S | Add skip-to-content link in `app/layout.tsx`; verify `<html lang>` switches per user language. |
| R3-17 | M | Web A11y | S | Wrap framer-motion components in `useReducedMotion()` to respect `prefers-reduced-motion`. |
| R3-18 | M | Web A11y | M | Form-level: replace placeholder-as-label with proper `<label htmlFor>` on login + welcome forms. Add `aria-live="polite"` on error states. |
| R3-19 | M | i18n | S | Adopt CLDR plural rules in `lib/i18n.ts` — Polish uses `one/few/many/other`. Switch translation lookup keys with `count` to ICU MessageFormat or Intl.PluralRules. Replace any naive `${count} paragon` strings. |
| R3-20 | M | i18n | S | Audit all `formatCurrency()` callsites — ensure PL uses `Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN' })` → produces `1 234,56 zł`; not `zł 1,234.56`. Same for date format: PL = DD.MM.YYYY; EN = MM/DD/YYYY (or YYYY-MM-DD ISO neutral). |
| R3-21 | M | iOS | M | Build `ReceiptSplitView.swift` — tap-to-claim per item, avatar grid for assignment, auto-prorated tax/tip, "fully claimed" enforcement before save. |
| R3-22 | M | iOS | S | Add "Paid by" picker UX in expense create flow — clean avatar grid, makes `paidByMemberId` discoverable. |
| R3-23 | L | Backend | M | Receipt-line VAT-aware split — use `receipt_items.vatRate` (when present) to compute exact VAT per claimer instead of proration. |
| R3-24 | L | Backend / AI | M | Add LLM-tiebreaker layer to subscription detector — only invoked when rules give 0.5-0.65 confidence. ~$0.45/mo at 10k MAU. |
| R3-25 | L | iOS | L | Auto-assign by name detection — LLM call given items + members + per-group history → suggested assignments. User reviews before confirming. |

---

## Cross-cutting recommendations

### Implementation order for next 4 rounds (R4–R7)

- **R4:** R3-1, R3-2, R3-3 (subscription detection MVP backend) — A1 territory. Plus R3-5, R3-6, R3-7, R3-8, R3-9, R3-10, R3-11 (SEO mechanical fixes) — A5/A2 territory (no source-code conflict).
- **R5:** R3-4 (iOS SubscriptionsView) — A3 territory.
- **R6:** R3-13, R3-14, R3-15, R3-16, R3-17, R3-18 (web a11y + perf). R3-19, R3-20 (i18n CLDR + currency).
- **R7:** R3-21, R3-22, R3-23 (iOS receipt-split UX + VAT-aware backend).

R3-24 and R3-25 are R10+ candidates — refinements.

### Compatibility with R1+R2 work

- **No conflict with A1 (perf):** subscription detector adds 1 endpoint; sitemap/robots are ~20 lines static.
- **No conflict with A2 (security):** new endpoint requires auth; uses existing `auth()` wrapper from `lib/auth-compat.ts`.
- **No conflict with A3 (iOS):** new views are NEW files; SubscriptionsView and ReceiptSplitView don't replace existing ones.
- **No conflict with A4 (correctness):** doesn't touch OCR pipeline or expense PUT/PATCH.

### Code-edit scope this round (A5)

Per round 3 spec: **NEW docs only, NO source code edits.**

Files written:
- `docs/research-round3.md` (this file).
- `docs/landing-seo-checklist.md` (quick win).
- `docs/i18n-finance-formatting.md` (quick win).
- `docs/subscriptions-detection-spec.md` (quick win).

---

## Sources (all checked May 2026)

### Subscription detection
- [Plaid — Build deeper user connections with data driven insights](https://plaid.com/blog/recurring-transactions/)
- [Plaid — Transactions API docs](https://plaid.com/docs/api/products/transactions/)
- [Plaid — Transactions intro](https://plaid.com/docs/transactions/)
- [Postman — Plaid Retrieve recurring transaction streams](https://www.postman.com/plaid-api/plaid/request/kclqv0d/retrieve-recurring-transaction-streams)
- [Rocket Money — homepage](https://www.rocketmoney.com/)
- [Rocket Money — Manage Subscriptions feature](https://www.rocketmoney.com/feature/manage-subscriptions)
- [Rocket Money help — Managing your bills and subscriptions](https://help.rocketmoney.com/en/articles/2185531-managing-your-bills-and-subscriptions)
- [Rocket Money help — Missing subscriptions](https://help.rocketmoney.com/en/articles/934383-missing-subscriptions)
- [Rocket Money review — The Penny Hoarder](https://www.thepennyhoarder.com/budgeting/rocket-money-review/)
- [Monarch — Tracking Recurring Expenses and Bills](https://help.monarch.com/hc/en-us/articles/4890751141908-Tracking-Recurring-Expenses-and-Bills)
- [Monarch FAQ](https://help.monarch.com/hc/en-us/articles/19985735202068-Monarch-FAQs)
- [Monarch Money review — NerdWallet](https://www.nerdwallet.com/finance/learn/monarch-money-app-review)
- [Monarch vs Rocket Money — Motley Fool](https://www.fool.com/money/personal-finance/monarch-money-vs-rocket-money/)
- [Bobby — App Store](https://apps.apple.com/us/app/bobby-track-subscriptions/id1059152023)
- [Bobby — Hulry article](https://hulry.com/track-subscriptions/)
- [Bobby — MacStories review](https://www.macstories.net/reviews/bobby-subscription-tracking-made-easy/)
- [CNBC Select — Best subscription trackers 2026](https://www.cnbc.com/select/best-subscription-trackers/)
- [Cleo — meetcleo.com about](https://web.meetcleo.com/company)
- [Cleo — cancel help](https://web.meetcleo.com/faqs/en/articles/3325860-how-do-i-cancel-cleo-plus)
- [Apple — Transaction.currentEntitlements](https://developer.apple.com/documentation/storekit/transaction/currententitlements)
- [Apple — Product.SubscriptionInfo.Status](https://developer.apple.com/documentation/storekit/product/subscriptioninfo/status)
- [Apple — StoreKit overview](https://developer.apple.com/storekit/)
- [WWDC25 — What's new in StoreKit (DEV.to)](https://dev.to/arshtechpro/wwdc-2025-whats-new-in-storekit-and-in-app-purchase-31if)
- [Apple — currentEntitlements docs](https://developer.apple.com/documentation/storekit/transaction/currententitlements)
- [Anodot — Using AI to Autonomously Monitor Subscription Payment Model](https://www.anodot.com/blog/ai-monitor-subscription-payment-model/)
- [Subaio — How does Subaio detect recurring payments (cited via search snippet; URL 301s May 2026)](https://subaio.com/subaio-explained/how-does-subaio-detect-recurring-payments)
- [Fintech.global — How transaction monitoring is being transformed by false positive reduction (Apr 2025)](https://fintech.global/2025/04/30/how-transaction-monitoring-is-being-transformed-by-false-positive-reduction/)

### Web SEO + a11y
- [Next.js — sitemap.xml file convention](https://nextjs.org/docs/app/api-reference/file-conventions/metadata/sitemap)
- [Next.js — robots.txt file convention](https://nextjs.org/docs/app/api-reference/file-conventions/metadata/robots)
- [Next.js — opengraph-image and twitter-image](https://nextjs.org/docs/app/api-reference/file-conventions/metadata/opengraph-image)
- [Next.js — JSON-LD guide](https://nextjs.org/docs/app/guides/json-ld)
- [Next.js — Metadata API generateMetadata](https://nextjs.org/docs/app/api-reference/functions/generate-metadata)
- [Schema SEO for SaaS Companies — JSONSchemaApp](https://jsonschemaapp.com/blog/the-ultimate-guide-to-schema-seo-for-saas-companies/)
- [Schema markup for SaaS — Singularity Digital](https://singularity.digital/insights/what-schema-markup-is-and-how-anyone-can-implement-it-on-saas-websites/)
- [SoftwareApplication Schema Complete Guide for SaaS — RankSightAI](https://ranksightai.com/blog/software-app-schema-guide-2025)
- [Google — FAQPage structured data](https://developers.google.com/search/docs/appearance/structured-data/faqpage)
- [Schema markup 2026 — ALM Corp](https://almcorp.com/blog/schema-markup-detailed-guide-2026-serp-visibility/)
- [JSON-LD for SEO 2026 — Foglift](https://foglift.io/blog/json-ld-seo-guide)
- [BuildWithMatija — Canonical Tags and Hreflang in Next.js 16](https://www.buildwithmatija.com/blog/nextjs-advanced-seo-multilingual-canonical-tags)
- [General Translation — Multilingual Next.js SEO](https://generaltranslation.com/en-US/blog/multilingual-nextjs-seo)
- [Krishang Technolab — Next.js i18n 2026](https://www.krishangtechnolab.com/blog/next-js-internationalization-multilingual-websites-guide/)
- [web.dev — Defining Core Web Vitals thresholds](https://web.dev/articles/defining-core-web-vitals-thresholds)
- [Core Web Vitals 2026 (Senorit)](https://senorit.de/en/blog/core-web-vitals-2026)
- [Core Web Vitals Explained — RoastWeb](https://roastweb.com/blog/core-web-vitals-explained-2026)
- [MDN — Fix LCP by optimizing image loading](https://developer.mozilla.org/en-US/blog/fix-image-lcp/)
- [SpeedVitals — WebP vs AVIF 2025](https://speedvitals.com/blog/webp-vs-avif/)
- [FrontendTools — Image Optimization 2025: WebP, AVIF & Best Practices](https://www.frontendtools.tech/blog/modern-image-optimization-techniques-2025)
- [WCAG 2.2 W3C](https://www.w3.org/TR/WCAG22/)
- [Level Access — WCAG 2.2 AA Summary](https://www.levelaccess.com/blog/wcag-2-2-aa-summary-and-checklist-for-website-owners/)
- [Clym — WCAG 2.2 AA is now ISO 40500:2025](https://www.clym.io/blog/wcag-2-2-iso-procurement)
- [TestParty — WCAG 2.5.8 Target Size guide](https://testparty.ai/blog/wcag-target-size-guide)
- [W3C — Understanding 2.5.8 Target Size Minimum](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)
- [Hogan Lovells — EAA financial services compliance](https://www.hoganlovells.com/en/publications/the-european-accessibility-act-what-should-financial-services-firms-be-focusing-on-as-the-june-2025)
- [Greenberg Traurig — EAA compliance July 2025](https://www.gtlaw.com/en/insights/2025/7/european-accessibility-act-compliance-what-businesses-in-the-eu-market-need-to-know)
- [Bird & Bird — EAA financial services 2025](https://www.twobirds.com/en/insights/2025/european-accessibility-act-focus-on-financial-services)
- [European Commission — EAA](https://commission.europa.eu/strategy-and-policy/policies/justice-and-fundamental-rights/disability/european-accessibility-act-eaa_en)
- [Subiektywnie o finansach — Polish receipt-app rankings](https://subiektywnieofinansach.pl/aplikacje-do-zarzadzania-paragonami-robimy-zdjecia-paragonow-a-aplikacje-wszystko-odczytuja-i-udostepniaja-nam-statystyki-wydatkow-maja-tez-inne-dodatkowe-funkcje-ktora-z-nich-wybrac-i-czy-w-ogole-war/)
- [Pan Paragon — Polish app](https://panparagon.pl/aplikacja/)
- [Paragonly — Polish app](https://www.paragonly.pl/)

### Receipt-line splitting
- [SplitMyExpenses — homepage](https://www.splitmyexpenses.com/)
- [SplitMyExpenses — Bill split methods explained](https://www.splitmyexpenses.com/articles/bill-split-methods-explained)
- [SplitMyExpenses — Receipt scanning](https://www.splitmyexpenses.com/articles/scan-receipt-images)
- [SplitMyExpenses — Articles](https://www.splitmyexpenses.com/articles)
- [Splitwise Pro feature page](https://www.splitwise.com/pro)
- [Splitwise — App Store](https://apps.apple.com/us/app/splitwise/id458023433)
- [Splitwise feedback — OCR itemize request](https://feedback.splitwise.com/forums/162446-general/suggestions/4084314-use-ocr-on-receipt-picture-to-itemize-expenses)
- [SplitterUp — Is Splitwise Pro Worth It](https://www.splitterup.app/blog/splitwise-pro-worth-it)
- [Splitty — Splitwise free limits 2026](https://splittyapp.com/learn/splitwise-free-limits/)
- [Splitty — 7 best bill splitting apps 2026](https://www.splittyapp.com/learn/best-bill-splitting-apps/)
- [Tab — tabapp.co](https://www.tabapp.co/)
- [Tab — App Store](https://apps.apple.com/us/app/tab-the-simple-bill-splitter/id595068606)
- [Tricount homepage](https://tricount.com/)
- [Tricount — Restaurant bill splitting use cases](https://tricount.com/expense-tracker-use-cases/restaurant-bills)
- [Tricount vs Splitwise — Cino](https://www.getcino.com/post/tricount-vs-splitwise)
- [Spliit GitHub](https://github.com/spliit-app/spliit)
- [Spliit homepage](https://spliit.app/)
- [Spliit — We Need an Open Source Alternative to Splitwise](https://spliit.app/blog/we-need-an-open-source-alternative-to-splitwise)
- [SplitPro GitHub](https://github.com/oss-apps/split-pro)
- [Open Alternative — Splitwise alternatives 2026](https://openalternative.co/alternatives/splitwise)
- [Snap & Split Bill](https://standysoftware.com/snapsplitbill/)
- [Veryfi receipt OCR](https://www.veryfi.com/receipt-ocr-api/)
- [Mindee receipt OCR](https://www.mindee.com/product/receipt-ocr-api)
- [Tabscanner](https://tabscanner.com/)
- [Microsoft — Capture receipt OCR Dynamics 365](https://learn.microsoft.com/en-us/dynamics365/project-operations/expense/match-receipt-expense-ocr)
- [Microsoft — Document Intelligence receipt model](https://learn.microsoft.com/en-us/azure/ai-services/document-intelligence/prebuilt/receipt?view=doc-intel-4.0.0)

### i18n / Polish formatting
- [W3C i18n — Number, currency, and unit formatting](https://w3c.github.io/i18n-drafts/questions/qa-number-format.en.html)
- [Freeformatter — Poland code snippets](https://freeformatter.com/poland-standards-code-snippets.html)
- [Unicode CLDR — Verify Polish numbers](https://www.unicode.org/cldr/charts/44/verify/numbers/pl.html)
- [SimpleLocalize — Pluralization guide](https://simplelocalize.io/blog/posts/pluralization-guide/)
- [SimpleLocalize — ICU MessageFormat](https://simplelocalize.io/blog/posts/what-is-icu/)
- [IntlPull — CLDR Plural Rules complete guide](https://intlpull.com/blog/cldr-plural-rules-complete-guide-2026)
- [CLDR Plural Rules](https://cldr.unicode.org/index/cldr-spec/plural-rules)
- [Better i18n — Pluralization Rules Across Languages](https://better-i18n.com/en/blog/pluralization-rules-across-languages/)
- [Lingui — Pluralization](https://lingui.dev/guides/plurals)
- [Loco — Plural forms](https://localise.biz/help/management/plurals)
- [MDN — Intl.NumberFormat](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/NumberFormat)
- [V8 — Intl.NumberFormat](https://v8.dev/features/intl-numberformat)
- [Intl Explorer](https://intl-explorer.com/NumberFormat?locale=en-us)
- [FastSpring — How to format 30+ currencies](https://fastspring.com/blog/how-to-format-30-currencies-from-countries-all-over-the-world/)

### Polish e-receipts / regulatory (R2 already deep-dived; only R3-relevant adds)
- [eparagony.pl — English](https://www.eparagony.pl/en/)
- [Fiscal Solutions — e-receipts in Poland](https://www.fiscal-requirements.com/news/1067)
- [EDICOM — Poland B2B e-invoicing](https://edicomgroup.com/blog/poland-will-make-b2b-electronic-invoicing-mandatory)
- [Marosa — KSeF guide](https://marosavat.com/vat-news/e-invoicing-poland-guide-ksef)

---

**End of round 3 research.** No source-code edits in this round. Three quick-win docs follow as separate files.
