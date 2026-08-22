import SwiftUI

/// Wybrany przez użytkownika schemat kolorów. `.system` idzie za iOS-em,
/// `.light` / `.dark` nadpisują. Zapisane w UserDefaults pod `solvio.theme`.
///
/// Wariant „wieczorny" wypadł razem z neobrutalizmem: paleta Notes Classic
/// ma dwa stany i oba siedzą w katalogu assetów, więc nie ma czego mostkować
/// w kodzie.
@MainActor
final class AppTheme: ObservableObject {
    enum Mode: String, CaseIterable, Identifiable {
        case system, light, dark
        var id: String { rawValue }

        var colorScheme: ColorScheme? {
            switch self {
            case .system: return nil
            case .light:  return .light
            case .dark:   return .dark
            }
        }
    }

    @Published var mode: Mode {
        didSet { UserDefaults.standard.set(mode.rawValue, forKey: storageKey) }
    }

    private let storageKey = "solvio.theme"

    init() {
        let raw = UserDefaults.standard.string(forKey: storageKey) ?? Mode.system.rawValue
        self.mode = Mode(rawValue: raw) ?? .system
    }
}
