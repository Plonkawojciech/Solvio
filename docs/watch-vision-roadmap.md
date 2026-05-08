# Solvio — Apple Watch + Vision Pro Roadmap

**Date:** 2026-05-07 / 2026-05-08 (R4 quick win)
**Source:** `docs/research-round4.md` §1 (Apple Watch + Vision Pro patterns)
**Audience:** future iOS agents picking up Watch / visionOS work

This is the actionable plan extracted from R4 research. Round 4 itself ships zero code; this doc is the playbook for round 7+ (Watch app v1) and the explicit defer decision for Vision Pro.

---

## TL;DR

- **Apple Watch: ship in round 7.** ~5 dev-days for parity with Copilot Money's Watch story (independent app + 2 complications + Live Activity sync).
- **Vision Pro: defer to v3 (2027+).** Free port from iPhone widgets when those ship; no dedicated investment. Addressable user base sub-1M globally in 2026.
- **All work uses WidgetKit + SwiftUI** — ClockKit deprecated since watchOS 10 / iOS 16.
- **Live Activities → Watch sync is automatic** with `.supplementalActivityFamilies([.small])` — single biggest leverage point.

---

## Part 1: Apple Watch app v1 — 5-day plan

### Day 1 — Project structure
- Add Watch app target (`Solvio Watch`) to `native-ios/Solvio.xcodeproj`.
- Share `Networking`, `Locale`, `Models`, `Theme` Swift modules with iPhone target. Zero duplication.
- Wire `WatchConnectivity` for fast iPhone-pair fallback when no Wi-Fi.
- Verify session cookie works via WatchConnectivity message-relay (iPhone sends bearer to Watch, Watch caches in keychain).

### Day 2 — Two complications
**`accessoryCircular` — Budget % gauge**
```swift
struct BudgetGaugeEntryView: View {
    let entry: BudgetTimelineEntry

    var body: some View {
        Gauge(value: entry.percentUsed, in: 0...1) {
            Text("BGT")
        } currentValueLabel: {
            Text("\(Int(entry.percentUsed * 100))%")
        }
        .gaugeStyle(.accessoryCircular)
        .tint(entry.percentUsed > 0.9 ? .red : entry.percentUsed > 0.7 ? .orange : .green)
    }
}
```

**`accessoryRectangular` — Last 3 expenses**
```swift
struct RecentExpensesEntryView: View {
    let entry: ExpensesTimelineEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(L10n.t("complications.recent")).font(.caption2.bold())
            ForEach(entry.expenses.prefix(3)) { e in
                HStack {
                    Text(e.vendor).lineLimit(1)
                    Spacer()
                    Text(e.amount, format: .currency(code: e.currency))
                        .monospacedDigit()
                }
                .font(.caption2)
            }
        }
    }
}
```

**`TimelineProvider`** — fetch from existing `/api/data/dashboard`. Update every 15 min via `.refreshAfter(date)` policy.

### Day 3 — Independent main view (Add Expense quick log)
- Single screen: amount keypad (digital crown for cents) + top-5 categories from history + save button.
- POST to `/api/data/expenses` with WatchConnectivity-relayed session cookie.
- Optimistic UI: insert local `pendingExpense`, show banner "Wysyłanie..." with retry queue if offline.
- On success: haptic `.success` + dismiss back to home view.

### Day 4 — Live Activity sync (the free win)
Add `.supplementalActivityFamilies([.small])` to existing iPhone Live Activity (R4-9 backlog item):

```swift
struct ShoppingLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: ShoppingActivityAttributes.self) { context in
            ShoppingActivityContent(context: context)
        } dynamicIsland: { context in
            // ... iPhone Dynamic Island config
        }
        .supplementalActivityFamilies([.small])  // <-- one line, Watch Smart Stack works
    }
}
```

Customize the Watch view via `@Environment(\.activityFamily)`:
```swift
struct ShoppingActivityContent: View {
    @Environment(\.activityFamily) var family
    @Environment(\.isLuminanceReduced) var aod
    let context: ActivityViewContext<ShoppingActivityAttributes>

    var body: some View {
        switch family {
        case .small:
            // Apple Watch Smart Stack rendering
            HStack {
                Image(systemName: "cart.fill")
                    .foregroundStyle(aod ? .gray : .orange)
                Text(context.state.runningTotal, format: .currency(code: "PLN"))
                    .monospacedDigit()
            }
        case .medium:
            // Lock screen / iPhone rendering
            ...
        @unknown default: EmptyView()
        }
    }
}
```

