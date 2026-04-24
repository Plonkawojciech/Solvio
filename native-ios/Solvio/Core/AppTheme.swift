import SwiftUI

/// User-selected color scheme. `.system` follows iOS appearance;
/// `.light` / `.dark` override it. Persisted to UserDefaults under
/// `solvio.theme` — read at launch and written on every change.
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
        didSet {
            UserDefaults.standard.set(mode.rawValue, forKey: storageKey)
        }
    }

    private let storageKey = "solvio.theme"

    init() {
        let raw = UserDefaults.standard.string(forKey: storageKey) ?? Mode.system.rawValue
        self.mode = Mode(rawValue: raw) ?? .system
    }
}
