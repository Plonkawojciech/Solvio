# Solvio — Research Round 4: Apple Watch + Vision Pro, Push Notifications, GDPR Export & Deletion

**Date:** 2026-05-07
**Round:** 4 / 20 (production hardening loop)
**Agent:** A5 (research / competitive)
**Scope:** Three NEW dimensions, none repeated from R1/R2/R3:
1. Apple Watch (watchOS 11/12) + Vision Pro (visionOS 26) patterns for finance/expense apps.
2. iOS push notification strategy (interruption levels, permission timing, Live Activities ↔ Watch sync).
3. GDPR/EAA-grade export + account deletion flow + Apple Privacy Manifest stub.

Builds on `docs/research-round1.md`, `docs/research-round2.md`, `docs/research-round3.md`. **Does NOT repeat any R1/R2/R3 material.** Every claim is sourced (URL + checked May 2026).

---

## Executive summary — 5 highest-leverage findings

1. **Apple Watch is a cheap, high-leverage glance surface for Solvio — but Vision Pro is a defer-to-v3.** watchOS 11+ standardized on four `accessory*` widget families (`accessoryCircular`, `accessoryCorner`, `accessoryInline`, `accessoryRectangular`) via WidgetKit; ClockKit has been deprecated since watchOS 10. The cost to ship a Solvio Watch app with one independent screen + 2 complications + Live Activity sync is **~3-5 days of effort** (SwiftUI is shared, no new auth, payload reuses `/api/data/dashboard`). visionOS 26 (released Sept 2025, WWDC 2025) added **persistent spatial widgets** and a "Liquid Glass" aesthetic — but the addressable Vision Pro user base is <1M globally and the ROI for a fintech is near-zero in 2026. **Recommendation: ship Watch, defer Vision Pro to v3.** Effort split: Watch S–M, Vision Pro skip.
2. **Push permission must NEVER be asked on first launch — provisional auth is the iOS 12+ standard.** Apple's HIG and best-practice writing converge: request `[.alert, .sound, .badge, .provisional]` on first run (no UI prompt), let users see quiet notifications in Notification Center, then upgrade to full alerts via in-app prompt only after the user has demonstrably engaged. Critical Alerts (`.criticalAlert`) require an Apple-approved entitlement — **finance apps will not be approved** (reserved for safety/health/severe-weather). Time-Sensitive interruption level is the right call for budget-overshoot/weekly-recap notifications and breaks through Focus modes without entitlement. Effort: S.
3. **Solvio's `/api/personal/export-data` exists but is not GDPR-Article-20-grade.** Article 20 (data portability) requires "structured, commonly used, machine-readable" format. PDF scans of records do NOT comply — but Solvio's current export is JSON, which does. Solvio is missing: (a) CSV export for spreadsheet users, (b) PDF for legal/audit, (c) email-delivery mode (large exports), (d) audit-log entry on every export, (e) clear retention statement on what's kept post-deletion. Polish accounting law mandates **5 years from end of tax year** for financial records — Solvio's `audit_log` and `expenses`/`receipts` may legally need to be retained even after RODO erasure for tax-relevant subsets. The fix is anonymization (replace `userId` with random uuid, drop email/name) instead of hard delete for those rows. Effort: M.
4. **`PrivacyInfo.xcprivacy` is mandatory since May 1, 2024 and Solvio's iOS bundle does not have one.** Apple's Required Reason API list includes 5 categories that touch nearly every iOS app: `UserDefaults` (CA92.1), `FileTimestamp` (C617.1), `SystemBootTime` (35F9.1), `DiskSpace` (E174.1, 85F4.1), `ActiveKeyboard` (3EC4.1, 54BD.1). Solvio's SwiftUI views likely call into `UserDefaults` via `@AppStorage` and `FileTimestamp` via Vercel Blob downloads → both must be declared. App Store submissions without `PrivacyInfo.xcprivacy` get an `ITMS-91053` rejection. The file is XML, ~50 lines, takes ~30 minutes to write correctly. Effort: S.
5. **App Store reviews of Spendee (PL/global) and Money Lover map directly to Solvio's competitive moat.** Top complaints across both: (a) bank sync silently fails or breaks after iOS update, (b) data loss after subscription expiry / migration (Spendee deleted "years of data" per multiple reviews; offered 3 months free as compensation), (c) limited widget category options on iPhone (Money Lover hardcoded 6 categories), (d) categories crash app when nested deeply (Money Lover), (e) developer unresponsive 6+ months on critical bugs. **Solvio's positioning: PL-first, no bank-feed dependency required, JSON export downloadable any time, audit log of all changes, native iOS = no app-update breakage.** Effort: marketing positioning, no code.

---

## Sub-topic 1 — Apple Watch + Vision Pro patterns for finance apps

### 1.1 watchOS 11 / 12 widget + complication families (the canonical taxonomy)

WidgetKit unified watch complications and iPhone widgets in iOS 16 / watchOS 9 (WWDC22 "Complications and widgets: Reloaded"). ClockKit's template-based system was deprecated; SwiftUI views now drive both surfaces with a single codebase. The four families that work on Apple Watch are:

