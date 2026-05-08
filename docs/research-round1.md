# Solvio — Research Round 1: Best-in-Class Competitor & iOS Pattern Audit

**Date:** 2026-05-07
**Round:** 1 / 20 (production hardening loop)
**Agent:** A5 (research / competitive)
**Scope:** Competitor analysis, iOS UX patterns, accessibility, AI/OCR — applied to a Solvio-specific backlog.

---

## Executive summary — top 5 opportunities for Solvio

1. **Adopt Live Activities + Dynamic Island for ongoing budgets.** Both Copilot and MoneyCoach use Live Activities to surface "remaining today / this week / this category" without the user opening the app. Solvio already has `category_budgets` and a Dashboard surface — the iOS scaffolding (Live Activity widget extension + a budget-progress lock-screen presentation) is a high-leverage, low-friction differentiator on iPhone where Solvio competes with web-first apps (Monarch, YNAB). Effort: M.
2. **Ship App Intents / Siri "Log $30 lunch" voice entry.** Currently Solvio is camera-first (OCR) and form-first (manual). Voice expense-entry is a daily-driver UX win that competitors (Budget, Tripsy 3.4) already lean on. App Intents minimum target is iOS 16; Solvio already targets modern iOS — the cost is a single `LogExpenseIntent` plus a `ProvidesAppShortcuts` provider. Effort: S.
3. **Cash-flow projection (Monarch's flagship moat).** Monarch is the *only* mainstream app that shows "here's what you'll have left" by projecting balance over time using upcoming income + recurring expenses. Solvio already stores `isRecurring` on expenses and has receipts. A 30/60/90-day projection chart on Dashboard is mostly a query + a Recharts line chart — and immediately differentiates from Splitwise/Spendee. Effort: M.
4. **Interactive widgets for one-tap expense logging.** iOS 17+ widgets can fire App Intents directly from the Home/Lock Screen. MoneyCoach ships a numpad-style widget; Copilot ships a "spending today" widget. Solvio should ship at minimum: (a) Lock Screen "spent today" (b) Home Screen 2x2 "tap-category to pre-fill" widget. Effort: M.
5. **Receipt OCR cost & accuracy review.** Azure Document Intelligence (current) is the accuracy leader for printed receipts (98-99% field-level on benchmarks) but is expensive at scale. The hybrid pattern that's winning in 2025: cheap OCR (Azure prebuilt-receipt or Tesseract) feeds GPT-4o-mini for *parsing+normalization*, not raw OCR. Solvio already has Azure DocIntel + Azure OpenAI — verify the current pipeline doesn't re-OCR with the LLM (token waste) and migrate any raw-image-to-LLM paths to OCR-then-parse. Effort: S–M, depending on what's in `app/api/v1/ocr-receipt/route.ts`.

---

## Competitor analysis

### 1. Copilot Money — `https://www.copilot.money` — App Store: id1447330651
**What they nail:**
- **Best-in-class iOS design.** Widely cited as "the best-designed budgeting app for Apple users." Tight Apple integration: iPhone, iPad, Mac, Watch, Vision Pro.
- **AI categorization that learns.** Auto-tags transactions (e.g. DoorDash → "Food Delivery") after a few cycles. Custom rules + ML.
- **Adaptive budgeting + rollovers.** Underspending in one month rolls into the next — perfect for vacation/childcare lumpiness.
- **Recurring transaction detection.** The app *finds* your subscriptions automatically rather than asking you to declare them.
- **10,000+ institution coverage.** Including Venmo, Coinbase, Apple Card, Amazon — the long tail.
- **Web app added Dec 2025** (limited but exists) → finally cross-device for households where one partner is on Android.

**What Solvio could borrow:**
- Recurring-transaction *detection* (we already have an `isRecurring` flag — the value is in suggesting it from history, not requiring users to mark).
- "Rollover" budget mode for `category_budgets` — currently appears to be flat monthly; rollover unlocks the family-vacation use case.
- Polish the iOS Dashboard widget set (Copilot has set the bar visually).

### 2. Monarch Money — `https://www.monarch.com` — App Store: id1459319842
**What they nail:**
- **Cash-flow projection.** "Here's what you'll have left" — projects balance over time based on upcoming income and expenses. *Only mainstream app with this.*
- **Flex budgeting** — three buckets: fixed (rent/insurance), non-monthly (annual fees), flexible (everything else). Less micromanagement than YNAB.
- **Real-time partner collaboration** with comments + transaction assignment, *without* sacrificing privacy (partners don't necessarily see every personal expense).
- **Smart category rules** — suggests a rule when you re-categorize a transaction ("apply to all past + future Starbucks?").
- **2026 split into Core ($99/yr) + Plus ($199/yr)** — Plus targets power users / small-business.

**What Solvio could borrow:**
- **Cash-flow projection chart** for Dashboard (top opportunity #3 above).
- **Flex budgets** as an alternative to per-category strict budgets — three-bucket mode for users who hate granularity.
- **Rule suggestions** when a user re-categorizes ("apply this to all past Lidl?"). Solvio has receipt items + categories — the rule engine fits naturally.

### 3. YNAB (You Need A Budget) — `https://www.ynab.com`
**What they nail:**
- **Methodology, not just an app.** Four rules: (1) give every dollar a job (zero-based), (2) embrace true expenses, (3) roll with the punches, (4) age your money (spend dollars ≥30 days old).
- **Behavioral results.** Users report ~$600 saved in first 2 months, ~$6,000 in first year. Real behavior change.
- **Best for paying off debt + breaking paycheck-to-paycheck cycle** because the methodology forces deliberate choices.
- **Transaction import via Plaid/MX/TrueLayer** — secure, no credential-sharing.
- **34-day free trial; $14.99/mo or $109/yr.** Free for college students.

**What Solvio could borrow:**
- An **opinionated mode** on top of the freeform expense tracker — "Solvio Coach" mode that gives every PLN a job and surfaces "you have X PLN unallocated this month". Differentiates from passive trackers (Spendee, Wallet).
- "Age your money" KPI — show how old (in days) the average dollar in the user's spendable balance is. It's a *behavior* nudge.
- Strong educational content during onboarding (YNAB's stickiness comes from the methodology, not the app).

### 4. Splitwise — `https://www.splitwise.com` — App Store: id458023433
**What they nail:**
- **Reference standard for group expense splitting.** Equally / by percentage / by shares / by exact amount. Recurring bills (monthly/weekly/yearly/fortnightly).
- **Cross-device free** (iPhone + Android + web). Friends-and-family network effect: if your friend already has Splitwise, you join their existing graph.
- **Splitwise Pro ($5/mo):** receipt scanning + itemizing, multi-currency via Open Exchange Rates, "spending by category" charts, **card-link auto-import** (US only).
- **IOUs and informal debts** — supports loose tracking, not just structured group expenses.
- **10GB cloud receipt storage** for Pro.

**What Solvio could borrow:**
- **Itemized split from receipt** — Solvio already has `receipt_items` and `expense_splits`; combining them ("split this paragon line by line") is unique vs Splitwise's flat split. Solvio could ship "scan receipt → assign each item to whoever ate it" and beat Splitwise at its own game.
- **Recurring bill split** — Splitwise has recurring; Solvio's `isRecurring` + `expense_splits` can do the same with one cron job.
- **IOU mode** — quick informal debt outside a formal group ("Marek owes me 50 PLN for coffee, no receipt").

### 5. Tiller Money — `https://tiller.com`
**What they nail:**
- **Spreadsheet-first.** Auto-imports bank transactions into Google Sheets / Excel. For users who *want* total customization.
- **AutoCat rules** auto-categorize recurring transactions.
- **5 spreadsheets per subscription** ($79/yr).
- **Template library** — annual budgets, net worth, debt snowball, investment performance.

**What Solvio could borrow:**
- **CSV/Sheet export with rich formatting** — Solvio already has CSV reports; a "export to Google Sheets" Shortcut (via App Intents) hits the power-user segment without building a spreadsheet UI.
- **AutoCat-style category rules** — already covered by the Monarch borrow.

### 6. MoneyCoach — `https://moneycoach.ai` — App Store: id989642198
**What they nail:**
- **Apple ecosystem-first.** iPhone + iPad + Mac (iCloud sync) + Apple Watch + Vision Pro widgets.
- **Liquid Glass redesign in v11 (Sep 2025).** First-mover advantage on iOS 26 design language.
- **Interactive widgets with full numpad** — log expenses without opening the app (iOS 17+).
- **Live Activities** for budget tracking ("$X spent of $Y this month, X% used").
- **Family Sync** across different Apple IDs — neat alternative to shared accounts.
- **Personalized budgets, smart goals, real-time net worth, credit-card tracking.**

**What Solvio could borrow:**
- **Adopt Liquid Glass for the iOS app surface** (top opportunity #1 above) — Apple requires Xcode 26 + iOS 26 SDK for new submissions starting **April 2026** (deadline already past), so this is *catch-up*, not differentiation.
- **Numpad-style interactive widget** for expense entry (top opportunity #4 above).
- **Family Sync via iCloud** as a free alternative to a paid multi-user mode (avoids us needing a real account-sharing system server-side).

### 7. Spendee — `https://www.spendee.com` — App Store: id635861140
**What they nail:**
- **Visual-first design.** Pie charts and category color-coding are praised in reviews; "you don't just see your spending, you actually get it."
- **AI Receipt Scanner** (added 2025) — scan + auto-create transaction.
- **Shared wallets** for partners/roommates/family.
- **Multiple currencies** for travel.
- **Free tier with 4.6 App Store rating** + 5,000+ reviews — the "good enough free option."

**What Solvio could borrow:**
- **Travel mode / multi-currency wallets** — a "Trip" entity that wraps a date range, auto-converts via FX, and produces a trip-level summary. Solvio already has `groups` — extend with `tripCurrency` + FX.
- **Color-first category UX** — Solvio has `category_colors.ts` but ensure the iOS dashboard is as visually digestible as Spendee's.

### 8. Wallet by BudgetBakers — `https://budgetbakers.com` — App Store: id1032467659
**What they nail:**
- **Custom budgets** (week / month / year) with **forecast** based on spending habits.
- **Custom goals** with active/paused/reached states.
- **Sharing across 20 people** (Master Premium) for households with extended family or roommates.
- **Bank sync across multi-currency / multi-account / investments.**

**What Solvio could borrow:**
- **Goal lifecycle** (active/paused/reached/archived) — Solvio has `Goals` views; ensure the lifecycle is rich.
- **Forecast-on-budget** — "based on this month's pace, you'll overshoot by 8%" — straightforward calc once we have daily-spend trend.

### Honorable mentions (from search results)

- **Money Pro** — multi-account, multi-currency Mac+iOS, strong calendar view of upcoming bills.
- **Today's Budget** — daily allowance approach (very different mental model: "you get $X/day").
- **Finny** (`getfinny.app`) — newer iOS-first competitor cited in 2026 best-of lists.
- **TravelSpend** — has Apple Pay automation via Shortcuts (model for Solvio's `LogExpenseIntent`).

---

## iOS pattern catalog — 10 patterns Solvio should evaluate

| # | Pattern | Why it matters for Solvio | Effort |
|---|---------|---------------------------|--------|
| 1 | **Live Activities for active budget / weekly spend** | Competes with Copilot + MoneyCoach. Surfaces remaining-spend without app launch — biggest single retention lever on iPhone. Lock Screen + Dynamic Island presentations both supported. | M |
| 2 | **App Intents → Siri "Log $30 lunch"** | Hands-free expense entry. Min iOS 16 (Solvio is on iOS 17+ already). Should also expose `ScanReceiptIntent`, `ShowBudgetIntent`. | S |
| 3 | **Interactive widgets (Lock Screen + Home Screen)** | iOS 17+ lets a widget *fire an App Intent*. Numpad widget = MoneyCoach parity. Lock Screen "spent today" = Copilot parity. Combined with #2 (App Intents), this is mostly free. | M |
| 4 | **Liquid Glass / iOS 26 design adoption** | Apple deadline for Xcode 26 + iOS 26 SDK was April 2026. Use `.glassEffect()`, `.glassEffectID()` for the floating nav layer. Content stays at base level; glass controls float. **NOTE for A3 — verify they haven't already started this in their polished views.** | M |
| 5 | **Dynamic Type compliance (full range)** | WCAG 2.2 AA. Test at largest accessibility sizes — text overflow is the #1 finance-app a11y bug. Reuse `.font(.headline)` etc., never hardcode point sizes. | S |
| 6 | **Haptics: success / warning / selection / impact** | A3 has been polishing this aggressively — we don't need to do it but **document the pattern** in iOS UX rules so other agents don't regress. Per progress.md A3 has covered Groups, Analysis, Audit, Prices, Reports already. | S (docs only) |
| 7 | **Pull-to-refresh + swipe-to-delete with undo toast** | Industry-standard mobile UX. Solvio's `ReceiptsListView` already has both. Ensure consistency across all list views (Goals, Expenses, Categories). | S |
| 8 | **Background scan queue + multi-image OCR** | Already implemented (`ScanQueueManager`) per progress.md. Document as pattern; ensure Goals/Receipts handle queue states uniformly. | S (docs only) |
| 9 | **Apple Pay Automation via Shortcuts** | Auto-log when user taps to pay (TravelSpend model). Requires user-built Shortcut + Solvio App Intent. Document in onboarding. | S |
| 10 | **Vision Pro + Apple Watch widgets** | Long-tail Apple ecosystem coverage. Watch complication = "spent today" glance. Vision Pro spatial widget = MoneyCoach parity. **Defer to a later round** — narrow audience. | L |

---

## Accessibility checklist — 15 items Solvio should hit

| # | Item | WCAG 2.2 AA | iOS-specific |
|---|------|--------------|--------------|
| 1 | All interactive elements ≥ 24×24 pt (44×44 pt preferred per HIG) | 2.5.8 Target Size | HIG mandate |
| 2 | Color contrast ≥ 4.5:1 for text (3:1 for large text/icons) | 1.4.3 Contrast (Minimum) | — |
| 3 | Dynamic Type fully supported, tested at AX5 (largest) | 1.4.4 Resize Text | `.font(.body)` etc. |
| 4 | VoiceOver labels on every meaningful element (`accessibilityLabel`) | 4.1.2 Name, Role, Value | SwiftUI modifier |
| 5 | VoiceOver hints on actions (`accessibilityHint`) | 3.3.2 Labels | SwiftUI modifier |
| 6 | Currency amounts read as "fifty point three zero PLN" not "50.30" | — | `.accessibilityValue("\(amount, format: .currency(code: \"PLN\"))")` |
| 7 | Charts have `.accessibilityChartDescriptor` (audio graph) | 1.1.1 Non-text Content | iOS 15+ Charts |
| 8 | Color is **not** the only carrier of meaning (charts use shape/pattern) | 1.4.1 Use of Color | Color-blind safe |
| 9 | Charts pass deuteranopia + protanopia simulators (Coblis / Color Oracle) | 1.4.1 | — |
| 10 | All drag-to-reorder has a non-drag alternative | 2.5.7 Dragging Movements (NEW in 2.2) | iOS context menu |
| 11 | Reduce Motion respected (`@Environment(\.accessibilityReduceMotion)`) | 2.3.3 Animation from Interactions | SwiftUI env |
| 12 | Reduce Transparency respected (Liquid Glass falls back to opaque) | — | iOS-specific |
| 13 | Increase Contrast respected (`@Environment(\.colorSchemeContrast)`) | 1.4.6 Contrast (Enhanced) | SwiftUI env |
| 14 | All form fields have `accessibilityLabel` AND visible label | 3.3.2 | — |
| 15 | Errors announced via `.accessibilityNotification(.announcement(...))` | 4.1.3 Status Messages | iOS 17+ |

**Banking/Finance specifics (EAA — June 2025 enforcement):**
- Transactions, statements, and financial tools must be accessible regardless of disability.
- Biometric login (Face ID / Touch ID) must have a fallback (passcode, magic link).

---

## AI / OCR backlog — 8 specific improvements

| # | Improvement | Rationale | Effort |
|---|-------------|-----------|--------|
| 1 | **Audit `/api/v1/ocr-receipt` pipeline for redundant LLM OCR** | Sending raw images to GPT-4o is 167× more expensive than Azure DocIntel + GPT-4o-mini parsing. Verify Solvio uses Azure for OCR text extraction, then GPT only for normalization/categorization. | S |
| 2 | **Migrate parsing prompt to structured-output JSON schema** | OpenAI's "structured outputs" with a schema ensures `{ vendor, date, total, items: [...] }` always validates — eliminates the "GPT replied with prose, parse failed" class of errors. | S |
| 3 | **Use `gpt-4o-mini` for categorization, `gpt-4o` only for ambiguous receipts** | Cost split. Mini @ $0.15/M input vs full @ $2.50/M input. Categorization is solved-problem territory. | S |
| 4 | **Cache categorization decisions per (userId, vendor) tuple** | If user has bought from Lidl 50 times, the 51st doesn't need an LLM call — pull last category. | S |
| 5 | **Add `gpt-image-1` fallback for handwritten / smudged receipts** | When Azure DocIntel returns confidence < 0.5 or empty, fall back to vision LLM. Rare path, but the receipts that fail are the ones users care most about. | M |
| 6 | **Few-shot examples in OCR-parse prompt for PL receipts** | Polish vendor names, decimal commas, NIP/REGON numbers, VAT structure (23% / 8% / 5% / 0%) are domain-specific. 3-5 in-context examples in PL improve accuracy noticeably. | S |
| 7 | **Receipt deduplication via hash + perceptual similarity** | `receipts.hash` exists in schema. Compute over normalized vendor+date+total — flag dupes at upload time. Avoids the "I scanned the same paragon twice" annoyance. | S |
| 8 | **Cost telemetry for AI calls** | Log `{ userId, route, model, inputTokens, outputTokens, cost }` to `ai_usage` table. Lets us catch a bad prompt that's burning money before the bill arrives. Important now that we're growing. | M |

**Reference benchmarks:**
- Azure DocIntel: industry-leading on standard printed forms, 98–99% field-level accuracy on invoices.
- Veryfi: 99.56% line-item extraction (claimed), 97% manual-vs-automated parity.
- GPT-4o-mini for parsing: ~$2.50/1M input, $10/1M output (2025 pricing). Typical receipt: 2K input, 500 output ≈ $0.01 per receipt — viable.
- LLM-only OCR: 167× more expensive than dedicated OCR APIs; only justified for handwritten / non-standard.

---

## Prioritized backlog — 22 items

| # | Pri | Area | Effort | Item | Rationale |
|---|-----|------|--------|------|-----------|
| 1 | **H** | iOS | M | Live Activities for active budget tracking | Competes with Copilot + MoneyCoach; biggest retention lever on iPhone |
| 2 | **H** | iOS | S | App Intents: `LogExpenseIntent`, `ScanReceiptIntent`, `ShowBudgetIntent` | Voice + Spotlight + Shortcuts surface; min iOS 16 |
| 3 | **H** | iOS | M | Interactive widget — numpad expense entry (Home Screen) | MoneyCoach parity; combines with #2 |
| 4 | **H** | iOS | S | Lock Screen widget — "spent today" / "remaining this week" | Copilot parity; trivial once #2 lands |
| 5 | **H** | Backend | S | Audit OCR pipeline — eliminate any raw-image-to-LLM paths | Cost: 167× saving potential |
| 6 | **H** | Backend | S | Structured-output JSON schema for receipt-parse prompt | Eliminates parse-fail errors |
| 7 | **H** | UX | M | Cash-flow projection chart on Dashboard (30/60/90 day) | Monarch's flagship moat — copy it |
| 8 | **H** | a11y | S | Full Dynamic Type audit (test at AX5) on all iOS list views | WCAG 2.2 AA + EAA enforcement |
| 9 | **M** | UX | S | Recurring-transaction *detection* (suggest, don't require flag) | Copilot's auto-recurring is the magic |
| 10 | **M** | UX | M | Rule suggestions on re-categorization ("apply to all past Lidl?") | Monarch parity |
| 11 | **M** | iOS | S | Liquid Glass adoption for nav layer (`.glassEffect()`) | Apple deadline already past; verify against A3's recent work first |
| 12 | **M** | UX | M | Itemized receipt split — assign each `receipt_item` to a group member | Differentiates vs Splitwise |
| 13 | **M** | Backend | S | `gpt-4o-mini` for categorization + cache per (userId, vendor) | Cost: ~80% of categorization calls become free |
| 14 | **M** | UX | M | Flex-budgets mode (3 buckets: fixed / non-monthly / flexible) | Monarch parity; alternative for users who hate per-category |
| 15 | **M** | UX | S | Rollover budgets (underspending carries forward) | Copilot parity; trivial schema change to `category_budgets` |
| 16 | **M** | a11y | S | Charts: deuteranopia/protanopia palette + non-color encoding (shape/pattern) | 8% of male users; trivial in Recharts/Charts |
| 17 | **M** | iOS | S | "Trip" entity wrapping group + currency + date range with FX summary | Spendee parity for travel use case |
| 18 | **M** | UX | M | Receipt deduplication via hash + perceptual similarity at upload | UX win + DB hygiene |
| 19 | **L** | iOS | L | Apple Watch complication: "spent today" | Long-tail Apple coverage |
| 20 | **L** | iOS | L | Vision Pro spatial widget | MoneyCoach parity but tiny audience |
| 21 | **L** | UX | M | "Solvio Coach" mode — opinionated YNAB-style zero-based + "age your money" KPI | Differentiation play vs passive trackers |
| 22 | **L** | a11y | M | Audio graph (`.accessibilityChartDescriptor`) on Analysis charts | iOS 15+; WCAG 1.1.1 |

---

## Sources

### Competitor reviews (2025–2026)
- [Copilot Money Review 2026 — The Penny Hoarder](https://www.thepennyhoarder.com/budgeting/budgeting-copilot-money-review/)
- [Copilot Money Review — College Investor 2026](https://thecollegeinvestor.com/41976/copilot-review/)
- [Copilot Money Review (Updated 2026) — Money with Katie](https://moneywithkatie.com/copilot-review-a-budgeting-app-that-finally-gets-it-right/)
- [Monarch Money Review — The Motley Fool](https://www.fool.com/money/personal-finance/monarch-money-review/)
- [Monarch Money Review 2026 — The Penny Hoarder](https://www.thepennyhoarder.com/budgeting/monarch-money-review/)
- [Monarch Money 30-day Review — NerdWallet](https://www.nerdwallet.com/finance/learn/monarch-money-app-review)
- [YNAB Review 2025 — PersonalOne](https://personalone.org/you-need-a-budget-ynab-review/)
- [YNAB App Review 2025 — NerdWallet](https://www.nerdwallet.com/finance/learn/ynab-app-review)
- [Splitwise official site](https://www.splitwise.com/) + [Splitwise Pro](https://www.splitwise.com/pro)
- [Tiller Money Reviews 2025 — G2](https://www.g2.com/products/tiller-money/reviews)
- [How Tiller Works](https://tiller.com/how-tiller-works/)
- [MoneyCoach official](https://moneycoach.ai/) + [Changelog](https://moneycoach.ai/blog/moneycoach-app-changelog)
- [Spendee — App Store](https://apps.apple.com/us/app/expense-budget-app-spendee/id635861140)
- [Spendee Review 2026 — Frugal For Less](https://www.frugalforless.com/spendee-review/)
- [Wallet by BudgetBakers Review — Beebom](https://beebom.com/wallet-app-by-budgetbakers-review/)
- [Best iOS Budget Apps 2026 — Finny](https://getfinny.app/blog/best-ios-budget-apps-2026)
- [Best Budget Apps 2026 — NerdWallet](https://www.nerdwallet.com/finance/learn/best-budget-apps)

### iOS / Apple HIG / SwiftUI (2025–2026)
- [Liquid Glass UI — iOS 26 Tutorial — The Swift Kit](https://theswiftk.it.com/blog/liquid-glass-ui-swiftui-ios-26-tutorial)
- [Liquid Glass — Official Best Practices for iOS 26 — DEV.to](https://dev.to/diskcleankit/liquid-glass-in-swift-official-best-practices-for-ios-26-macos-tahoe-1coo)
- [SwiftUI Liquid Glass — Atelier Socle](https://www.atelier-socle.com/en/articles/swiftui-liquid-glass-guide)
- [iOS 26 Liquid Glass Reference — GitHub conorluddy](https://github.com/conorluddy/LiquidGlassReference)
- [iOS 26 Developer Guide — index.dev](https://www.index.dev/blog/ios-26-developer-guide)
- [App Intents + Siri Shortcuts in Swift — Commit Studio](https://commitstudiogs.medium.com/integrating-app-intents-and-siri-shortcuts-in-your-swift-app-7058df7eeaee)
- [Hey Siri, How Do I Use App Intents — Instil Software](https://instil.co/blog/siri-with-app-intents)
- [Tripsy 3.4: Apple Intelligence + Shortcuts + Intents](https://tripsy.blog/tripsy-3-4-shortcuts-intents-and-apple-intelligence/)
- [22 Examples of Live Activities — OneSignal](https://onesignal.com/blog/best-examples-of-apps-using-live-activities-to-enrich-their-ux/)
- [Apps with Live Activities + Dynamic Island — MacRumors](https://www.macrumors.com/2022/10/24/live-activities-dynamic-island-apps/)
- [iOS 17 Interactive Widgets — TechCrunch](https://techcrunch.com/2023/09/18/these-ios-17-apps-bring-interactive-widgets-to-your-iphone-home-screen/)
- [iOS 17 Interactive Widgets list — MacRumors](https://www.macrumors.com/2023/09/18/ios-17-interactive-widget-list/)
- [Apple HIG 2026 — Nadcab](https://www.nadcab.com/blog/apple-human-interface-guidelines-explained)
- [Implementing HIG with SwiftUI — Pavlos Simas](https://simaspavlos.medium.com/implementing-apples-human-interface-guidelines-hig-with-swiftui-64bdb8ceb2fc)
- [Dynamic Type + Accessibility in SwiftUI — Wesley Matlock](https://medium.com/@wesleymatlock/enhancing-your-swiftui-app-with-dynamic-type-and-accessibility-6b4bd84f4132)
- [Larger Text Evaluation Criteria — Apple Developer](https://developer.apple.com/help/app-store-connect/manage-app-accessibility/larger-text-evaluation-criteria/)
- [SwiftUI Sensory Feedback — Use Your Loaf](https://useyourloaf.com/blog/swiftui-sensory-feedback/)
- [How and When to use Haptic Feedback — Cracking Swift](https://medium.com/cracking-swift/how-and-when-to-use-haptic-feedback-for-a-better-ios-app-9bcfcc97393a)
- [Tap to Pay on iPhone — Apple Developer](https://developer.apple.com/tap-to-pay/)
- [TravelSpend Apple Pay Automation](https://help.travel-spend.com/shortcuts--automation/ignQHsp85RQDsig2QwVcdX/set-up-apple-pay-automation/7tL8XfjBceg4D7mQeiSK2V)

### Accessibility (WCAG 2.2 AA + finance)
- [Mobile App Accessibility & WCAG — Allyant](https://allyant.com/blog/mobile-application-accessibility-understanding-wcag-conformance-and-legal-requirements-for-your-native-applications/)
- [What WCAG 2.2 Means for Native Mobile — Deque](https://www.deque.com/blog/what-wcag-2-2-means-for-native-mobile-accessibility/)
- [Mobile App Accessibility 2026 — corpowid.ai](https://corpowid.ai/blog/mobile-application-accessibility-practical-humancentered-guide-android-ios)
- [iOS Accessibility VoiceOver Best Practices — Capital One Tech](https://medium.com/capital-one-tech/ios-accessibility-best-practices-for-the-voiceover-user-experience-dc08112ef16)
- [Accessibility Testing for Mobile Apps 2025 — AudioEye](https://www.audioeye.com/post/accessibility-testing-for-mobile-apps/)
- [Color Blind Friendly Palettes — Venngage](https://venngage.com/blog/color-blind-friendly-palette/)
- [Designing Charts for Color Blindness — Sigma](https://www.sigmacomputing.com/blog/data-charts-color-blindness)
- [Accessible Color Palettes — European Data Portal](https://data.europa.eu/apps/data-visualisation-guide/accessible-colour-palettes)
- [Best Charts for Colorblind Viewers — Datylon](https://www.datylon.com/blog/data-visualization-for-colorblind-readers)

### AI / OCR
- [Veryfi vs Google Cloud Vision vs Mindee Benchmark 2025](https://www.veryfi.com/ai-insights/invoice-ocr-competitors-veryfi/)
- [Veryfi 2025 Line-Item Accuracy Benchmark](https://www.veryfi.com/technology/line-item-extraction-accuracy-benchmarks/)
- [Receipt OCR Accuracy UK — Azure DocIntel vs Alternatives](https://www.receiptbridge.co.uk/ocr-accuracy/)
- [AWS Textract vs Google vs Azure vs GPT-4o — BusinessWare](https://www.businesswaretech.com/blog/research-best-ai-services-for-automatic-invoice-processing)
- [Azure OCR Comparison — Mistral, GPT, Document Intelligence](https://jannikreinhard.com/2026/01/12/master-the-paper-chaos-comparing-azures-ocr-and-document-intelligence-powerhouses/)
- [Choose the right Azure AI tool for document processing — MS Learn](https://learn.microsoft.com/en-us/azure/ai-services/content-understanding/choosing-right-ai-tool)
- [LLMs vs OCR APIs — hidden cost trap — Mindee](https://www.mindee.com/blog/llm-vs-ocr-api-cost-comparison)
- [Prompt engineering for structured data with GPT-4o — Frontiers](https://www.frontiersin.org/journals/artificial-intelligence/articles/10.3389/frai.2025.1558938/full)
- [OpenAI Prompt Guidance](https://developers.openai.com/api/docs/guides/prompt-guidance)
- [GPT-4o Vision Guide — getstream](https://getstream.io/blog/gpt-4o-vision-guide/)
- [DeepSeek-OCR vs GPT-4 Vision 2025](https://skywork.ai/blog/ai-agent/deepseek-ocr-vs-gpt-4-vision-2025-comparison/)

### Onboarding / UX
- [UX Onboarding Best Practices 2025 — UX Design Institute](https://www.uxdesigninstitute.com/blog/ux-onboarding-best-practices-guide/)
- [Apps with Great Onboarding 2026 — UXCam](https://uxcam.com/blog/10-apps-with-great-user-onboarding/)
- [Mobile App Onboarding Guide 2026 — VWO](https://vwo.com/blog/mobile-app-onboarding-guide/)

---

## Open follow-ups for next research rounds (rounds 6, 11, 16)

### Round 6 — focused topics
- **Apple Wallet pass + Tap-to-Pay automation** — deep dive on TravelSpend's Apple Pay automation pattern. Can Solvio build a "tap to pay = auto-log" workflow that doesn't require manual user-built Shortcut?
- **PSD2 / Open Banking comparison** — Solvio uses GoCardless (Nordigen). Compare with Plaid (US), TrueLayer (EU), Tink. Cost vs coverage in PL specifically.
- **Russian/Ukrainian/Czech market expansion** — currency support, vendor name normalization, OCR accuracy on Cyrillic / Czech receipts.

### Round 11 — focused topics
- **AI agentic patterns** — "Solvio Agent" that reads transactions weekly and suggests budget adjustments + flags anomalies. Compare with Cleo, Albert.
- **Subscription detection** — Rocket Money / Truebill specialist comparison; how do they detect "you're paying for Spotify on 2 cards"?
- **Investment tracking entry point** — Monarch + Copilot both moved into investment tracking. Decide if this is in Solvio's scope or out.

### Round 16 — focused topics
- **Latest iOS SDK additions** (post-iOS 26 patch updates) — re-audit for new APIs.
- **Performance benchmarks** — measure Solvio iOS bundle size vs Copilot, MoneyCoach, Spendee.
- **App Store reviews mining** — pull recent Solvio App Store reviews; compare top complaints with competitor complaint patterns to find blind spots.

---

*This document is the canonical research output for round 1 of the production hardening loop. It feeds the prioritized backlog used by future agents in rounds 2–20. Update with new findings; do not delete.*
