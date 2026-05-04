import SwiftUI

struct RootView: View {
    @EnvironmentObject private var session: SessionStore

    var body: some View {
        ZStack {
            Theme.background.ignoresSafeArea()
            if session.isRestoring {
                SplashView()
            } else if session.isAuthenticated {
                MainTabView()
            } else {
                LoginView()
            }
            ToastOverlay()
        }
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