| Family | Position on watch face | Typical content | Best Solvio fit | Pixel constraints |
|---|---|---|---|---|
| `accessoryCircular` | Modular Compact / Circular slot | Single number, gauge, or icon | "% of monthly budget left" gauge | 120×120px image limit per [SwiftUI tutorial sources](https://lyvennithasasikumar.medium.com/complications-widgets-for-watchos-swiftui-99bf176231a8) — May 2026 |
| `accessoryCorner` | Corner slot (Infograph face) | Single numeric, often with curved/arc gauge | "Today's spend total" with arc to budget | Variable per face; uses `widgetCurvesContent()` |
| `accessoryInline` | Top-of-face inline text | One line of text | "Dziś: 47 zł / 200 zł" | One line, monospaced-readable |
| `accessoryRectangular` | Modular face large slot | Multi-line text + small chart | Last 3 expenses, or category breakdown | Larger area, supports `Text` + small `Chart` |

**Smart Stack relevance:** widgets that provide `TimelineEntry.relevance` cues automatically promote to the top of Smart Stack at relevant times. For Solvio, this means: **a "budget remaining" widget can flag relevance high when a user enters a known shopping vendor based on past `expenses.vendor` patterns** — a non-trivial moat over Money Lover/Spendee, neither of which use relevance API per public reviews.

Sources:
- [Apple Developer — Widgets and watch complications](https://developer.apple.com/documentation/widgetkit/widgets-and-complications-collection) — checked May 2026
- [WWDC22 — Complications and widgets: Reloaded](https://developer.apple.com/videos/play/wwdc2022/10050/) — checked May 2026
- [WWDC22 — Go further with Complications in WidgetKit](https://developer.apple.com/videos/play/wwdc2022/10051/) — checked May 2026
- [Sleekible — From ClockKit to WidgetKit](https://www.sleekible.com/2024/02/04/clockkit-to-widgetkit.html) — checked May 2026

### 1.2 watchOS 12 (rumored 2026) — Smart Stack relevance, S10 chip latency wins

Per third-party round-ups (Apple has not yet announced a "watchOS 12" name as of May 2026 — the actual release pattern is alignment with iOS, so we expect `watchOS 26` to mirror iOS 26 / visionOS 26 naming), the practical takeaways for a finance app shipping in 2026:

- **Smart Stack widgets on the wrist** (rolled out with watchOS 11): widgets surface based on relevance cues; complications remain the fastest way to show static data.
- **Reduced complication update latency** in watchOS 12 (per third-party reports, up to 40% faster than watchOS 11). Material for budget glance surfaces where stale numbers feel broken.
- **Series 10 / Ultra 3 / SE 3 ship with the S10 chip and always-on retina** — design for AOD reduced luminance.

Sources:
- [refurb.me — 20 Best Apple Watch Complications in 2026](https://www.refurb.me/blog/best-apple-watch-complications) — checked May 2026
- [applebitcoin.co — How to Put Bitcoin Price on Apple Watch (2026)](https://applebitcoin.co/how-to-put-bitcoin-price-on-apple-watch-2026/) — checked May 2026
- [the5krunner.com — Best Apple Watch 2026: Series 11, Ultra 3 or SE 3](https://the5krunner.com/2026/02/05/best-apple-watch-2026/) — checked May 2026

### 1.3 What competing finance apps actually ship on Apple Watch

| App | Watch app independent? | Complications | What it shows | Public review signal (May 2026) |
|---|---|---|---|---|
| **Mint** (discontinued) | View-only mirror of iPhone | Yes (limited families) | Monthly budget, discretionary remaining | Discontinued 2023; archive only |
| **YNAB** | Yes | Yes | Available funds, category progress | Praised, popular |
| **Copilot Money** | Yes — independent + iCloud sync | Yes | Native widgets + watch glances + Siri shortcuts | Apple Editor's Choice 2026 |
| **MoneyWatch** | Yes — native watch app | Yes | Account + transaction summaries on watch | Niche but well-rated |
| **Money Lover** | Limited | Limited (6 hardcoded categories per reviews) | Quick balance | App-update breakage complaints common |
| **Spendee** | None / minimal | None confirmed | N/A | Watch not a focus |

**Solvio takeaway:** the segment leader (Copilot Money) ships a near-independent Watch app with widgets + complications + Siri shortcuts, and it's positioned as an Apple Editor's Choice differentiator. Solvio is iOS-native already; ~5 days of Solvio engineering buys parity. **Recommendation: ship a Watch app in v2 (round 7+).**

Sources:
- [money.com — 15 Very Cool Money Apps for the Apple Watch](https://money.com/apple-watch-personal-finance-apps/) — checked May 2026
- [thepennyhoarder.com — Copilot Money Review 2026](https://www.thepennyhoarder.com/budgeting/budgeting-copilot-money-review/) — checked May 2026
- [help.copilot.money — Improving Widget Performance](https://help.copilot.money/en/articles/4968599-improving-widget-performance) — checked May 2026
- [applevis.com — Mint Personal Finance & Money on watch](https://www.applevis.com/apps/watch/finance/mintpersonal-finance-money) — checked May 2026

### 1.4 Live Activities → Apple Watch sync (the free win)

Live Activities (ActivityKit, iOS 16.1+) automatically sync to Apple Watch's Smart Stack with **zero additional code** as of watchOS 11 (WWDC24 session 10068). The Dynamic Island compact views appear in the Smart Stack automatically.

Key facts:
- No separate Watch push token required — same `Activity<Attributes>` in the iOS app drives both surfaces.
- Updates count against Apple Watch's update budget. High-frequency updates supported when paired with iPhone via Wi-Fi or Bluetooth.
- **Always-On Display (AOD) reduced luminance** is automatic. Use `@Environment(\.isLuminanceReduced)` to dim bright elements:

```swift
struct BudgetGauge: View {
    @Environment(\.isLuminanceReduced) private var isLuminanceReduced
    var context: ActivityViewContext<BudgetActivityAttributes>

    var body: some View {
        Gauge(value: context.state.spentRatio) {
            Text(context.state.budgetLeft, format: .currency(code: "PLN"))
        }
        .tint(isLuminanceReduced ? .gaugeDim : .gaugeFull)
    }
}
```

- Add `.supplementalActivityFamilies([.small])` to the `ActivityConfiguration` to opt into Smart Stack rendering on the watch.
- For **Solvio**: a "shopping in progress" Live Activity (started when the user opens AddExpenseSheet, ended on save with the new amount + category) is a high-leverage pattern. Cost: ~1 day of work. Surfaces on lock screen, Dynamic Island, AND Apple Watch Smart Stack with no extra Watch code required.

Sources:
- [WWDC24 — Bring your Live Activity to Apple Watch](https://developer.apple.com/videos/play/wwdc2024/10068/) — checked May 2026
- [Apple Developer — Displaying live data with Live Activities](https://developer.apple.com/documentation/activitykit/displaying-live-data-with-live-activities) — checked May 2026
- [newly.app — iOS Live Activities Guide 2026](https://newly.app/articles/ios-live-activities) — checked May 2026

### 1.5 Vision Pro / visionOS 26 for finance — defer

visionOS 26 (released Sept 15, 2025; announced WWDC 2025) introduced spatial widgets, "Liquid Glass" design language, and persistence (widgets stay where the user pinned them across sessions). Per Apple Newsroom and macrumors:

- Widgets render as either `Paper` or `Glass` material; both adapt to ambient lighting.
- Frame thickness, color, and depth are user-customizable.
- Widgets pinned to a vertical or horizontal surface persist across reboots — a fintech "morning dashboard" use case is conceptually a fit.
- iOS WidgetKit code "looks great on visionOS" with no changes (per Apple's "Adapting your widgets for visionOS" doc) — but the device installed base in 2026 is sub-1M globally per industry estimates.

**Solvio recommendation:** **defer Vision Pro to v3 (2027+).** Reasons:
- Current Vision Pro user base is order-of-magnitude smaller than Apple Watch user base.
- Solvio's daily-active surface is iPhone (camera for receipt scan). Vision Pro adds zero capability there.
- WidgetKit code from the iPhone build will work on Vision Pro automatically when/if Solvio shipped widgets — **building widgets for iPhone is the right path; Vision Pro is a free side-effect, not a feature investment.**
- The Liquid Glass design language is converging across iOS / iPadOS / macOS / visionOS in iOS 26+ → designing for it on iPhone first makes the visionOS port automatic.

Effort estimate for Vision Pro-specific build: 8-12 days (not justifiable). For the free port from iPhone widgets: 0 days when the iPhone widgets ship.

Sources:
- [Apple Newsroom — visionOS 26 introduces powerful new spatial experiences](https://www.apple.com/newsroom/2025/06/visionos-26-introduces-powerful-new-spatial-experiences-for-apple-vision-pro/) — checked May 2026
- [macrumors — Apple Releases visionOS 26](https://www.macrumors.com/2025/09/15/apple-releases-visionos-26/) — checked May 2026
- [WWDC25 — What's new in visionOS 26](https://developer.apple.com/videos/play/wwdc2025/317/) — checked May 2026
- [WWDC25 — Design widgets for visionOS](https://developer.apple.com/videos/play/wwdc2025/255/) — checked May 2026
- [Apple Developer — Updating your widgets for visionOS](https://developer.apple.com/documentation/WidgetKit/Updating-your-widgets-for-visionOS) — checked May 2026

### 1.6 Solvio Apple Watch app — concrete roadmap

A 5-day plan that ships a useful Watch surface without a separate backend:

**Day 1 — Project structure**
- Add Watch app target (`Solvio Watch`) sharing the `Solvio` Swift package.
- Reuse existing `Networking` + `Locale` + `Models` modules (zero duplication).
- Wire WatchConnectivity for fast iPhone-pair fallback when no Wi-Fi.

**Day 2 — Two complications (`accessoryCircular` + `accessoryRectangular`)**
- Circular: budget % left (gauge).
- Rectangular: last 3 expenses (truncated vendor + amount).
- Wire `TimelineProvider` against `/api/data/dashboard` (already shipped).
- `WidgetConfiguration.relevance` from past-7-day spending pattern ("8 PM → high relevance" if user typically logs evening expenses).

**Day 3 — Independent main view (Add Expense quick log)**
- Single-screen amount keypad + category picker (top 5 by usage).
- POST to `/api/data/expenses` (existing) with bearer cookie via WatchConnectivity-relayed session.
- Optimistic UI: insert local `pendingExpense`, retry queue if offline.

**Day 4 — Live Activity sync**
- Add `BudgetActivity` ActivityKit attributes; iPhone starts Activity on AddExpenseSheet open, ends on save.
- `.supplementalActivityFamilies([.small])` for Smart Stack.

**Day 5 — Polish + AOD + a11y + ship**
- VoiceOver labels on all complications.
- AOD luminance treatment.
- Submit Watch app slice to TestFlight.

**Backend changes needed:** 0 (everything is already shipped).

**Net effort:** 5 dev-days for full feature parity with Copilot Money's Watch story.

---

## Sub-topic 2 — Push notification strategy

### 2.1 The four interruption levels (the modern taxonomy)

iOS has converged on four interruption levels, set on `UNNotificationContent.interruptionLevel`. The choice of level is the single most important decision for a finance app's notification UX.

| Level | UI behavior | Sound? | Bypasses Focus? | Entitlement? | Apple approval? | Solvio use cases |
|---|---|---|---|---|---|---|
| `.passive` | Silent, lands in Notification Center only; no banner | No | No | No | No | "Weekly recap ready", "New cheaper price detected for X" |
| `.active` (default) | Standard banner + sound | Yes | No | No | No | "Settlement request from Wojtek", "Group expense added" |
| `.timeSensitive` | Yellow "Time Sensitive" banner; breaks Focus modes; can break scheduled delivery | Yes | **Yes** | No (but `com.apple.developer.usernotifications.time-sensitive` recommended) | No | "You're 95% over budget for Groceries this month", "Subscription auto-renew tomorrow at 599 zł" |
| `.critical` | Plays sound even with mute switch / DND on; bypasses everything | Yes (configurable level) | Yes | **`com.apple.developer.usernotifications.critical-alerts`** | **Yes — Apple-approved per app, narrow categories only** | **None** — finance apps will not be approved (reserved for safety/health/severe weather) |

**Solvio mapping recommendation:**
- Settlement nudges, share-token confirms, group invites → **`.active`** (default).
- Weekly recap, "new cheaper X at store Y", new feature announcements → **`.passive`**.
- Budget overshoot, recurring auto-renew T-1 day → **`.timeSensitive`**.
- Never use `.critical` — Apple will not approve a budget app.

Sources:
- [Apple Developer — UNNotificationInterruptionLevel.timeSensitive](https://developer.apple.com/documentation/usernotifications/unnotificationinterruptionlevel/timesensitive) — checked May 2026
- [Apple Developer — Critical Alerts entitlement](https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.developer.usernotifications.critical-alerts) — checked May 2026
- [Apple Developer — UNAuthorizationOptions criticalAlert](https://developer.apple.com/documentation/usernotifications/unauthorizationoptions/criticalalert) — checked May 2026
- [OneSignal — iOS Focus modes and interruption levels](https://documentation.onesignal.com/docs/en/ios-focus-modes-and-interruption-levels) — checked May 2026
- [WWDC21 — Send communication and Time Sensitive notifications](https://developer.apple.com/videos/play/wwdc2021/10091/) — checked May 2026

### 2.2 Provisional authorization — never ask on first launch

The iOS HIG and best-practice writing converge on one rule: **do not request notification authorization on first launch**. The pattern instead:

```swift
// On app launch (e.g. SolvioApp.init or a Task in WindowGroup)
let center = UNUserNotificationCenter.current()
do {
    try await center.requestAuthorization(
        options: [.alert, .sound, .badge, .provisional]
    )
} catch {
    // Log, do not block UX
}
```

**What `.provisional` does:**
- No system permission dialog.
- Notifications deliver QUIETLY into the Notification Center (no banner, no sound).
- Each notification ships with two action buttons: "Keep" and "Turn Off."
- After the user has seen value (taps "Keep" or interacts), upgrade to full authorization with a custom in-app prompt explaining the value, then redirect to Settings via `UIApplication.openSettingsURLString` (Apple does not allow a second system prompt).

**Why provisional matters for Solvio:**
- Most users default-deny if asked at first launch (industry numbers: ~40% acceptance for first-launch ask, ~60-70% acceptance for in-context ask after engagement, per multiple iOS notification UX writeups).
- Provisional gets you on the user's radar with zero friction, and Apple specifically designed this path to encourage opt-in over time.
- Subscription detection notifications, weekly recaps, and budget overshoot alerts all work fine as quiet provisional notifications during onboarding — let the user discover value before you ask for the bell.

**Upgrade trigger for Solvio (concrete):**
- After the user has saved 3+ expenses AND opened the app on 2+ separate days, surface an in-app sheet: "Włącz przypomnienia o budżecie" / "Turn on budget alerts" with a one-line explainer and a button that opens Settings. NOT a system prompt — those can't be re-triggered.

Sources:
- [nilcoalescing.com — Sending trial notifications with provisional authorization on iOS](https://nilcoalescing.com/blog/TrialNotificationsWithProvisionalAuthorizationOnIOS/) — checked May 2026
- [Phiture — Provisional Push: What is it and how will it impact your addressable audience?](https://phiture.com/blog/provisional-push-what-is-it-and-how-will-it-impact-your-addressable-audience/) — checked May 2026
- [useyourloaf.com — Provisional Authorization of User Notificatons](https://useyourloaf.com/blog/provisional-authorization-of-user-notificatons/) — checked May 2026
- [medium — iOS Push Notifications: Stop Asking Permission on Day One](https://medium.com/@shobhakartiwari/ios-push-notifications-stop-asking-permission-on-day-one-7a2fb2bbe366) — checked May 2026

### 2.3 Solvio's notification taxonomy (concrete)

Map every Solvio notification to a level + cadence + content template:

| Notification | Trigger | Interruption | Cadence cap | Polish content | English content |
|---|---|---|---|---|---|
| Weekly recap | Sunday 19:00 local | `.passive` | 1/week | "Twój tygodniowy raport jest gotowy. W tym tygodniu wydałeś X zł." | "Your weekly recap is ready. You spent X this week." |
| Budget overshoot 80% | When `category.spent / category.budget > 0.8` | `.timeSensitive` | 1/category/period | "Uważaj — wydałeś już 80% budżetu na: {category}." | "Heads up — you've used 80% of your budget for: {category}." |
| Budget overshoot 100% | When `> 1.0` | `.timeSensitive` | 1/category/period | "Przekroczyłeś budżet na: {category} o {amount} zł." | "You've gone over budget for: {category} by {amount}." |
| Subscription detected (R3 backlog) | When detector fires after 3rd occurrence | `.passive` | 1/subscription | "Wygląda na cykliczną opłatę: {vendor}, {amount} zł/mies. Potwierdź?" | "Looks like a recurring charge: {vendor}, {amount}/mo. Confirm?" |
| Subscription auto-renew T-1 day | 24h before next predicted occurrence | `.timeSensitive` | 1/subscription/period | "Jutro odnowienie: {vendor} ({amount} zł)." | "Tomorrow's auto-renew: {vendor} ({amount})." |
| Settlement request | New `paymentRequests` row on user | `.active` | per request | "{name} prosi cię o {amount} zł za {description}." | "{name} requests {amount} for {description}." |
| Settlement settled (incoming) | Other party clicked Settle | `.passive` | per request | "{name} rozliczył(a) {amount} zł." | "{name} settled {amount}." |
| Group invite | Share token used / member added | `.active` | per invite | "{name} dodał cię do grupy: {groupName}." | "{name} added you to: {groupName}." |
| Cheaper price found (audit) | Audit detects ≥10% cheaper alt for known vendor | `.passive` | 1/vendor/30d | "{vendor} oferuje {amount} zł zamiast {orig} u {altVendor}." | "{altVendor} offers {amount} instead of {orig} at {vendor}." |
| Receipt OCR done | When `receipts.status` flips to `processed` | `.active` (foreground only) | per receipt | "Paragon zeskanowany: {vendor}, {total} zł." | "Receipt scanned: {vendor}, {total}." |

**Anti-patterns to AVOID (per Spendee/Money Lover review mining):**
- Daily spam ("how was your day?" generic). Users mute these immediately.
- Batched bundling at fixed hours that isn't user-customizable.
- Re-asking for permission after a deny (illegal in iOS; redirect to Settings instead).
- Critical Alerts for non-emergency content — Apple will reject the entitlement, so it's moot.

### 2.4 Live Activities for shopping in progress (the standout pattern)

A Live Activity is a foreground "task in progress" surface that lives on the Lock Screen, Dynamic Island, and (auto-syncs to) Apple Watch Smart Stack. For Solvio, the prime use case:

**"Shopping at {vendor}" Live Activity:**
- Started when user opens AddExpenseSheet from a known vendor (or scans a receipt that matches an active geofenced location).
- Updates `state.runningTotal` as the user adds expenses to the same vendor in a session.
- Ends when user closes the sheet or after a 60-min idle timeout.
- Shows in Dynamic Island as "🛒 Biedronka — 47,30 zł".

```swift
struct ShoppingActivityAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        var runningTotal: Decimal
        var itemCount: Int
        var vendor: String
    }
    var sessionId: UUID
}

// Start on AddExpense open
let activity = try Activity<ShoppingActivityAttributes>.request(
    attributes: ShoppingActivityAttributes(sessionId: UUID()),
    content: .init(state: .init(runningTotal: 0, itemCount: 0, vendor: vendor),
                   staleDate: Date().addingTimeInterval(60*60))
)

// Update on each save
await activity.update(.init(state: newState, staleDate: ...))

// End on close
await activity.end(.init(state: finalState, staleDate: nil), dismissalPolicy: .immediate)
```

This single feature ships:
- Lock Screen presence (huge engagement).
- Dynamic Island compact view (iPhone 15+).
- Apple Watch Smart Stack sync (free, auto).
- iOS 18+ Smart Stack on iPhone Lock Screen.

**Cost:** ~1.5 days of work. **Marketing benefit:** the only Polish expense app shipping Live Activities in 2026.

Sources:
- [Apple Developer — ActivityKit](https://developer.apple.com/documentation/activitykit) — checked May 2026
- [Canopas — Integrating Live Activity and Dynamic Island in iOS](https://canopas.com/integrating-live-activity-and-dynamic-island-in-i-os-a-complete-guide) — checked May 2026
- [newly.app — Dynamic Island 2026](https://newly.app/articles/dynamic-island) — checked May 2026

### 2.5 iOS 18 / iOS 26 specific updates

Per [newly.app — iOS Push Notifications Guide 2026](https://newly.app/articles/ios-push-notifications) and [pushwoosh — iOS push notifications guide 2026](https://www.pushwoosh.com/blog/ios-push-notifications/), iOS 18 introduced:

- **Smarter "priority notifications"** with on-device ranking — relevance score affects display order in Notification Center.
- **Reduce Interruptions Focus mode** — a system Focus mode that AI-filters non-urgent notifications. Time-Sensitive notifications break through; Active does not.
- **Improved silent push delivery consistency** — `content-available: 1` push has more predictable wake behavior.
- **Refined permission UX** — Apple has made the system dialog more compact; in-context asking matters more than ever.

**Concrete payload format (May 2026):**
```json
{
  "aps": {
    "alert": {
      "title": "Przekroczono budżet",
      "subtitle": "Kategoria: Spożywcze",
      "body": "Wydałeś 850 zł z 800 zł limitu (106%)."
    },
    "sound": "default",
    "badge": 1,
    "interruption-level": "time-sensitive",
    "relevance-score": 1.0,
    "category": "BUDGET_ALERT"
  },
  "category_id": "groceries",
  "deep_link": "solvio://budget/groceries"
}
```

Where `relevance-score` (0.0–1.0) drives Smart Stack ordering on Watch and Notification Center grouping in iOS 18+.

Sources:
- [pushwoosh — iOS push notifications guide 2026](https://www.pushwoosh.com/blog/ios-push-notifications/) — checked May 2026
- [Bugfender — iOS Push Notifications: Complete APNs & Swift Setup Guide](https://bugfender.com/blog/ios-push-notifications/) — checked May 2026
- [oneuptime — iOS Push Notifications in Swift](https://oneuptime.com/blog/post/2026-02-02-ios-push-notifications/view) — checked May 2026

### 2.6 SKStoreReviewController + RequestReviewAction (rate-the-app)

Apple imposes a hard limit of **3 review prompts per user per app per 365 days**. The system enforces this; you don't need to track it yourself. Best timing per Apple HIG and third-party writeups:

- **NEVER on app launch.**
- **NEVER after a user error** (a frustrated user is a 1-star user).
- **DO** after a user successfully completes a meaningful task — for Solvio:
  - After 5th successful receipt scan in a session.
  - After successfully closing a settlement.
  - After viewing a generated report.
  - After hitting a savings goal.
- Add a 1-2s delay before calling `requestReview()` so the UI settles.

**Modern SwiftUI pattern (iOS 16+):**
```swift
import SwiftUI
import StoreKit

struct GoalDetailView: View {
    @Environment(\.requestReview) private var requestReview

    func onGoalCompleted() {
        // ... save goal, show celebration ...
        Task {
            try? await Task.sleep(for: .seconds(2))
            requestReview()
        }
    }
}
```

The `requestReview` Environment value (iOS 16+) replaces the older `SKStoreReviewController.requestReview(in:)`. Both are rate-limited identically by the system.

Sources:
- [Apple Developer — RequestReviewAction](https://developer.apple.com/documentation/storekit/requestreviewaction) — checked May 2026
- [Apple Developer — SKStoreReviewController](https://developer.apple.com/documentation/storekit/skstorereviewcontroller) — checked May 2026
- [SwiftLee — Increase App Ratings by using SKStoreReviewController](https://www.avanderlee.com/swift/skstorereviewcontroller-app-ratings/) — checked May 2026
- [criticalmoments.io — SKStoreReviewController Guide with Examples](https://criticalmoments.io/blog/skstorereviewcontroller_guide_with_examples) — checked May 2026
- [Sarunw — How to request users to review your app in SwiftUI](https://sarunw.com/posts/how-to-request-users-to-review-app-in-swiftui/) — checked May 2026

---

## Sub-topic 3 — Backup, export, account deletion (GDPR / EAA / RODO + Privacy Manifest)

### 3.1 The legal bar — GDPR Articles 15, 17, 20 (and Polish RODO)

**Article 15 — Right of Access:** the data subject has the right to obtain confirmation as to whether personal data concerning them is being processed, and where that is the case, access to the personal data and supplementary information.

**Article 17 — Right to Erasure ('Right to be Forgotten'):** the data subject has the right to obtain erasure of personal data without undue delay; the controller has the obligation to erase without undue delay.

**Article 20 — Right to Data Portability:** the data subject has the right to receive personal data concerning them in a **structured, commonly used and machine-readable format** and to transmit it without hindrance.

**Time limits:** organizations must respond to access/portability/erasure requests within **one month** of receipt. May extend by two months for complex requests, but must inform the subject.

**Polish RODO specifics:**
- RODO is GDPR transposed into Polish law via the Act of 10 May 2018 on the Protection of Personal Data. Largely identical to GDPR with minor procedural differences.
- Privacy notices for consumers MUST be in Polish.
- The Polish DPA (UODO — Urząd Ochrony Danych Osobowych) actively conducts audits; 2026 audit plan published on gofin.pl shows fintech as a priority sector.

**Critical conflict for Solvio (Polish accounting law):**
- Polish tax law mandates retention of financial records (invoices, receipts, transaction records) for **5 years from the end of the calendar year in which the tax obligation arose**. Many businesses keep 6 years.
- KSeF (mandatory e-invoicing) launched Feb 1, 2026 (large taxpayers) and April 1, 2026 (most companies); KSeF repository retains 10 years.
- For users acting as consumers, this is less binding — but if Solvio adds business mode (already in `productType` schema), `expenses` and `receipts` for that user may need to be retained even after a RODO deletion request.
- **Resolution pattern:** anonymize rather than hard-delete the financial-record subset. Replace `userId` with a random UUID; null out `email`, `name`, IP address, device IDs; keep amount/date/category for legal compliance.

Sources:
- [GDPR-info.eu — Article 17 GDPR Right to erasure](https://gdpr-info.eu/art-17-gdpr/) — checked May 2026
- [gdpr-text.com — Article 20 Right to data portability](https://gdpr-text.com/read/article-20/) — checked May 2026
- [DLA Piper — Data protection laws in Poland](https://www.dlapiperdataprotection.com/index.html?t=law&c=PL) — checked May 2026
- [GDPR.pl — Artykuł 17 Prawo do usunięcia danych](https://gdpr.pl/baza-wiedzy/akty-prawne/interaktywny-tekst-gdpr/artykul-17-prawo-do-usuniecia-danych-prawo-do-bycia-zapomnianym) — checked May 2026
- [GDPR.pl — Retencja danych osobowych](https://gdpr.pl/artykuly/retencja-danych-osobowych) — checked May 2026
- [polishtax.com — Invoicing in Poland 2026](https://polishtax.com/information/polish-tax-law/issuance-of-the-invoices/) — checked May 2026
- [edicomgroup.com — Poland implements mandatory B2B electronic invoicing with KSeF](https://edicomgroup.com/blog/poland-will-make-b2b-electronic-invoicing-mandatory) — checked May 2026
- [usercentrics — GDPR data retention compliance guidelines](https://usercentrics.com/knowledge-hub/gdpr-data-retention/) — checked May 2026
- [ICO — Right to data portability](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/individual-rights/individual-rights/right-to-data-portability/) — checked May 2026
- [Auth0 — GDPR Data Portability](https://auth0.com/docs/secure/data-privacy-and-compliance/gdpr/gdpr-data-portability) — checked May 2026
- [Subiektywnie o finansach — Konto w Getinie i RODO](https://subiektywnieofinansach.pl/zamknela-konto-w-getinie-i-poprosila-bank-o-usuniecie-swoich-danych-osobowych-bank-jej-odmowil-co-tu-jest-grane-co-na-to-rodo/) — checked May 2026

### 3.2 Export format strategy — CSV + JSON + PDF (all three)

Per ICO and Auth0 guidance, "structured, commonly used, machine-readable" rules out:
- Image scans (PDF photos of records).
- Proprietary binary formats.
- Encrypted files without user-controllable keys.

**Solvio's export tier strategy:**

| Format | Use case | Destination | Effort to add (Solvio) |
|---|---|---|---|
| **JSON** (already shipped) | Programmer / tool import; full fidelity | Vercel Blob signed URL | 0 (exists) |
| **CSV** (one file per table) | Spreadsheet users; expenses.csv, receipts.csv, settlements.csv | Vercel Blob, ZIP bundle | S — add a builder per table |
| **PDF** (human-readable summary) | Legal/audit; cover page + summary tables | Vercel Blob via existing pdfkit | M — design template |
| **OFX / QIF** (banking interchange) | Import into Quicken/YNAB/Money Lover | Vercel Blob | L — defer; small audience |

**Recommendation:** ship JSON + CSV + PDF as a single ZIP. The user clicks "Export my data" → backend kicks off async job → email + push when ready → ZIP signed URL valid for 24h.

**Audit trail:** every export must write an `audit_log` entry: `{ userId, action: "data_export", format: "json+csv+pdf", sizeBytes, fingerprint }`. This protects both the user (proof of access) and Solvio (compliance evidence).

### 3.3 Account deletion flow — best-in-class pattern

Apple has required in-app account deletion since June 30, 2022 (for any app that supports account creation). The flow must:
1. Live within the app (not require a website).
2. Be reasonably easy to find (Settings → Account → Delete).
3. Permit reauthentication and confirmation steps to prevent accidental deletion.
4. Inform the user of timing.
5. Comply with retention exceptions (legal — see 3.1).

**The recommended Solvio flow:**

```
Settings → Konto / Account → Usuń konto / Delete account
  ↓
Screen 1: What will happen
  • All expenses, receipts, groups, reports — permanently deleted
  • Subscription auto-renew cancelled (link to App Store subs)
  • Data retained: anonymized financial records (5y per Polish tax law) — see Privacy Notice
  • Process timing: instant for personal data; 30 days for backup purge
  • Cannot be undone after 24h grace period
  [Cancel] [Continue]
  ↓
Screen 2: Re-authentication
  • Send code to email
  • Enter 6-digit code
  [Cancel] [Verify]
  ↓
Screen 3: Final confirmation
  • Type "USUŃ KONTO" / "DELETE ACCOUNT" to confirm
  • Reason (optional, free text) — for product feedback
  [Cancel] [Permanently Delete]
  ↓
Screen 4: Done
  • Confirmation: "Twoje konto zostanie usunięte w ciągu 24h. Otrzymasz email z potwierdzeniem."
  • Sign out, return to splash
```

**Backend implementation:**
- `POST /api/personal/account/delete` → write `audit_log` entry, set `userSettings.deletionScheduledAt = now() + 24h`, dispatch a 24h-delayed cron task.
- 24h grace cron: hard-delete `userSettings`, `categories`, `groups` (where user is sole creator), `paymentRequests` (where user is from/to), `bankConnections`, `bankAccounts`, `priceComparisons`, `goals`, `reports`. Anonymize `expenses`, `receipts`, `expenseSplits` (set `userId = anon_<uuid>`, drop `email`/IP/device traces).
- Email confirmation on completion.
- Optional: 24h "undo" link in initial confirmation email.

**Apple Privacy Details vs in-app deletion:** these are separate. The App Store privacy nutrition label is informational; in-app deletion is mandatory for compliance.

**Auto-renewable subscription handling:** if Solvio adds a Pro tier later, the deletion flow must:
- Notify user that App Store subscription continues until cancelled.
- Provide a deep link to `https://apps.apple.com/account/subscriptions`.
- Optionally schedule deletion at next subscription expiration.

Sources:
- [Apple Developer — Offering account deletion in your app](https://developer.apple.com/support/offering-account-deletion-in-your-app/) — checked May 2026
- [Apple Developer — Account deletion within apps required starting January 31](https://developer.apple.com/news/?id=mdkbobfo) — checked May 2026
- [Apple Developer — Account deletion requirement starts June 30](https://developer.apple.com/news/?id=12m75xbj) — checked May 2026
- [Capgo — Account Deletion Compliance: Apple Guidelines](https://capgo.app/blog/account-deletion-compliance-apple-guidelines/) — checked May 2026
- [TermsFeed — Apple's Requirement for In-App Deletion of Accounts](https://www.termsfeed.com/blog/apple-requirement-in-app-deletion-accounts/) — checked May 2026
- [Authgear — The Right to Erasure](https://www.authgear.com/post/the-right-to-erasure-and-how-you-can-follow-it-for-your-apps) — checked May 2026
- [Transcend — Apple In-App Account Deletion](https://docs.transcend.io/docs/articles/privacy-requirements/apple-account-deletion) — checked May 2026

### 3.4 Apple Privacy Manifest (`PrivacyInfo.xcprivacy`) — mandatory since May 1, 2024

Solvio is iOS-native; the App Store will reject any submission without a `PrivacyInfo.xcprivacy` file. The file declares:

1. **`NSPrivacyTracking`** — boolean; whether the app tracks the user across other apps/sites.
2. **`NSPrivacyTrackingDomains`** — domains contacted for tracking.
3. **`NSPrivacyCollectedDataTypes`** — array of dictionaries describing what data is collected.
4. **`NSPrivacyAccessedAPITypes`** — array of dictionaries declaring use of "Required Reason APIs."

**Required Reason API categories (full list, May 2026):**

| Category (`NSPrivacyAccessedAPIType`) | Reason codes | When Solvio uses it |
|---|---|---|
| `NSPrivacyAccessedAPICategoryUserDefaults` | `CA92.1` (own app), `1C8F.1` (app group), `C56D.1` (CloudKit) | Anywhere `@AppStorage` is used (locale toggle, theme, onboarding flag) |
| `NSPrivacyAccessedAPICategoryFileTimestamp` | `C617.1` (own files), `3B52.1` (display to user), `0A2A.1` (sync), `DDA9.1` (third-party SDK) | Receipt cache freshness, downloaded report metadata |
| `NSPrivacyAccessedAPICategorySystemBootTime` | `35F9.1` (calc time intervals), `8FFB.1` (timer), `3D61.1` (mirror to Apple) | Likely none today; may need if performance-monitoring SDK added |
| `NSPrivacyAccessedAPICategoryDiskSpace` | `E174.1` (dest space), `85F4.1` (write check), `7D9E.1` (third-party), `B728.1` (Apple-mirroring) | Image cache for receipts |
| `NSPrivacyAccessedAPICategoryActiveKeyboard` | `3EC4.1` (custom keyboard with reason), `54BD.1` (own keyboard) | Likely none |

**Solvio data types collected (initial mapping):**

```xml
<!-- PrivacyInfo.xcprivacy template for Solvio -->
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>NSPrivacyTracking</key>
    <false/>
    <key>NSPrivacyTrackingDomains</key>
    <array/>
    <key>NSPrivacyCollectedDataTypes</key>
    <array>
        <dict>
            <key>NSPrivacyCollectedDataType</key>
            <string>NSPrivacyCollectedDataTypeEmailAddress</string>
            <key>NSPrivacyCollectedDataTypeLinked</key>
            <true/>
            <key>NSPrivacyCollectedDataTypeTracking</key>
            <false/>
            <key>NSPrivacyCollectedDataTypePurposes</key>
            <array>
                <string>NSPrivacyCollectedDataTypePurposeAppFunctionality</string>
            </array>
        </dict>
        <dict>
            <key>NSPrivacyCollectedDataType</key>
            <string>NSPrivacyCollectedDataTypePurchaseHistory</string>
            <key>NSPrivacyCollectedDataTypeLinked</key>
            <true/>
            <key>NSPrivacyCollectedDataTypeTracking</key>
            <false/>
            <key>NSPrivacyCollectedDataTypePurposes</key>
            <array>
                <string>NSPrivacyCollectedDataTypePurposeAppFunctionality</string>
                <string>NSPrivacyCollectedDataTypePurposeAnalytics</string>
            </array>
        </dict>
        <dict>
            <key>NSPrivacyCollectedDataType</key>
            <string>NSPrivacyCollectedDataTypeOtherFinancialInfo</string>
            <key>NSPrivacyCollectedDataTypeLinked</key>
            <true/>
            <key>NSPrivacyCollectedDataTypeTracking</key>
            <false/>
            <key>NSPrivacyCollectedDataTypePurposes</key>
            <array>
                <string>NSPrivacyCollectedDataTypePurposeAppFunctionality</string>
            </array>
        </dict>
        <dict>
            <key>NSPrivacyCollectedDataType</key>
            <string>NSPrivacyCollectedDataTypePhotosorVideos</string>
            <key>NSPrivacyCollectedDataTypeLinked</key>
            <true/>
            <key>NSPrivacyCollectedDataTypeTracking</key>
            <false/>
            <key>NSPrivacyCollectedDataTypePurposes</key>
            <array>
                <string>NSPrivacyCollectedDataTypePurposeAppFunctionality</string>
            </array>
        </dict>
        <dict>
            <key>NSPrivacyCollectedDataType</key>
            <string>NSPrivacyCollectedDataTypeDeviceID</string>
            <key>NSPrivacyCollectedDataTypeLinked</key>
            <true/>
            <key>NSPrivacyCollectedDataTypeTracking</key>
            <false/>
            <key>NSPrivacyCollectedDataTypePurposes</key>
            <array>
                <string>NSPrivacyCollectedDataTypePurposeAppFunctionality</string>
            </array>
        </dict>
    </array>
    <key>NSPrivacyAccessedAPITypes</key>
    <array>
        <dict>
            <key>NSPrivacyAccessedAPIType</key>
            <string>NSPrivacyAccessedAPICategoryUserDefaults</string>
            <key>NSPrivacyAccessedAPITypeReasons</key>
            <array>
                <string>CA92.1</string>
            </array>
        </dict>
        <dict>
            <key>NSPrivacyAccessedAPIType</key>
            <string>NSPrivacyAccessedAPICategoryFileTimestamp</string>
            <key>NSPrivacyAccessedAPITypeReasons</key>
            <array>
                <string>C617.1</string>
                <string>3B52.1</string>
            </array>
        </dict>
        <dict>
            <key>NSPrivacyAccessedAPIType</key>
            <string>NSPrivacyAccessedAPICategoryDiskSpace</string>
            <key>NSPrivacyAccessedAPITypeReasons</key>
            <array>
                <string>E174.1</string>
                <string>85F4.1</string>
            </array>
        </dict>
        <dict>
            <key>NSPrivacyAccessedAPIType</key>
            <string>NSPrivacyAccessedAPICategorySystemBootTime</string>
            <key>NSPrivacyAccessedAPITypeReasons</key>
            <array>
                <string>35F9.1</string>
            </array>
        </dict>
    </array>
</dict>
</plist>
```

**Add to Xcode project:**
1. File → New → File → Property List → name `PrivacyInfo.xcprivacy`.
2. Add to `Solvio` target.
3. Set as "Build Phases" → "Copy Bundle Resources."
4. Validate via Xcode 15+ "Generate Privacy Report" in archive product menu.

Sources:
- [Apple Developer — Privacy manifest files](https://developer.apple.com/documentation/bundleresources/privacy-manifest-files) — checked May 2026
- [Apple Developer — Adding a privacy manifest to your app or third-party SDK](https://developer.apple.com/documentation/bundleresources/adding-a-privacy-manifest-to-your-app-or-third-party-sdk) — checked May 2026
- [Apple Developer — Describing use of required reason API](https://developer.apple.com/documentation/bundleresources/describing-use-of-required-reason-api) — checked May 2026
- [Apple Developer — TN3183: Adding required reason API entries to your privacy manifest](https://developer.apple.com/documentation/technotes/tn3183-adding-required-reason-api-entries-to-your-privacy-manifest) — checked May 2026
- [Apple Developer — List of APIs that require declared reasons now available](https://developer.apple.com/news/?id=z6fu1dcu) — checked May 2026
- [Apple Developer — NSPrivacyCollectedDataTypes](https://developer.apple.com/documentation/bundleresources/app-privacy-configuration/nsprivacycollecteddatatypes) — checked May 2026
- [mszpro.com — ITMS-91053: Missing API declaration](https://mszpro.com/itms-91053-missing-api-declaration-for-accessing-userdefaults-timestamps-other-apis) — checked May 2026
- [Bitrise — Enforcement of Apple Privacy Manifest starting from May 1, 2024](https://bitrise.io/blog/post/enforcement-of-apple-privacy-manifest-starting-from-may-1-2024) — checked May 2026
- [Bugfender — Complying with Apple's New Privacy Requirements in the App Store](https://bugfender.com/blog/apple-privacy-requirements/) — checked May 2026
- [Capgo — Privacy Manifest for iOS Apps](https://capgo.app/blog/privacy-manifest-for-ios-apps/) — checked May 2026

### 3.5 Competitor App Store reviews mining — what users actually complain about

Aggregating App Store / Capterra / G2 / Trustpilot / SourceForge reviews for Solvio's adjacent competitors (May 2026 verified):

**Spendee — top complaints:**
- "Spendee deleted years of data, and offers no compensation except 3 months free subscription." Multiple reviewers report **catastrophic data loss after migration / version update**.
- "Six months for customer support to respond" on a paid tier.
- "Bank synchronization doesn't automatically work — refresh access or delete and add bank accounts."
- "After new bank connections there are lots of bugs and the app doesn't work properly."
- "Slow and stuck on some mobile devices."
- "Removed feature to set the monthly period made financial management messed up."
- Multiple reviews say "the app is not supported anymore — Spendee team not releasing new features."

**Money Lover — top complaints:**
- "Categories — if you make too many and start parenting them the app starts to crush" (sic).
- "Widget gadget — if you want to choose categories...only six of them" (hardcoded limit).
- "It doesn't sync with other devices and you can't see all active bills at once."
- "When I select a date for a transaction it would be saved as the day before" (timezone bug).
- "Money Lover is very basic, does not have all the features that the top budgeting apps have."
- "Money Lover: Money Manager does not appear safe based on available data" (justuseapp.com risk score concern).

**Solvio competitive moat (mapped from reviews):**

| Spendee/Money Lover pain | Solvio current state | Marketing position |
|---|---|---|
| Data loss after update | iOS native + JSON export anytime | "Twoje dane zawsze pod kontrolą — eksport JSON jednym kliknięciem" |
| Bank sync silently breaks | GoCardless integration optional, not required | "Działa offline. Bank sync tylko gdy chcesz." |
| Slow customer support | Direct dev contact (small team) | "Bezpośredni kontakt z developerami" |
| Hardcoded widget limits | iOS native widgets via WidgetKit (when shipped) | "Wszystkie kategorie w widget'ach. Bez limitów." |
| Timezone bugs | Date stored UTC, displayed user-locale | (silent quality bar) |
| Stale dev | 100% AI codebase, weekly updates | "Aktualizowane co tydzień" |
| Categories crash on nesting | Flat category model + budgets per category | (silent quality bar) |

This is **20-line marketing copy ammunition** that maps directly to documented user pain points. No code change required.

Sources:
- [G2 — Spendee Reviews 2026](https://www.g2.com/products/spendee/reviews) — checked May 2026
- [Capterra — Spendee Reviews 2026](https://www.capterra.com/p/238829/Spendee/reviews/) — checked May 2026
- [SourceForge — Spendee Reviews](https://sourceforge.net/software/product/Spendee/) — checked May 2026
- [Trustpilot — Spendee](https://www.trustpilot.com/review/spendee.com) — checked May 2026
- [App Store PL — Spendee Tracking Budżetu](https://apps.apple.com/pl/app/id635861140?l=pl) — checked May 2026
- [App Store — Money Lover](https://apps.apple.com/us/app/money-lover-money-manager/id486312413) — checked May 2026
- [JustUseApp — Money Lover](https://justuseapp.com/en/app/486312413/money-lover-expense-manager/reviews) — checked May 2026
- [SourceForge — Money Lover](https://sourceforge.net/software/product/Money-Lover/) — checked May 2026

### 3.6 Polish RODO-specific privacy notice (template language)

Polish law requires consumer-facing privacy notices in Polish. Solvio's notice should explicitly call out:

1. Administrator (`administrator danych osobowych`): Programo s.c., NIP/REGON, adres.
2. Cele przetwarzania (purposes of processing).
3. Podstawa prawna (legal basis):
   - Art. 6 ust. 1 lit. b RODO — wykonanie umowy (account, expense storage).
   - Art. 6 ust. 1 lit. c RODO — obowiązek prawny (Polish accounting law for tax-relevant records).
   - Art. 6 ust. 1 lit. f RODO — prawnie uzasadniony interes (audit log for security).
4. Okres przechowywania (retention period):
   - Konto + dane osobowe: do usunięcia konta + 30 dni rezerwy.
   - Dane finansowe (paragon, faktura, wydatek): 5 lat od końca roku podatkowego (zgodnie z ustawą o rachunkowości).
   - Audit log: 90 dni (zgodnie z R3 GC cron).
5. Odbiorcy danych (recipients): Vercel (hosting), Neon (database, EU-eu-central-1), Azure OpenAI (AI features), Vercel Blob (file storage).
6. Prawa: dostęp, sprostowanie, usunięcie, ograniczenie, portability, sprzeciw, skarga do PUODO.
7. Kontakt do administratora.

**This is a template addition to `app/privacy-policy/page.tsx` (or wherever Solvio lands the policy)**, not a code change. Effort: ~2 hours of writing.

Sources (Polish-specific):
- [GDPR.pl — Interaktywny tekst GDPR](https://gdpr.pl/baza-wiedzy/akty-prawne/interaktywny-tekst-gdpr) — checked May 2026
- [LexDigital — Żądanie usunięcia danych osobowych](https://lexdigital.pl/zadanie-usuniecia-danych-osobowych/) — checked May 2026
- [GLC — RODO in Poland: What Do You Need To Know](https://glc.pl/en/blog/rodo-in-poland-what-do-you-need-to-know/) — checked May 2026
- [GOFIN — Kontrole Prezesa UODO w 2026 r.](https://www.gofin.pl/17,2,7,260480,kontrole-prezesa-uodo-w-2026-r.html) — checked May 2026
- [RPMS Kancelaria — Prawo do usunięcia danych](https://rpms.pl/prawo-do-usuniecia-danych-jak-realizowac-art-17-rodo/) — checked May 2026
- [InfoR — Prawo do usunięcia danych osobowych według RODO](https://www.infor.pl/prawo/prawa-konsumenta/konsument-w-sieci/2714285,Prawo-do-usuniecia-danych-osobowych-wedlug-RODO.html) — checked May 2026
- [Panoptykon — RODO na tacy. Odcinek IV: O prawie do bycia zapomnianym](https://panoptykon.org/wiadomosc/rodo-na-tacy-odcinek-iv-o-prawie-do-bycia-zapomnianym-sic-i-zabrania-danych-ze-soba) — checked May 2026

---

## Updated prioritized backlog — Round 4 NEW items only

25 NEW items, no overlap with R1/R2/R3. H = high (priority 1), M = medium (priority 2), L = low (priority 3+). Effort: S (<1d), M (1-3d), L (3-7d).

| # | Pri | Area | Effort | Description |
|---|---|---|---|---|
| R4-1 | H | iOS / Privacy | S | Add `PrivacyInfo.xcprivacy` to `native-ios/Solvio` target — required for App Store submission. Use the template in §3.4. |
| R4-2 | H | iOS / Watch | M | Build minimum Apple Watch app: 2 complications (`accessoryCircular` budget %, `accessoryRectangular` last-3-expenses) + `TimelineProvider` against existing `/api/data/dashboard`. |
| R4-3 | H | iOS / Notifications | S | Wire `requestAuthorization([.alert, .sound, .badge, .provisional])` on app launch. Never show system prompt on first run. |
| R4-4 | H | Backend / Privacy | M | Account deletion endpoint `POST /api/personal/account/delete` with 24h grace + cron-driven hard delete + financial records anonymization (per §3.3). |
| R4-5 | H | Backend / Privacy | M | Extend `/api/personal/export-data` to bundle JSON + CSV + PDF in a ZIP. Currently JSON-only. |
| R4-6 | H | iOS / a11y | S | `RequestReviewAction` via `@Environment(\.requestReview)` in `GoalDetailView.onGoalCompleted`, `ReportsView.onReportGenerated`, with 2s delay. Three high-satisfaction triggers, hard limit 3/year handled by system. |
| R4-7 | H | Backend / Notifications | M | APNs push payload schema + endpoint `POST /api/notifications/send` with interruption-level mapping per §2.3. Service worker on Vercel for cron-driven weekly recap. |
| R4-8 | H | Web / Privacy | S | Polish privacy policy page at `/polityka-prywatnosci` with retention table per §3.6. English version at `/privacy-policy`. |
| R4-9 | M | iOS / Live Activities | M | "Shopping at {vendor}" Live Activity. Started on AddExpenseSheet open, updated on save, ended on close. Auto-syncs to Apple Watch Smart Stack. |
| R4-10 | M | iOS / Notifications | S | Time-Sensitive notification for "budget overshoot 80%" + "100%" — wire `interruption-level: time-sensitive` in payload, breaks Focus modes, no entitlement needed. |
| R4-11 | M | iOS / Privacy | S | After 3 saved expenses + 2 sessions, surface in-app "Włącz przypomnienia o budżecie" sheet that opens Settings. Only ask for full notification authorization in-context. |
| R4-12 | M | Backend / GDPR | S | `audit_log` entry on every export + every account deletion request. Already have audit_log table; just wire two new event types (`data_export`, `account_deletion_initiated`). |
| R4-13 | M | iOS / Notifications | M | UNNotificationCategory with custom actions: "Open settlement", "Mark as paid", "Snooze 1d". Required for `.active` settlement nudges to feel native. |
| R4-14 | M | iOS / Watch | S | `WidgetConfiguration.relevance` based on weekly-spending pattern from `/api/data/dashboard?relevance=true` — promotes "budget" complication to Smart Stack top at user's typical evening shopping time. |
| R4-15 | M | Web / Marketing | S | Landing page section "Czego brakuje konkurencji" using §3.5 review-mining — no code, just copywriting that maps to documented Spendee/Money Lover pain points. |
| R4-16 | M | iOS / Notifications | S | Disable notification badge by default on app icon. Only set badge for unread settlement requests count, clear on app open. (Spendee complaint: badges spam.) |
| R4-17 | M | Backend / Privacy | M | Email confirmation flow on account deletion completion. Reuse existing email infrastructure (Resend / Azure Communication Services). |
| R4-18 | L | iOS / Vision Pro | S | Verify Solvio iPhone widgets render correctly when ported to visionOS. No new code; just test on Vision Pro Simulator and document. |
| R4-19 | L | iOS / Watch | M | Independent Watch quick-add view: amount keypad + top-5 categories + WatchConnectivity-relayed POST to `/api/data/expenses`. |
| R4-20 | L | iOS / Notifications | S | Notification grouping via `thread-identifier` payload key — group by category for budget alerts, by group for settlement alerts. iOS 18 ranks groups by relevance score. |
| R4-21 | L | iOS / Privacy | S | Add `NSUserActivity` for handoff between iPhone and Watch (e.g., start AddExpense on iPhone, finish entering amount on Watch). |
| R4-22 | L | Backend / Privacy | M | OFX/QIF export format for power users importing into Quicken/YNAB. Defer until justified by user request volume. |
| R4-23 | L | iOS / Notifications | M | Local notifications for goal milestones (50%, 75%, 100% to target). Local-only, no APNs needed; uses `UNTimeIntervalNotificationTrigger` + relative scheduling. |
| R4-24 | L | iOS / Watch | M | Apple Watch Siri shortcut: "Hey Siri, log 47 zł at Biedronka" → POST to `/api/data/expenses` with category guess from vendor history. |
| R4-25 | L | Web / ASO | S | App Store Connect Polish localization sweep — title (30 chars), subtitle (30 chars), keyword field (100 chars). Currently likely all English. ASO targets per R3 sub-topic 2 keyword research. |

---

## Cross-cutting recommendations

### Implementation order for next 4 rounds (R5–R8)

**Round 5 (next): privacy + ship.**
- R4-1 (PrivacyInfo.xcprivacy) — gates any future App Store submission.
- R4-3 (provisional notifications on launch) — zero-prompt, non-blocking.
- R4-8 (Polish privacy policy page) — RODO compliance bar.
- R4-12 (audit_log entries on export + deletion) — compliance evidence.

**Round 6: deletion + export.**
- R4-4 (account deletion endpoint + 24h grace) — Apple App Store mandatory.
- R4-5 (JSON+CSV+PDF export ZIP) — GDPR Art. 20 grade.
- R4-17 (email confirmation on deletion) — UX completion.

**Round 7: watch app v1.**
- R4-2 (Watch app + 2 complications) — 5-day full feature.
- R4-14 (relevance for Smart Stack) — wraps R4-2.
- R4-9 (Live Activity, free port to Watch) — 1.5 days.

**Round 8: full notification stack.**
- R4-7 (APNs cron + payload + scheduler).
- R4-10 (time-sensitive budget alerts).
- R4-13 (notification categories + actions).
- R4-11 (in-app upgrade prompt).
- R4-6 (RequestReviewAction integration).
- R4-16 (badge sanity).
- R4-20 (thread-identifier grouping).

### Compatibility with R1+R2+R3 work

- R4 adds NEW Watch app target — no conflict with iOS app target.
- R4-1 PrivacyInfo.xcprivacy is an iOS-target add — does not conflict with web codebase or A2 security work.
- R4-4 deletion endpoint is a NEW route — does not modify existing endpoints.
- R4-5 export expansion modifies existing `/api/personal/export-data` — coordinate with A1/A2/A4 in R5 plan.
- R4-7/10/13 push infrastructure is brand-new; no conflict.
- R4-6 review prompt is iOS-only — pure A3 territory.
- R4-15 marketing copy is web (`components/landing_page/`) — A3 web territory.

### Code-edit scope this round (A5)

**Zero source-code edits this round.** All work is research + new docs:

- `docs/research-round4.md` — this file.
- `docs/watch-vision-roadmap.md` — quick win 1.
- `docs/push-strategy.md` — quick win 2.
- `docs/gdpr-export-deletion.md` — quick win 3.

(Optional) `README.md` minor section addition pointing to round 4 docs.

A1/A2/A3/A4 territories untouched. Zero git commits per round 4 spec.

---

## Sources (all checked May 2026)

### watchOS / Apple Watch / WidgetKit
- [Apple Developer — watchOS](https://developer.apple.com/watchos/) — checked May 2026
- [Apple Developer — Widgets and watch complications](https://developer.apple.com/documentation/widgetkit/widgets-and-complications-collection) — checked May 2026
- [Apple Developer — Creating accessory widgets and watch complications](https://developer.apple.com/documentation/widgetkit/creating-accessory-widgets-and-watch-complications) — checked May 2026
- [Apple Developer — Migrating ClockKit complications to WidgetKit](https://developer.apple.com/documentation/widgetkit/converting-a-clockkit-app) — checked May 2026
- [Apple Developer — Updating your app and widgets for watchOS 10](https://developer.apple.com/documentation/watchos-apps/updating-your-app-and-widgets-for-watchos-10) — checked May 2026
- [Apple Developer — Building complications with SwiftUI](https://developer.apple.com/documentation/clockkit/building-complications-with-swiftui) — checked May 2026
- [Apple Developer — watchOS apps](https://developer.apple.com/documentation/watchOS-Apps) — checked May 2026
- [WWDC22 — Complications and widgets: Reloaded](https://developer.apple.com/videos/play/wwdc2022/10050/) — checked May 2026
- [WWDC22 — Go further with Complications in WidgetKit](https://developer.apple.com/videos/play/wwdc2022/10051/) — checked May 2026
- [WWDC20 — Build complications in SwiftUI](https://developer.apple.com/videos/play/wwdc2020/10048/) — checked May 2026
- [refurb.me — 20 Best Apple Watch Complications in 2026](https://www.refurb.me/blog/best-apple-watch-complications) — checked May 2026
- [applebitcoin.co — How to Put Bitcoin Price on Apple Watch](https://applebitcoin.co/how-to-put-bitcoin-price-on-apple-watch-2026/) — checked May 2026
- [the5krunner.com — Best Apple Watch 2026: Series 11, Ultra 3 or SE 3](https://the5krunner.com/2026/02/05/best-apple-watch-2026/) — checked May 2026
- [SimplyMac — Apple Watch Series 10 Review](https://www.simplymac.com/apple-watch/apple-watch-series-10-review) — checked May 2026
- [Sleekible — From ClockKit to WidgetKit](https://www.sleekible.com/2024/02/04/clockkit-to-widgetkit.html) — checked May 2026
- [Kodeco — watchOS With SwiftUI by Tutorials, Chapter 8: Complications](https://www.kodeco.com/books/watchos-with-swiftui-by-tutorials/v2.0/chapters/8-complications) — checked May 2026
- [Medium / Lyvennitha — Complications(Widgets) For WatchOS — SwiftUI](https://lyvennithasasikumar.medium.com/complications-widgets-for-watchos-swiftui-99bf176231a8) — checked May 2026
- [Medium / Yoo — How to make simple watchOS Complications](https://medium.com/@Jager-yoo/how-to-make-simple-watchos-complications-df236940c4d0) — checked May 2026
- [money.com — 15 Very Cool Money Apps for the Apple Watch](https://money.com/apple-watch-personal-finance-apps/) — checked May 2026
- [thepennyhoarder.com — Copilot Money Review 2026](https://www.thepennyhoarder.com/budgeting/budgeting-copilot-money-review/) — checked May 2026
- [help.copilot.money — Improving Widget Performance](https://help.copilot.money/en/articles/4968599-improving-widget-performance) — checked May 2026
- [applevis.com — Mint Personal Finance & Money on watch](https://www.applevis.com/apps/watch/finance/mintpersonal-finance-money) — checked May 2026
- [moneywithkatie.com — Copilot Money Review 2026](https://moneywithkatie.com/copilot-review-a-budgeting-app-that-finally-gets-it-right/) — checked May 2026
- [App Store — MoneyWatch Budget & Finance](https://apps.apple.com/us/app/moneywatch-budget-finance/id1593524945) — checked May 2026

### visionOS / Vision Pro
- [Apple Developer — visionOS Overview](https://developer.apple.com/visionos/) — checked May 2026
- [Apple Developer — visionOS What's New](https://developer.apple.com/visionos/whats-new/) — checked May 2026
- [Apple Developer — Designing for visionOS](https://developer.apple.com/design/human-interface-guidelines/designing-for-visionos) — checked May 2026
- [Apple Developer — Updating your widgets for visionOS](https://developer.apple.com/documentation/WidgetKit/Updating-your-widgets-for-visionOS) — checked May 2026
- [WWDC25 — What's new in visionOS 26](https://developer.apple.com/videos/play/wwdc2025/317/) — checked May 2026
- [WWDC25 — Design widgets for visionOS](https://developer.apple.com/videos/play/wwdc2025/255/) — checked May 2026
- [WWDC25 — Explore enhancements to your spatial business app](https://developer.apple.com/videos/play/wwdc2025/223/) — checked May 2026
- [WWDC25 — Optimize your custom environments for visionOS](https://developer.apple.com/videos/play/wwdc2025/305/) — checked May 2026
- [WWDC25 — What's new in widgets](https://developer.apple.com/videos/play/wwdc2025/278/) — checked May 2026
- [WWDC25 — What's new for the spatial web](https://developer.apple.com/videos/play/wwdc2025/237/) — checked May 2026
- [Apple Newsroom — visionOS 26 introduces powerful new spatial experiences](https://www.apple.com/newsroom/2025/06/visionos-26-introduces-powerful-new-spatial-experiences-for-apple-vision-pro/) — checked May 2026
- [macrumors — Apple Releases visionOS 26](https://www.macrumors.com/2025/09/15/apple-releases-visionos-26/) — checked May 2026
- [Cult of Mac — Everything new in visionOS 26](https://www.cultofmac.com/how-to/visionos-26-new-features) — checked May 2026
- [Appleosophy — visionOS 26 with Liquid Glass Design](https://appleosophy.com/2025/06/09/apple-announces-visionos-26-liquid-glass-design-spatial-widgets-enhanced-personas-and-enterprise-apis-elevate-apple-vision-pro/) — checked May 2026
- [BusinessToday — Apple unveils visionOS 26](https://www.businesstoday.in/technology/news/story/apple-unveils-visionos-26-with-spatial-widgets-shared-3d-experiences-playstation-vr2-support-for-vision-pro-479669-2025-06-09) — checked May 2026
- [createwithswift — Adapting your widgets for visionOS](https://www.createwithswift.com/adapting-your-widgets-for-visionos/) — checked May 2026
- [Road to VR — Apple Vision Pro visionOS 26 Persistent Widgets](https://www.roadtovr.com/apple-vision-pro-visionos-26-persistent-widgets/) — checked May 2026

### Push notifications + Live Activities
- [Apple Developer — Sending notification requests to APNs](https://developer.apple.com/documentation/usernotifications/sending-notification-requests-to-apns) — checked May 2026
- [Apple Developer — Registering your app with APNs](https://developer.apple.com/documentation/usernotifications/registering-your-app-with-apns) — checked May 2026
- [Apple Developer — UNUserNotificationCenter](https://developer.apple.com/documentation/usernotifications/unusernotificationcenter) — checked May 2026
- [Apple Developer — UNNotificationInterruptionLevel timeSensitive](https://developer.apple.com/documentation/usernotifications/unnotificationinterruptionlevel/timesensitive) — checked May 2026
- [Apple Developer — UNAuthorizationOptions criticalAlert](https://developer.apple.com/documentation/usernotifications/unauthorizationoptions/criticalalert) — checked May 2026
- [Apple Developer — Critical Alerts entitlement](https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.developer.usernotifications.critical-alerts) — checked May 2026
- [Apple Developer — ActivityKit](https://developer.apple.com/documentation/activitykit) — checked May 2026
- [Apple Developer — Displaying live data with Live Activities](https://developer.apple.com/documentation/activitykit/displaying-live-data-with-live-activities) — checked May 2026
- [Apple Developer — RequestReviewAction](https://developer.apple.com/documentation/storekit/requestreviewaction) — checked May 2026
- [Apple Developer — SKStoreReviewController](https://developer.apple.com/documentation/storekit/skstorereviewcontroller) — checked May 2026
- [Apple Developer — requestReview Environment](https://developer.apple.com/documentation/swiftui/environmentvalues/requestreview) — checked May 2026
- [WWDC21 — Send communication and Time Sensitive notifications](https://developer.apple.com/videos/play/wwdc2021/10091/) — checked May 2026
- [WWDC24 — Bring your Live Activity to Apple Watch](https://developer.apple.com/videos/play/wwdc2024/10068/) — checked May 2026
- [WWDC25 — Finish tasks in the background](https://developer.apple.com/videos/play/wwdc2025/227/) — checked May 2026
- [newly.app — iOS Push Notifications APNs Permissions Guide 2026](https://newly.app/articles/ios-push-notifications) — checked May 2026
- [newly.app — iOS Live Activities ActivityKit Dynamic Island Lock Screen Guide 2026](https://newly.app/articles/ios-live-activities) — checked May 2026
- [newly.app — Dynamic Island 2026](https://newly.app/articles/dynamic-island) — checked May 2026
- [pushwoosh — iOS push notifications guide 2026](https://www.pushwoosh.com/blog/ios-push-notifications/) — checked May 2026
- [oneuptime — iOS Push Notifications in Swift APNs Setup](https://oneuptime.com/blog/post/2026-02-02-ios-push-notifications/view) — checked May 2026
- [Bugfender — iOS Push Notifications: Complete APNs & Swift Setup Guide](https://bugfender.com/blog/ios-push-notifications/) — checked May 2026
- [Medium / Manna — iOS Push Notifications: The Complete Setup Guide for 2026](https://medium.com/@khmannaict13/ios-push-notifications-the-complete-setup-guide-for-2026-adfc98592ab7) — checked May 2026
- [Medium / Singh — The Only iOS Notifications Guide You'll Ever Need](https://medium.com/@rajanTheSilentCompiler/the-only-ios-notifications-guide-youll-ever-need-until-apple-deprecates-something-again-ddfdd820c8a1) — checked May 2026
- [Medium / Tiwari — iOS Push Notifications: Stop Asking Permission on Day One](https://medium.com/@shobhakartiwari/ios-push-notifications-stop-asking-permission-on-day-one-7a2fb2bbe366) — checked May 2026
- [nilcoalescing — Sending trial notifications with provisional authorization on iOS](https://nilcoalescing.com/blog/TrialNotificationsWithProvisionalAuthorizationOnIOS/) — checked May 2026
- [Phiture — Provisional Push: What is it and how will it impact your addressable audience?](https://phiture.com/blog/provisional-push-what-is-it-and-how-will-it-impact-your-addressable-audience/) — checked May 2026
- [useyourloaf — Provisional Authorization of User Notificatons](https://useyourloaf.com/blog/provisional-authorization-of-user-notificatons/) — checked May 2026
- [createwithswift — Request Authorization for Notifications with async/await](https://www.createwithswift.com/notifications-tutorial-requesting-user-authorization-for-notifications-with-async-await/) — checked May 2026
- [createwithswift — Prompting users to review your app](https://www.createwithswift.com/prompting-users-to-review-your-app/) — checked May 2026
- [SwiftLee — Increase App Ratings by using SKStoreReviewController](https://www.avanderlee.com/swift/skstorereviewcontroller-app-ratings/) — checked May 2026
- [criticalmoments — SKStoreReviewController Guide with Examples](https://criticalmoments.io/blog/skstorereviewcontroller_guide_with_examples) — checked May 2026
- [Sarunw — How to request users to review your app in SwiftUI](https://sarunw.com/posts/how-to-request-users-to-review-app-in-swiftui/) — checked May 2026
- [nilcoalescing — Requesting App Store Reviews in SwiftUI](https://nilcoalescing.com/blog/RequestingAppStoreReviewsInSwiftUI/) — checked May 2026
- [hackingwithswift — How to ask the user to review your app](https://www.hackingwithswift.com/quick-start/swiftui/how-to-ask-the-user-to-review-your-app) — checked May 2026
- [OneSignal — iOS Focus modes and interruption levels](https://documentation.onesignal.com/docs/en/ios-focus-modes-and-interruption-levels) — checked May 2026
- [iOS Gadget Hacks — iOS 18 Reduce Interruptions Feature](https://ios.gadgethacks.com/how-to/stop-the-notification-chaos-i-os-18-s-reduce-interruptions-feature-explained-and-activated/) — checked May 2026
- [Canopas — Integrating Live Activity and Dynamic Island in iOS](https://canopas.com/integrating-live-activity-and-dynamic-island-in-i-os-a-complete-guide) — checked May 2026
- [Apple Developer — BGAppRefreshTask](https://developer.apple.com/documentation/backgroundtasks/bgapprefreshtask) — checked May 2026
- [Medium / Marasinghe — Mastering iOS 26 Background Tasks](https://medium.com/swlh/mastering-ios-26-background-tasks-a-complete-guide-for-smarter-apps-97096bbcb809) — checked May 2026

### GDPR / RODO / Privacy Manifest
- [Apple Developer — Privacy manifest files](https://developer.apple.com/documentation/bundleresources/privacy-manifest-files) — checked May 2026
- [Apple Developer — Adding a privacy manifest to your app or third-party SDK](https://developer.apple.com/documentation/bundleresources/adding-a-privacy-manifest-to-your-app-or-third-party-sdk) — checked May 2026
- [Apple Developer — Describing use of required reason API](https://developer.apple.com/documentation/bundleresources/describing-use-of-required-reason-api) — checked May 2026
- [Apple Developer — TN3183: Adding required reason API entries](https://developer.apple.com/documentation/technotes/tn3183-adding-required-reason-api-entries-to-your-privacy-manifest) — checked May 2026
- [Apple Developer — List of APIs that require declared reasons now available](https://developer.apple.com/news/?id=z6fu1dcu) — checked May 2026
- [Apple Developer — Privacy updates for App Store submissions](https://developer.apple.com/news/?id=3d8a9yyh) — checked May 2026
- [Apple Developer — NSPrivacyCollectedDataTypes](https://developer.apple.com/documentation/bundleresources/app-privacy-configuration/nsprivacycollecteddatatypes) — checked May 2026
- [Apple Developer — App Privacy Details](https://developer.apple.com/app-store/app-privacy-details/) — checked May 2026
- [Apple Developer — Offering account deletion in your app](https://developer.apple.com/support/offering-account-deletion-in-your-app/) — checked May 2026
- [Apple Developer — Account deletion within apps required starting January 31](https://developer.apple.com/news/?id=mdkbobfo) — checked May 2026
- [Apple Developer — Account deletion requirement starts June 30](https://developer.apple.com/news/?id=12m75xbj) — checked May 2026
- [Apple Support — Understand and control the personal information that you store with Apple](https://support.apple.com/en-us/102283) — checked May 2026
- [Apple Support — About privacy information on the App Store](https://support.apple.com/en-us/102399) — checked May 2026
- [Bitrise — Enforcement of Apple Privacy Manifest starting from May 1, 2024](https://bitrise.io/blog/post/enforcement-of-apple-privacy-manifest-starting-from-may-1-2024) — checked May 2026
- [Capgo — Privacy Manifest for iOS Apps](https://capgo.app/blog/privacy-manifest-for-ios-apps/) — checked May 2026
- [Capgo — Account Deletion Compliance: Apple Guidelines](https://capgo.app/blog/account-deletion-compliance-apple-guidelines/) — checked May 2026
- [Bugfender — Complying with Apple's New Privacy Requirements in the App Store](https://bugfender.com/blog/apple-privacy-requirements/) — checked May 2026
- [TermsFeed — Apple's Requirement for In-App Deletion of Accounts](https://www.termsfeed.com/blog/apple-requirement-in-app-deletion-accounts/) — checked May 2026
- [TermsFeed — App Privacy Details Labels for Apple App Store Connect](https://www.termsfeed.com/blog/comply-apple-app-privacy-details/) — checked May 2026
- [Authgear — The Right to Erasure](https://www.authgear.com/post/the-right-to-erasure-and-how-you-can-follow-it-for-your-apps) — checked May 2026
- [Transcend — Apple In-App Account Deletion](https://docs.transcend.io/docs/articles/privacy-requirements/apple-account-deletion) — checked May 2026
- [Singular — iOS SDK - Privacy manifest FAQ](https://support.singular.net/hc/en-us/articles/24045392537243-iOS-SDK-Privacy-manifest-FAQ) — checked May 2026
- [Adobe — iOS 17 Privacy Manifest Requirements](https://developer.adobe.com/client-sdks/resources/privacy-manifest/) — checked May 2026
- [Microsoft — Apple privacy manifest .NET MAUI](https://learn.microsoft.com/en-us/dotnet/maui/ios/privacy-manifest?view=net-maui-10.0) — checked May 2026
- [Expo — Privacy manifests](https://docs.expo.dev/guides/apple-privacy/) — checked May 2026
- [Kotlin — Privacy manifest for iOS apps](https://kotlinlang.org/docs/multiplatform/multiplatform-privacy-manifest.html) — checked May 2026
- [mszpro — ITMS-91053: Missing API declaration](https://mszpro.com/itms-91053-missing-api-declaration-for-accessing-userdefaults-timestamps-other-apis) — checked May 2026
- [Medium / Hart — YOU are NOT prepared for Apple's New Privacy Requirements](https://medium.com/@emt.joshhart/a-comprehensive-guide-to-apples-new-privacy-manifest-requirements-for-ios-app-developers-d004dc47ad35) — checked May 2026
- [Adapty — Understanding Apple App Privacy Policies](https://adapty.io/docs/apple-app-privacy) — checked May 2026
- [GDPR-info.eu — Article 17 GDPR Right to erasure](https://gdpr-info.eu/art-17-gdpr/) — checked May 2026
- [GDPR-info.eu — Chapter 3: Rights of the data subject](https://gdpr-info.eu/chapter-3/) — checked May 2026
- [gdpr-text.com — Article 20 Right to data portability](https://gdpr-text.com/read/article-20/) — checked May 2026
- [gdpr.algolia.com — Article 17 Right to erasure](https://gdpr.algolia.com/gdpr-article-17) — checked May 2026
- [Clarip — The GDPR Right to Erasure Under Article 17](https://www.clarip.com/data-privacy/gdpr-erasure/) — checked May 2026
- [Sovy — Data Subject Rights under GDPR 2025–2026](https://www.sovy.com/blog/data-subjects-rights/) — checked May 2026
- [Orbiq — GDPR Compliance: Complete Guide for 2026](https://www.orbiqhq.com/eu-regulations/gdpr-article-28-32-33-34) — checked May 2026
- [ICO — Right to data portability](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/individual-rights/individual-rights/right-to-data-portability/) — checked May 2026
- [Auth0 — GDPR Data Portability](https://auth0.com/docs/secure/data-privacy-and-compliance/gdpr/gdpr-data-portability) — checked May 2026
- [legiscope — Right to Data Portability GDPR Art. 20](https://www.legiscope.com/blog/data-portability-right.html) — checked May 2026
- [usercentrics — GDPR data retention compliance guidelines](https://usercentrics.com/knowledge-hub/gdpr-data-retention/) — checked May 2026

### Polish RODO / Polish accounting
- [GDPR.pl — Artykuł 17 Prawo do usunięcia danych](https://gdpr.pl/baza-wiedzy/akty-prawne/interaktywny-tekst-gdpr/artykul-17-prawo-do-usuniecia-danych-prawo-do-bycia-zapomnianym) — checked May 2026
- [GDPR.pl — Interaktywny tekst GDPR](https://gdpr.pl/baza-wiedzy/akty-prawne/interaktywny-tekst-gdpr) — checked May 2026
- [GDPR.pl — Retencja danych osobowych](https://gdpr.pl/artykuly/retencja-danych-osobowych) — checked May 2026
- [DLA Piper — Data protection laws in Poland](https://www.dlapiperdataprotection.com/index.html?t=law&c=PL) — checked May 2026
- [GLC — RODO in Poland: What Do You Need To Know](https://glc.pl/en/blog/rodo-in-poland-what-do-you-need-to-know/) — checked May 2026
- [GOFIN — Kontrole Prezesa UODO w 2026 r.](https://www.gofin.pl/17,2,7,260480,kontrole-prezesa-uodo-w-2026-r.html) — checked May 2026
- [LexDigital — Żądanie usunięcia danych osobowych](https://lexdigital.pl/zadanie-usuniecia-danych-osobowych/) — checked May 2026
- [RPMS Kancelaria — Prawo do usunięcia danych jak realizować](https://rpms.pl/prawo-do-usuniecia-danych-jak-realizowac-art-17-rodo/) — checked May 2026
- [InfoR — Prawo do usunięcia danych osobowych według RODO](https://www.infor.pl/prawo/prawa-konsumenta/konsument-w-sieci/2714285,Prawo-do-usuniecia-danych-osobowych-wedlug-RODO.html) — checked May 2026
- [Panoptykon — RODO na tacy. Odcinek IV: O prawie do bycia zapomnianym](https://panoptykon.org/wiadomosc/rodo-na-tacy-odcinek-iv-o-prawie-do-bycia-zapomnianym-sic-i-zabrania-danych-ze-soba) — checked May 2026
- [Subiektywnie o finansach — Konto w Getinie i RODO](https://subiektywnieofinansach.pl/zamknela-konto-w-getinie-i-poprosila-bank-o-usuniecie-swoich-danych-osobowych-bank-jej-odmowil-co-tu-jest-grane-co-na-to-rodo/) — checked May 2026
- [rkrodo.pl — Żądanie usunięcia danych osobowych według RODO](https://rkrodo.pl/zadanie-usuniecia-danych-osobowych-wedlug-rodo/) — checked May 2026
- [odo24.pl — Usuwanie danych z kopii zapasowych](https://odo24.pl/blog-post.usuwanie-danych-z-kopii-zapasowych-kiedy-i-w-jakich-sytuacjach) — checked May 2026
- [polishtax.com — Invoicing in Poland 2026](https://polishtax.com/information/polish-tax-law/issuance-of-the-invoices/) — checked May 2026
- [polishtax.com — Invoicing In Poland Legal Requirements For Non-electronic Invoices](https://polishtax.com/invoicing-rules-in-poland/) — checked May 2026
- [edicomgroup — Poland implements mandatory B2B electronic invoicing with KSeF from 2026](https://edicomgroup.com/blog/poland-will-make-b2b-electronic-invoicing-mandatory) — checked May 2026
- [dudkowiak — E-Invoicing in Poland - KSeF Implementation in 2026](https://www.dudkowiak.com/tax-law-in-poland/e-invoicing-in-poland-ksef/) — checked May 2026
- [vatupdate — Poland KSeF E-Invoicing E-Reporting Mandate](https://www.vatupdate.com/2025/11/26/poland-ksef-e-invoicing-mandate-a-comprehensive-guide/) — checked May 2026
- [International Tax Review — Polish tax in 2026: digital tax compliance becomes business reality](https://www.internationaltaxreview.com/article/2ftq9i8cg3bhb3op12ygw/sponsored/polish-tax-in-2026-digital-tax-compliance-becomes-business-reality) — checked May 2026

### App Store Optimization + reviews mining
- [apptweak — App Store keyword research for ASO: The 2026 step-by-step guide](https://www.apptweak.com/en/aso-blog/app-store-keyword-research-aso) — checked May 2026
- [growthbykev — ASO Best Practices 2026: The Complete App Store Optimization Guide](https://www.growthbykev.com/blog/aso-fundamentals-guide) — checked May 2026
- [applaunchflow — ASO Best Practices 2026: Complete App Store Optimization Guide](https://www.applaunchflow.com/blog/aso-2026-guide) — checked May 2026
- [appradar — What is App Store Optimization (ASO)? The Most Actionable Guide in 2026](https://appradar.com/academy/what-is-app-store-optimization-aso) — checked May 2026
- [asomobile — ASO in 2026: the complete guide to app optimization](https://asomobile.net/en/blog/aso-in-2026-the-complete-guide-to-app-optimization/) — checked May 2026
- [G2 — Spendee Reviews 2026](https://www.g2.com/products/spendee/reviews) — checked May 2026
- [Capterra — Spendee Reviews 2026](https://www.capterra.com/p/238829/Spendee/reviews/) — checked May 2026
- [SourceForge — Spendee Reviews](https://sourceforge.net/software/product/Spendee/) — checked May 2026
- [Trustpilot — Spendee](https://www.trustpilot.com/review/spendee.com) — checked May 2026
- [App Store PL — Spendee Tracking Budżetu](https://apps.apple.com/pl/app/id635861140?l=pl) — checked May 2026
- [App Store — Money Lover](https://apps.apple.com/us/app/money-lover-money-manager/id486312413) — checked May 2026
- [JustUseApp — Money Lover](https://justuseapp.com/en/app/486312413/money-lover-expense-manager/reviews) — checked May 2026
- [SourceForge — Money Lover](https://sourceforge.net/software/product/Money-Lover/) — checked May 2026
- [Slashdot — Money Lover Reviews 2026](https://slashdot.org/software/p/Money-Lover/) — checked May 2026

### Offline-first / SwiftData / sync
- [Medium / Ravi6997 — Offline Sync Strategies: Core Data + CloudKit + SwiftData in iOS Apps](https://ravi6997.medium.com/offline-sync-strategies-core-data-cloudkit-swiftdata-in-ios-apps-3760684567fd) — checked May 2026
- [Medium / Shanmugam — Handling Offline Support and Data Synchronization in iOS with Swift](https://medium.com/@kalidoss.shanmugam/handling-offline-support-and-data-synchronization-in-ios-with-swift-2130ecb3d7c1) — checked May 2026
- [Medium / Studio — Build Offline-First Apps with SwiftData and Background Tasks](https://commitstudiogs.medium.com/build-offline-first-apps-with-swiftdata-and-background-tasks-a29434b6f80c) — checked May 2026
- [Medium / Ranpura — Offline-First SwiftUI with SwiftData](https://medium.com/@ashitranpura27/offline-first-swiftui-with-swiftdata-clean-fast-and-sync-ready-9a4faefdeedb) — checked May 2026
- [Medium / Singh — Build an Offline-First iOS App with Conflict-Free Sync (CRDTs in Swift)](https://medium.com/@aditya877633/build-an-offline-first-ios-app-with-conflict-free-sync-crdts-in-swift-e3cdb0d787e7) — checked May 2026
- [BigGo — SQLiteData Delivers CloudKit Sync for SQLite with Performance Claims Over SwiftData](https://biggo.com/news/202509181942_SQLiteData_CloudKit_Sync_Performance) — checked May 2026
- [Apple Developer Forums — How do I resolve conflicts with SwiftData?](https://developer.apple.com/forums/thread/751480) — checked May 2026
- [pointfreeco — Customizable conflict resolution for CloudKit sync](https://github.com/pointfreeco/sqlite-data/discussions/272) — checked May 2026
- [Hacking with Swift — Syncing SwiftData with CloudKit](https://www.hackingwithswift.com/books/ios-swiftui/syncing-swiftdata-with-cloudkit) — checked May 2026
