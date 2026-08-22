import SwiftUI

@main
struct SolvioApp: App {
    @StateObject private var session = SessionStore()
    @StateObject private var router = AppRouter()
    @StateObject private var toast = ToastCenter()
    @StateObject private var appTheme = AppTheme()
    @StateObject private var appLocale = AppLocale()
    /// Pamięć podręczna panelu — każdy widok czyta stąd, więc przełączenie
    /// zakładki jest natychmiastowe. Patrz `Core/AppDataStore.swift`.
    @StateObject private var dataStore: AppDataStore
    /// Kolejka uploadów OCR w tle. Siedzi w korzeniu, żeby pływający
    /// wskaźnik postępu był widoczny na obu ekranach.
    @StateObject private var scanQueue: ScanQueueManager
    @Environment(\.scenePhase) private var scenePhase

    init() {
        FontLoader.register()
        let store = AppDataStore()
        _dataStore = StateObject(wrappedValue: store)
        _scanQueue = StateObject(wrappedValue: ScanQueueManager(store: store))
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(session)
                .environmentObject(router)
                .environmentObject(toast)
                .environmentObject(appTheme)
                .environmentObject(appLocale)
                .environmentObject(dataStore)
                .environmentObject(scanQueue)
                .task { await session.restore() }
                .onAppear {
                    // Komunikaty błędów kolejki mają być zlokalizowane,
                    // a nie wyciekać surowym opisem z URLSession.
                    scanQueue.locale = appLocale
                }
                .onChange(of: session.currentUser?.email) { email in
                    guard email != nil else {
                        dataStore.resetAll()
                        return
                    }
                    // Rozgrzewamy cache w chwili logowania, żeby pierwszy
                    // ekran nie miał spinnera.
                    dataStore.refreshAll(force: true)
                    // Konta założone przed wdrożeniem seeda nadal mają zero
                    // kategorii. Wywołanie jest idempotentne i ograniczone
                    // po stronie serwera, więc puszczamy je w tle.
                    Task { try? await MaintenanceRepo.seedCategories() }
                }
                .onChange(of: scenePhase) { phase in
                    // Powrót z tła — po cichu odświeżamy, żeby liczby na
                    // ekranie były aktualne. Bez spinnera, jeśli cache żyje.
                    if phase == .active, session.currentUser != nil {
                        dataStore.refreshAll(force: false)
                    }
                }
                .preferredColorScheme(appTheme.mode.colorScheme)
        }
    }
}