### Day 5 — Polish + AOD + a11y + ship
- VoiceOver labels on all complications: "Budżet wykorzystany w 67 procentach" / "Budget used at 67 percent".
- AOD luminance treatment via `@Environment(\.isLuminanceReduced)`.
- Smart Stack relevance via `WidgetConfiguration.relevance(.high)` based on weekly-spending pattern.
- Submit Watch app slice to TestFlight.

**Backend changes needed:** 0. `/api/data/dashboard` already returns everything Watch needs.

---

## Part 2: Live Activity — the high-leverage standalone item

This is half a day of work that delivers iPhone Lock Screen + Dynamic Island + Apple Watch Smart Stack in one shot.

**Define attributes:**
```swift
struct ShoppingActivityAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        var runningTotal: Decimal
        var itemCount: Int
        var vendor: String
        var lastUpdate: Date
    }
    var sessionId: UUID
    var startedAt: Date
}
```

**Start on AddExpenseSheet open:**
```swift
import ActivityKit

func startShoppingActivity(vendor: String) async {
    guard ActivityAuthorizationInfo().areActivitiesEnabled else { return }
    let attributes = ShoppingActivityAttributes(sessionId: UUID(), startedAt: Date())
    let initialState = ShoppingActivityAttributes.ContentState(
        runningTotal: 0,
        itemCount: 0,
        vendor: vendor,
        lastUpdate: Date()
    )
    let staleDate = Date().addingTimeInterval(60*60)  // 1h idle timeout
    do {
        let activity = try Activity.request(
            attributes: attributes,
            content: .init(state: initialState, staleDate: staleDate)
        )
        Self.currentActivityId = activity.id
    } catch {
        // log; silently fail
    }
}
```

**Update on each save:**
```swift
func updateShoppingActivity(amount: Decimal) async {
    guard let id = Self.currentActivityId,
          let activity = Activity<ShoppingActivityAttributes>.activities.first(where: { $0.id == id })
    else { return }

    let newState = ShoppingActivityAttributes.ContentState(
        runningTotal: activity.content.state.runningTotal + amount,
        itemCount: activity.content.state.itemCount + 1,
        vendor: activity.content.state.vendor,
        lastUpdate: Date()
    )
    await activity.update(.init(state: newState, staleDate: Date().addingTimeInterval(60*60)))
}
```

**End on close or vendor change:**
```swift
func endShoppingActivity() async {
    guard let id = Self.currentActivityId,
          let activity = Activity<ShoppingActivityAttributes>.activities.first(where: { $0.id == id })
    else { return }

    await activity.end(
        .init(state: activity.content.state, staleDate: nil),
        dismissalPolicy: .after(Date().addingTimeInterval(30))  // linger 30s after close
    )
    Self.currentActivityId = nil
}
```

**Cost:** ~1.5 days. Surfaces:
- iPhone Lock Screen (huge engagement).
- iPhone Dynamic Island compact + minimal + expanded views.
- Apple Watch Smart Stack (free, automatic).
- iOS 18+ Smart Stack on Lock Screen.

Marketing: "Pierwsza polska aplikacja wydatkowa z Live Activities."

---

## Part 3: Vision Pro defer reasoning

**Why defer:**

1. **Addressable users.** Vision Pro device installed base is sub-1M globally in 2026 (vs ~150M Apple Watch). Solvio's PL audience would be in the low hundreds at best.

2. **No camera advantage.** Solvio's daily-active surface is iPhone (camera for receipt scan). Vision Pro has no Solvio-relevant capability the iPhone doesn't have.

3. **Free port from iPhone.** Per Apple's "Adapting your widgets for visionOS" doc, "Widgets written for iOS- and iPadOS-compatible apps using WidgetKit and SwiftUI look great on visionOS" with no changes. **Building widgets for iPhone is the right path; Vision Pro is a free side-effect, not a feature investment.**

4. **Liquid Glass converges.** The Liquid Glass design language in iOS 26+ is unifying across iOS / iPadOS / macOS / visionOS. Designing for it on iPhone first makes the visionOS port automatic.

5. **8-12 dev-days for Vision Pro-specific UX** (volumetric "morning dashboard", spatial drill-downs into category breakdowns) is not justifiable for sub-1M user base.

**When to revisit:** when Vision Pro device base crosses ~5M globally OR Apple ships a non-pro Vision device that crosses ~10M. Current trajectory: 2027-2028.

**What to do today (zero cost):**
- When R4-2 ships iPhone widgets, verify they render correctly on visionOS Simulator.
- Add `tinting` mode support to widget views (one-line change per widget).
- Document on `solvio.app` press page that "Solvio supports Apple Vision Pro" once verified.

---

## References

- See `docs/research-round4.md` §1 for full sourced research.
- All citations checked May 2026.
