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
    /// Dane z crm.programo.pl — osobno od `AppDataStore`, bo to nie są nasze
    /// dane: źródłem prawdy zostaje CRM, a apka jest pilotem.
    @StateObject private var crm = CrmStore()
    /// Księgowość firmy — tylko odczyt, przez ten sam most.
    @StateObject private var accounting: AccountingStore
    @StateObject private var reminders: ObligationReminders
    @Environment(\.scenePhase) private var scenePhase

    init() {
        FontLoader.register()
        let store = AppDataStore()
        _dataStore = StateObject(wrappedValue: store)
        _scanQueue = StateObject(wrappedValue: ScanQueueManager(store: store))

        let reminders = ObligationReminders()
        let accounting = AccountingStore()
        accounting.onObligations = { [weak reminders] in reminders?.update($0) }
        _reminders = StateObject(wrappedValue: reminders)
        _accounting = StateObject(wrappedValue: accounting)
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
                .environmentObject(crm)
                .environmentObject(accounting)
                .environmentObject(reminders)
                .task {
                    await session.restore()
                    // Wylogowanie mogło przerwać zamknięcie apki.
                    if session.currentUser == nil {
                        reminders.setAccount(nil)
                        WebPage.signOut()
                    }
                }
                .onAppear {
                    // Komunikaty błędów kolejki mają być zlokalizowane,
                    // a nie wyciekać surowym opisem z URLSession.
                    scanQueue.locale = appLocale
                    scanQueue.canPresentReview = { [weak router] in router?.holdsReview != true }
                    reminders.locale = appLocale
                }
                .onChange(of: session.currentUser?.email) { email in
                    // Czyścimy przy KAŻDEJ zmianie konta, nie tylko przy
                    // wylogowaniu: dane jednego nie mają prawa mignąć drugiemu.
                    dataStore.resetAll()
                    crm.reset()
                    accounting.reset()
                    router.reset()
                    scanQueue.dropReview()
                    reminders.setAccount(email)
                    guard email != nil else {
                        // Sesja weba w apce należy do poprzedniego konta.
                        WebPage.signOut()
                        return
                    }
                    // Rozgrzewamy cache w chwili logowania, żeby pierwszy
                    // ekran nie miał spinnera.
                    dataStore.refreshAll(force: true)
                    crm.ensureLoaded(force: true)
                    // Konta założone przed wdrożeniem seeda nadal mają zero
                    // kategorii. Wywołanie jest idempotentne i ograniczone
                    // po stronie serwera, więc puszczamy je w tle.
                    Task { try? await MaintenanceRepo.seedCategories() }
                }
                .onChange(of: crm.connected) { connected in
                    switch connected {
                    case true?:
                        accounting.ensureLoaded()
                    case false?:
                        accounting.reset()
                        reminders.clear()
                        router.leaveCompany()
                    case nil:
                        // Nowy klucz albo inne konto: nie wiadomo, czyje to dane,
                        // a otwarte ekrany trzymają dokumenty poprzedniej firmy.
                        accounting.reset()
                        router.leaveCompany()
                    }
                }
                .onChange(of: appLocale.language) { _ in reminders.reschedule() }
                .onChange(of: scenePhase) { phase in
                    // Powrót z tła — po cichu odświeżamy, żeby liczby na
                    // ekranie były aktualne. Bez spinnera, jeśli cache żyje.
                    if phase == .active, session.currentUser != nil {
                        dataStore.refreshAll(force: false)
                        crm.ensureLoaded()
                        if crm.connected == true { accounting.ensureLoaded() }
                    }
                }
                .preferredColorScheme(appTheme.mode.colorScheme)
        }
    }
}
