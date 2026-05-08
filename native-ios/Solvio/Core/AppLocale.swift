import Foundation
import SwiftUI

/// PL/EN language selector. Mirrors PWA `lib/i18n.ts` dictionary pattern
/// but loaded in-memory — no bundle `.strings` files (too many keys to
/// port manually, and the PWA source of truth already changes weekly).
///
/// Published `language` drives `L10n.t(_:)`. Views observe via
/// `@EnvironmentObject var locale: AppLocale` and call
/// `locale.t("nav.dashboard")`. Defaults to system language, falling
/// back to PL (the primary target market). Persisted to UserDefaults
/// under `solvio.language`; also synced to backend via Settings.
@MainActor
final class AppLocale: ObservableObject {
    enum Language: String, CaseIterable, Identifiable {
        case pl, en
        var id: String { rawValue }
        var label: String {
            switch self {
            case .pl: return "Polski"
            case .en: return "English"
            }
        }
    }

    @Published var language: Language {
        didSet {
            UserDefaults.standard.set(language.rawValue, forKey: storageKey)
        }
    }

    private let storageKey = "solvio.language"

    init() {
        if let stored = UserDefaults.standard.string(forKey: storageKey),
           let lang = Language(rawValue: stored) {
            self.language = lang
            return
        }
        let preferred = Locale.preferredLanguages.first?.lowercased() ?? ""
        if preferred.hasPrefix("pl") {
            self.language = .pl
        } else {
            self.language = .en
        }
    }

    func t(_ key: String) -> String {
        L10n.strings[language]?[key] ?? L10n.strings[.en]?[key] ?? key
    }

    /// Pick the right plural form for `count` from a base key with CLDR
    /// suffixes (`<key>.one`, `<key>.few`, `<key>.many`). Looks up the
    /// suffixed key in the current language's table; if missing, falls back
    /// to the un-suffixed `<key>` (preserves behavior for keys not yet
    /// pluralized) and ultimately to the key itself.
    ///
    /// Polish (CLDR 46) plural categories for integer `count`:
    ///   one:  count == 1
    ///   few:  count % 10 ∈ {2,3,4} AND count % 100 ∉ {12,13,14}
    ///   many: everything else
    ///
    /// English: `count == 1` → `.one`, otherwise `.many`. The same key set
    /// works in both languages because we map `.few` → `.many` for English
    /// at lookup time (English has no "few" category).
    ///
    /// Example:
    ///   locale.tPlural("analyze.receiptsCount", count: 5)
    ///     PL → "%d paragonów"
    ///   locale.tPlural("analyze.receiptsCount", count: 2)
    ///     PL → "%d paragony"
    ///   locale.tPlural("analyze.receiptsCount", count: 1)
    ///     PL → "%d paragon"
    func tPlural(_ baseKey: String, count: Int) -> String {
        let category = pluralCategory(for: count)
        // Try the most specific suffix first; fall back step-by-step.
        let table = L10n.strings[language] ?? [:]
        let enTable = L10n.strings[.en] ?? [:]
        let candidates: [String]
        switch category {
        case .one:
            candidates = ["\(baseKey).one", baseKey]
        case .few:
            candidates = ["\(baseKey).few", "\(baseKey).many", baseKey]
        case .many:
            candidates = ["\(baseKey).many", baseKey]
        }
        for k in candidates {
            if let v = table[k] { return v }
        }
        for k in candidates {
            if let v = enTable[k] { return v }
        }
        return baseKey
    }

    /// CLDR plural category for the active language.
    private func pluralCategory(for count: Int) -> PluralCategory {
        switch language {
        case .pl: return Self.polishCategory(for: count)
        case .en: return count == 1 ? .one : .many
        }
    }

    enum PluralCategory {
        case one
        case few
        case many
    }

    /// Polish CLDR plural rule. Public for unit-testability and reuse from
    /// callsites that need to branch on the category outside `t()`.
    static func polishCategory(for count: Int) -> PluralCategory {
        let n = abs(count)
        if n == 1 { return .one }
        let mod10 = n % 10
        let mod100 = n % 100
        if (2...4).contains(mod10) && !(12...14).contains(mod100) { return .few }
        return .many
    }
}
