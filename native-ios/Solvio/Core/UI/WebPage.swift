import SafariServices
import SwiftUI

/// Strona Solvio do otwarcia w apce. Powstaje wyłącznie ze sprawdzonej ścieżki,
/// więc host to zawsze `AppConfig.apiBaseURL`.
struct WebPage: Identifiable, Equatable {
    let url: URL
    var id: String { url.absoluteString }

    init?(path: String?) {
        guard let url = SolvioWeb.url(path: path) else { return nil }
        self.url = url
    }

    /// Sesja weba żyje między otwarciami, więc po wylogowaniu z apki trzeba ją
    /// zdjąć: następne konto weszłoby na web jako poprzednie.
    static func signOut() {
        SFSafariViewController.DataStore.default.clearWebsiteData()
    }
}

struct WebPageView: UIViewControllerRepresentable {
    let page: WebPage
    @Environment(\.dismiss) private var dismiss

    func makeUIViewController(context: Context) -> SFSafariViewController {
        let controller = SFSafariViewController(url: page.url)
        controller.delegate = context.coordinator
        controller.dismissButtonStyle = .close
        controller.preferredControlTintColor = UIColor(Theme.primary)
        return controller
    }

    func updateUIViewController(_ controller: SFSafariViewController, context: Context) {
        context.coordinator.onClose = { dismiss() }
    }

    func makeCoordinator() -> Coordinator { Coordinator() }

    final class Coordinator: NSObject, SFSafariViewControllerDelegate {
        var onClose: () -> Void = {}

        func safariViewControllerDidFinish(_ controller: SFSafariViewController) { onClose() }
    }
}
