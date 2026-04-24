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

    struct Toast: Identifiable, Equatable {
        let id = UUID()
        let kind: Kind
        let title: String
        let description: String?
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

    private func show(_ toast: Toast) {
        current = toast
        let displayNs: UInt64 = toast.kind == .error ? 5_000_000_000 : 3_200_000_000
        Task {
            try? await Task.sleep(nanoseconds: displayNs)
            if current?.id == toast.id {
                current = nil
            }
        }
    }

    func dismiss() { current = nil }
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
                }
                .padding(Theme.Spacing.md)
                .nbCard(radius: Theme.Radius.md, shadow: Theme.Shadow.md)
                .padding(.horizontal, Theme.Spacing.md)
                .transition(.move(edge: .top).combined(with: .opacity))
                .onTapGesture { toast.dismiss() }
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
