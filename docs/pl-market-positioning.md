# Solvio — PL Market Positioning (1-page)

**Status:** round 2 / A5 finding. Source: `docs/research-round2.md` Part 1.

---

## Tagline (PL)

> **Solvio — jedyna apka w Polsce, która łączy paragony, banki i grupy w jednym.**

## Tagline (EN)

> **Solvio — the only Polish app that combines receipts, banks, and group splits in one.**

---

## The 4 layers of the PL expense-app market (and where Solvio fits)

```
┌──────────────────────────────────────────────────────────────────┐
│  Layer A — Bank-native budgeting (free, default-on)              │
│  Revolut Polska / mBank / ING / PKO IKO / Pekao / Santander      │
│  Strength: zero-friction; auto-cat from MCC.                     │
│  Weakness: single bank, no receipts, no groups.                  │
│                                                                  │
│  ◄── Solvio aggregates ALL of these via GoCardless AISP.         │
└──────────────────────────────────────────────────────────────────┘
┌──────────────────────────────────────────────────────────────────┐
│  Layer B — Polish-native budget apps (paid, niche)               │
│  Kontomierz / EasyBudget / Cardina / Monefy                      │
│  Strength: PL-language, PL-bank-aware.                           │
│  Weakness: web-first; weak iOS UX; no receipt OCR; no groups.    │
│                                                                  │
│  ◄── Solvio dominates on iOS UX + receipts + groups.             │
└──────────────────────────────────────────────────────────────────┘
┌──────────────────────────────────────────────────────────────────┐
│  Layer C — Government / state-backed (free, growing)             │
│  e-Paragony (Ministerstwo Finansów / KAS, ~73k users mid-2025)   │
│  Strength: free, government-trusted, cryptographically-signed,   │
│            POS-acquisition (no marketing needed).                │
│  Weakness: e-receipts only (paper paragony out of scope);        │
│            no bank integration; no groups; no JPK export.        │
│                                                                  │
│  ◄── Solvio integrates e-Paragony share-format and adds          │
│      paper paragony OCR + bank aggregation + groups + JPK.       │
└──────────────────────────────────────────────────────────────────┘
┌──────────────────────────────────────────────────────────────────┐
│  Layer D — International best-of-breed (English-first)           │
│  Splitwise / Copilot / Monarch / YNAB / Cleo / Rocket Money      │
│  Strength: best UX in their narrow domain.                       │
│  Weakness: no PL bank integration; no JPK; no Polish-receipt OCR │
│            tuning; PL UI may be machine-translated.              │
│                                                                  │
│  ◄── Solvio matches on UX, wins on PL fitness.                   │
└──────────────────────────────────────────────────────────────────┘
```

---

## What Solvio uniquely combines (the 5×5 moat)

| | Solvio | Revolut | Kontomierz | e-Paragony | Splitwise |
|---|---|---|---|---|---|
| **PL bank aggregation** | ✅ via GoCardless | partial (one bank) | ✅ | ❌ | ❌ |
| **Paper paragon OCR** | ✅ Azure DocIntel | ❌ | ❌ | ❌ | ✅ Pro only |
| **e-Paragon import** | ⏳ planned | ❌ | ❌ | ✅ native | ❌ |
| **Group expense splitting** | ✅ line-item | ❌ | ❌ | ❌ | ✅ flat |
| **JPK_VAT export** | ⏳ planned | ❌ | ❌ | ❌ | ❌ |

Solvio is the ONLY entry that combines all five rows. Each row alone has a strong incumbent — but no one row has all five.

---

## Solvio's defensible position (5 sentences)

1. **For Polish individuals:** Solvio aggregates your bank transactions (PSD2 via GoCardless) AND your paper paragony (Azure OCR) AND your e-paragony (planned import) AND your group trips (line-item splits). No other PL app does all four.
2. **For Polish self-employed (JDG / firma):** Solvio plans to ship JPK_VAT XML export from receipts — the first PL app combining receipt OCR with native JPK output. (Round 2 backlog item.)
3. **For Polish iPhone power users:** Solvio is iOS-first with SwiftUI + Live Activities + App Intents + Lock Screen widgets — the segment Polish-native apps (Kontomierz, EasyBudget) under-serve because they are web-first.
4. **For Polish families:** Solvio's `groups` model with line-item splitting handles "split the Lidl receipt: I had the milk + bread, you had the cheese" — Splitwise still requires manual entry of the split amount.
5. **For Polish privacy-conscious users:** Solvio runs on EU infrastructure (Neon eu-central-1, Azure West/North Europe) — RODO-native, no US data transfers.

---

## Pricing recommendation (PL ARPU benchmarks)

- **Solvio Free** — manual expenses, 5 receipts/mo OCR, 1 group, 1 bank connection.
- **Solvio Pro — 19 PLN/mo or 149 PLN/yr** — unlimited receipts, AI agent (subscription detection + anomaly + month-end recap), JPK export, multi-bank, Live Activity, Lock Screen widget, unlimited groups.
- **Sliding-scale option** (Cleo / Rocket pattern) — let users pay 9 / 14 / 19 PLN, all features unlocked at every tier. Higher avg ARPU than fixed-price; better goodwill.

PL paying-user willingness for finance/utility apps: median 15–25 PLN/mo. Conversion 2–4%. At 19 PLN × 3% conversion × 100k users = 57,000 PLN/mo MRR ≈ 684,000 PLN/yr.

---

## Round 2+ priority order for shipping the moat

1. **Solvio Pro pricing + paywall scaffolding** (19 PLN/mo or 149 PLN/yr) — Required before everything below makes commercial sense.
2. **e-Paragony share-format import** — Round 2 backlog Pri H. Defensive moat against the free government app.
3. **JPK_VAT export at `/api/reports/jpk`** — Round 2 backlog Pri H. The only PL app combining receipt OCR + JPK.
4. **iOS App Intents (`LogExpenseIntent` + `AppShortcutsProvider`)** — Round 2 backlog Pri H. Apple Intelligence surface unlock.
5. **Solvio Agent (subscription detection, anomaly, month-end recap)** — Round 2 backlog Pri H. The conversational layer over the data we already have.

---

*Last updated: 2026-05-07 (round 2 / A5).*
