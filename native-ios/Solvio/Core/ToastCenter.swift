import Foundation
import SwiftUI

/// Lightweight top-banner toast surface. Matches the PWA's `sonner`
/// toaster — success/info/error/warning with icon + message.
@MainActor
final class ToastCenter: ObservableObject {
    enum Kind {
        case success
        case error
        case info
        case warning
    }

    /// Optional undo action attached to a toast. When present the toast
    /// renders an "Undo" button — tapping it cancels the auto-dismiss timer
    /// and runs `handler`. Use cases: bulk delete, swipe-to-delete, archive.
    struct UndoAction: Equatable {
        let label: String
        let handler: () -> Void
        // Equatable conformance: two undo actions are "equal" when they
        // share the same label — handlers are closures and can't be
        // compared. Good enough for SwiftUI animation diffing.
        static func == (lhs: UndoAction, rhs: UndoAction) -> Bool { lhs.label == rhs.label }
    }

    struct Toast: Identifiable, Equatable {
        let id = UUID()
        let kind: Kind
        let title: String
        let description: String?
        var undo: UndoAction? = nil
    }

    @Published var current: Toast?

    func success(_ title: String, description: String? = nil) {
        show(Toast(kind: .success, title: title, description: description))
    }

    func error(_ title: String, description: String? = nil) {
        show(Toast(kind: .error, title: title, description: description))
    }

    func info(_ title: String, description: String? = nil) {
        show(Toast(kind: .info, title: title, description: description))
    }

    func warning(_ title: String, description: String? = nil) {
        show(Toast(kind: .warning, title: title, description: description))
    }

    /// Show an info toast with an undo affordance. Kept open ~5 s so the
    /// user has time to react before the destructive action commits.
    func undoable(_ title: String, undoLabel: String, undo: @escaping () -> Void) {
        show(Toast(kind: .info, title: title, description: nil, undo: UndoAction(label: undoLabel, handler: undo)))
    }

    private func show(_ toast: Toast) {
        current = toast
        // Undo toasts get the longer 5 s window so the user has time to act.
        let isUndoOrError = toast.kind == .error || toast.undo != nil
        let displayNs: UInt64 = isUndoOrError ? 5_000_000_000 : 3_200_000_000
        Task {
            try? await Task.sleep(nanoseconds: displayNs)
            if current?.id == toast.id {
                current = nil
            }
        }
    }

    func dismiss() { current = nil }

    /// Run the toast's undo handler if present and dismiss. Called from the
    /// toast UI when the user taps the inline "Undo" button.
    func performUndo() {
        guard let undo = current?.undo else { return }
        undo.handler()
        dismiss()
    }
}

struct ToastOverlay: View {
    @EnvironmentObject private var toast: ToastCenter

    var body: some View {
        VStack {
            if let t = toast.current {
                HStack(alignment: .top, spacing: Theme.Spacing.sm) {
                    icon(for: t.kind)
                        .frame(width: 20, height: 20)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(t.title)
                            .font(AppFont.bodyMedium)
                            .foregroundColor(Theme.foreground)
                        if let d = t.description {
                            Text(d)
                                .font(AppFont.caption)
                                .foregroundColor(Theme.mutedForeground)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                    Spacer()
                    // Undo button — explicit Button (not onTapGesture) so it
                    // captures the tap before the toast-level dismiss runs.
                    if let u = t.undo {
                        Button(action: { toast.performUndo() }) {
                            Text(u.label)
                                .font(AppFont.mono(11))
                                .tracking(1)
                                .textCase(.uppercase)
                                .padding(.horizontal, 10)
                                .padding(.vertical, 6)
                                .foregroundColor(Theme.background)
                                .background(Theme.foreground)
                                .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.sm))
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(Theme.Spacing.md)
                .nbCard(radius: Theme.Radius.md, shadow: Theme.Shadow.md)
                .padding(.horizontal, Theme.Spacing.md)
                .transition(.move(edge: .top).combined(with: .opacity))
                // Tap-to-dismiss only on toasts WITHOUT an undo affordance.
                // For undoable toasts a stray tap on the body would dismiss
                // and silently lose the undo opportunity — surprise loss.
                .onTapGesture {
                    if t.undo == nil { toast.dismiss() }
                }
            }
            Spacer()
        }
        .padding(.top, Theme.Spacing.sm)
        .animation(.spring(response: 0.35, dampingFraction: 0.85), value: toast.current)
        .allowsHitTesting(toast.current != nil)
    }

    @ViewBuilder
    private func icon(for kind: ToastCenter.Kind) -> some View {
        switch kind {
        case .success:
            Image(systemName: "checkmark.circle.fill").foregroundColor(Theme.success)
        case .error:
            Image(systemName: "exclamationmark.octagon.fill").foregroundColor(Theme.destructive)
        case .warning:
            Image(systemName: "exclamationmark.triangle.fill").foregroundColor(Theme.warning)
        case .info:
            Image(systemName: "info.circle.fill").foregroundColor(Theme.info)
        }
    }
}
