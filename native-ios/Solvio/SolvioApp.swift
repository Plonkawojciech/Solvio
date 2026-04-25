import SwiftUI

@main
struct SolvioApp: App {
    @StateObject private var session = SessionStore()
    @StateObject private var router = AppRouter()
    @StateObject private var toast = ToastCenter()
    @StateObject private var appTheme = AppTheme()
    @StateObject private var appLocale = AppLocale()
    /// Central in-memory cache for dashboard / receipts / goals / loyalty /
    /// challenges / groups. Every view reads from this so tab switches
    /// feel instant — see `Core/AppDataStore.swift`.
    @StateObject private var dataStore = AppDataStore()
    /// Background queue for multi-image receipt OCR uploads. Lives at the
    /// app root so the floating progress widget is visible across all tabs
    /// — see `Core/ScanQueueManager.swift`.
    @StateObject private var scanQueue: ScanQueueManager
    /// Watches app foreground/background transitions. When the app comes
    /// back from background, we silently refresh all slices so the user
    /// never sees stale numbers.
    @Environment(\.scenePhase) private var scenePhase

    init() {
        FontLoader.register()
        // ScanQueueManager needs the data store to invalidate caches after
        // each successful scan, so we hand it a reference at init time.
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
                    // Wire the queue's locale once so failure messages
                    // get localized instead of leaking raw URLSession /
                    // HTTP-status strings to the user.
                    scanQueue.locale = appLocale
                }
                .onChange(of: session.currentUser?.email) { email in
                    if email != nil {
                        // Warm EVERY cache slice in parallel the moment the
                        // user logs in. By the time they touch any tab, data
                        // is already in memory — no per-tab spinner, no
                        // "Something went wrong" on transient first-load
                        // failures. ensureX is fire-and-forget; all six
                        // network fetches run concurrently in detached Tasks.
                        dataStore.refreshAll(force: true)
                        // Run account-bring-up tasks once per login. The
                        // session POST already calls ensureUserSeeded, but
                        // older accounts (logged in before the fix shipped)
                        // still have 0 categories — call seed explicitly to
                        // catch them. Then recategorize old receipts whose
                        // items don't yet have a `category_id`. Both are
                        // idempotent and rate-limited server-side; we fire
                        // them in the background and refresh the dashboard
                        // afterwards so the user sees newly-tagged items.
                        let lang = appLocale.language.rawValue
                        let store = dataStore
                        Task {
                            try? await MaintenanceRepo.seedCategories()
                            do {
                                let result = try await MaintenanceRepo.recategorize(force: false, lang: lang)
                                if (result.itemsUpdated ?? 0) > 0 {
                                    // Recategorize shuffles items + expenses
                                    // between categories, so EVERY slice that
                                    // groups by category needs a refresh —
                                    // dashboard (per-category bar chart),
                                    // budget (per-category breakdown), and
                                    // financial health (score derived from
                                    // budget vs actual). Receipts list shows
                                    // item-level categories too.
                                    store.invalidateDashboard()
                                    store.invalidateReceipts()
                                    store.invalidateBudget()
                                    store.invalidateFinancialHealth()
                                    store.ensureDashboard(force: true)
                                    store.ensureReceipts(force: true)
                                    store.ensureBudget(force: true)
                                    store.ensureFinancialHealth(force: true)
                                }
                            } catch ApiError.notFound {
                                // Backend `recategorize-receipts` endpoint
                                // isn't deployed to prod yet. Silent — the
                                // earlier `seedCategories` call already
                                // covered the legacy-account path.
                            } catch ApiError.cancelled {
                                // Task cancelled (logout / app shutdown).
                                // No-op.
                            } catch {
                                #if DEBUG
                                print("[SolvioApp] recategorize failed: \(error)")
                                #endif
                            }
                        }
                    } else {
                        dataStore.resetAll()
                    }
                }
                .onChange(of: scenePhase) { phase in
                    // App just returned to the foreground — silently refresh
                    // every slice so the numbers the user sees are current.
                    // refreshXImpl skips the spinner when cached data exists,
                    // so this is invisible if nothing fails.
                    if phase == .active, session.currentUser != nil {
                        dataStore.refreshAll(force: false)
                    }
                }
                .preferredColorScheme(appTheme.mode.colorScheme)
        }
    }
}
