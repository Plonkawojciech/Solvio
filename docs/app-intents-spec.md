# Solvio — App Intents + Siri Spec

**Date:** 2026-05-08
**Status:** Spec — not yet implemented
**Companion to:** `docs/research-round5.md` Section 2
**Owner:** A5 (research) — to be picked up by an iOS-implementation agent in round 6-7

---

## v1 scope (3 intents)

| Intent | Parameter(s) | `openAppWhenRun` | Purpose |
|---|---|---|---|
| `LogExpenseIntent` | `amount: Double` (required, 0.01...1M), `vendor: String?`, `category: SolvioCategoryEntity?` | `false` | Logs an expense in the background |
| `ScanReceiptIntent` | none | `true` | Opens camera UI for receipt OCR |
| `CheckBudgetIntent` | `category: SolvioCategoryEntity?` | `false` | Returns spend/budget snippet |

Plus:
- `SolvioCategoryEntity: AppEntity` — wraps `categories` table rows
- `SolvioCategoryQuery: EntityQuery` — for Siri/Shortcuts disambiguation
- `SolvioAppShortcuts: AppShortcutsProvider` — registers all three with phrases
- `IntentDonationManager.shared.donate(intent:)` calls in regular app flow so Siri learns from non-Siri usage

---

## File layout

```
native-ios/
  Solvio/
    Features/
      AppIntents/
        SolvioCategoryEntity.swift          # AppEntity + EntityQuery
        LogExpenseIntent.swift
        ScanReceiptIntent.swift
        CheckBudgetIntent.swift
        SolvioAppShortcuts.swift            # AppShortcutsProvider
        BudgetSnippetView.swift             # SwiftUI for inline Siri response
        IntentErrors.swift                  # SolvioIntentError enum
        IntentDonationsHelper.swift         # wrapper for donate() calls
      Localization/
        AppShortcuts.strings                # PL + EN phrase localization
```

---

## Phrase rules (Apple's hard constraints)

- Every phrase MUST contain `\(.applicationName)` placeholder.
- Each phrase has at most ONE intent parameter inline. Phrases without parameters can have rest in summary.
- Apple suggests 5–10 phrases per intent for good Siri training.

### `LogExpenseIntent` phrases

```swift
[
    "Log expense in \(.applicationName)",
    "Add expense in \(.applicationName)",
    "Dodaj wydatek w \(.applicationName)",
    "Zapisz wydatek w \(.applicationName)",
    "Log \(\.$amount) in \(.applicationName)",
    "Add \(\.$amount) to \(.applicationName)",
    "Zapisz \(\.$amount) w \(.applicationName)",
]
```

### `ScanReceiptIntent` phrases

```swift
[
    "Scan receipt in \(.applicationName)",
    "Scan a receipt in \(.applicationName)",
    "New receipt in \(.applicationName)",
    "Skanuj paragon w \(.applicationName)",
    "Nowy paragon w \(.applicationName)",
]
```

### `CheckBudgetIntent` phrases

```swift
[
    "Check budget in \(.applicationName)",
    "What's my budget in \(.applicationName)",
    "How much have I spent in \(.applicationName)",
    "Sprawdź budżet w \(.applicationName)",
    "Ile wydałem w \(.applicationName)",
]
```

---

## SolvioCategoryEntity

```swift
struct SolvioCategoryEntity: AppEntity, Identifiable {
    let id: String           // category UUID from DB
    let name: String         // localized
    let icon: String         // SF Symbol or emoji
    let color: String

    static var typeDisplayRepresentation: TypeDisplayRepresentation {
        TypeDisplayRepresentation(name: "Category")
    }

    var displayRepresentation: DisplayRepresentation {
        DisplayRepresentation(title: "\(name)", subtitle: "")
    }

    static var defaultQuery = SolvioCategoryQuery()
}

struct SolvioCategoryQuery: EntityQuery {
    func entities(for identifiers: [SolvioCategoryEntity.ID]) async throws -> [SolvioCategoryEntity] {
        try await SolvioAPI.shared.fetchCategories(ids: identifiers).map(\.asEntity)
    }

    func suggestedEntities() async throws -> [SolvioCategoryEntity] {
        try await SolvioAPI.shared.fetchAllCategories().map(\.asEntity)
    }
}
```

