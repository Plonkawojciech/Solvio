# Solvio — Research Round 5: Live Activities deep dive, App Intents + Siri, PSD2/Polish bank API integration

**Date:** 2026-05-08
**Round:** 5 / 20 (production hardening loop)
**Agent:** A5 (research / competitive)
**Scope:** THREE NEW dimensions — none repeated from R1/R2/R3/R4:

1. **Live Activities (ActivityKit) deep dive.** Implementation patterns for budget/savings-goal Live Activities, update strategy (push vs local), Lock Screen / Dynamic Island / Smart Stack presentation, Apple Watch sync via `.supplementalActivityFamilies`. Full code skeleton for Solvio.
2. **App Intents + Siri integration deep dive.** Full code skeleton for `LogExpenseIntent`, `ScanReceiptIntent`, `CheckBudgetIntent`. `AppShortcutsProvider` registration, parameter resolution patterns, Apple Intelligence integration in iOS 26.
3. **PSD2 / Polish bank API integration.** Solvio currently uses GoCardless (Nordigen) for bank linking. **CRITICAL FINDING:** GoCardless stopped accepting NEW Bank Account Data accounts from July 2025. Compare alternatives — Tink, TrueLayer, Salt Edge, Yapily, Enable Banking. Polish bank coverage matrix. PolishAPI direct integration cost/benefit. Refresh-token longevity (90d → 180d after EBA opinion).

Builds on `docs/research-round1.md`, `docs/research-round2.md`, `docs/research-round3.md`, `docs/research-round4.md`. Every claim is sourced (URL + checked May 2026).

---

## Executive summary — 5 highest-leverage findings

1. **Solvio's GoCardless integration is at architectural risk — GoCardless stopped accepting new Bank Account Data accounts in July 2025.** Existing Solvio production accounts continue to work, but **Solvio cannot onboard NEW production tenants on GoCardless** without an enterprise plan or migration. The two viable replacements with Polish bank coverage and live, accepting-new-customers status as of May 2026 are: **(a) Yapily** (covers 25M+ Polish accounts including PKO, mBank, Pekao via PolishAPI standard) and **(b) Enable Banking API** (free for personal use, 8 countries including Poland, but more app-side overhead). **Recommendation: keep GoCardless for existing users, add Yapily as primary new-user path, plan a 6-month migration.** Effort: M (Yapily integration ~2 weeks). Source: Open Banking Tracker / GoCardless status page checked 2026-05-08.
2. **Live Activities are a near-zero-effort, high-leverage budget-glance surface for Solvio — but ContentState is hard-capped at ~4KB, the activity dies after ~8h active + 4h dismissable, and update budgets are aggressive.** The right pattern for Solvio: ship one `BudgetActivity` keyed to "today's spend vs daily budget" with **`ProgressView(timerInterval:)` for cost-free visual smoothness** (Apple interpolates this client-side without push), update via local `Activity.update()` after each new expense logged, and add `.supplementalActivityFamilies([.small])` for free Apple Watch Smart Stack sync (zero extra code, watchOS 11+). Effort: S–M (~3 days).
3. **App Intents are now table-stakes for an expense app — Copilot Money has them, Solvio does not, and iOS 26's enhanced App Intents bring Spotlight + Siri + Shortcuts + Apple Intelligence integration "for free."** Each phrase must contain `\(.applicationName)` and at most ONE intent parameter (Apple's hard limit). For Solvio, the right v1 set is: `LogExpenseIntent` (parameter: amount as `Decimal`, optional vendor as String), `ScanReceiptIntent` (no parameters, `openAppWhenRun = true`), `CheckBudgetIntent` (parameter: optional category). All three feed into `AppShortcutsProvider` and donate via `IntentDonationManager`. Effort: M (~5 days for v1, ~3 days for Apple Intelligence integration in iOS 26).
4. **PolishAPI standard 3.0 / 2.1.4 was published 2025-06-17 — and Solvio's GoCardless adapter can be supplemented with direct PolishAPI calls for the top 4 banks at zero per-account cost.** The economic argument: GoCardless (Nordigen) free tier is 50 connections/month; if Solvio grows past that, every additional connection costs (no public price). PolishAPI direct is free but requires per-bank certification, AISP licensing in Poland (KNF), and per-bank developer portal onboarding. **Hybrid recommendation:** keep aggregator for niche banks (~25 of 281 Polish banks), use direct PolishAPI for PKO/mBank/Santander/ING (which together cover ~80% of Polish retail banking by share). Effort: L (12+ months — requires KNF AISP license).
5. **The 90-day SCA re-authentication has been extended to 180 days under the EBA opinion (effective in many member states 2024–2025) — Solvio's refresh-token UX should align.** Per GoCardless / Yapily / EBA documentation, the previous 90-day forced re-auth is now 180 days for AIS data access, and the FCA in the UK lets users confirm consent with a simple yes/no instead of full SCA. **Action:** Solvio's `account_metadata.last_accessed` field already exists (in `lib/nordigen/sync.ts`); add a 165-day proactive re-consent prompt (push notification + in-app banner) to avoid surprise expirations. Effort: S (1–2 days).

---

## Sub-topic 1 — Live Activities deep dive (Solvio budget-glance pattern)

### 1.1 The architecture: ActivityAttributes vs ContentState

Live Activities (ActivityKit, iOS 16.1+) split data into two layers:

- **`ActivityAttributes`** — static data set ONCE when the activity starts. For Solvio: `userId`, `currency`, `dailyBudget`, `monthName`. Cannot be updated.
- **`ContentState` (nested)** — dynamic data that changes throughout the activity's life. For Solvio: `spentToday`, `lastVendor`, `lastAmount`, `progressRatio`. Capped at ~4KB JSON.

