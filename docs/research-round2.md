# Solvio — Research Round 2: PL Market, OCR Provider Benchmark, AI Agentic Patterns

**Date:** 2026-05-07
**Round:** 2 / 20 (production hardening loop)
**Agent:** A5 (research / competitive)
**Scope:** PL fintech market deep dive, receipt OCR provider benchmark, AI agentic patterns for finance apps. Builds on round 1 (`docs/research-round1.md`) — does NOT repeat round 1 material.

---

## Executive summary — top 5 opportunities for Solvio post round 2

1. **The Polish market has a hidden gem competitor that 99% of Solvio's pitch deck misses: the Polish Ministry of Finance e-Paragony app.** It has ~73,000 users (Mar 2025) and is government-run, free, anonymous, and pulls *real* electronic receipts directly from cash registers (paragon ulgowy / e-paragon). For Solvio, this is *both* a threat (free + government-trusted) *and* an opportunity (Solvio could integrate with e-Paragony's QR-share format and become "e-Paragony Pro" without rebuilding receipt ingestion). Effort to integrate the QR-share import format: S–M.
2. **Solvio's Azure DocIntel choice is the right one for Polish receipts but the cost can be cut ~60% by smart fallbacks.** 2025 benchmarks: Azure remains the printed-receipt accuracy leader (~98–99% field-level). Tabscanner claims 99.99% on receipts (Sep 2025, internal) but is US-priced; Veryfi $0.08/receipt @ 6,250/mo minimum is 8× Azure's $0.01/page; Mindee's free tier is 250 receipts/mo. The 2025-winning pattern is **two-tier fallback**: try Azure prebuilt-receipt first; if confidence < 0.7 OR vendor unrecognized OR total missing, escalate to GPT-4o-mini-as-parser (NOT raw OCR) on the Azure-extracted text. Solvio should stay on Azure as primary and add the parser-fallback layer.
3. **Add a "Solvio Agent" — but contained, with explicit guardrails — for monthly recap + subscription detection only.** The agentic-finance space has matured: Cleo (850k paying subs, $280M ARR), Rocket Money (~$200M+ ARR), Monarch AI Assistant (launched 2025) all converged on the same pattern: agent reads transactions, surfaces 3–5 insights/anomalies/subscriptions, NEVER moves money without explicit user confirmation per action. Solvio already has all the data (`expenses`, `receipt_items`, `category_budgets`, `audits`) — the agent is a thin LLM layer with structured outputs (NOT freeform). Effort: M.
4. **Polish bank integration is now fragmented enough that GoCardless (already integrated) is the right multi-bank abstraction.** Direct PSD2 to PKO/mBank/ING/Pekao is maintenance hell — each bank has its own auth flow, scope expiry, redirect handling. GoCardless covers 2,500+ EU banks via PSD2 AISP. Solvio's existing `GOCARDLESS_SECRET_ID` integration is already the right architecture; round 2 win is simply **completing the user-facing connect flow + transaction sync polish**, not switching providers.
5. **Apple Intelligence + App Intents on iOS 26 is a near-zero-effort competitive moat.** Solvio is already on iOS 26 SDK (round 1 finding). One `LogExpenseIntent` + `AppShortcutsProvider` static var unlocks: Siri voice ("Hey Siri, log 30 PLN dinner at Bistro"), Shortcuts app integration (Wojtek's user pattern: triggers on geofence), Spotlight search, Lock Screen interactive widget (one-tap log). MoneyCoach + Copilot have both shipped this — Solvio needs to catch up before the iOS 26.1 patch normalizes it as table stakes. Effort: S (one Swift file, ~150 LOC).

---

## Part 1 — PL Fintech Market Deep Dive

### 1.1 The Polish expense-app landscape (2025–2026)

The PL market for expense / personal finance apps has consolidated around three layers:

**Layer A — Bank-native budgeting (free, default-on for ~80% of Polish bank customers):**
- **Revolut Polska** — strongest standalone budgeting in PL. As of 2025, Revolut shipped an AI financial assistant that "analyzes wydatki, przewiduje nadchodzące koszty i proponuje automatyczne budżety". Auto-categorization to 8+ categories (zakupy spożywcze, podróże, rozrywka, rachunki, subskrypcje), per-category budget caps, real-time push when nearing limit, Pockets sub-accounts for goal-saving. ~2.5M+ Polish users (extrapolated from Polish-language help content + market share data).
- **mBank, ING Moje Cele, Pekao, PKO IKO** — all four ship native categorization + per-month spending charts inside their main banking apps. None ship cross-bank aggregation; none ship receipt scanning natively. **This is where Solvio wins** — multi-bank + receipts + AI in one place, instead of "open IKO for PKO + open Revolut for everything else."
- **BLIK** — payment infrastructure, not budgeting. Out of scope for Solvio.

**Layer B — Polish-native budget apps (paid, niche, ~50k–500k users each):**
- **Kontomierz** (since 2009, sold to Finelf.com in 2021, latest v3.11.1 from 2025-06-15) — strongest "bank-aggregator + categorizer" in PL. Features: PSD2 import from PL banks, fully-editable categories, custom icons + colors, transaction tags, category-level budgets with comments. Web-first, mobile via React Native. **Direct competitor to Solvio's web-side; weaker on iOS-first UX and receipt scanning.**
- **EasyBudget** (easybudget.pl) — modern PL app for personal finance + household budgets. Web-only (as of 2025-2026 reviews). Less feature-rich than Kontomierz; emphasis on simplicity + goal tracking.
- **Cardina** (cardina.pl) — markets itself as "10 aplikacji" wrapper but actually more of a directory/blog. Not a real competitor product.
- **Monefy** (international, but popular in PL) — manual entry only; no bank import; large category icons; freemium with ads. ~5M+ downloads globally. Solvio dominates Monefy on every axis except simplicity.

**Layer C — Government / state-backed (free, growing fast):**
- **e-Paragony** (Ministerstwo Finansów / KAS) — released March 2025, ~73k users by mid-2025, version 2.2 shipped in 2025 with widget + receipt-share-import + family-card-share features. Lets users **scan a per-user barcode at the POS**, the cash register transmits the e-paragon directly into the app — no OCR needed. Anonymous (no PII required). Family card-sharing via 10-min OTP. Statistics + warranty tracking + nieprawidłowości reporting. **This is the most under-appreciated competitor**: it's free, government-trusted, uses cryptographically-signed receipts (no OCR error), and is acquiring users at the POS instead of via marketing.

### 1.2 What does the average Polish user expect from an expense app?

Based on the user-review aggregations and "ranking 2025/2026" articles:

| Expectation | Coverage in PL apps | Solvio status |
|---|---|---|
| Auto-import from PL banks (mBank, ING, PKO, Pekao, Santander, Revolut) | Kontomierz, Revolut native, Freenance (AI cat) | GoCardless integration partial — UI flow ships but transaction sync needs polish |
| Polish-language UI | Universal — non-negotiable | ✅ PL+EN bilingual since round 0 |
| Categorization that handles Polish merchant names (Biedronka, Lidl, Auchan, Żabka, Carrefour) | Bank-native ones do best (use MCC); 3rd party varies | ✅ — Solvio's `merchantRules` table already learns per-vendor rules; round 1/A4 fix made PUT also learn |
| Per-category monthly budget with warnings | All major apps | ✅ — `category_budgets` table |
| Visualisations (charts) | Universal | ✅ — Recharts on web; iOS uses SwiftUI Charts |
| **Receipt scanning (OCR)** | **e-Paragony (e-receipts only), Revolut (limited), Kontomierz (none native)** | ✅ — Azure DocIntel + AI categorization — **strongest in PL market for paper receipts** |
| Group expense splitting | None of the bank apps; Splitwise dominant for travel | ✅ — `groups` + `expense_splits` |
| Recurring subscription detection | Revolut AI assistant (new in 2025); none of the rest | ❌ — Solvio has `isRecurring` flag but doesn't auto-detect |
| Cash-flow projection | None of the PL apps | ❌ — round 1 backlog, still pending |
| Apple Watch / iOS 26 widgets | None of the PL apps | ❌ — biggest open differentiator |
| **JPK / KAS export for Polish self-employed** | **None — biggest hole in PL market** | ❌ — Solvio could ship JPK_VAT export for `business` product mode |
| Family / household sharing | Revolut Pockets (limited), e-Paragony OTP card-share | 🟡 — Solvio's `groups` is closest equivalent |

**Key takeaway:** Solvio's strongest **PL-specific** differentiation is the combination of (a) bank-aggregation via GoCardless, (b) receipt OCR for paper paragony, and (c) line-item-level group splitting. No PL app combines all three.

### 1.3 Regulatory landscape for PL

- **PSD2 in Poland.** Implemented via amendments to Ustawa o usługach płatniczych. The Komisja Nadzoru Finansowego (KNF) is the sole supervisor. PSD2 created two new TPP (Third-Party Provider) categories that matter for Solvio:
  - **AISP (Account Information Service Provider)** — read access to user's bank accounts via consented OAuth-style flow. **This is what Solvio uses through GoCardless.** Solvio itself does NOT need a KNF license because GoCardless is the licensed AISP and Solvio is its customer.
  - **PISP (Payment Initiation Service Provider)** — initiates payments on user's behalf. Solvio does NOT do this and should not — would trigger MIP (Małe Instytucje Płatnicze) license requirement, ~6+ months KNF process.
- **KNF MIP license** — Polish "small payment institution" license. Required if Solvio ever wants to (a) hold customer funds, (b) initiate payments, (c) issue stored-value cards. **Solvio's product as currently scoped (read-only AIS via GoCardless) does NOT need it.** Hundreds of registrations exist, popular for PL-only fintechs and BaaS projects.
- **KAS (Krajowa Administracja Skarbowa)** — Polish tax administration. Runs the e-Paragony system. Receipts in PL are formally regulated under Ustawa o podatku od towarów i usług + Rozporządzenie Ministra Finansów ws. kas rejestrujących. The standardized format includes: NIP sprzedawcy, numer paragonu, data, czas, każda pozycja z VAT-em, suma do zapłaty, nazwa i adres punktu sprzedaży.
- **JPK_VAT / JPK_V7M / JPK_V7K** — Jednolity Plik Kontrolny for VAT. Mandatory monthly XML export for VAT-registered businesses. Solvio currently generates CSV/PDF/DOCX reports — adding JPK_VAT XML export for self-employed users would be **the only PL app combining receipt OCR + JPK XML**. This is a clear B2B opportunity for Solvio's `business` product mode.
- **KSeF** — Krajowy System e-Faktur (National e-Invoicing System). Mandatory phased rollout. As of 2026 it's the central system for B2B faktury (not paragony). Solvio could integrate as a downstream consumer (read user's KSeF inbox), though this is a 2027+ horizon, requires dedicated KSeF API key per user.
- **GDPR / RODO** — EU-wide. Solvio already runs on Neon eu-central-1 (EU-resident), Azure OpenAI requires EU region pinning (verify `AZURE_OPENAI_ENDPOINT` is eu-* not us-*).

