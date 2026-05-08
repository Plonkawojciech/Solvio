import SwiftUI

struct RootView: View {
    @EnvironmentObject private var session: SessionStore
    /// Persists across launches — WelcomeOnboarding only shows once per
    /// device install. `@AppStorage` reads UserDefaults synchronously so
    /// there's no flash of login before the carousel kicks in.
    @AppStorage("solvio.seenWelcome") private var seenWelcome: Bool = false

    var body: some View {
        ZStack {
            Theme.background.ignoresSafeArea()
            if session.isRestoring {
                SplashView()
            } else if session.isAuthenticated {
                MainTabView()
            } else if !seenWelcome {
                WelcomeOnboardingView(onContinue: { seenWelcome = true })
                    .transition(.opacity)
            } else {
                LoginView()
                    .transition(.opacity)
            }
            ToastOverlay()
        }
        .animation(.easeInOut(duration: 0.25), value: seenWelcome)
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
                .frame(width: 96, height: 96)
                .clipShape(RoundedRectangle(cornerRadius: 22))
                .overlay(
                    RoundedRectangle(cornerRadius: 22)
                        .stroke(Theme.border, lineWidth: Theme.Border.width)
                )
                .nbShadow(Theme.Shadow.lg)
            Text(locale.t("login.brand"))
                .font(AppFont.black(32))
                .foregroundColor(Theme.foreground)
            NBEyebrow(text: locale.t("splash.tagline"))
        }
    }
}
