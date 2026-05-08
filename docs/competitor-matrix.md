# Solvio Competitor Matrix

Where Solvio sits relative to the major personal-finance / expense-tracking apps in 2026. See [`research-round1.md`](./research-round1.md) for the full reviews + sources.

---

## Feature matrix

Legend: ✅ has it · 🟡 partial · ❌ missing · ➖ not applicable / out of scope

| Feature | **Solvio** | Copilot | Monarch | YNAB | Splitwise | Tiller | MoneyCoach | Spendee | Wallet (BB) |
|---|---|---|---|---|---|---|---|---|---|
| **Receipt OCR** | ✅ Azure DocIntel | ❌ | ❌ | ❌ | ✅ Pro | ❌ | 🟡 | ✅ AI Scanner | ✅ |
| **Manual expense entry** | ✅ | ✅ | ✅ | ✅ | ✅ | 🟡 (sheet) | ✅ | ✅ | ✅ |
| **Category budgets** | ✅ monthly | ✅ adaptive + rollover | ✅ flex (3-bucket) | ✅ zero-based | ❌ | ✅ template | ✅ personalized | ✅ | ✅ week/month/year |
| **Group expense splitting** | ✅ | ❌ | 🟡 partner only | ❌ | ✅ best in class | ❌ | ❌ | 🟡 shared wallets | 🟡 share with 20 |
| **Itemized split (per receipt line)** | 🟡 schema ready | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Cash-flow projection** | ❌ | 🟡 | ✅ flagship | ❌ | ❌ | 🟡 (sheet) | ❌ | ❌ | ✅ forecast |
| **Recurring transaction detection** | 🟡 manual flag | ✅ auto | ✅ | ✅ | ✅ | 🟡 AutoCat | ✅ | 🟡 | ✅ |
| **Categorization rules** | 🟡 manual | ✅ ML | ✅ rule suggest | ✅ | 🟡 | ✅ AutoCat | ✅ | ✅ | ✅ |
| **Bank sync (PSD2 / Plaid)** | ✅ GoCardless | ✅ 10K+ inst. | ✅ | ✅ Plaid/MX/TL | ❌ | ✅ 21K+ | ✅ | ✅ | ✅ |
| **Multi-currency** | ✅ | ✅ | ✅ | 🟡 | ✅ Pro | ✅ | ✅ | ✅ | ✅ |
| **Investment tracking** | ❌ | ✅ | ✅ | 🟡 | ❌ | ✅ template | ✅ net worth | ❌ | ✅ |
| **AI spending analysis** | ✅ | ✅ | 🟡 | ❌ | ❌ | ❌ | 🟡 | 🟡 | ❌ |
| **Reports (CSV / PDF / DOCX)** | ✅ all 3 | 🟡 CSV | 🟡 CSV | ✅ | ✅ in-sheet | 🟡 CSV | 🟡 | 🟡 | ✅ |
| **Bilingual (PL / EN)** | ✅ | ❌ EN only | ❌ EN only | ❌ EN only | ✅ many | ❌ EN only | 🟡 | ✅ many | ✅ many |
| **Web app** | ✅ | 🟡 added Dec 2025 | ✅ | ✅ | ✅ | ✅ Sheets/Excel | ❌ | ✅ | ✅ |
| **iOS app** | ✅ SwiftUI | ✅ best-in-class | ✅ | ✅ | ✅ | ❌ | ✅ Liquid Glass v11 | ✅ | ✅ |
| **Android app** | ❌ | ❌ | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ |
| **Live Activities** | ❌ | 🟡 | ❌ | ❌ | ❌ | ➖ | ✅ budget tracking | ❌ | ❌ |
| **Interactive widgets** | ❌ | ✅ | ❌ | ❌ | ❌ | ➖ | ✅ numpad | ❌ | ❌ |
| **Apple Watch app** | ❌ | ✅ | ✅ | ✅ | ❌ | ➖ | ✅ | ✅ | ❌ |
| **Vision Pro** | ❌ | ✅ | ❌ | ❌ | ❌ | ➖ | ✅ widgets | ❌ | ❌ |
| **App Intents / Siri** | ❌ | 🟡 | ❌ | ❌ | ❌ | ❌ | 🟡 | ❌ | ❌ |
| **Tap-to-Pay automation** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | 🟡 (Shortcuts) |
| **Goals tracking** | ✅ | ✅ | ✅ | ✅ | ➖ | ✅ template | ✅ smart goals | ❌ | ✅ active/paused/reached |
| **Price comparison (AI)** | ✅ unique | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Shopping audit (AI)** | ✅ unique | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

