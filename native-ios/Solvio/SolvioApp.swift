import SwiftUI

@main
struct SolvioApp: App {
    @StateObject private var session = SessionStore()
    @StateObject private var router = AppRouter()
    @StateObject private var toast = ToastCenter()
    @StateObject private var appTheme = AppTheme()
    @StateObject private var appLocale = AppLocale()

    init() {
        FontLoader.register()
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(session)
                .environmentObject(router)
                .environmentObject(toast)
                .environmentObject(appTheme)
                .environmentObject(appLocale)
                .task { await session.restore() }
                .preferredColorScheme(appTheme.mode.colorScheme)
        }
    }
}
