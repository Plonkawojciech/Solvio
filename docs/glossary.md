# Solvio — Glossary (PL/EN regulatory + technical terms)

Quick lookup for terms that appear in `progress.md`, `docs/research-round*.md`, and the Solvio code/UI. PL/EN bilingual; PL terms first because they dominate the Polish-fintech context.

---

## A — Polish regulatory

| Term | Polish full form | English | What it means for Solvio |
|---|---|---|---|
| **AISP** | Account Information Service Provider (PSD2) | Same | Solvio uses GoCardless (a licensed AISP) — so Solvio itself does NOT need a KNF license to read user bank data. |
| **PISP** | Payment Initiation Service Provider (PSD2) | Same | Solvio is NOT a PISP. We never initiate payments. Stays out of MIP-license scope. |
| **TPP** | Third-Party Provider (PSD2 umbrella) | Same | Generic term for AISP + PISP + CAF (Confirmation of Funds Provider). |
| **PSD2** | Payment Services Directive 2 (EU 2015/2366) | Same | Single EU-wide rules for open banking. PL transposed via amendments to *Ustawa o usługach płatniczych*. |
| **KNF** | Komisja Nadzoru Finansowego | Polish Financial Supervision Authority | Sole supervisor for fintech, banking, insurance in PL. Issues MIP licenses. |
| **MIP** | Mała Instytucja Płatnicza | Small Payment Institution | Lightweight PL payment license. Solvio doesn't need it under current scope (read-only AIS). |
| **KAS** | Krajowa Administracja Skarbowa | National Revenue Administration | Polish tax authority. Runs e-Paragony, JPK, KSeF systems. |
| **JPK** | Jednolity Plik Kontrolny | Standard Audit File for Tax | XML format for tax records that Polish businesses file with KAS. |
| **JPK_VAT / JPK_V7M / JPK_V7K** | JPK for VAT (monthly = M, quarterly = K) | Same | Mandatory monthly VAT records for VAT-registered Polish businesses. Solvio should ship JPK_VAT export at `/api/reports/jpk` (round 2 backlog). |
| **JPK_FA** | JPK Faktury | JPK Invoices | XML for B2B invoice records. Less relevant to Solvio (we deal with paragony, not faktury). |
| **KSeF** | Krajowy System e-Faktur | National e-Invoicing System | Mandatory PL B2B e-invoice central system. Phased rollout. Future Solvio integration target (2027+). |
| **NIP** | Numer Identyfikacji Podatkowej | Tax Identification Number | Polish company tax ID (10 digits). Required for B2B receipts/invoices. Solvio should add `vendorNip` to `receipts` schema. |
| **REGON** | Rejestr Gospodarki Narodowej | National Business Register | PL business registry. Public API. Use to enrich vendor info from NIP. |
| **PKO BP** | Powszechna Kasa Oszczędności Bank Polski | Largest PL bank | Biggest PL bank by assets. Direct PSD2 API at `developers.pkobp.pl`. Solvio uses GoCardless abstraction. |
| **mBank, ING Bank Śląski, Pekao, Santander Bank Polska** | — | Top-5 PL retail banks | Solvio reaches all five via GoCardless AISP. |
| **paragon** | paragon fiskalny | Cash register receipt (printed) | What Solvio's OCR pipeline scans. Standardized format under Ustawa o VAT. |
| **e-paragon** | paragon elektroniczny | Electronic receipt | Cryptographically-signed receipt transmitted via cash register to user's e-Paragony app. No OCR needed. |
| **e-Paragony** | (proper noun — the app) | (proper noun) | Polish Ministry of Finance app released March 2025. ~73k users by mid-2025. Free, anonymous, government-trusted. Both competitor and integration target for Solvio. |
| **RODO** | Rozporządzenie o Ochronie Danych Osobowych | GDPR | Polish term for EU GDPR. Solvio is RODO-compliant (Neon eu-central-1, Azure EU regions). |
| **kasa fiskalna** | — | Fiscal cash register | Mandatory for B2C sellers in PL. Issues paragony with VAT breakdown. |

---

## B — Solvio technical / architectural

| Term | Meaning |
|---|---|
| **Solvio Agent** | (planned, round 2 backlog) — LLM-powered subagent system for subscription detection, anomaly detection, budget tracking, month-end recap. NEVER moves money. |
| **Two-tier OCR** | (planned, round 2 backlog) — Azure DocIntel as Tier 1; GPT-4o-mini parser on Azure's text output as Tier 2 fallback when confidence/vendor/total fails. |
| **OCR provenance** | (planned, round 2 backlog) — `receipts.metadata` field tracking which tier filled which structured field. Debug + future provider comparison. |
| **`merchantRules`** | DB table that learns vendor → category mapping from user corrections. Round 1 / A4 fix made PUT also update it (was POST-only). |
| **`expense_splits`** | DB table for group expense splits. Stores `splits` jsonb array. |
| **`payment_requests`** | DB table for settlement requests. Status: pending / settled / declined. |
| **iOS = produkt** | Solvio's product surface IS the iOS app (SwiftUI, native). Web `(protected)` routes are legacy maintenance, not the future. |
| **Web `(marketing)`** | Public landing page route group. SEO surface. |
| **AppShortcutsProvider** | (planned, round 2 backlog) — iOS surface that exposes Solvio to Siri, Shortcuts app, Spotlight, Lock Screen widgets via `LogExpenseIntent`. |
| **Live Activity** | iOS 16+ surface for ongoing-state widgets (budgets / savings goals). Round 1 backlog. |

---

## C — Competitor / market

