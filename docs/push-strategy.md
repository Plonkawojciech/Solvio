# Solvio — Push Notification Strategy

**Date:** 2026-05-07 / 2026-05-08 (R4 quick win)
**Source:** `docs/research-round4.md` §2 (push notification strategy)
**Audience:** future iOS + backend agents shipping notification infrastructure

---

## TL;DR

1. **Never ask for notification permission on first launch.** Use provisional auth (no UI prompt) so notifications land quietly in Notification Center.
2. **Four interruption levels.** Map every notification: passive, active, time-sensitive, critical. Solvio uses passive + active + time-sensitive only — never critical.
3. **Weekly recap + budget overshoot are the two killer notifications.** Both work great as time-sensitive (no entitlement needed).
4. **Live Activities for shopping in progress.** Free Apple Watch sync via `.supplementalActivityFamilies([.small])`.
5. **Hard limit 3 review prompts/year, system-enforced.** Trigger only after meaningful task completion (goal hit, settlement closed, report viewed).

---

## Stage 1: First launch — provisional auth (zero friction)

```swift
// SolvioApp.swift
import SwiftUI
import UserNotifications

@main
struct SolvioApp: App {
    init() {
        Task {
            await requestProvisionalAuthorization()
        }
    }

    var body: some Scene {
        WindowGroup { ContentView() }
    }
}

@MainActor
func requestProvisionalAuthorization() async {
    let center = UNUserNotificationCenter.current()
    let settings = await center.notificationSettings()

    // Idempotent: don't re-request if already authorized or denied
    guard settings.authorizationStatus == .notDetermined else { return }

    do {
        try await center.requestAuthorization(
            options: [.alert, .sound, .badge, .provisional]
        )
    } catch {
        // Log only, don't block UX
        Logger.notifications.error("Provisional auth failed: \(error)")
    }
}
```

**Effect:** no prompt shown, user is silently opted-in to QUIET notifications. Each notification lands in Notification Center with "Keep" / "Turn Off" action buttons. No banner, no sound, no Lock Screen interrupt.

## Stage 2: In-app upgrade prompt (after engagement)

After the user has logged 3+ expenses AND opened the app on 2+ separate days, surface an in-app sheet:

```swift
struct UpgradeNotificationsSheet: View {
    @Environment(\.dismiss) var dismiss

    var body: some View {
        VStack(spacing: 24) {
            Image(systemName: "bell.badge.fill")
                .font(.system(size: 60))
                .foregroundStyle(.tint)
            Text(L10n.t("notifications.upgrade.title"))
                .font(.title2.bold())
            Text(L10n.t("notifications.upgrade.body"))
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)
            VStack(spacing: 12) {
                Label(L10n.t("notifications.upgrade.bullet1"), systemImage: "exclamationmark.triangle.fill")
                Label(L10n.t("notifications.upgrade.bullet2"), systemImage: "calendar")
                Label(L10n.t("notifications.upgrade.bullet3"), systemImage: "chart.line.uptrend.xyaxis")
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            Spacer()
            Button(L10n.t("notifications.upgrade.cta")) {
                if let url = URL(string: UIApplication.openSettingsURLString) {
                    UIApplication.shared.open(url)
                }
                dismiss()
            }
            .buttonStyle(.borderedProminent)
            Button(L10n.t("common.notNow")) { dismiss() }
        }
        .padding()
    }
}
```

**Polish copy:**
- title: "Włącz powiadomienia o budżecie"
- body: "Powiadomimy Cię, gdy zbliżasz się do limitu budżetu lub gdy ktoś poprosi o rozliczenie."
- bullet1: "Alerty gdy zbliżasz się do limitu kategorii"
- bullet2: "Cotygodniowe podsumowanie wydatków"
- bullet3: "Powiadomienia o nowych prośbach o rozliczenie"
- cta: "Otwórz ustawienia"

**English copy:**
- title: "Turn on budget alerts"
- body: "We'll notify you when you're approaching your budget limit or when someone requests a settlement."
- bullets: "Alerts when approaching category limits", "Weekly spending recap", "Settlement request notifications"
- cta: "Open Settings"

**Why redirect to Settings instead of system prompt:** iOS allows the system permission prompt only ONCE. After provisional, the user is in a terminal authorization state until they actively change it in Settings.

---

## Stage 3: Interruption level mapping

Every Solvio notification maps to ONE of these four levels. Set in `UNNotificationContent.interruptionLevel` for local notifications, or `interruption-level` payload key for APNs.

| Level | UI | Sound | Bypasses Focus | Entitlement | Solvio uses for |
|---|---|---|---|---|---|
| `.passive` | Silent | No | No | No | Weekly recap, "new feature", "cheaper price found" |
| `.active` (default) | Banner | Yes | No | No | Settlement requests, group invites, OCR done |
| `.timeSensitive` | Yellow banner | Yes | **Yes** | No | Budget overshoot 80%/100%, subscription auto-renew T-1d |
| `.critical` | Bypasses everything | Configurable | Yes | **Yes — Apple-approved** | **Never** (finance apps not approved) |

**Why time-sensitive matters:** breaks through Focus modes (Work, Sleep, Driving) without requiring a Critical Alerts entitlement. Apple specifically designed this level for finance/scheduling/travel use cases.

**Why never critical:** Apple reserves the entitlement for safety/health/severe-weather. Submission for a finance app will be rejected.

---

## Stage 4: APNs payload schema