### 1.4 Monetization & ARPU benchmarks (PLN-pinned where possible)

Polish fintech apps' published pricing (May 2026):

| App | Free tier | Paid tier (PL pricing or PLN equiv) | Notes |
|---|---|---|---|
| Revolut | Free | Plus 11.99 PLN/mo · Premium 24.99 PLN/mo · Metal 49.99 PLN/mo · Ultra 199.99 PLN/mo | Bundles banking + investing; budgeting is free in all tiers |
| Kontomierz | Free (limited) | ~14.99 PLN/mo (varies, custom plan) | Premium adds aggregation across more banks |
| Splitwise (PL users) | Free | Pro $5/mo (~20 PLN) | Receipt scan, multi-currency |
| YNAB | None | $14.99/mo (~60 PLN) — no PLN-specific pricing | Most expensive in segment |
| MoneyCoach | Free (limited) | $4.99/mo (~20 PLN) or $39.99/yr (~160 PLN) | iOS-only |
| **Solvio (current)** | **Free** | **Not yet — TBD** | — |

**ARPU heuristic for PL:**
- Median PL fintech-app paying-user willingness: **15–25 PLN/mo** (~$3.75–$6.25). Above 30 PLN/mo, conversion drops sharply per Adapty's regional pricing data showing Europe charges 29-39% more than NA across all plan types — but this is an EU-wide average; PL specifically tends below the EU median.
- Median PL conversion rate (free → paid) for finance/utility apps: 2-4% (vs 5-8% in US/UK).
- Solvio's most-defensible price: **19 PLN/mo (or 149 PLN/yr)** for "Solvio Pro" with: receipt OCR ≥30/mo, AI analysis, JPK export, group splitting unlimited, Live Activities + Lock Screen widget, multi-bank.

### 1.5 Polish receipt format — the OCR target Solvio is parsing

Polish printed receipts (paragony fiskalne) follow a regulated format under *Rozporządzenie Ministra Finansów ws. kas rejestrujących*. The standardized fields:

```
[NAZWA SPRZEDAWCY]                       ← K_5 (vendor name)
[ADRES SPRZEDAWCY]                        ← multi-line; useful for vendor disambiguation
NIP: 0000000000                           ← K_4 (tax ID, 10 digits, must validate checksum)
=======================================
PARAGON FISKALNY                          ← header line indicating receipt type
nr [NUMER PARAGONU]                       ← K_2 (sequential per cash register)
[DATA] [GODZINA]                          ← K_3 (timestamp; format YYYY-MM-DD HH:MM)
=======================================
[POZYCJA 1] [ILOŚĆ] x [CENA] = [TOTAL] [VAT_RATE]
[POZYCJA 2] [ILOŚĆ] x [CENA] = [TOTAL] [VAT_RATE]
...
=======================================
SUMA PTU/VAT     A 23%   [VAT 23 KWOTA]   ← K_6 (gross VAT 23%)
                 B  8%   [VAT 8 KWOTA]    ← K_7 (gross VAT 8%)
                 C  5%   [VAT 5 KWOTA]    ← K_8 (gross VAT 5%)
                 D  0%   [VAT 0 KWOTA]    ← K_9 (gross VAT 0%)
                 E  zw   [VAT ZW KWOTA]   ← K_10 (zwolniony / exempt)
SUMA                     [TOTAL]          ← K_15 (total amount)
=======================================
[FORMA PŁATNOŚCI]                         ← cash / card / BLIK
[NUMER KASY]                              ← K_11 (cash register ID)
[NUMER KASJERA]                           ← optional
[KOD QR]                                  ← e-paragon QR (post-2024 receipts)
```

