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
}