**Standard alert payload:**
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
    "thread-id": "budget-groceries",
    "category": "BUDGET_ALERT"
  },
  "category_id": "groceries",
  "deep_link": "solvio://budget/groceries",
  "user_id": "u_<sha256-hash>"
}
```

**Keys explained:**
- `interruption-level`: `passive` | `active` | `time-sensitive` | `critical`.
- `relevance-score`: 0.0–1.0; drives Smart Stack ordering on Watch and Notification Center grouping in iOS 18+.
- `thread-id`: groups notifications under one heading. e.g. all settlement-related share `thread-id: "settlement-<id>"`.
- `category`: maps to a `UNNotificationCategory` for custom action buttons.

**Silent push (background sync trigger):**
```json
{
  "aps": {
    "content-available": 1
  },
  "type": "subscription_detected",
  "subscription_id": "<uuid>"
}
```

iOS 18+ delivers content-available pushes more consistently than iOS 17.

---

## Stage 5: Notification categories with custom actions

Define categories so users can act from the Lock Screen / Dynamic Island without opening the app:

```swift
let settlementCategory = UNNotificationCategory(
    identifier: "SETTLEMENT_REQUEST",
    actions: [
        UNNotificationAction(
            identifier: "OPEN_SETTLEMENT",
            title: L10n.t("notifications.actions.open"),
            options: [.foreground]
        ),
        UNNotificationAction(
            identifier: "MARK_PAID",
            title: L10n.t("notifications.actions.markPaid"),
            options: [.authenticationRequired]  // Face ID required
        ),
        UNNotificationAction(
            identifier: "SNOOZE_1D",
            title: L10n.t("notifications.actions.snooze1d"),
            options: []
        )
    ],
    intentIdentifiers: [],
    options: []
)

UNUserNotificationCenter.current().setNotificationCategories([
    settlementCategory,
    budgetAlertCategory,
    weeklyRecapCategory,
    subscriptionRenewCategory
])
```

Match the `category` key in payload to one of the registered categories.

---

## Stage 6: Solvio's full notification taxonomy

| Notification | Trigger | Level | Cadence cap | Thread ID |
|---|---|---|---|---|
| Weekly recap | Sunday 19:00 local | `.passive` | 1/week | `recap-weekly` |
| Budget overshoot 80% | `category.spent / category.budget > 0.8` | `.timeSensitive` | 1/category/period | `budget-{categoryId}` |
| Budget overshoot 100% | `> 1.0` | `.timeSensitive` | 1/category/period | `budget-{categoryId}` |
| Subscription detected | Detector fires after 3rd occurrence | `.passive` | 1/subscription | `subs-{vendor}` |
| Subscription auto-renew T-1d | 24h before next predicted occurrence | `.timeSensitive` | 1/subscription/period | `subs-{vendor}` |
| Settlement request | New `paymentRequests` row on user | `.active` | per request | `settlement-{requestId}` |
| Settlement settled | Other party clicked Settle | `.passive` | per request | `settlement-{requestId}` |
| Group invite | Share token used / member added | `.active` | per invite | `group-{groupId}` |
| Cheaper price | Audit detects ≥10% cheaper alt | `.passive` | 1/vendor/30d | `audit-{vendor}` |
| Receipt OCR done | `receipts.status` → `processed` | `.active` (foreground only) | per receipt | `ocr-{receiptId}` |

---

## Stage 7: Live Activities (auto-syncs to Watch)

See `docs/watch-vision-roadmap.md` §2 for the full pattern. Summary: shopping-in-progress Live Activity covers iPhone Lock Screen + Dynamic Island + Apple Watch Smart Stack with one codebase. Cost: ~1.5 days. Setup `.supplementalActivityFamilies([.small])` and the Watch sync is automatic.

---

## Stage 8: RequestReviewAction (rate-the-app)

**System-enforced rate limit:** 3 prompts per user per app per 365 days. Apple handles this; you don't track it.

**SwiftUI iOS 16+ pattern:**
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

**Solvio trigger points (high-satisfaction moments):**
1. After saving 5th expense in a session (small win, frequent).
2. After successfully closing a settlement (medium win, less frequent).
3. After hitting a savings goal target (big win, rare).
4. After viewing a generated report PDF (medium win, monthly).

**Anti-patterns to avoid:**
- Never on app launch.
- Never after a user error.
- Never as a result of a tap on a "Rate us" button (that's a manual flow — show a deep link to App Store reviews instead).
- Never more than once per app version (system enforces).

---

## Backend infrastructure

Solvio needs:

1. **APNs HTTP/2 connection** in `lib/apns/client.ts`. Use `node-apn` or `apn` package. Auth via JWT signed with .p8 key from Apple Developer.
2. **Cron jobs:**
   - `cron-weekly-recap` Sunday 19:00 local (actually 19:00 UTC + per-user offset stored in `userSettings.timezone`).
   - `cron-budget-overshoot-check` daily 09:00 UTC.
   - `cron-subscription-renew-tomorrow` daily 12:00 UTC.
3. **Per-user device tokens table:** `device_tokens (userId, token, platform, registeredAt, lastSeenAt)`.
4. **Notification preferences per category:** `userSettings.notificationPrefs jsonb` storing `{weeklyRecap: bool, budgetAlerts: bool, ...}` for granular opt-out.
5. **Send queue + retry:** persisted `notification_queue` table with `status ∈ {pending, sent, failed}` and exponential-backoff retry.

Effort: ~3 dev-days for the full backend.

---

## References

- See `docs/research-round4.md` §2 for full sourced research.
- All citations checked May 2026.