---

## Pricing

| App | Free tier | Paid |
|---|---|---|
| **Solvio** | (TBD — currently free) | TBD |
| Copilot Money | ❌ | $13/mo or $95/yr |
| Monarch Money | 🟡 7-day trial | Core $99/yr · Plus $199/yr |
| YNAB | 🟡 34-day trial · free for college students | $14.99/mo or $109/yr |
| Splitwise | ✅ free | Pro ~$5/mo |
| Tiller Money | 🟡 30-day trial | $79/yr |
| MoneyCoach | ✅ free tier | premium varies |
| Spendee | ✅ free | premium varies |
| Wallet (BudgetBakers) | ✅ free | premium varies (Master Premium adds 20-person sharing) |

---

## Solvio's strengths (vs the field)

- **Bilingual PL/EN** out of the box — competitors that aren't Czech/PL native (Spendee is Czech, Wallet is Czech) ship English-only.
- **AI shopping audit + price comparison** — uniquely positioned; nobody else combines OCR + LLM + web search this way.
- **Group splitting + receipts on the same backend** — Splitwise does splits well but doesn't OCR. Wallet/Spendee do OCR but treat groups as an afterthought. Solvio's `receipt_items` + `expense_splits` schema is the ingredient nobody else has wired together.
- **Reports in 3 formats (CSV / PDF / DOCX)** — most competitors stop at CSV.
- **Self-owned infrastructure** (Neon + Vercel + Azure) — no Plaid lock-in, no third-party identity provider.

---

## Solvio's gaps (and what to copy from whom)

| Gap | Best-in-class to learn from | Effort |
|---|---|---|
| Live Activities for budget tracking | **MoneyCoach** | M |
| Interactive widget for one-tap log | **MoneyCoach** + **Copilot** | M |
| App Intents / Siri voice entry | TravelSpend pattern; Tripsy 3.4 | S |
| Cash-flow projection chart | **Monarch** (their flagship) | M |
| Recurring detection (auto, not manual) | **Copilot** | M |
| Adaptive / rollover budgets | **Copilot** | S |
| Flex 3-bucket budget mode | **Monarch** | M |
| Itemized receipt split | nobody — Solvio can ship first | M |
| Investment tracking | **Copilot** + **Monarch** (decide if in scope) | L |
| Watch + Vision Pro complications | **MoneyCoach** | L |
| Liquid Glass / iOS 26 design | **MoneyCoach v11** | M |
| Android app | **Monarch** + **Spendee** | XL |

---

## Strategic positioning

Solvio's wedge is **"the iPhone-first PL/EN expense tracker that also splits receipts line-by-line and tells you where you overpaid."** That sentence has no direct competitor:

- Copilot owns "best-designed iOS app for individual users"
- Monarch owns "household financial planner"
- YNAB owns "behavioral methodology"
- Splitwise owns "splitting flat / trip / household bills"
- Spendee/Wallet/MoneyCoach own "good free or freemium tracker"
- Tiller owns "spreadsheet power user"

Nobody owns **"AI tells you where you should have shopped + splits the receipt with your roommate + speaks Polish."** That's where the prioritized backlog in [`research-round1.md`](./research-round1.md) is pointed.

---

*Last updated: 2026-05-07 (round 1 research). Update when feature parity changes or major competitor releases ship.*