| Term | Meaning |
|---|---|
| **Splitwise** | Reference standard for group expense splitting. Free cross-device. Pro $5/mo. Uses approx-poly-time algorithm for debt simplification (NP-complete problem). |
| **Splitwise debt simplification** | The "simplify debts" toggle that minimizes total number of payments by reusing transitive obligations. Approximation algorithm (problem is NP-complete). |
| **Settle Up / Tricount** | EU-popular group splitting alternatives. Tricount acquired by bunq. Both lack item-level splitting. |
| **Cleo** | UK fintech AI assistant. 850k paying subs (2025), $280M ARR. Uses GPT-4o. Cleo 3.0 introduced agentic architecture. |
| **Rocket Money / Truebill** | US subscription-tracker + bill-cancellation. Pay-what-you-want $7-$14/mo Premium tier. Auto-detects subscriptions from transactions. |
| **Monarch Money** | US/Canada budgeting app. AI Assistant launched 2024. Cash-flow projection (round 1 finding). Core $99/yr + Plus $199/yr (2026). |
| **Copilot Money** | Apple-ecosystem budgeting app. Best iOS design in segment. Auto-categorization that learns. |
| **MoneyCoach** | Apple-ecosystem-only budgeting app. First to ship Liquid Glass on iOS 26. Numpad widget + Live Activities. |
| **Kontomierz** | Long-running PL budgeting app (since 2009). Sold to Finelf.com 2021. Strong PL bank-aggregation; weak on iOS UX + receipts. |
| **Revolut Polska budget** | Free budget feature inside Revolut app. AI assistant launched 2025. Auto-categorization, per-category caps, push warnings, Pockets goal-saving. |
| **e-Paragony app** | See "e-Paragony" in section A. |

---

## D — OCR provider names (round 2)

| Term | Meaning |
|---|---|
| **Azure Document Intelligence (DocIntel)** | Microsoft's OCR + structured-doc extraction. Solvio's current provider. Prebuilt-receipt model. $10/1k pages. |
| **`prebuilt-receipt`** | Azure's purpose-built receipt extraction model. Multilingual base. |
| **Veryfi** | US receipt-OCR specialist. $0.08/receipt @ $500/mo minimum. 99.56% line-item benchmark (self-reported, 2025). |
| **Mindee** | EU/France-based OCR. Free 250 docs/mo tier. |
| **Klippa DocHorizon** | NL-based receipt OCR. Custom pricing. EU residency by default (Amsterdam). |
| **Tabscanner** | Receipt-specialist. 99.99% claim Sep 2025 (high-tier with HITL). 99% standard. Real-time API. |
| **Taggun** | AU/EU receipt OCR. Mid-tier. |
| **AWS Textract Analyze Expense API** | Amazon's receipt extractor. $10/1k pages. EU regions available. |
| **Google Document AI** | Google's OCR. Multiple processors. Strong base OCR. |
| **HITL (Human-In-The-Loop)** | Receipt-OCR pattern where low-confidence outputs are routed to human reviewers. Tabscanner offers as an add-on. |

---

## E — AI / LLM-specific

| Term | Meaning |
|---|---|
| **Azure OpenAI** | Microsoft-hosted OpenAI models. EU regions available (West Europe, North Europe). Solvio's primary AI provider. |
| **GPT-4o-mini** | Cheaper OpenAI model. ~$0.15/1M input tokens. Solvio's recommended model for structured tasks (categorization, parser fallback, subagents). |
| **GPT-4o** | OpenAI's flagship. 5× pricier than mini. Used for free-text "ask me anything" features (Cleo, Monarch). |
| **Structured outputs (Zod-validated)** | LLM call pattern: response schema enforced server-side. Reduces hallucination. Recommended for Solvio Agent. |
| **Agentic guardrails** | The set of constraints (rate-limit, action-confirmation, cost-cap, no-autonomous-money-movement) that keep an LLM agent safe in production. |
| **Subagent** | Specialized LLM call scoped to a single task (e.g. "detect subscriptions from these 90 days of expenses"). Returns typed JSON, not freeform text. |
| **Context window** | The number of tokens an LLM can read in one call. GPT-4o = 128k, GPT-4o-mini = 128k. |
| **Token (LLM)** | Subword unit. Polish ≈ 0.6 tokens per character (more than English's 0.25 tokens/char). 1k Polish characters ≈ 600 tokens. |

---

## F — Apple platform

| Term | Meaning |
|---|---|
| **App Intents** | iOS 16+ framework. Defines actions your app exposes to system surfaces (Siri, Shortcuts, Spotlight, widgets). |
| **AppShortcutsProvider** | Static-var protocol. Exposes app-level shortcuts to Siri (no per-user training needed). |
| **`LogExpenseIntent`** | (planned for Solvio) — single-method `AppIntent` for "log X PLN at Y vendor". |
| **Live Activity** | iOS 16+ ongoing-state widget on Lock Screen + Dynamic Island. |
| **Liquid Glass** | iOS 26 design language. Translucent + depth-aware UI. Solvio targets iOS 26 SDK (round 1 confirmed). |
| **Interactive Widget** | iOS 17+ widget that fires App Intents directly without opening the app. Used for one-tap quick-log. |
| **Apple Intelligence** | Apple's on-device + private-cloud LLM platform. Surfaces Siri/Writing Tools/Image Playground; integrates with App Intents. iOS 26+. |
| **Spotlight** | Apple's system-wide search. App Intents surface here automatically. |

---

*Last updated: 2026-05-07 (round 2 / A5). Append new terms as they appear in `progress.md`.*
