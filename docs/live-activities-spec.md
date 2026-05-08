# Solvio — Live Activities Technical Spec

**Date:** 2026-05-08
**Status:** Spec — not yet implemented
**Companion to:** `docs/research-round5.md` Section 1
**Owner:** A5 (research) — to be picked up by an iOS-implementation agent in round 6-9

---

## Goal

Ship a single Live Activity (`BudgetActivity`) that surfaces today's spend versus daily budget on:
- iPhone Lock Screen
- iPhone Dynamic Island (compact, minimal, expanded)
- Apple Watch Smart Stack (free via `.supplementalActivityFamilies`)

Update strategy: **local-only** (`Activity.update(using:)`). No APNs push token plumbing in v1.

---

## File layout

```
native-ios/
  Solvio/                                         # main iOS app target
    Features/
      LiveActivities/
        BudgetActivityController.swift            # NEW — start/update/end
        BudgetActivityRefreshService.swift        # NEW — wakes on day-rollover
  SolvioWidget/                                   # NEW — widget extension target
    SolvioWidget.swift                            # widget bundle
    BudgetActivityAttributes.swift                # ActivityAttributes
    BudgetLiveActivity.swift                      # ActivityConfiguration + Lock Screen + Dynamic Island
    BudgetWatchSmallView.swift                    # .small activity family for Apple Watch
    Info.plist
```

The widget extension target is NEW. It needs:
- `NSExtensionPointIdentifier = com.apple.widgetkit-extension`
- `NSSupportsLiveActivities = YES` in the iOS app target's Info.plist
- `NSSupportsLiveActivitiesFrequentUpdates` deliberately NOT set (default false; revisit after telemetry)

---

## ActivityAttributes contract

```swift
public struct BudgetActivityAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        public var spentToday: Decimal
        public var dailyBudget: Decimal
        public var lastVendor: String?
        public var lastAmount: Decimal?
        public var lastTimestamp: Date

        public var progressRatio: Double { /* 0...1 */ }
    }

    public let userId: String
    public let currency: String
    public let monthLabel: String
}
```

**Size budget:** ContentState payload should target <512 B. Apple's 4KB cap leaves 8× headroom for future fields like category breakdown.

---

## State transitions

| Trigger | Action |
|---|---|
| App launched + Live Activities enabled + no current activity | `start` if today's `dailyBudget > 0` |
| User logs new expense | `update` with new `spentToday`, `lastVendor`, `lastAmount` |
| Receipt OCR completes and creates expense | same as above |
| Day rollover (00:00 local) | `end` current, `start` new with `spentToday = 0` |
| User signs out | `end` with `.immediate` dismissal |
| User toggles Live Activities OFF in Settings | observe `Activity.activityUpdates`, clear cache |
| User dismisses activity manually | `Activity.activityStateUpdates` → `.dismissed` |

Day rollover is implemented via:
1. A `BackgroundTasks` `BGAppRefreshTask` scheduled for next 00:01 — works when app is backgrounded.
2. A safety net in `applicationWillEnterForeground` — checks if current activity's `monthLabel` matches today; recreates if not.

---

## Lock Screen layout (iPhone)

```
┌──────────────────────────────────────────────┐
│ [pie] Solvio · Maj 2026                       │
│                                                │
│  145 zł / 300 zł      ▓▓▓▓▓▓▓░░░ 48%          │
│                                                │
│  Last: Biedronka • 47 zł • 5 min ago          │
└──────────────────────────────────────────────┘
```

- 16pt headline currency on the left
- 13pt subtitle "month label"
- Linear `ProgressView(value:)` tinted `.solvioAccent`, capped at 1.0; switches to `.red` at >1.0
- Last expense as 12pt secondary
- Padding: 16pt all-around
- `.activityBackgroundTint(.solvioBackground)` matches Solvio brand
- Dark/light mode auto-handled via system colors

## Dynamic Island regions

| Region | Content | Notes |
|---|---|---|
| compactLeading | `chart.pie.fill` (16pt, accent) | Always visible when activity is current |
| compactTrailing | `47 zł` (no decimals, monospaced) | Shows today's spend, NOT remaining |
| minimal | `chart.pie.fill` | Used when multiple activities are active |
| expanded.leading | `chart.pie.fill` (24pt) | |
| expanded.trailing | `145 zł` formatted full currency | |
| expanded.center | `Maj 2026` (caption) | |
| expanded.bottom | full-width `ProgressView` | |

## Apple Watch (.small family)

```
┌────────────────────────┐
│ [pie] 145 zł      [G] │
└────────────────────────┘
```
- Single line: icon + spend + circular gauge on the right
- `@Environment(\.isLuminanceReduced)` dims to gray on AOD
- 22×22 pt gauge with `accessoryCircularCapacity` style
- Padding: 8pt horizontal

---

## Update budget management

- Local updates are throttled by iOS but generously — for ≤10 user expense logs/day, no risk.
- Set `staleDate = .now + 30 min` on every update so iOS re-renders timestamps and dim states.
- Don't over-update: avoid pushing for non-state changes (e.g. user just toggling between tabs).

---

## Telemetry

Add to `lib/analytics/events.ts` (or iOS-side equivalent):
- `live_activity.requested` with `currency, hasBudget`
- `live_activity.updated` with `triggerSource: "expense"|"day_rollover"|"manual"`
- `live_activity.ended` with `reason: "day_rollover"|"signout"|"manual_dismiss"|"system_eviction"|"error"`

Track to understand:
- What % of users have Live Activities enabled
- What % see the activity expire vs manually dismiss
- Median activity lifetime

---

## Open questions for round 6+

1. Should `dailyBudget` be derived (monthly_budget / days_in_month) or its own field? Need a R6 product call.
2. Should the activity show "remaining" instead of "spent" when over 50%? Probably yes — avoid feeling shame-y; needs A/B test.
3. Multi-currency: when the user has expenses in EUR and PLN today, do we show only PLN? Convert? v1 = main currency only.
4. Settings toggle "Show daily budget on Lock Screen"? Default ON, toggle in Settings → Privacy.

---

## Effort estimate

- Day 1: widget extension scaffolding, ActivityAttributes, basic Lock Screen view
- Day 2: Dynamic Island regions, polish
- Day 3: Controller wiring into expense save path + day rollover trigger
- Day 0.5: Watch `.supplementalActivityFamilies`
- Day 0.5: testing on device

**Total: ~4 days of focused iOS work.**