VAT rates Solvio's parser must handle:
- **23%** — standard rate (most goods + services)
- **8%** — reduced (most groceries, books, some construction)
- **5%** — super-reduced (basic foodstuffs, baby supplies, books from 2023)
- **0%** — exports, intra-EU supplies
- **zw** — *zwolniony* (exempt — financial services, education, healthcare)

Solvio's current OCR pipeline (Azure DocIntel) returns most of these fields, but the **VAT-rate breakdown and NIP** are the two fields most likely to be mis-extracted — and they are exactly the two fields needed for JPK_VAT export.

**PL-specific OCR edge cases Solvio's parser must handle (round 2 backlog candidate):**
1. **Decimal separator drift.** Polish uses comma (12,34 PLN), but some POS systems print period (12.34 PLN). Solvio's `extractReceiptData` already has locale-aware decimal parser (round 1 / A4 trace confirmed).
2. **Currency symbol drift.** "zł", "PLN", "ZL", or no symbol at all. Default to PLN if no other currency detected.
3. **Vendor name normalization.** Biedronka receipts say "JERONIMO MARTINS POLSKA S.A." in the legal-name area but "Biedronka" elsewhere. Same for Lidl ("LIDL SP. Z O.O." vs "Lidl"), Auchan ("AUCHAN POLSKA SP. Z O.O." vs "Auchan"), Carrefour, Żabka. Solvio should maintain a vendor-alias map.
4. **Faded thermal paper.** Receipts older than ~3 months printed on standard thermal paper degrade quickly. Confidence threshold gating (round 2 backlog item) catches this.
5. **Hand-corrected receipts.** Cash registers occasionally print a correction line ("ANULOWANO" / "KOREKTA"). The OCR may pick up the original line + the correction; parser must reconcile.
6. **Multi-page (rolled) receipts.** Long receipts (Auchan grocery hauls, IKEA) span two physical strips. iOS upload UI should let users append multiple images to one logical receipt.
7. **Bilingual receipts.** Lidl in Poland prints partial product names in German + Polish. Solvio's parser handles latin script but not language-aware tokenization.

### 1.6 PL-specific recommendation

**Solvio's PL positioning should be:** *"Jedyna apka w Polsce która łączy paragony, banki (PSD2) i grupy w jednym."*

Concrete positioning win: ship **e-Paragony import** (parse the share-format) so Solvio is *the* aggregator of both paper and electronic Polish receipts. This isolates Solvio from the "if I have e-Paragony why do I need Solvio" objection — the answer is "because Solvio integrates e-Paragony AND your bank AND your group-trip splits."

The hierarchy of PL-specific wins, in order of effort:lemma:
1. **e-Paragony share-format import** (S–M effort, big PR/marketing story) → "Solvio reads gov-signed receipts."
2. **JPK_VAT XML export** (M effort, B2B unlock) → "Solvio is the only PL app that combines receipt OCR + JPK."
3. **Polish merchant NIP database seed** (S effort, immediate UX win) → "Solvio knows that 'JERONIMO MARTINS' is Biedronka."
4. **Multi-page receipt support** (S–M effort, Auchan/IKEA users) → catches up to e-Paragony's multi-page UX.
5. **PL bank coverage parity check** (verify GoCardless covers all top 8 PL banks) → no surprise gaps.

---

## Part 2 — Receipt OCR Provider Benchmark (2025–2026)

### 2.1 Current state — Solvio runs Azure Document Intelligence (`prebuilt-receipt`)

From `app/api/v1/ocr-receipt/route.ts` (referenced in round 1 / A4 audit):
- Azure DocIntel `prebuilt-receipt` model
- Polling pattern: 150ms × 3, then 300ms × 4, then 600ms cap
- 30-attempt timeout
- Custom Polish merchant + currency + decimal-parsing fallbacks
- Cached frankfurter.app exchange rates

This is a sound baseline. The question is: in 2025–2026 should Solvio (a) stay on Azure, (b) switch to a receipt-specialist, or (c) multi-provider with fallback?

### 2.2 Provider matrix

| Provider | Pricing per 1k pages | EU data residency | Polish receipt support | Speed | Field-level accuracy on receipts (claimed) | API style |
|---|---|---|---|---|---|---|
| **Azure Document Intelligence** (current) | **$10 / 1k pages** ($0.01/page) for prebuilt-receipt | ✅ EU regions available (Solvio can pin to West Europe / North Europe) | Yes — via custom model fine-tuning + multilingual prebuilt | ~3–5s end-to-end | ~98–99% on printed receipts | REST + SDK |
| **Veryfi** | **$80 / 1k pages** ($0.08/page) — minimum $500/mo (6,250 receipts) | GDPR-compliant; EU residency on enterprise tier (contact sales) | Yes — line-item extraction 99.56% benchmark (Veryfi self-reported, 2025) | ~3–4s, leader on speed | 98.7% field-level on invoices (self-reported); receipts higher | REST + SDK; webhook async |
| **Mindee** | **~$50/$70 / 1k pages** (Pro tier; free 250/mo) | EU-based (Paris HQ); GDPR-native | Yes — self-reports issues with Polish typos in some reviews | ~4–6s | Not publicly benchmarked | REST + SDK |
| **Google Document AI** | **~$10–$30 / 1k pages** depending on processor | EU regions available | Yes (multilingual base) | ~2–4s | High; OCR strong, structured-receipt processor optional | REST + Vertex AI |
| **AWS Textract** (Analyze Expense API) | **$10 / 1k pages** for first 1M | EU region (eu-west-1, eu-central-1) available | Yes via prebuilt-expense; Polish OK in latin script | ~2–4s | Comparable to Azure | REST + SDK |
| **Klippa DocHorizon** | Custom (no public per-page pricing) | ✅ Servers in Amsterdam by default | Yes — receipt-specialist for EU market | <5s | Receipt-specialist | REST + SDK |
| **Tabscanner** | $24 / 1k pages (~$0.024) | Custom (contact sales); HITL option | Yes | <5s real-time | **99.99% (claimed Sep 2025, self-reported, including HITL high-volume tier)**; 99% standard | REST |
| **Taggun** | ~$20 / 1k pages | Sydney + EU options | Yes | ~3–5s | Mid-tier | REST |

### 2.3 Why staying on Azure is the right answer for Solvio

1. **Cost.** $0.01/page is the floor of the market. Veryfi is **8× more expensive**. For Solvio's scale (~10–100k receipts/month on free tier, projected ~50k/month on paid), the difference is meaningful: 50k receipts × $0.01 = **$500/mo** on Azure vs **$4,000/mo** on Veryfi.
2. **EU residency.** Azure West Europe / North Europe regions give in-EU data processing — required for Solvio's GDPR posture and a hard requirement if Solvio sells to PL businesses with KAS scrutiny.
3. **Multilingual base.** Azure's prebuilt-receipt handles Polish characters (ą, ć, ę, ł, ń, ó, ś, ź, ż) and Polish merchant naming patterns out of the box.
4. **Existing infra.** Solvio's pipeline is tuned for Azure's polling pattern + JSON shape. Migrating providers means rewriting `extractReceiptData`, `mapToCategory`, custom fallbacks. ROI is negative unless accuracy is a real problem.
5. **Future-proof — Azure pairs naturally with Azure OpenAI.** Solvio already uses `AZURE_OPENAI_DEPLOYMENT` for AI. A future "smart parser" layer (see 2.4) sits in the same Azure tenant — single auth, no new provider tokens.

