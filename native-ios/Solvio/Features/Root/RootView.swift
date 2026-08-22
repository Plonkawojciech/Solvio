import SwiftUI

struct RootView: View {
    @EnvironmentObject private var session: SessionStore

    var body: some View {
        ZStack {
            PaperBackground()
            if session.isRestoring {
                SplashView()
            } else if session.isAuthenticated {
                MainTabView()
            } else {
                LoginView().transition(.opacity)
            }
            ToastOverlay()
        }
        .animation(.easeInOut(duration: 0.25), value: session.isAuthenticated)
    }
}

private struct SplashView: View {
    @EnvironmentObject private var locale: AppLocale

    var body: some View {
        VStack(spacing: Theme.Spacing.md) {
            Image("SplashLogo")
                .resizable()
                .scaledToFit()
                .frame(width: 88, height: 88)
                .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
                .softShadow(2)
            Text("Solvio")
                .font(AppFont.bold(28))
                .foregroundColor(Theme.foreground)
            SectionLabel(text: locale.t("splash.tagline"))
        }
    }
}