---

## SolvioAppShortcuts (the registration glue)

```swift
struct SolvioAppShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: LogExpenseIntent(),
            phrases: [/* see above */],
            shortTitle: "Log expense",
            systemImageName: "plus.circle.fill"
        )
        AppShortcut(
            intent: ScanReceiptIntent(),
            phrases: [/* see above */],
            shortTitle: "Scan receipt",
            systemImageName: "doc.viewfinder.fill"
        )
        AppShortcut(
            intent: CheckBudgetIntent(),
            phrases: [/* see above */],
            shortTitle: "Check budget",
            systemImageName: "chart.line.uptrend.xyaxis"
        )
    }

    static var shortcutTileColor: ShortcutTileColor = .teal
}
```

---

## Donation pattern (so Siri learns from non-Siri use)

In Solvio's existing `ExpenseDetailView` (or wherever expenses get created/saved):

```swift
// after a successful save:
let intent = LogExpenseIntent()
intent.amount = expense.amount.doubleValue
intent.vendor = expense.vendor
intent.category = expense.categoryId.flatMap { /* lookup */ }
IntentDonationManager.shared.donate(intent: intent)
```

Without donations, Spotlight / Siri Suggestions never learn the user's pattern. **Always donate from regular app flow.**

---

## Error handling

```swift
enum SolvioIntentError: Error, CustomLocalizedStringResourceConvertible {
    case notLoggedIn
    case networkFailed
    case categoryNotFound
    case invalidAmount

    var localizedStringResource: LocalizedStringResource {
        switch self {
        case .notLoggedIn:    return "Open Solvio to sign in first."
        case .networkFailed:  return "Couldn't reach Solvio. Check your connection."
        case .categoryNotFound: return "That category wasn't found in Solvio."
        case .invalidAmount:  return "The amount must be at least 0.01."
        }
    }
}
```

`throw`ing one of these from `perform()` causes Siri to speak the message and abort gracefully.

---

## iOS 26 enhancements (defer to round 7-8)

- Interactive Snippets — add a "Log new" button inside `BudgetSnippetView` that itself runs `LogExpenseIntent`
- Apple Intelligence parameter resolution — automatic in iOS 18.1+; no code changes needed
- IntentSearchAction for Spotlight inline results — defer

---

## Testing checklist

- [ ] "Hey Siri, log 47 in Solvio" → Siri asks "How much?" → response "47 zlotys" → confirms creation
- [ ] "Hey Siri, scan receipt in Solvio" → opens app camera UI
- [ ] "Hey Siri, what's my budget in Solvio" → returns dialog + snippet
- [ ] Spotlight: type "Solvio log" → suggests `LogExpenseIntent`
- [ ] Spotlight: type "expense Biedronka" → suggests `LogExpenseIntent` (after a few donations)
- [ ] Action Button assigned to `ScanReceiptIntent` → tap opens camera
- [ ] Shortcuts.app: build a Shortcut combining `LogExpenseIntent` + `Get Current Location` + `Wait` → succeeds
- [ ] PL phrases work with Polish Siri
- [ ] EN phrases work with English Siri
- [ ] Sign-out then run intent → throws `notLoggedIn` with correct dialog

---

## Effort estimate

- Day 1: SolvioCategoryEntity + Query + LogExpenseIntent
- Day 2: ScanReceiptIntent + CheckBudgetIntent + BudgetSnippetView
- Day 3: AppShortcutsProvider + phrases + localization (PL+EN)
- Day 4: Donation calls in existing app flow + error states
- Day 5: device testing

**Total: ~5 days of focused iOS work.**