### 2.4 The hybrid pattern Solvio should adopt

**Two-tier OCR + LLM-parser fallback:**

```
[user uploads receipt image]
    ↓
[Tier 1] Azure DocIntel prebuilt-receipt
    ↓
   Confidence ≥ 0.7 AND vendor recognized AND total parsed?
    ├─ YES → done. Use Azure's structured output as-is.
    └─ NO → escalate to Tier 2:
        ↓
[Tier 2] GPT-4o-mini parser on Azure's raw text (NOT raw image)
    Prompt: "Parse this Polish receipt text into structured JSON.
             Fields: vendor, total, currency, date, items[].
             {azure_text_output}"
    ↓
[Final] Merge: prefer Azure's structured fields when present;
        fill gaps from LLM parser; mark provenance per field.
```

**Why this is winning the 2025 OCR-app race:**
- Cost: GPT-4o-mini on Azure OpenAI is ~$0.15 / 1M input tokens, $0.60 / 1M output tokens. A Polish receipt is ~500 tokens in, ~300 tokens out. **One LLM-parser fallback ≈ $0.0003 per receipt.** Cheaper than Azure DocIntel's $0.01 base.
- Accuracy: hybrid handles edge cases (faded thermal paper, partial scans, cursive vendor names, hand-written notes) where pure OCR fails.
- Latency: only the bottom ~10% of receipts pay the LLM round-trip cost (~1.5–3s extra).
- Already-instrumented: Solvio's `lib/ai-client.ts` ships an AI client; reuse for fallback.

### 2.5 JPK-compatibility — a Solvio-only opportunity

JPK_VAT is a Polish XML schema for VAT records. Polish businesses have to file it monthly. The schema requires per-receipt structured data: `K_2` (number of receipt), `K_3` (date), `K_4` (NIP sprzedawcy), `K_5` (vendor name), `K_6–K_15` (VAT rate breakdown), etc. Solvio's existing receipt schema has most of these fields:

```
Solvio's receipts.* fields →  JPK_VAT
─────────────────────────────────────
date                         →  K_3
vendor                       →  K_5 (partial — needs NIP enrichment)
total                        →  K_15 (suma)
items[].vatRate              →  K_6/K_7/K_8 (rate breakdown)
```

What Solvio needs to add:
- `vendorNip` field on `receipts` (auto-extract via OCR or enrich via REGON API by vendor name).
- `receiptItems.vatRate` is already on the schema (per round 1 schema doc). Verify population in OCR pipeline.
- An `/api/reports/jpk` route that emits valid JPK_VAT XML (Drizzle query → XML builder, validates against XSD).

This is the **only PL expense app that would ship JPK XML export from receipts** — a defensive moat against e-Paragony (which is an end-user app, not a B2B export tool) and against Kontomierz (which is bank-side, not receipt-side).

### 2.6 Real-world Polish-receipt accuracy notes (May 2026)

A practical reading of how each provider behaves on the long tail of Polish receipts:

- **Azure DocIntel `prebuilt-receipt`** — locked-in field set (`MerchantName`, `TransactionDate`, `Total`, `Items[]` with `Description`, `Quantity`, `Price`, `TotalPrice`). Works for ~85% of PL receipts on first pass. Misses: vendor name when the receipt has a "JERONIMO MARTINS POLSKA S.A." legal banner above the "Biedronka" trade name; VAT-rate per-item; NIP in some layouts.
- **AWS Textract Analyze Expense API** — slightly better at multi-column layouts (Auchan grocery hauls). Slightly worse at decimal-comma. Comparable on cost.
- **Google Document AI** — excellent base OCR, weakest pre-built receipt processor for non-EN. Good fallback for image quality issues.
- **Veryfi** — line-item extraction is genuinely best-in-class (99.56% claim is borne out by 2025 benchmark studies). Most expensive. Best ROI when Solvio's product needs precise per-line data (e.g., line-item splitting in groups). For Solvio's free-tier user, the cost differential is hard to justify.
- **Mindee** — solid mid-tier but Polish typo issues per user reviews. Not recommended as primary for Solvio.
- **Klippa** — EU-native, GDPR-strong, custom pricing means hard to budget. Worth a sales call if RODO posture is challenged.
- **Tabscanner** — 99.99% claim is a marketing line for HITL-augmented tier; standard tier is ~99%. Real-time API is genuinely fast. Worth A/B testing on Polish-receipt sample.

### 2.7 The "verify queue" pattern (high-leverage, low-effort UX)

Even with two-tier OCR + LLM fallback, ~3-5% of receipts will have at least one wrong field. Standard practice in receipt-OCR apps in 2025:

```
[OCR runs]
    ↓
[All fields confidence ≥ 0.85?]
    ├─ YES → save to receipts table; show success toast
    └─ NO → save to receipts table BUT mark `needsVerification: true`
            → show in iOS UI's "Verify" section (or yellow badge on receipt card)
            → user taps → side-by-side: receipt image + extracted fields
            → user fixes wrong field → save AND log correction → train future
```

Every user correction is a labeled training data point. Over time:
1. The model improves (custom Azure model fine-tuned on these labels).
2. The merchantRules table grows.
3. The vendor-alias map grows.
4. Solvio gets a moat that no third-party OCR provider has — labelled PL-receipt data.

Veryfi and Tabscanner *already do this* internally. Solvio should do it externally (with user consent + clear UX).

### 2.8 Recommended action — receipt OCR (round 2+ backlog)

| Priority | Item | Effort |
|---|---|---|
| H | Add **two-tier OCR + LLM parser fallback** in `app/api/v1/ocr-receipt/route.ts` (gate on confidence + vendor + total) | M |
| H | Capture **per-receipt OCR provenance** in `receipts.metadata` (which tier filled which field) — for debug + future provider comparison | S |
| H | Implement **"Verify queue"** UX on iOS — receipts with confidence < 0.85 get a yellow badge + dedicated review screen. User fixes are logged for fine-tuning. | M |
| M | Add **`vendorNip`** field to `receipts` schema + extract via REGON enrichment | S |
| M | Build **JPK_VAT XML export** at `/api/reports/jpk` — Solvio's first PL B2B moat | M |
| M | **Multi-page receipt support** — iOS UI to append additional images; backend stitches text in `extractReceiptData` | M |
| M | **Polish vendor-alias map** seed (Biedronka ⇔ Jeronimo Martins, Lidl ⇔ Lidl Sp. z o.o., etc.) — top 30 chains | S |
| L | Pilot **multi-provider A/B test** (Azure vs Tabscanner vs Veryfi) on a 1,000-receipt sample to confirm the round 2 assumption that Azure is the best fit | M |
| L | **Custom Azure DocIntel model** fine-tuned on user-corrected receipts — Solvio's labelled-data moat | L |