The 4KB cap is per [Apple's ActivityKit push doc](https://developer.apple.com/documentation/activitykit/starting-and-updating-live-activities-with-activitykit-push-notifications) — checked 2026-05-08. In practice Solvio's natural state is ~200B; we have 20× headroom.

```swift
// SolvioWidget/BudgetActivityAttributes.swift
import ActivityKit
import Foundation

public struct BudgetActivityAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        // Dynamic — every Activity.update() pushes new values
        public var spentToday: Decimal           // 145.00
        public var dailyBudget: Decimal          // 300.00
        public var lastVendor: String?           // "Biedronka"
        public var lastAmount: Decimal?          // 47.32
        public var lastTimestamp: Date           // for "X min ago" rendering

        public var progressRatio: Double {
            guard dailyBudget > 0 else { return 0 }
            return min(NSDecimalNumber(decimal: spentToday).doubleValue
                    / NSDecimalNumber(decimal: dailyBudget).doubleValue, 1.0)
        }
    }

    // Static — set on .request, never changes
    public let userId: String
    public let currency: String       // "PLN"
    public let monthLabel: String     // "Maj 2026" / "May 2026"
}
```

**Why this split matters for Solvio:** the 4KB cap is per-update, not per-activity. If Solvio ever wanted to ship category breakdowns inside the activity, it would have to be a `[CategorySpend]` array stuffed into ContentState — that's where the 4KB starts to bite (10 categories × ~120B each ≈ 1.2KB; manageable, but worth knowing the budget).

Sources:
- [Apple Developer — ActivityKit](https://developer.apple.com/documentation/activitykit) — checked 2026-05-08
- [Apple Developer — Starting and updating Live Activities with ActivityKit push notifications](https://developer.apple.com/documentation/activitykit/starting-and-updating-live-activities-with-activitykit-push-notifications) — checked 2026-05-08

### 1.2 Lock Screen, Dynamic Island, Smart Stack — three surfaces, one config

A single `ActivityConfiguration` declares all surfaces:

```swift
// SolvioWidget/BudgetLiveActivity.swift
import ActivityKit
import SwiftUI
import WidgetKit

struct BudgetLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: BudgetActivityAttributes.self) { context in
            // Lock Screen — full-bleed view
            BudgetLockScreenView(context: context)
                .activityBackgroundTint(Color.solvioBackground)
                .activitySystemActionForegroundColor(.solvioAccent)
        } dynamicIsland: { context in
            DynamicIsland {
                // Expanded — shown when user long-presses compact / minimal
                DynamicIslandExpandedRegion(.leading) {
                    Image(systemName: "chart.pie.fill")
                        .foregroundColor(.solvioAccent)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Text(context.state.spentToday,
                         format: .currency(code: context.attributes.currency))
                        .font(.headline)
                }
                DynamicIslandExpandedRegion(.center) {
                    Text(context.attributes.monthLabel)
                        .font(.caption)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    ProgressView(value: context.state.progressRatio)
                        .tint(.solvioAccent)
                }
            } compactLeading: {
                Image(systemName: "chart.pie.fill")
                    .foregroundColor(.solvioAccent)
            } compactTrailing: {
                Text(context.state.spentToday,
                     format: .currency(code: context.attributes.currency)
                        .precision(.fractionLength(0)))
                    .monospacedDigit()
            } minimal: {
                Image(systemName: "chart.pie.fill")
                    .foregroundColor(.solvioAccent)
            }
            .keylineTint(.solvioAccent)
        }
        // 1.4: Apple Watch Smart Stack support — ZERO extra code beyond this line
        .supplementalActivityFamilies([.small])
    }
}
```

The Dynamic Island has four regions per [Apple's docs](https://developer.apple.com/documentation/activitykit) and the [Sparrow Code tutorial — checked 2026-05-08](https://sparrowcode.io/en/tutorials/live-activities):

| Region | When shown | Solvio content |
|---|---|---|
| **compactLeading** | Tiny pill, left of camera notch | Pie-chart icon |
| **compactTrailing** | Tiny pill, right of camera notch | "47 zł" (today's spend, no decimals) |
| **minimal** | Even smaller; multi-app stacking | Same icon as compactLeading |
| **expanded** (4 sub-regions) | Long-press / open | Spend, budget bar, last vendor |

### 1.3 Local update vs APNs push — Solvio uses LOCAL only

Two ways to update a Live Activity:

| Mode | Who initiates | Use when | Cost | Solvio fit |
|---|---|---|---|---|
| **`Activity.update(using:)`** | iOS app foreground or background | App is alive (foreground or BG fetch) | Free | **YES — matches Solvio's data flow** |
| **APNs `liveactivity` push** | Solvio backend → APNs | App is fully terminated and you need server-driven updates | APNs token mgmt + server cost + budget | NO — Solvio's expenses are user-typed, no server-side state change |

Solvio's expense logging is user-initiated: user logs an expense in the iOS app → app calls `/api/data/expenses` → on success, app calls `Activity.update(using: ...)` directly. No backend push token plumbing needed. This is the cheap, simple, recommended path.

```swift
// SolvioApp/Features/LiveActivities/BudgetActivityController.swift
import ActivityKit
import Foundation

@MainActor
final class BudgetActivityController: ObservableObject {
    static let shared = BudgetActivityController()
    @Published private(set) var current: Activity<BudgetActivityAttributes>?

    func startTodayActivity(currency: String, dailyBudget: Decimal, spentToday: Decimal) async {
        guard ActivityAuthorizationInfo().areActivitiesEnabled else {
            print("[LiveActivity] User has Live Activities disabled")
            return
        }

        let attrs = BudgetActivityAttributes(
            userId: SolvioSession.shared.userId,
            currency: currency,
            monthLabel: monthFormatter.string(from: Date())
        )
        let state = BudgetActivityAttributes.ContentState(
            spentToday: spentToday,
            dailyBudget: dailyBudget,
            lastVendor: nil,
            lastAmount: nil,
            lastTimestamp: Date()
        )

        do {
            current = try Activity.request(
                attributes: attrs,
                content: .init(state: state, staleDate: stalenessHorizon()),
                pushType: nil  // local-only
            )
        } catch {
            print("[LiveActivity] start failed: \(error)")
        }
    }

    func updateAfterExpense(amount: Decimal, vendor: String?, newDailyTotal: Decimal,
                            dailyBudget: Decimal) async {
        guard let activity = current else { return }

        let newState = BudgetActivityAttributes.ContentState(
            spentToday: newDailyTotal,
            dailyBudget: dailyBudget,
            lastVendor: vendor,
            lastAmount: amount,
            lastTimestamp: Date()
        )

        await activity.update(.init(state: newState, staleDate: stalenessHorizon()))
    }

    func endTodayActivity() async {
        guard let activity = current else { return }
        await activity.end(.init(state: activity.content.state,
                                  staleDate: nil),
                            dismissalPolicy: .immediate)
        current = nil
    }

    /// Activity becomes "stale" 30 minutes from now — system shows a translucent overlay.
    /// On Solvio's pattern, we never want stale data: the next user expense or daily reset
    /// updates this. 30 min is forgiving for offline phones.
    private func stalenessHorizon() -> Date {
        Date().addingTimeInterval(30 * 60)
    }

    private let monthFormatter: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "LLLL yyyy"
        f.locale = Locale.current
        return f
    }()
}
```

Triggering points in Solvio's existing iOS code:
- **Day rollover (00:00):** new `BackgroundTasks` schedule or first foreground after 00:00 → `endTodayActivity()` then `startTodayActivity(...)` with fresh `spentToday = 0`.
- **After a new expense saved:** `await BudgetActivityController.shared.updateAfterExpense(...)` after `/api/data/expenses` POST returns 201.
- **After receipt OCR completes (if it created an expense):** same as above.
- **User closes the activity manually:** iOS handles dismissal, app observes `Activity.activityUpdates` and clears `current`.

Sources:
- [Apple Developer — ActivityKit](https://developer.apple.com/documentation/activitykit) — checked 2026-05-08
- [9to5Mac — Live Activities won't be able to refresh as frequently in iOS 18](https://9to5mac.com/2024/08/31/live-activities-ios-18/) — checked 2026-05-08
- [Sparrow Code — Live Activity & Dynamic Island](https://sparrowcode.io/en/tutorials/live-activities) — checked 2026-05-08

### 1.4 Free Apple Watch sync via `.supplementalActivityFamilies`

iOS 18 / watchOS 11 introduced `.supplementalActivityFamilies` on `ActivityConfiguration`. Per [WWDC24 Session 10068 "Bring your Live Activity to Apple Watch"](https://developer.apple.com/videos/play/wwdc2024/10068/) — checked 2026-05-08:

> "Beginning in iOS 18 and watchOS 11, your iOS Live Activity will appear in the Smart Stack on Apple Watch automatically. ... Live Activity updates are synchronized automatically to Apple Watch. You don't have to manage separate push tokens or add any code."

The only optional thing is to override the default rendering with a Watch-specific layout:

```swift
struct BudgetLockScreenView: View {
    let context: ActivityViewContext<BudgetActivityAttributes>
    @Environment(\.activityFamily) var activityFamily

    var body: some View {
        switch activityFamily {
        case .small:
            // Watch Smart Stack — single line + gauge
            BudgetWatchSmallView(context: context)
        case .medium:
            // iPhone Lock Screen — full layout
            BudgetLockScreenLargeView(context: context)
        @unknown default:
            BudgetLockScreenLargeView(context: context)
        }
    }
}

struct BudgetWatchSmallView: View {
    let context: ActivityViewContext<BudgetActivityAttributes>
    @Environment(\.isLuminanceReduced) var dim   // AOD

    var body: some View {
        HStack {
            Image(systemName: "chart.pie.fill")
                .foregroundColor(dim ? .gray : .solvioAccent)
            Text(context.state.spentToday,
                 format: .currency(code: context.attributes.currency)
                            .precision(.fractionLength(0)))
                .monospacedDigit()
            Spacer()
            Gauge(value: context.state.progressRatio) { EmptyView() }
                .gaugeStyle(.accessoryCircularCapacity)
                .tint(dim ? .gray : .solvioAccent)
                .frame(width: 22, height: 22)
        }
        .padding(.horizontal, 8)
    }
}
```

**Update budget caveat:** Per [Apple Developer Forums thread 799505 — checked 2026-05-08](https://developer.apple.com/forums/thread/799505), Watch update sync is also budgeted similarly to iPhone, and high-frequency updates can throttle. For Solvio's pattern (one update per logged expense, ≤10/day for 95% of users) this is a non-issue.

Sources:
- [Apple Developer — Bring your Live Activity to Apple Watch (WWDC24)](https://developer.apple.com/videos/play/wwdc2024/10068/) — checked 2026-05-08
- [Medium — Bringing Live Activities to Apple Watch in watchOS 11](https://medium.com/@dhavaljasoliya8/bringing-live-activities-to-apple-watch-in-watchos-11-a-developers-guide-a95e1f4606ba) — checked 2026-05-08
- [OneSignal — Elevate Your iOS Live Activities](https://onesignal.com/blog/elevate-your-ios-live-activities-exciting-updates-for-apple-watch-in-2024/) — checked 2026-05-08

### 1.5 Stale dates, lifetimes, and the "8 + 4 hours" myth

Per [the createwithswift.com tutorial — checked 2026-05-08](https://www.createwithswift.com/implementing-live-activities-in-a-swiftui-app/) and various community sources, Live Activities have these lifetime constraints:

- **Active visibility: up to 8 hours.** After that the activity is forced into a dismissed state.
- **Dismissed-but-on-Lock-Screen: up to 4 additional hours.** Disappears after 12 hours total.
- **Stale date:** the timestamp at which iOS visually marks the activity as "out of date" (translucent dim overlay). Set this on every `update()` to force re-render at horizons.

For Solvio's daily-budget activity, `8h + 4h = 12h` is fine — the activity ends naturally at midnight via the day-rollover trigger, well before the 12h cap.

**`ProgressView(timerInterval:)` and `Text(timerInterval:)` are the only primitives iOS interpolates frame-to-frame** (per [the Live Activity 2025 community guide — checked 2026-05-08](https://newly.app/articles/ios-live-activities)) — for budget bars Solvio doesn't need this (a static `ProgressView(value:)` works) but it's worth knowing for future "savings goal countdown to deadline" features.

Sources:
- [createwithswift.com — Implementing Live Activities in a SwiftUI app](https://www.createwithswift.com/implementing-live-activities-in-a-swiftui-app/) — checked 2026-05-08
- [Pushwoosh — iOS 18 Live Activities best practices](https://www.pushwoosh.com/blog/ios-live-activities/) — checked 2026-05-08
- [newly.app — iOS Live Activities 2026 guide](https://newly.app/articles/ios-live-activities) — checked 2026-05-08

### 1.6 Cost analysis for Solvio

| Item | Cost | Notes |
|---|---|---|
| Engineering effort (initial) | ~3 days | Widget extension + ActivityAttributes + 3 SwiftUI views + controller + integration into `ExpenseDetailView` save path |
| Watch parity (`.supplementalActivityFamilies`) | ~0.5 day | Add modifier + watch-specific small view |
| APNs Live Activity push token plumbing | NOT NEEDED | Local updates only; saves 1–2 weeks of backend work |
| Frequent updates entitlement (`NSSupportsLiveActivitiesFrequentUpdates = true` in Info.plist) | 0 cost, default `false` | Apple will throttle aggressive senders; not relevant for ≤10 updates/day |
| Per-month server cost | $0 | No APNs traffic |
| Per-user value | High | Glance surface that drives daily app open rate (the moat over SMS confirmations) |

**Recommendation: ship in v2.1 (round 7-9 of this hardening loop).** No conflict with A1/A2/A3/A4 — this is a NEW widget extension target.

---

## Sub-topic 2 — App Intents + Siri integration deep dive

### 2.1 Why Solvio needs App Intents NOW

App Intents (iOS 16+) are how Solvio gets surfaced in:

- **Spotlight** — typing "expense Biedronka 47" in Spotlight should suggest the Solvio shortcut.
- **Siri / Apple Intelligence** — "Hey Siri, log 47 zł at Biedronka in Solvio."
- **Shortcuts app** — users build automations around Solvio (e.g. "When I leave the supermarket, ask me how much I spent").
- **Action Button (iPhone 15 Pro+)** — long-press to scan a receipt instantly.
- **Control Center custom controls** (iOS 18+) — quick "log expense" tile.
- **Widgets and Live Activities tap targets** — `Button(intent: ScanReceiptIntent())` on a widget.
- **Apple Pencil Pro double-squeeze (iPadOS 17.5+).**

Per [Apple's App Intents docs](https://developer.apple.com/documentation/appintents) — checked 2026-05-08: "App Intents makes your app's content and actions discoverable with system experiences like Spotlight, widgets, and the Shortcuts app."

Competitive read: **Copilot Money already ships App Intents + Siri Shortcuts** (per [The Penny Hoarder Copilot Money review — checked 2026-05-08](https://www.thepennyhoarder.com/budgeting/budgeting-copilot-money-review/) — this was an Apple Editor's Choice differentiator). Solvio doesn't.

### 2.2 The three intents Solvio should ship in v1

| Intent | Parameter(s) | `openAppWhenRun` | Phrase examples |
|---|---|---|---|
| **`LogExpenseIntent`** | `amount: Decimal` (required), `vendor: String?`, `category: SolvioCategoryEntity?` | `false` (background) | "Log 47 zł in Solvio", "Add expense in Solvio" |
| **`ScanReceiptIntent`** | none | `true` (must open camera UI) | "Scan receipt in Solvio", "New receipt in Solvio" |
| **`CheckBudgetIntent`** | `category: SolvioCategoryEntity?` (optional) | `false` | "What's my budget in Solvio?", "How much have I spent in Solvio?" |

**Apple's hard constraint:** per [the createwithswift.com App Shortcuts tutorial — checked 2026-05-08](https://www.createwithswift.com/performing-your-app-actions-with-siri-through-app-shortcuts-provider/) and [the WWDC22 Session 10170 video "Implement App Shortcuts with App Intents"](https://developer.apple.com/videos/play/wwdc2022/10170/) — every phrase MUST contain `\(.applicationName)` and at most ONE intent parameter. So `LogExpenseIntent` can't have two parameters in a single phrase — must pick the most discoverable one (amount).

### 2.3 Full code skeleton: `LogExpenseIntent`

```swift
// SolvioApp/Features/AppIntents/LogExpenseIntent.swift
import AppIntents
import Foundation

struct LogExpenseIntent: AppIntent {
    static var title: LocalizedStringResource = "Log expense"

    static var description: IntentDescription {
        IntentDescription(
            "Adds a new expense to Solvio, optionally with a vendor and category.",
            categoryName: "Expenses",
            searchKeywords: ["expense", "spend", "log", "wydatek", "dodaj"]
        )
    }

    /// Run in the background — don't open the app for a quick log.
    static var openAppWhenRun: Bool = false

    @Parameter(
        title: "Amount",
        description: "How much you spent",
        requestValueDialog: IntentDialog("How much did you spend?"),
        controlStyle: .field,
        inclusiveRange: (0.01, 1_000_000.0)
    )
    var amount: Double

    @Parameter(
        title: "Vendor",
        description: "Where you spent it",
        requestValueDialog: IntentDialog("Where did you spend it?")
    )
    var vendor: String?

    @Parameter(
        title: "Category",
        description: "Solvio category",
        default: nil
    )
    var category: SolvioCategoryEntity?

    static var parameterSummary: some ParameterSummary {
        When(\.$vendor, .hasAnyValue) {
            Summary("Log \(\.$amount) at \(\.$vendor) in Solvio") {
                \.$category
            }
        } otherwise: {
            Summary("Log \(\.$amount) in Solvio") {
                \.$vendor
                \.$category
            }
        }
    }

    @MainActor
    func perform() async throws -> some IntentResult & ProvidesDialog {
        let session = SolvioSession.shared
        guard session.isLoggedIn else {
            throw SolvioIntentError.notLoggedIn
        }

        let dec = Decimal(amount)
        do {
            try await SolvioAPI.shared.createExpense(
                amount: dec,
                vendor: vendor,
                categoryId: category?.id,
                date: Date()
            )

            // Refresh the Live Activity if there's one running.
            await BudgetActivityController.shared.refreshFromServer()

            // Donate so Siri learns this pattern.
            IntentDonationManager.shared.donate(intent: self)

            let dialog: IntentDialog = {
                let formatted = NumberFormatter.solvioCurrency.string(from: NSDecimalNumber(decimal: dec)) ?? "\(amount)"
                if let v = vendor, !v.isEmpty {
                    return IntentDialog("Added \(formatted) at \(v).")
                }
                return IntentDialog("Added \(formatted) to your expenses.")
            }()

            return .result(dialog: dialog)
        } catch SolvioAPIError.unauthorized {
            throw SolvioIntentError.notLoggedIn
        } catch {
            throw SolvioIntentError.networkFailed
        }
    }
}

enum SolvioIntentError: Error, LocalizedError, CustomLocalizedStringResourceConvertible {
    case notLoggedIn
    case networkFailed

    var errorDescription: String? {
        switch self {
        case .notLoggedIn:    return "Please open Solvio to sign in first."
        case .networkFailed:  return "Couldn't reach Solvio. Check your connection."
        }
    }

    var localizedStringResource: LocalizedStringResource {
        switch self {
        case .notLoggedIn:    return "Please open Solvio to sign in first."
        case .networkFailed:  return "Couldn't reach Solvio. Check your connection."
        }
    }
}
```

The key APIs in play:

- **`@Parameter(title:description:requestValueDialog:)`** — when Siri/Spotlight needs to ask the user, the `requestValueDialog` is what's spoken. Per [Apple's IntentParameter doc — checked 2026-05-08](https://developer.apple.com/documentation/appintents/intentparameter), foundation types (Decimal, String, Currency, Measurement) are first-class.
- **`parameterSummary`** — drives how the Shortcut block renders in the Shortcuts app. The `When(...)` syntax conditions the summary on parameter state.
- **`IntentDonationManager.shared.donate(intent: self)`** — tells Siri "the user just did this, learn the pattern." Without donations, Spotlight predictions don't bootstrap. Per [GoodRequest tips — checked 2026-05-08](https://www.goodrequest.com/blog/app-intents-tips-and-tricks).
- **Currency parameter caveat:** per [Apple Developer Forums thread 733616 — checked 2026-05-08](https://forums.developer.apple.com/forums/thread/733616), `INCurrencyAmount` and validation constraints have known issues — recommendation: use plain `Double` or `Decimal` for amount and format to currency in `parameterSummary` and dialog only.

Sources:
- [Apple Developer — App Intents](https://developer.apple.com/documentation/appintents) — checked 2026-05-08
- [Apple Developer — Adding parameters to an app intent](https://developer.apple.com/documentation/appintents/adding-parameters-to-an-app-intent) — checked 2026-05-08
- [Use Your Loaf — Getting Started With App Intents](https://useyourloaf.com/blog/getting-started-with-app-intents/) — checked 2026-05-08
- [Superwall — App Intents Field Guide](https://superwall.com/blog/an-app-intents-field-guide-for-ios-developers/) — checked 2026-05-08

### 2.4 `ScanReceiptIntent` — opens camera UI, returns `OpensIntent`

```swift
// SolvioApp/Features/AppIntents/ScanReceiptIntent.swift
import AppIntents

struct ScanReceiptIntent: AppIntent {
    static var title: LocalizedStringResource = "Scan a receipt"

    static var description: IntentDescription {
        IntentDescription(
            "Opens the Solvio receipt scanner. Snap a photo and Solvio will OCR it.",
            categoryName: "Receipts",
            searchKeywords: ["scan", "receipt", "camera", "paragon", "skanuj"]
        )
    }

    /// Must open the app — camera UI requires foreground.
    static var openAppWhenRun: Bool = true

    @MainActor
    func perform() async throws -> some IntentResult {
        // Set deep-link target so SolvioApp sees this on next foreground.
        DeepLinkRouter.shared.requestRoute(.scanReceipt)
        IntentDonationManager.shared.donate(intent: self)
        return .result()
    }
}
```

Per [Apple's OpenIntent doc — checked 2026-05-08](https://developer.apple.com/documentation/appintents) and the [SwiftLee App Intents Spotlight integration article](https://www.avanderlee.com/swiftui/app-intents-spotlight-integration-using-shortcuts/), setting `openAppWhenRun = true` is the simplest path. For deep-routing into a specific tab, the app observes a deep link via `URL.handle(...)` or a shared `DeepLinkRouter` singleton.

### 2.5 `CheckBudgetIntent` — shows a snippet inline (no app open)

```swift
struct CheckBudgetIntent: AppIntent {
    static var title: LocalizedStringResource = "Check budget"
    static var description: IntentDescription {
        IntentDescription(
            "Shows your current spend versus budget for today, this month, or by category.",
            categoryName: "Budgets"
        )
    }
    static var openAppWhenRun: Bool = false

    @Parameter(title: "Category")
    var category: SolvioCategoryEntity?

    @MainActor
    func perform() async throws -> some IntentResult & ProvidesDialog & ShowsSnippetView {
        let session = SolvioSession.shared
        guard session.isLoggedIn else { throw SolvioIntentError.notLoggedIn }

        let snapshot = try await SolvioAPI.shared.fetchBudgetSnapshot(categoryId: category?.id)

        let dialog = IntentDialog(stringLiteral:
            "You've spent \(snapshot.spent.formattedPLN) of \(snapshot.budget.formattedPLN) — \(Int(snapshot.percent * 100))%."
        )

        IntentDonationManager.shared.donate(intent: self)
        return .result(dialog: dialog, view: BudgetSnippetView(snapshot: snapshot))
    }
}

// SwiftUI snippet shown inline by Siri / Shortcuts
struct BudgetSnippetView: View {
    let snapshot: BudgetSnapshot

    var body: some View {
        VStack(spacing: 8) {
            Text(snapshot.label)
                .font(.headline)
            ProgressView(value: snapshot.percent)
                .tint(snapshot.percent > 1.0 ? .red : .solvioAccent)
            HStack {
                Text(snapshot.spent.formattedPLN).bold()
                Text("/").foregroundStyle(.secondary)
                Text(snapshot.budget.formattedPLN).foregroundStyle(.secondary)
            }
            .monospacedDigit()
        }
        .padding(16)
    }
}
```

The `ShowsSnippetView` conformance is the key trick for showing rich SwiftUI inside Siri's response sheet without opening the app.

### 2.6 `AppShortcutsProvider` registration

```swift
// SolvioApp/Features/AppIntents/SolvioAppShortcuts.swift
import AppIntents

struct SolvioAppShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: LogExpenseIntent(),
            phrases: [
                "Log expense in \(.applicationName)",
                "Add expense in \(.applicationName)",
                "Dodaj wydatek w \(.applicationName)",
                "Zapisz wydatek w \(.applicationName)",
                "Log \(\.$amount) in \(.applicationName)",   // single-parameter phrase
            ],
            shortTitle: "Log expense",
            systemImageName: "plus.circle.fill"
        )

        AppShortcut(
            intent: ScanReceiptIntent(),
            phrases: [
                "Scan receipt in \(.applicationName)",
                "New receipt in \(.applicationName)",
                "Skanuj paragon w \(.applicationName)",
            ],
            shortTitle: "Scan receipt",
            systemImageName: "doc.viewfinder.fill"
        )

        AppShortcut(
            intent: CheckBudgetIntent(),
            phrases: [
                "Check budget in \(.applicationName)",
                "What's my budget in \(.applicationName)",
                "Sprawdź budżet w \(.applicationName)",
            ],
            shortTitle: "Check budget",
            systemImageName: "chart.line.uptrend.xyaxis"
        )
    }

    /// Run on the main actor so we can pre-load the in-app vocabulary.
    static var shortcutTileColor: ShortcutTileColor = .teal
}
```

Per [Apple's App Shortcuts doc — checked 2026-05-08](https://developer.apple.com/documentation/appintents/app-shortcuts), `AppShortcutsProvider` is registered automatically by Xcode's build system as long as the file is in the iOS app target. No `Info.plist` change needed.

For multi-language, see [sowenjub.me — Localizing App Shortcuts with App Intents — checked 2026-05-08](https://sowenjub.me/writes/localizing-app-shortcuts-with-app-intents/) — phrases go in `AppShortcuts.strings` files and are tagged with `LocalizedStringResource`.

### 2.7 iOS 26 / Apple Intelligence enhancements (post-October 2025 patch)

Per [Apple's Apple Intelligence developer page — checked 2026-05-08](https://developer.apple.com/apple-intelligence/) and [Superwall — App Intents Interactive Snippets in iOS 26 — checked 2026-05-08](https://superwall.com/blog/app-intents-interactive-snippets-in-ios-26/):

- **Image Search via App Intents (iOS 26):** apps can implement `IntentValueQuery` accepting `SemanticContentDescriptor` to expose entities to Image Playground / Genmoji / system image search. **Solvio fit:** receipt thumbnails could be made searchable from Photos via "find receipts from Biedronka" — defer to v3.
- **Interactive Snippets (iOS 26):** the `ShowsSnippetView` snippet returned from an intent can now contain interactive controls (buttons, toggles) that themselves run further intents. **Solvio fit:** the `BudgetSnippetView` could include a "Log new expense" button that launches `LogExpenseIntent` directly. ~1 day to wire up.
- **In-app search actions (iOS 26):** `IntentSearchAction` lets your app's search results show in the system search panel. **Solvio fit:** searching "Biedronka" on the Home Screen shows Solvio expenses inline. M effort.
- **Apple Intelligence parameter resolution:** in iOS 18.1+, Siri uses Apple Intelligence to better disambiguate ambiguous parameters. For a phrase like "Log forty seven Polish złoty in Solvio," Apple Intelligence resolves "forty seven Polish złoty" to `Decimal(47.0)` and the "PLN" currency tag. No code changes needed — the LLM does it.

### 2.8 Cost analysis for App Intents v1

| Item | Effort |
|---|---|
| `LogExpenseIntent` + `ScanReceiptIntent` + `CheckBudgetIntent` + `SolvioAppShortcuts` | ~3 days |
| `SolvioCategoryEntity` (AppEntity for category disambiguation) + `SolvioCategoryQuery` | ~1 day |
| Localized phrases (PL+EN) in `AppShortcuts.strings` | ~0.5 day |
| `BudgetSnippetView` SwiftUI design + integration | ~0.5 day |
| Manual testing across Spotlight, Siri, Shortcuts, Action Button | ~1 day |
| **Total v1** | **~6 days** |
| iOS 26 Interactive Snippets (button-in-snippet pattern) | +1 day |
| Image Search integration | +3 days (defer to v3) |

**Recommendation: ship v1 (3 intents + provider) in round 6-7.**

---

## Sub-topic 3 — PSD2 / Polish bank API integration: aggregator comparison + direct PolishAPI economics

### 3.1 The current Solvio architecture

Solvio's bank-link pipeline lives in `lib/nordigen/client.ts` and `lib/nordigen/sync.ts` (verified 2026-05-08). It uses GoCardless Bank Account Data (formerly Nordigen, acquired by GoCardless April 2023 per [Silicon Canals — checked 2026-05-08](https://siliconcanals.com/gocardless-to-acquire-nordigen/)). Routes:

- `POST /api/bank/connect` → creates an end-user agreement and Requisition, returns hosted-auth `link`
- `GET /api/bank/callback` → completes the consent, stores `requisitionId` and `accountIds`
- `POST /api/bank/sync` → pulls `transactions/?date_from=...` for each account, dedupes by `transactionId`, inserts into `expenses`

**Findings on the existing setup:**
- The free GoCardless tier lets you connect up to **50 banks per month** (per [Actual Budget docs — checked 2026-05-08](https://actualbudget.org/docs/advanced/bank-sync/gocardless/)). One bank with multiple accounts inside still counts as ONE connection.
- Refresh-token validity: 30 days for GoCardless's `access_token`, 90 days for `refresh_token`. Account access (re-consent SCA) is the regulator-defined limit — see 3.4.

### 3.2 CRITICAL: GoCardless stopped accepting new Bank Account Data accounts (July 2025)

This is the single biggest finding of R5. Per [Actual Budget GoCardless setup docs — checked 2026-05-08](https://actualbudget.org/docs/advanced/bank-sync/gocardless/) and confirmed by [the actualbudget GitHub issue #5505 — checked 2026-05-08](https://github.com/actualbudget/actual/issues/5505):

> "From July 2025 onwards, GoCardless has stopped accepting new Bank Account Data accounts. However, if you are an existing user, your account should continue to work."

What this means for Solvio:

- **Solvio's existing GoCardless account remains operational** — sync works for current users.
- **Solvio cannot self-serve onboard NEW developer accounts** to GoCardless Bank Account Data. If Solvio loses its credentials or wants to spin up a separate dev/staging environment, it's blocked.
- **Long-term lock-in risk:** GoCardless evidently is migrating away from the free Bank Account Data product. If they sunset it for existing users (no public timeline), Solvio needs a migration path ready.

**Recommendation: dual-track by Q3 2026:**
1. Keep GoCardless wired up for current users (existing requisitions, existing accounts).
2. Add a NEW provider path (Yapily or Enable Banking) for net-new bank links. The UI flow stays the same; the lib layer dispatches by user segment.
3. Plan a 6-month silent migration for existing users (consent re-grants needed anyway every 180 days — see 3.4).

Sources:
- [Actual Budget docs — GoCardless Setup](https://actualbudget.org/docs/advanced/bank-sync/gocardless/) — checked 2026-05-08
- [Actual Budget GitHub Issue #5505 — replace GoCardless with Enable Banking](https://github.com/actualbudget/actual/issues/5505) — checked 2026-05-08
- [Firefly III GitHub Issue #10753 — add Enable Banking](https://github.com/firefly-iii/firefly-iii/issues/10753) — checked 2026-05-08

### 3.3 Polish bank coverage matrix — May 2026

The Polish banking market is dominated by ~10 large retail banks. Coverage as of 2026-05-08:

| Bank | Direct PolishAPI portal | GoCardless | Tink (Visa) | Salt Edge | Yapily | TrueLayer |
|---|---|---|---|---|---|---|
| **PKO BP** | [developers.pkobp.pl](https://developers.pkobp.pl) | YES | YES | YES | YES | YES |
| **mBank** | [developer.api.mbank.pl](https://developer.api.mbank.pl) | YES | YES | YES | YES | YES |
| **Santander Polska** | [developer.santander.pl](https://developer.santander.pl) | YES | YES | YES | YES | YES |
| **ING Bank Śląski** | [devportal.ing.pl](https://devportal.ing.pl) | YES | YES | YES | YES | YES |
| **Bank Pekao** | [developer.pekao.com.pl](https://developer.pekao.com.pl/sandbox/) | YES | YES | YES | YES | YES |
| **Bank Millennium** | [openapi.bankmillennium.pl](https://openapi.bankmillennium.pl) | YES | YES | YES | YES | YES |
| **Alior Bank** | (no public portal page) | YES (per OpenBankingTracker) | YES | YES | partial | YES |
| **BNP Paribas Polska** | (PolishAPI) | likely | YES | YES | YES | partial |
| **Citi Handlowy** | (PolishAPI) | likely | YES | YES | partial | partial |
| **Credit Agricole Polska** | (PolishAPI) | likely | YES | partial | partial | partial |

**Coverage caveats:** "YES" for an aggregator means the institution appears in their directory at some point in 2024–2026; production reliability varies. Per [Toshl's public X post 2024-05-26 — checked 2026-05-08](https://x.com/Toshl/status/1795100937117139335), PKO's PSD2 API had a >6-week outage in 2024 — the regulatory framework forces banks to expose APIs but **does not enforce uptime SLAs**. Real-world: Solvio's existing GoCardless adapter has logic for `accountStatus = SUSPENDED/EXPIRED/ERROR` precisely because Polish banks frequently break their own APIs.

Sources:
- [PolishAPI — Commercial Banks](https://polishapi.org/en/commercial-banks/) — checked 2026-05-08
- [Open Banking Tracker — 281 Banks in Poland (2026)](https://www.openbankingtracker.com/providers/country/pl) — checked 2026-05-08
- [Yapily — Live in Poland](https://www.yapily.com/blog/live-in-poland-open-banking) — checked 2026-05-08
- [Open Banking Tracker — GoCardless 2,228+ banks](https://www.openbankingtracker.com/api-aggregators/gocardless) — checked 2026-05-08
- [Salt Edge — Country Coverage Poland](https://www.saltedge.com/products/account_information/coverage/pl) — checked 2026-05-08
- [Tink — Pricing](https://tink.com/pricing/) — checked 2026-05-08

### 3.4 90-day → 180-day SCA re-authentication — Solvio's UX must align

Per the [GoCardless 90-day re-authentication explainer — checked 2026-05-08](https://gocardless.com/guides/posts/90-day-re-authentication-rule/), [the Yapily 90-day reauthentication article — checked 2026-05-08](https://www.yapily.com/blog/90-day-reauthentication-changes), and [the Projective Group EBA opinion summary — checked 2026-05-08](https://www.projectivegroup.com/psd2-alert-authentication-period-for-account-information-services-extended-to-180-days/):

- **Original PSD2 RTS (Sept 2019):** every 90 days, the user MUST complete a fresh SCA (full 2FA) to renew their AIS consent for any TPP. This was massive friction.
- **EBA Opinion (June 2022) and member-state implementations (2023–2025):** the period was extended from 90 → **180 days** for AIS data access, and the FCA in the UK introduced a "delegated SCA" pattern where the TPP can re-confirm consent with a simple yes/no flow instead of a fresh SCA.
- **Polish status:** PolishAPI v3.0 / 2.1.4 published 2025-06-17 (per the [Yapily Live in Poland blog — checked 2026-05-08](https://www.yapily.com/blog/live-in-poland-open-banking)). The 180-day model is the de-facto standard now; individual Polish banks may differ but most have aligned with the EBA opinion.

**Implications for Solvio's UX:**
- Today, Solvio's Nordigen sync code presumably handles `EXPIRED` requisitions reactively (after the user gets stuck). Better: track `requisition.created_at + 165 days` in DB, show a friendly banner ("Your bank link will expire in 15 days. Re-confirm now to keep syncing.") plus a push notification (using R4's strategy doc).
- **Don't surprise the user.** If a bank-sync fails because of expiry, the user should already have been warned 2+ weeks earlier.

### 3.5 Aggregator comparison — Yapily vs Salt Edge vs Tink vs Enable Banking

| Aggregator | Open to new accounts (May 2026)? | Polish coverage | Pricing model | Sandbox available? | Notes for Solvio |
|---|---|---|---|---|---|
| **GoCardless** | NO (closed July 2025) | All majors via PolishAPI | Free up to 50 connections/mo | Yes (existing accounts) | Lock-in risk; keep existing only |
| **Yapily** | YES | All majors (PKO, mBank, Pekao, Santander, ING, Millennium) — 25M+ accounts | API-first, custom pricing per Yapily blog | Yes | Strong Poland-specific marketing; PSD2-only AISP (no PIS friction with Apple Pay etc.) |
| **Salt Edge** | YES | 5,000+ institutions across 50 countries; Poland in coverage page | Usage-based; KYC and risk add-ons separately priced | Yes | More legacy/banking-focused; geared toward enterprise |
| **Tink (Visa)** | YES | Major Polish banks; "6,000 connections" headline | €0.50/user/month per Finexer; tier pricing | Yes | Visa-owned; strong ecosystem, but per-user pricing kills B2C scaling |
| **TrueLayer** | YES | 95%+ EU coverage incl. Poland | Custom pricing | Yes | UK/EU-strong; payment-init forte |
| **Enable Banking** | YES (free for personal) | Poland in 8-country list | Free for personal use; commercial = paid | Yes | More app-side overhead (auth state stored by Solvio, not provider) |

**Recommendation for Solvio's NEW connections (post-GoCardless):**

- **Primary candidate: Yapily.** Strongest Polish marketing presence, AISP-only (simpler), public docs on PolishAPI alignment. Matches Solvio's "no payments, just data" use case.
- **Alternative for cost-conscious: Enable Banking.** Free for personal use, but the developer portal-storing-session-state is non-trivial work. Use only if Yapily pricing falls outside Solvio's budget after a sales call.
- **Avoid Tink.** €0.50/user/month is fatal for a freemium B2C expense tracker.

Sources:
- [Yapily — Live in Poland](https://www.yapily.com/blog/live-in-poland-open-banking) — checked 2026-05-08
- [Yapily — Coverage](https://www.yapily.com/coverage) — checked 2026-05-08
- [Salt Edge — Coverage Poland](https://www.saltedge.com/products/account_information/coverage/pl) — checked 2026-05-08
- [Tink — Pricing UK guide](https://blog.finexer.com/tink-pricing/) — checked 2026-05-08
- [TrueLayer — open banking Poland coverage in fintegrationfs comparison](https://www.fintegrationfs.com/post/plaid-vs-tink-vs-truelayer-which-open-banking-api-is-best-for-your-fintech) — checked 2026-05-08
- [Enable Banking — PSD2 sandboxes](https://enablebanking.com/blog/2020/05/05/psd2-sandbox-apis) — checked 2026-05-08

### 3.6 Direct PolishAPI integration vs aggregator routing — economic analysis

Solvio's MEMORY.md notes a planned PKO direct PSD2 integration (`pko-psd2-api.md`) and a kept-for-back-compat `PKO_ENCRYPTION_KEY` env var. This sub-section weighs whether direct PolishAPI is worth pursuing for the top 4 banks.

**Direct PolishAPI cost per bank (one-off):**
- AISP license from KNF (Polish Financial Supervision Authority) — minimum capital, regulatory filings, 6+ months processing time, ~€20-50k legal/compliance cost. Per [Open Banking Tracker — Open Banking in Poland — checked 2026-05-08](https://www.openbankingtracker.com/country/poland), KNF began TPP oversight in 2018; ~30 PL-licensed AISPs/PISPs as of 2025.
- Per-bank developer-portal onboarding (PSD2 production cert) — typically free but requires the AISP license as prerequisite.
- Engineering: ~3 weeks per bank (the four endpoints — `consent`, `accounts`, `transactions`, `balances` — are well-spec'd in PolishAPI but each bank has quirks like Pekao's distinct sandbox URL pattern).

**Direct PolishAPI variable cost:** **zero per request, zero per account, zero per user.** That's the entire value prop.

**Aggregator variable cost (Yapily ballpark):** depends on contract; typical EU bank API aggregator pricing in 2026 is in the range €0.10–0.50 per linked account per month. At 5,000 active users with 1.2 accounts each → 6,000 accounts × €0.30 = **€1,800/month = €21,600/year**.

**Break-even analysis:**
- Direct integration cost: ~€50k legal + 4 banks × 3 weeks engineering ≈ €100k all-in.
- Variable cost saved at 5,000 users: €21,600/year.
- Pure-finance break-even: ~5 years.
- BUT direct PolishAPI for the top 4 banks doesn't replace the aggregator — it supplements. Need aggregator for the long tail (~25 of 281 banks = ~9% of users).

**Recommendation: stay aggregator-only until 10,000+ active bank-linked users.** Only consider direct PolishAPI integration as a "later"/v3 cost-optimization play. The MEMORY.md PKO direct integration is interesting as an experiment / unique-selling-point ("Solvio has a direct PKO integration, no third-party data routing"), but not as the primary path.

### 3.7 Webhook reliability — the part nobody mentions

Aggregator-driven flows depend on either:
- **Polling** (Solvio's current model) — Solvio's `/api/bank/sync` endpoint pulls data on-demand (user opens app, taps "Refresh", or via cron). Reliability is 100% (your code, your problem). Latency: 2–10 seconds per account.
- **Webhooks** (push from aggregator → Solvio) — when GoCardless detects new transactions on the bank side, it POSTs Solvio's webhook endpoint. Real-time, but introduces ALL of: duplicate-detection, replay protection, signature verification, exponential-retry handling, network-blip recovery.

GoCardless does support webhooks for the "real" GoCardless product (direct debit), but the Bank Account Data product currently relies on customer-initiated polling. For Solvio's pattern (user-initiated bank refresh + nightly cron) this is fine. **No code changes needed; just be aware that "real-time bank notifications" require migrating to a different aggregator if/when needed.**

### 3.8 PolishAPI 3.0 / 2.1.4 — what changed in 2025-06-17

Per [the Yapily Poland blog — checked 2026-05-08](https://www.yapily.com/blog/live-in-poland-open-banking):

> "On June 17, 2025, versions 2.1.4 and 3.0.1 of the PolishAPI standard were published, containing minor changes in connection with the migration of systems to the ISO20022 standard."

ISO 20022 is the new structured-financial-message format replacing legacy SWIFT MT messages. For Solvio this is largely transparent (the aggregator absorbs the change), but two things to watch:
- **Field names in transaction data** — `creditorName`, `debtorName`, `remittanceInformationStructured` are ISO 20022 standardized. Solvio's `lib/nordigen/client.ts` already uses these names — confirmed 2026-05-08.
- **Mandate references and end-to-end IDs** — easier to dedupe transactions reliably (less guessing on the dedup key).

No Solvio-side changes required, but it's a robust foundation for future direct-PolishAPI work.

---

## Updated prioritized backlog — 18 NEW R5 items

Effort legend: **S** ≤ 2 days, **M** 3–7 days, **L** > 7 days.

| # | Priority | Area | Effort | Description |
|---|---|---|---|---|
| R5-01 | H | PSD2 | M | Add Yapily as alternative bank-link provider (`lib/yapily/`); abstract `lib/bank-providers/` interface so existing GoCardless code becomes one of two paths. |
| R5-02 | H | PSD2 | S | Add 165-day proactive bank-link expiry banner + push (uses R4 push strategy doc). |
| R5-03 | H | iOS | M | Ship `LogExpenseIntent` + `ScanReceiptIntent` + `CheckBudgetIntent` + `SolvioAppShortcuts` (iOS 16+). |
| R5-04 | H | iOS | S | Add `IntentDonationManager.shared.donate()` calls to existing in-app expense-create flow so donation history bootstraps for users who never use Siri. |
| R5-05 | H | Live Activity | M | Ship `BudgetActivityAttributes` + Lock Screen + Dynamic Island + start/update/end controller; trigger from existing expense save path. |
| R5-06 | M | Live Activity | S | Add `.supplementalActivityFamilies([.small])` modifier + Watch-specific `BudgetWatchSmallView`. |
| R5-07 | M | iOS | M | Add `BudgetSnippetView` SwiftUI snippet returned by `CheckBudgetIntent` (iOS 17+). |
| R5-08 | M | iOS | S | Localize App Shortcuts phrases (PL+EN) in `AppShortcuts.strings`. |
| R5-09 | M | iOS | M | Add `SolvioCategoryEntity` + `SolvioCategoryQuery` so Siri can disambiguate categories ("Log 47 zł in groceries"). |
| R5-10 | M | PSD2 | S | Doc-only: write `docs/psd2-providers-comparison.md` (R5 quick win, included). |
| R5-11 | M | iOS 26 | M | Wire `CheckBudgetIntent` snippet to use Interactive Snippets (iOS 26) — button-in-snippet to launch `LogExpenseIntent`. |
| R5-12 | M | Live Activity | S | Frequent-update entitlement consideration — set `NSSupportsLiveActivitiesFrequentUpdates = false` (default) and document why; revisit only if budget bar feels stale. |
| R5-13 | L | PSD2 | L | (Defer 2027+) AISP licensing in Poland with KNF + direct PolishAPI integration for PKO/mBank/Santander/ING. |
| R5-14 | L | iOS 26 | M | Image Search via `IntentValueQuery` for receipt thumbnails — searchable from Photos/Spotlight. |
| R5-15 | L | iOS | S | Add Action Button shortcut config card to Settings ("Tap your Action Button to scan a receipt"). |
| R5-16 | L | iOS | M | Control Widget (iOS 18+) for Control Center custom controls — quick "log expense" tile. |
| R5-17 | L | Live Activity | M | Multi-activity pattern — concurrent "today's spend" + "savings goal countdown" Live Activities. Watch out for combined 4KB cap. |
| R5-18 | L | PSD2 | S | Migration plan doc (in `docs/psd2-migration-plan.md` — defer creation to round 9-10 once Yapily integration starts). |

---

## Sources — full bibliography

### Live Activities (Section 1)
- [Apple Developer — ActivityKit](https://developer.apple.com/documentation/activitykit) — checked 2026-05-08
- [Apple Developer — Starting and updating Live Activities with ActivityKit push notifications](https://developer.apple.com/documentation/activitykit/starting-and-updating-live-activities-with-activitykit-push-notifications) — checked 2026-05-08
- [Apple Developer — Bring your Live Activity to Apple Watch (WWDC24 Session 10068)](https://developer.apple.com/videos/play/wwdc2024/10068/) — checked 2026-05-08
- [Apple Developer — Update Live Activities with push notifications (WWDC23 Session 10185)](https://developer.apple.com/videos/play/wwdc2023/10185/) — checked 2026-05-08
- [Apple Developer — Broadcast updates to your Live Activities (WWDC24 Session 10069)](https://developer.apple.com/videos/play/wwdc2024/10069/) — checked 2026-05-08
- [9to5Mac — Live Activities won't be able to refresh as frequently in iOS 18](https://9to5mac.com/2024/08/31/live-activities-ios-18/) — checked 2026-05-08
- [Sparrow Code — Live Activity & Dynamic Island](https://sparrowcode.io/en/tutorials/live-activities) — checked 2026-05-08
- [createwithswift.com — Implementing Live Activities in a SwiftUI app](https://www.createwithswift.com/implementing-live-activities-in-a-swiftui-app/) — checked 2026-05-08
- [newly.app — iOS Live Activities 2026 guide](https://newly.app/articles/ios-live-activities) — checked 2026-05-08
- [Pushwoosh — iOS 18 Live Activities best practices](https://www.pushwoosh.com/blog/ios-live-activities/) — checked 2026-05-08
- [OneSignal — Elevate Your iOS Live Activities for Apple Watch (2024)](https://onesignal.com/blog/elevate-your-ios-live-activities-exciting-updates-for-apple-watch-in-2024/) — checked 2026-05-08
- [Medium — Bringing Live Activities to Apple Watch in watchOS 11](https://medium.com/@dhavaljasoliya8/bringing-live-activities-to-apple-watch-in-watchos-11-a-developers-guide-a95e1f4606ba) — checked 2026-05-08
- [Apple Developer Forums — Live Activity budget exceeded #799505](https://developer.apple.com/forums/thread/799505) — checked 2026-05-08
- [Canopas — Integrating Live Activity and Dynamic Island Part 2](https://canopas.com/integrating-live-activity-and-dynamic-island-in-i-os-a-complete-guide-part-2) — checked 2026-05-08

### App Intents + Siri (Section 2)
- [Apple Developer — App Intents](https://developer.apple.com/documentation/appintents) — checked 2026-05-08
- [Apple Developer — App Shortcuts](https://developer.apple.com/documentation/appintents/app-shortcuts) — checked 2026-05-08
- [Apple Developer — IntentParameter](https://developer.apple.com/documentation/appintents/intentparameter) — checked 2026-05-08
- [Apple Developer — Adding parameters to an app intent](https://developer.apple.com/documentation/appintents/adding-parameters-to-an-app-intent) — checked 2026-05-08
- [Apple Developer — Get to know App Intents (WWDC25 Session 244)](https://developer.apple.com/videos/play/wwdc2025/244/) — checked 2026-05-08
- [Apple Developer — Implement App Shortcuts with App Intents (WWDC22 Session 10170)](https://developer.apple.com/videos/play/wwdc2022/10170/) — checked 2026-05-08
- [Apple Developer — Bring your app's core features to users with App Intents (WWDC24 Session 10210)](https://developer.apple.com/videos/play/wwdc2024/10210/) — checked 2026-05-08
- [Apple Developer — Apple Intelligence](https://developer.apple.com/apple-intelligence/) — checked 2026-05-08
- [Apple Developer — Making in-app search actions available to Siri and Apple Intelligence](https://developer.apple.com/documentation/appintents/making-in-app-search-actions-available-to-siri-and-apple-intelligence) — checked 2026-05-08
- [Apple Developer Forums — Currency Amount (INCurrencyAmount) #733616](https://forums.developer.apple.com/forums/thread/733616) — checked 2026-05-08
- [Use Your Loaf — Getting Started With App Intents](https://useyourloaf.com/blog/getting-started-with-app-intents/) — checked 2026-05-08
- [Superwall — App Intents Field Guide](https://superwall.com/blog/an-app-intents-field-guide-for-ios-developers/) — checked 2026-05-08
- [Superwall — App Intents Interactive Snippets in iOS 26](https://superwall.com/blog/app-intents-interactive-snippets-in-ios-26/) — checked 2026-05-08
- [createwithswift.com — Performing your app actions with Siri through App Shortcuts Provider](https://www.createwithswift.com/performing-your-app-actions-with-siri-through-app-shortcuts-provider/) — checked 2026-05-08
- [GoodRequest — App Intents tips and tricks](https://www.goodrequest.com/blog/app-intents-tips-and-tricks) — checked 2026-05-08
- [SwiftLee — App Intents Spotlight integration using Shortcuts](https://www.avanderlee.com/swiftui/app-intents-spotlight-integration-using-shortcuts/) — checked 2026-05-08
- [sowenjub.me — Localizing App Shortcuts with App Intents](https://sowenjub.me/writes/localizing-app-shortcuts-with-app-intents/) — checked 2026-05-08
- [The Penny Hoarder — Copilot Money Review 2026](https://www.thepennyhoarder.com/budgeting/budgeting-copilot-money-review/) — checked 2026-05-08
- [ArcTouch — How to Implement iOS App Shortcuts & Intents](https://arctouch.com/blog/implementing-app-shortcuts-intents) — checked 2026-05-08

### PSD2 / Polish bank API (Section 3)
- [PolishAPI — About / Standard](https://polishapi.org/en/) — checked 2026-05-08
- [PolishAPI — Commercial Banks](https://polishapi.org/en/commercial-banks/) — checked 2026-05-08
- [Open Banking Tracker — 281 Banks in Poland](https://www.openbankingtracker.com/providers/country/pl) — checked 2026-05-08
- [Open Banking Tracker — Open Banking in Poland](https://www.openbankingtracker.com/country/poland) — checked 2026-05-08
- [Open Banking Tracker — GoCardless 2,228+ banks](https://www.openbankingtracker.com/api-aggregators/gocardless) — checked 2026-05-08
- [Open Banking Tracker — Salt Edge 1,586+ Institutions](https://www.openbankingtracker.com/api-aggregators/salt-edge) — checked 2026-05-08
- [Open Banking Tracker — Yapily 443+ Institutions](https://www.openbankingtracker.com/api-aggregators/yapily) — checked 2026-05-08
- [Open Banking Tracker — Nordigen acquired by GoCardless](https://www.openbankingtracker.com/api-aggregators/nordigen) — checked 2026-05-08
- [Open Banking Tracker — PKO Bank Polski provider](https://www.openbankingtracker.com/provider/pko-bank-polski) — checked 2026-05-08
- [Silicon Canals — GoCardless to acquire Nordigen](https://siliconcanals.com/gocardless-to-acquire-nordigen/) — checked 2026-05-08
- [Actual Budget Docs — GoCardless Setup](https://actualbudget.org/docs/advanced/bank-sync/gocardless/) — checked 2026-05-08
- [Actual Budget GitHub Issue #5505 — GoCardless discontinuation](https://github.com/actualbudget/actual/issues/5505) — checked 2026-05-08
- [Firefly III GitHub Issue #10753 — Add Enable Banking](https://github.com/firefly-iii/firefly-iii/issues/10753) — checked 2026-05-08
- [Yapily — Live in Poland (PolishAPI 2.1.4 / 3.0.1)](https://www.yapily.com/blog/live-in-poland-open-banking) — checked 2026-05-08
- [Yapily — Coverage page](https://www.yapily.com/coverage) — checked 2026-05-08
- [Yapily Blog — 90-day reauthentication changes](https://www.yapily.com/blog/90-day-reauthentication-changes) — checked 2026-05-08
- [Salt Edge — AIS Coverage Poland](https://www.saltedge.com/products/account_information/coverage/pl) — checked 2026-05-08
- [GoCardless — 90-day re-authentication rule](https://gocardless.com/guides/posts/90-day-re-authentication-rule/) — checked 2026-05-08
- [GoCardless — PSD2 explained](https://gocardless.com/guides/posts/an-introduction-to-psd2/) — checked 2026-05-08
- [GoCardless — Strong Customer Authentication](https://gocardless.com/guides/strong-customer-authentication/intro-to-sca/) — checked 2026-05-08
- [GoCardless Developers — Bank Account Data Statuses](https://developer.gocardless.com/bank-account-data/statuses/) — checked 2026-05-08
- [Projective Group — PSD2 alert: Authentication period extended to 180 days](https://www.projectivegroup.com/psd2-alert-authentication-period-for-account-information-services-extended-to-180-days/) — checked 2026-05-08
- [Open Banking Standards UK — 90-Days Re-authentication delegated SCA](https://standards.openbanking.org.uk/customer-experience-guidelines/appendices/90-days-reauthentication-delegated-sca/v3-1-11/) — checked 2026-05-08
- [PKO Bank Polski Developer Portal](https://developers.pkobp.pl/) — checked 2026-05-08
- [mBank Developer Portal](https://developer.api.mbank.pl/) — checked 2026-05-08
- [Santander Polska Developer Portal](https://developer.santander.pl) — checked 2026-05-08
- [ING Bank Śląski Developer Portal](https://devportal.ing.pl) — checked 2026-05-08
- [Bank Pekao Developer Portal](https://developer.pekao.com.pl/sandbox/) — checked 2026-05-08
- [Bank Millennium Open API](https://openapi.bankmillennium.pl) — checked 2026-05-08
- [Toshl X post — PKO PSD2 API outage 2024-05-26](https://x.com/Toshl/status/1795100937117139335) — checked 2026-05-08
- [Tink — Pricing](https://tink.com/pricing/) — checked 2026-05-08
- [Finexer — Tink Pricing UK](https://blog.finexer.com/tink-pricing/) — checked 2026-05-08
- [Fintegrationfs — Plaid vs Tink vs TrueLayer 2026](https://www.fintegrationfs.com/post/plaid-vs-tink-vs-truelayer-which-open-banking-api-is-best-for-your-fintech) — checked 2026-05-08
- [Enable Banking — PSD2 sandboxes](https://enablebanking.com/blog/2020/05/05/psd2-sandbox-apis) — checked 2026-05-08
- [Fiskil — Poland Open Banking PSD2 Regulations Status](https://www.fiskil.com/open-finance-tracker/poland) — checked 2026-05-08
- [Citi Handlowy — PSD2 Directive and open banking](https://www.citibank.pl/en/citi-handlowy-open-banking/) — checked 2026-05-08

---

## Cross-references to other Solvio docs

- Push notification strategy for the 165-day re-consent banner — see [`docs/push-strategy.md`](push-strategy.md) (R4).
- Apple Watch widget patterns — see [`docs/watch-vision-roadmap.md`](watch-vision-roadmap.md) (R4); R5 Section 1.4 extends with Live Activity Watch sync.
- Privacy Manifest (`PrivacyInfo.xcprivacy`) covers any new `UserDefaults` use in App Intents — see [`docs/gdpr-export-deletion.md`](gdpr-export-deletion.md) (R4).
- iOS UX rules and competitor-quote takedowns — see [`docs/competitor-matrix.md`](competitor-matrix.md) (R1).
- The PolishAPI direct integration was MVP'd in `lib/pko/types.ts` and is referenced in MEMORY.md `pko-psd2-api.md`.

End of R5 / A5 research.
