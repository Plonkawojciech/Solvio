import SwiftUI
import UIKit

/// User-selected color scheme. `.system` follows iOS appearance;
/// `.light` / `.dark` override it. `.evening` is a custom warm-bluish
/// dark variant — Solvio-only, requires `ThemeStore` lookup so colors
/// aren't pulled from the standard light/dark asset slots.
/// Persisted to UserDefaults under `solvio.theme`.
@MainActor
final class AppTheme: ObservableObject {
    enum Mode: String, CaseIterable, Identifiable {
        case system, light, dark, evening
        var id: String { rawValue }

        /// What we hand to SwiftUI's `.preferredColorScheme`. Evening
        /// uses the dark scheme so system chrome (status bar, picker
        /// backgrounds) goes dark, while our token resolver swaps the
        /// asset palette for the bluish one at runtime.
        var colorScheme: ColorScheme? {
            switch self {
            case .system:  return nil
            case .light:   return .light
            case .dark:    return .dark
            case .evening: return .dark
            }
        }
    }

    @Published var mode: Mode {
        didSet {
            UserDefaults.standard.set(mode.rawValue, forKey: storageKey)
            ThemeStore.shared.activeMode = mode
        }
    }

    private let storageKey = "solvio.theme"

    init() {
        let raw = UserDefaults.standard.string(forKey: storageKey) ?? Mode.system.rawValue
        let resolved = Mode(rawValue: raw) ?? .system
        self.mode = resolved
        ThemeStore.shared.activeMode = resolved
    }
}

/// Singleton bridge between `AppTheme.mode` and the static `Theme`
/// token enum. The token closures read `ThemeStore.shared.activeMode`
/// to decide whether to return the evening palette or fall through
/// to the asset catalog (which itself resolves light vs dark from the
/// active trait collection).
///
/// Not `@MainActor` so it can be called synchronously from `Theme.X`
/// statics during view-body computation. All writes go through
/// `AppTheme.didSet` which IS MainActor-isolated, and the field is a
/// value-type enum, so reads are race-free in practice.
final class ThemeStore: @unchecked Sendable {
    static let shared = ThemeStore()
    var activeMode: AppTheme.Mode = .system
    private init() {}
}