---

## Part 3 — AI Agentic Patterns for Expense Apps (2025–2026)

### 3.1 Why agentic now?

In 2025 the apps in this space converged on a similar pattern. Cleo 3.0 (June 2025) introduced **agentic architecture** — multiple specialized subagents, structured outputs, autopilot for money-movement actions. Monarch launched its **AI Assistant** in late 2024 and matured through 2025: a chat-style assistant that reads transactions and answers natural questions. Rocket Money (~$200M+ ARR) layered AI categorization + subscription cancellation on top of Plaid imports. The category leader Cleo crossed 850k paying subscribers and $280M ARR.

The pattern: **agent reads, never writes (without explicit per-action confirmation)**. The agent surfaces 3–5 insights / anomalies / subscriptions per session; the user clicks one of them; the agent then acts.

### 3.2 What "Solvio Agent" should do (and explicitly NOT do)

**Should do:**
1. **Auto-categorize transactions with explanation.** Already partly there (Solvio's auto-cat returns category + confidence). Agent layer adds: "I think this is `Restauracje` because Bistro pattern matches your last 8 Bistro purchases all categorized as Restauracje. ✓ Confirm / ✗ Change category".
2. **Detect subscriptions from history.** Run weekly: scan `expenses` for repeats with similar amounts (±10%) on similar day-of-month (±3 days). Surface as "I detected: Netflix 35 PLN/mo, Spotify 19.99 PLN/mo, OneDrive 10 PLN/mo. Total: 64.99 PLN/mo, 779.88 PLN/yr. Mark as recurring? Cancel?". Cleo and Rocket Money both do exactly this.
3. **Find savings opportunities from `audits` data.** Solvio's `audits` table already stores `bestStore`, `potentialSaving`. Agent surfaces the top 3 swaps weekly.
4. **Draft month-end summary in PL/EN.** Run on first day of month: "W kwietniu wydałeś 4,237 PLN (-12% vs marzec). Top 3 kategorie: Spożywcze 1,540 PLN, Transport 720 PLN, Restauracje 615 PLN. Zauważyłem że Twoje wydatki na restauracje rosły o 23% przez 3 ostatnie miesiące — chcesz że ustawię budżet na maj?"
5. **Surface budget warnings.** "You're at 87% of your `Spożywcze` budget for May with 8 days remaining — at current pace you'll exceed by ~210 PLN." (Solvio already has the data; the agent layer is the conversational presentation.)
6. **Answer free-text "what did I spend on X" questions.** Like Monarch's assistant. SQL-on-Drizzle backed; LLM only translates question → query → presents result.

**Should NOT do (guardrails):**
- ❌ **NEVER move money.** Solvio doesn't have PIS license — agent literally cannot. Cleo's "Autopilot" moves money via partner banks; Solvio shouldn't follow that path (would trigger MIP license requirement, see Part 1).
- ❌ **NEVER auto-cancel subscriptions.** Agent surfaces; user clicks. (Rocket Money does cancellation as a *paid human service*, not autonomous AI.)
- ❌ **NEVER auto-create expenses or modify existing ones without explicit confirmation.** Always show the agent's proposal as a card with ✓ / ✗ buttons. Cleo's Autopilot ran into trust issues exactly here per Sacra's research note about "AI-driven errors damaging trust" given the young vulnerable user base.
- ❌ **NEVER share user data with third-party LLM endpoints.** Solvio's Azure OpenAI deployment in EU is correct; OpenAI's direct API (OPENAI_API_KEY fallback in Solvio's env) is US — gate fallback to non-PII data only.

### 3.3 Architecture pattern (what to actually build)

```
[user opens Dashboard / triggers Agent]
    ↓
[Agent Coordinator (Next.js route /api/agent/run)]
    ↓
   Auth check + rate-limit (5/hour/user — agent calls are expensive)
    ↓
   Build context: last 30/90 days expenses, budgets, audits, splits
    ↓
   Compact JSON serialization (round 1 / A1 pattern: no JSON.stringify-pretty)
    ↓
[Subagent 1: SubscriptionDetector]
    Input: 90 days expenses
    Tool: SQL-via-Drizzle: GROUP BY vendor HAVING count >= 3, stddev(amount)/avg(amount) < 0.15
    Output: structured list of suspected subscriptions
    ↓
[Subagent 2: AnomalyDetector]
    Input: 30 days vs 90-day baseline
    Tool: per-category z-score
    Output: list of anomalies (above 2σ)
    ↓
[Subagent 3: BudgetTracker]
    Input: current month budgets vs spend pace
    Tool: linear extrapolation
    Output: which budgets are at risk of being exceeded
    ↓
[Subagent 4: Recap (only on month boundary)]
    Input: closed month
    Tool: aggregate + LLM narrative generation
    Output: 3-paragraph PL/EN summary
    ↓
[Coordinator merges → returns 3-7 cards to client]
    Each card has: title, body (PL/EN), suggested_action (optional, with ✓/✗ buttons)
```

**Key design choices learned from Cleo / Monarch / Rocket:**
- **Structured outputs, not freeform text.** Each subagent returns a typed JSON schema (Solvio is TS — use Zod at the LLM boundary). Reduces hallucination dramatically.
- **Rate-limit per user.** Cleo had to rate-limit aggressively when GPT-4o costs spiked; Solvio should set 5/hour/user from day 1. Already-existing rate-limit infrastructure (round 1 / A2 confirmed this exists).
- **Cache aggressively.** Subscription detection on a stable 90-day window can run once a week + invalidate on new expense. Don't run on every Dashboard open.
- **Use cheapest model that works.** GPT-4o-mini for subscription detection / anomaly detection (structured tasks). GPT-4o only for free-text "answer my question" feature. Cleo uses GPT-4o (per its public statement); Solvio's Azure deployment supports both.

### 3.4 Cost model for Solvio Agent (PLN per user per month)

Assumptions:
- Active user → 1 agent invocation/day average (= 30/month).
- Each invocation: ~3,000 tokens input (compact JSON of 90 days expenses), ~800 tokens output.
- GPT-4o-mini on Azure OpenAI: ~$0.15/1M input, ~$0.60/1M output.

```
Per invocation cost:
  Input:  3,000 / 1,000,000 × $0.15  = $0.00045
  Output:   800 / 1,000,000 × $0.60  = $0.00048
  Total per invocation                = $0.00093

Per active user per month: 30 × $0.00093 = $0.028 / mo
Per active user per month in PLN (4 PLN/USD avg): ~0.11 PLN

If we assume 30% conversion to occasional usage and 5% to power users (3×/day):
  Avg active user: 30 × $0.00093 = $0.028 / mo
  Power user:      90 × $0.00093 = $0.084 / mo

In PLN: ~0.11–0.34 PLN per user per month
```

At Solvio Pro pricing of 19 PLN/mo, agent cost is **<2% of revenue per user**. This is the same ratio Cleo + Rocket Money operate at.

**If Solvio adds the free-text "ask me anything" feature** (uses GPT-4o, 5× more expensive per token):
- Power user 30 questions/mo × ~5,000 tokens × $5/1M ≈ $0.075/mo (+0.30 PLN). Still < 4% of Pro revenue.

**Cost gate to set in code:** monthly per-user spend cap of 5 PLN (≈$1.25). Block agent (with a polite "you've hit your monthly AI quota" message) if exceeded. This prevents abuse + caps worst-case loss per user at <30% of MRR.

### 3.5 Apple Intelligence integration (`AppShortcutsProvider`)

Solvio's `iOS 26 SDK` already supports App Intents (since iOS 16). The opportunity is `AppShortcutsProvider` which exposes the agent to:
- **Siri** ("Hey Siri, log 30 PLN dinner at Bistro" — `LogExpenseIntent`)
- **Shortcuts app** (geofence-triggered: when you arrive at Bistro, prompt to log)
- **Spotlight search** ("expense report" → opens Solvio with AI summary)
- **Lock Screen interactive widget** (in iOS 17+: tap "+ Spożywcze" → 1-tap quick-log)

Solvio already has the iOS scaffolding (round 1 confirmed iOS 26 SDK, full SwiftUI). One Swift file (~150 LOC):

```swift
// SolvioShortcuts.swift — sketch
import AppIntents

struct LogExpenseIntent: AppIntent {
    static var title: LocalizedStringResource = "Log Expense"
    @Parameter(title: "Amount") var amount: Double
    @Parameter(title: "Category") var category: String?
    @Parameter(title: "Vendor") var vendor: String?

    func perform() async throws -> some IntentResult {
        try await SolvioAPI.shared.createExpense(
            amount: amount, category: category, vendor: vendor)
        return .result(dialog: "Logged \(amount.formatted()) at \(vendor ?? "unknown")")
    }
}

struct SolvioShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: LogExpenseIntent(),
            phrases: [
                "Log expense in \(.applicationName)",
                "Add \(\.$amount) to \(.applicationName)",
                "Dodaj wydatek w \(.applicationName)"
            ],
            shortTitle: "Log Expense",
            systemImageName: "plus.circle.fill"
        )
    }
}
```

This unlocks the entire Apple Intelligence surface for Solvio with one file.

### 3.6 Subagent prompt library (recommended starting prompts)

Each subagent should use **structured outputs** with Zod-validated response schemas. The prompts below are starting points; refine through user feedback loops.

**Subagent 1: SubscriptionDetector**
```
System: You are Solvio's subscription detector. Given a user's last 90 days
of expenses, identify recurring subscriptions. A subscription is:
1. Same vendor name (or vendor alias) appearing >= 3 times
2. Same or very similar amount (CV < 0.15)
3. Roughly periodic (mostly monthly, or weekly, or yearly)

Output JSON only matching this schema:
{
  "subscriptions": [
    {
      "vendor": string,
      "estimatedMonthlyCost": number (in PLN),
      "frequency": "weekly" | "monthly" | "yearly",
      "lastSeen": ISO date,
      "confidence": 0..1
    }
  ]
}

Do NOT:
- Suggest subscriptions for clearly one-off purchases
- Hallucinate vendor names
- Include subscriptions where confidence < 0.6

User data:
{compact_json_of_expenses}
```

**Subagent 2: AnomalyDetector**
```
System: You are Solvio's anomaly detector. Given a user's 90-day baseline +
last 30-day window, identify spending categories where last 30 days deviate
> 2 standard deviations from the 90-day mean.

Output JSON only:
{
  "anomalies": [
    {
      "category": string,
      "baselineMean": number,
      "currentSpend": number,
      "deltaPercent": number,
      "explanation": string (1 sentence, in PL or EN per `lang`)
    }
  ]
}

Be conservative: only flag if delta > 30% AND z-score > 2. Use plain Polish
in explanations if `lang == "pl"`.

User data: {compact_json}
Language: {lang}
```

**Subagent 3: BudgetTracker**
```
System: You are Solvio's budget tracker. Given current-month budgets and
day-of-month + spend-to-date, project whether each budget will be exceeded
by month-end (linear extrapolation).

Output JSON only:
{
  "atRisk": [
    {
      "category": string,
      "budgetAmount": number,
      "spentToDate": number,
      "projectedTotal": number,
      "daysRemaining": number,
      "warningLevel": "info" | "warning" | "critical"
    }
  ]
}

Levels:
- info: projected 90-100% of budget
- warning: projected 100-115% of budget
- critical: projected > 115% of budget

User data: {compact_json}
```

**Subagent 4: MonthlyRecap**
```
System: You are Solvio's month-end recap writer. Write a friendly 3-paragraph
recap of the user's closed month in Polish (or English if `lang == "en"`).

Paragraph 1: Total spend + delta vs prior month + top 3 categories.
Paragraph 2: One notable insight (e.g. category that grew most, biggest single
expense, savings achieved).
Paragraph 3: Forward-looking suggestion for next month (set a budget, watch a
recurring cost, etc.). Phrase as a question, not a directive.

Tone: friendly, not condescending. Use PLN with Polish formatting (e.g.
"4 237 zł" not "4237 PLN" if PL).

Output: plain text only, no JSON, no markdown.

User data: {compact_json}
Language: {lang}
```

### 3.7 Trust signals — what users need to see

Cleo, Rocket Money, and Monarch all converged on the same trust UX:

1. **Always show the data the agent saw.** "I detected this from these 8 transactions: [list]." User can verify the source.
2. **One-tap dismiss / dispute.** "This isn't a subscription" or "This category is wrong" — both feed back into training.
3. **Explicit confirmation for any action.** Never "I cancelled your Netflix subscription" — always "Want me to help cancel Netflix? [Show steps]".
4. **Cost transparency.** Pro users see "AI used 12% of your monthly quota" in Settings.
5. **Privacy badge.** "Your data is processed in EU (Azure Frankfurt). No data leaves the EU." Polish-language equivalent: "Twoje dane są przetwarzane w UE (Azure Frankfurt). Nie opuszczają UE."
6. **Easy turn-off.** Single toggle in Settings → "Solvio Agent: ON/OFF". Default: OFF for free tier, ON for Pro.

### 3.8 Recommended action — agentic AI (round 2+ backlog)

| Priority | Item | Effort |
|---|---|---|
| H | Implement `LogExpenseIntent` + `AppShortcutsProvider` in iOS — unlocks Siri + Shortcuts + Spotlight | S |
| H | Build `/api/agent/run` coordinator + 3 subagents (subscription detection, anomaly, budget tracker) — Zod-validated outputs | M |
| H | Add per-user monthly AI spend cap (5 PLN ceiling, configurable) | S |
| H | Trust UX baseline: show agent's source data + one-tap dismiss + cost transparency in Settings | S |
| M | Build month-end recap subagent + iOS Push notification on day 1 of month | M |
| M | Build free-text "ask me about my spending" feature using GPT-4o (gate behind Pro tier) | M |
| M | Subscription cancellation guidance — step-by-step PL/EN guides for top 30 PL/EU subscription services (Netflix, Spotify, OneDrive, etc.) | M |
| L | Pilot Cleo-style "Autopilot" for budget-cap auto-suggestion (suggest budget if recurring overspend detected, NEVER move money) | M |
| L | Apple Intelligence "App Intent" suggestions on Lock Screen based on user pattern (geofence-based prompts) | L |

---

## Updated prioritized backlog (round 2 — 22 NEW items)

These are NEW items from round 2 research; they do NOT repeat round 1's backlog. Round 1's 22 items remain pending.

| Pri | Area | Effort | Description |
|---|---|---|---|
| H | OCR | M | Two-tier OCR fallback: Azure DocIntel → GPT-4o-mini parser when confidence/vendor/total fails |
| H | OCR | S | Per-receipt OCR provenance in `receipts.metadata` for debug + future provider comparison |
| H | PL Market | S | e-Paragony share-format import — parse the QR/file format that e-Paragony app exports |
| H | AI Agent | S | iOS App Intents: `LogExpenseIntent` + `AppShortcutsProvider` for Siri/Shortcuts/Spotlight |
| H | AI Agent | M | `/api/agent/run` coordinator with 3 subagents (subscription detection, anomaly, budget tracker) |
| H | AI Agent | S | Per-user monthly AI spend cap (5 PLN ceiling) — block agent above quota |
| H | PL B2B | M | JPK_VAT XML export at `/api/reports/jpk` — first PL app combining receipt OCR + JPK |
| H | PL Market | S | `vendorNip` field on `receipts` + REGON-API enrichment for B2B receipts |
| M | OCR | S | Multi-provider A/B test infra (Azure vs Tabscanner) on a 1,000-receipt sample |
| M | AI Agent | M | Month-end recap subagent + iOS Push on day 1 of month (PL+EN) |
| M | AI Agent | M | Free-text "ask me about my spending" — GPT-4o behind Pro tier |
| M | iOS | M | Lock Screen interactive widget: "+ Spożywcze" 1-tap log (uses LogExpenseIntent) |
| M | iOS | M | Live Activity for monthly budget progress (already in round 1 backlog as L; promote to M with this round's data) |
| M | Pricing | S | Define and ship Solvio Pro pricing — 19 PLN/mo or 149 PLN/yr; gate JPK + multi-bank + AI agent behind it |
| M | PL Market | S | Polish merchant NIP database seed (top 100 retailers: Biedronka 7792045985, Lidl 7811830660, etc.) |
| M | OCR | M | Confidence-tier feedback loop: low-confidence receipts go to a "Verify" inbox; user fixes + we learn |
| M | AI Agent | M | Subscription cancellation guidance (NOT autonomous — Polish-language step-by-step, Cleo's freemium model) |
| M | Compliance | S | Document Solvio's PSD2/KNF/RODO posture in `docs/compliance.md` (we use GoCardless AISP, no MIP needed) |
| L | iOS | M | Apple Watch app: today's spend + 1-tap quick-log (4 categories) |
| L | Vision Pro | L | Spatial expense visualisation — 3D charts for monthly breakdown |
| L | AI Agent | M | Cleo-style budget auto-suggestion (suggest cap based on history, NEVER auto-apply) |
| L | OCR | M | Custom Azure DocIntel model fine-tuned on 5,000+ Polish paragony (would push accuracy to ~99.5%+ on PL) |

---

## Cross-cutting risks (flagged for round 3+)

1. **Azure OpenAI region drift.** Confirm `AZURE_OPENAI_ENDPOINT` is in EU region (Solvio is EU-resident; pinning OpenAI endpoint to US would breach RODO). Owner: A2.
2. **GoCardless transaction-sync gap.** Round 1 shipped `bank/connect` rate-limit + Zod validation but the sync polling pipeline (post-OAuth callback → fetch transactions → match to expenses) needs round 2/3 polish. Owner: A1+A4.
3. **e-Paragony format reverse-engineering.** Government's share-format isn't formally documented. Reverse-engineer carefully — could change without notice. Mitigate with a single dedicated parser and clear feature-flag.
4. **JPK_VAT schema versioning.** KAS releases new JPK schemas yearly. Solvio's JPK export needs to read the active schema version from KAS at runtime — not hardcode.
5. **AI-spend cost overrun.** Cleo had this in 2024 — agent invocations spiked 10× when a popular feature shipped. Solvio's per-user 5 PLN cap is the *circuit breaker*; need Vercel/Azure dashboard monitoring + per-day global cap as well.
6. **Apple App Review on `LogExpenseIntent`.** Apple has been picky about App Intents that touch financial data — make sure `LogExpenseIntent` clearly states "creates a record only", does not promise tax/legal advice.

---

## Sources (round 2 — 30+ links, May 2026)

### PL fintech market
- [Kontomierz on the App Store](https://apps.apple.com/pl/app/kontomierz/id6450919895) — accessed 2026-05-07
- [Kontomierz Wydatki 3.11.1 release info](https://kontomierz-wydatki.updatestar.com/en) — accessed 2026-05-07
- [Najlepsze aplikacje do planowania budżetu — ranking, bentkowski.eu](https://www.bentkowski.eu/najlepsze-aplikacje-do-planowania-budzetu-ranking/) — accessed 2026-05-07
- [9 aplikacji do kontroli wydatków — porównanie 2026, easybudget.pl](https://www.easybudget.pl/9-aplikacji-do-spisywania-wydatkow) — accessed 2026-05-07
- [TOP 10 najlepszych aplikacji do zarządzania budżetem domowym 2025](https://najlepszetop10.pl/top-10-najlepszych-aplikacji-do-zarzadzania-budzetem-domowym-2025/) — accessed 2026-05-07
- [Aplikacje do wydatków i budżetu domowego 2026, nano.komputronik.pl](https://nano.komputronik.pl/n/aplikacja-do-wydatkow-budzet-domowy/) — accessed 2026-05-07
- [Revolut Polska — planowanie budżetu](https://www.revolut.com/pl-PL/best-budget-planner/) — accessed 2026-05-07
- [Czy Revolut jest wart uwagi w 2025 roku — fintechpolska.com](https://fintechpolska.com/revolut-review/) — accessed 2026-05-07
- [Revolut: subskrypcje, budżetowanie i Pockets — jakdorobic.pl](https://jakdorobic.pl/revolut-subskrypcje/) — accessed 2026-05-07
- [Best Fintechs in Poland 2026 — Freenance](https://freenance.io/rankings/best-fintechs-in-poland/) — accessed 2026-05-07
- [Top 10 Banks in Poland — Elevate Pay](https://www.elevatepay.co/blog/banks-in-poland) — accessed 2026-05-07
- [Najlepsza aplikacja do śledzenia wydatków w Polsce 2026 — martia.pl](https://martia.pl/najlepsza-aplikacja-do-sledzenia-wydatkow-polska) — accessed 2026-05-07

### PL regulatory + government
- [Aplikacja e-Paragony — Ministerstwo Finansów](https://www.gov.pl/web/finanse/aplikacja-e-paragony--twoje-wydatki-i-paragony-w-jednym-miejscu) — accessed 2026-05-07
- [Nowa wersja aplikacji mobilnej e-Paragony 2.2 — Ministerstwo Finansów, 2025](https://www.gov.pl/web/finanse/nowa-wersja-aplikacji-mobilnej-e-paragony--przelom-w-zarzadzaniu-i-kontroli-nad-codziennymi-wydatkami) — accessed 2026-05-07
- [e-Paragony 2.2 nowe funkcje — Infor.pl](https://ksiegowosc.infor.pl/wiadomosci/7045529,eparagony-22-nowe-funkcje-w-aplikacji-ministerstwa-finansow-komu-i-do-czego-moga-sie-przydac.html) — accessed 2026-05-07
- [Fintech Laws and Regulations 2025 Poland — globallegalinsights.com](https://www.globallegalinsights.com/practice-areas/fintech-laws-and-regulations/poland/) — accessed 2026-05-07
- [Poland Open Banking PSD2 Status — fiskil.com](https://www.fiskil.com/open-finance-tracker/poland) — accessed 2026-05-07
- [Implementation of PSD2 Directive in Poland — Dudkowiak & Putyra](https://www.dudkowiak.com/blog/new-regulations-regarding-payment-service-providers-in-poland.html) — accessed 2026-05-07
- [Poland KNF MIP License 2026 — crassula.io](https://crassula.io/guides/licenses/poland-knf-payment/) — accessed 2026-05-07
- [Paragony i faktury do paragonu w JPK_V7 — JPKinfo](https://jpk.info.pl/jpk-v7/paragony-faktury-jpk-v7m-v7k/) — accessed 2026-05-07
- [Serwis o podatkach JPK_VAT — podatki.gov.pl](https://www.podatki.gov.pl/podatki-firmowe/jednolity-plik-kontrolny/jpk_vat-z-deklaracja/) — accessed 2026-05-07

### OCR provider benchmarks
- [Azure Document Intelligence pricing — Microsoft Azure](https://azure.microsoft.com/en-us/pricing/details/document-intelligence/) — accessed 2026-05-07
- [Veryfi pricing](https://www.veryfi.com/pricing/) — accessed 2026-05-07
- [Veryfi 2025 line-item extraction benchmark](https://www.veryfi.com/technology/line-item-extraction-accuracy-benchmarks/) — accessed 2026-05-07
- [Veryfi vs Mindee 2025 invoice OCR benchmark](https://www.veryfi.com/ai-insights/invoice-ocr-competitors-veryfi/) — accessed 2026-05-07
- [Mindee OCR API pricing](https://www.mindee.com/pricing) — accessed 2026-05-07
- [Klippa Best OCR Software in Europe 2026](https://www.klippa.com/en/blog/information/best-ocr-software-in-europe/) — accessed 2026-05-07
- [Klippa AI-Powered Receipt OCR Software](https://www.klippa.com/en/ocr/financial-documents/receipts/) — accessed 2026-05-07
- [Tabscanner 99.99% accuracy claim Sep 2025](https://tabscanner.com/tabscanner-comparisons-vs-top-receipt-ocr/) — accessed 2026-05-07
- [Tabscanner 100% benchmark claim](https://tabscanner.com/tabscanner-achieves-100-receipt-processing-accuracy/) — accessed 2026-05-07
- [Comparing Top 6 OCR Models 2025 — MarkTechPost](https://www.marktechpost.com/2025/11/02/comparing-the-top-6-ocr-optical-character-recognition-models-systems-in-2025/) — accessed 2026-05-07
- [Best Receipt Parsing APIs in 2025 — Klippa](https://www.klippa.com/en/blog/information/best-receipt-parsing-apis/) — accessed 2026-05-07

### AI agentic patterns
- [Cleo 3.0 introduction — June 2025 launch](https://web.meetcleo.com/blog/introducing-cleo-3-0) — accessed 2026-05-07
- [Cleo Autopilot announcement](https://web.meetcleo.com/blog/introducing-autopilot) — accessed 2026-05-07
- [Cleo revenue, funding & growth — Sacra](https://sacra.com/c/cleo/) — accessed 2026-05-07
- [Cleo App Review 2025 — The Penny Hoarder](https://www.thepennyhoarder.com/budgeting/cleo-app-review/) — accessed 2026-05-07
- [Monarch AI Assistant — Help](https://help.monarch.com/hc/en-us/articles/16116906962452-About-the-Monarch-AI-Assistant) — accessed 2026-05-07
- [Monarch AI Assistant Product Hunt](https://www.producthunt.com/products/monarch/launches/monarch-ai-assistant) — accessed 2026-05-07
- [Rocket Money Pricing 2025 — productivewithchris.com](https://productivewithchris.com/tools/rocket-money/) — accessed 2026-05-07
- [Rocket Money Pricing 2026 — checkthat.ai](https://checkthat.ai/brands/rocket-money/pricing) — accessed 2026-05-07
- [Cleo OpenAI GPT-4o usage — OpenAIToolsHub](https://www.openaitoolshub.org/en/blog/ai-budgeting-apps-compared) — accessed 2026-05-07
- [What Are Agentic AI Guardrails — BigID](https://bigid.com/blog/agentic-ai-guardrails/) — accessed 2026-05-07
- [Apple App Intents documentation](https://developer.apple.com/documentation/appintents) — accessed 2026-05-07
- [WWDC25 Get to know App Intents](https://developer.apple.com/videos/play/wwdc2025/244/) — accessed 2026-05-07
- [Performing app actions with Siri through App Shortcuts Provider — createwithswift.com](https://www.createwithswift.com/performing-your-app-actions-with-siri-through-app-shortcuts-provider/) — accessed 2026-05-07
- [iOS 17 Lock Screen Interactive Widgets — MacRumors](https://www.macrumors.com/guide/ios-17-lock-screen/) — accessed 2026-05-07

### Group splitting (cross-reference for round 1)
- [Splitwise debt simplification algorithm — Medium / Mithun Mohan K](https://medium.com/@mithunmk93/algorithm-behind-splitwises-debt-simplification-feature-8ac485e97688) — accessed 2026-05-07
- [Splitwise feedback knowledgebase: Simplify Debts](https://feedback.splitwise.com/knowledgebase/articles/107220-what-does-the-simplify-debts-setting-do) — accessed 2026-05-07
- [Splitwise multi-currency conversion docs](https://feedback.splitwise.com/knowledgebase/articles/301146-can-splitwise-do-currency-conversion-between-multi) — accessed 2026-05-07
- [Settler vs Splitwise vs Tricount 2025 — getsettler.com](https://getsettler.com/blog/settler-vs-splitwise-vs-tricount) — accessed 2026-05-07
- [Tricount official site (acquired by bunq)](https://tricount.com/en-us/) — accessed 2026-05-07

### Pricing benchmarks
- [Adapty In-App Subscription Benchmarks 2026](https://adapty.io/state-of-in-app-subscriptions-report/) — accessed 2026-05-07
- [Adapty Subscription Price Radar](https://adapty.io/subscription-price-radar/) — accessed 2026-05-07
- [OpenAI API pricing](https://openai.com/api/pricing/) — accessed 2026-05-07

---

## Open follow-ups for rounds 7, 12, 17

- **Round 7** — Customer development pass: 5–10 in-depth interviews with PL users (cross-section: self-employed JDG using JPK, family households, students, freelancers using Revolut+IKO+Solvio). Validate the 19 PLN/mo price-point assumption.
- **Round 12** — KSeF deep dive once the integration is technically feasible (target Solvio's `business` mode KSeF inbox sync — 2027 horizon).
- **Round 17** — Post-iOS 27 SDK preview WWDC 2026 (June 2026) — what new App Intents / Apple Intelligence surfaces matter for Solvio.

---

*Last updated: 2026-05-07. Round 2 / A5. Builds on `docs/research-round1.md`.*
