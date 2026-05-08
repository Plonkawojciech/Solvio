import UIKit

/// Centralised haptic feedback helper. Wraps the three system feedback
/// generators behind a flat enum API so callsites stay short:
///
///   `Haptics.success()` after a successful save
///   `Haptics.error()` when an API call fails
///   `Haptics.impact(.medium)` on FAB / destructive confirmations
///   `Haptics.selection()` on tab swap, segmented picker change
///
/// Auto-fires through `ToastCenter` for every toast kind; views still
/// call directly when there's no toast (FAB, swipe actions, refresh).
///
/// Generators are recreated each call rather than retained — Apple's
/// recommendation for low-frequency feedback. For high-frequency (e.g.
/// scrubbing through a slider) keep a generator instance instead.
@MainActor
enum Haptics {
    /// Lekka pozytywna reakcja — formularz zapisany, paragon dodany.
    static func success() {
        guard !isReduceMotion else { return }
        let g = UINotificationFeedbackGenerator()
        g.prepare()
        g.notificationOccurred(.success)
    }

    /// Mocniejszy alarm — fetch error, walidacja niezaakceptowana.
    static func error() {
        guard !isReduceMotion else { return }
        let g = UINotificationFeedbackGenerator()
        g.prepare()
        g.notificationOccurred(.error)
    }

    /// Średni alarm — budżet 80%, deadline za chwilę, deposit warn.
    static func warning() {
        guard !isReduceMotion else { return }
        let g = UINotificationFeedbackGenerator()
        g.prepare()
        g.notificationOccurred(.warning)
    }

    /// Punktowa odpowiedź dla taps i dragów. `.light` na zwykły tap,
    /// `.medium` na FAB / primary CTA, `.heavy` na destructive confirm.
    static func impact(_ style: UIImpactFeedbackGenerator.FeedbackStyle = .light) {
        guard !isReduceMotion else { return }
        let g = UIImpactFeedbackGenerator(style: style)
        g.prepare()
        g.impactOccurred()
    }

    /// Subtelne tick dla picker / segmented control change.
    static func selection() {
        guard !isReduceMotion else { return }
        let g = UISelectionFeedbackGenerator()
        g.prepare()
        g.selectionChanged()
    }

    /// Reduce Motion gate. iOS robi to też dla audio in some places, ale
    /// haptyka dziedziczy ten sam toggle przez accessibility setting.
    private static var isReduceMotion: Bool {
        UIAccessibility.isReduceMotionEnabled
    }
}
