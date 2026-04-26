import SwiftUI
import PhotosUI

/// Root authenticated layout — mirrors PWA mobile shell:
///   ┌─ Sticky header (hamburger · logo · lang/theme) ─┐
///   │                                                  │
///   │                  Tab content                     │
///   │                                                  │
///   └─ Bottom nav (5 slots + FAB) ────────────────────┘
/// PWA ref: `components/protected/main/{app-mobile-header.tsx,
/// mobile-bottom-nav.tsx}`.
struct MainTabView: View {
    @EnvironmentObject private var router: AppRouter
    @EnvironmentObject private var locale: AppLocale
    @EnvironmentObject private var toast: ToastCenter
    @EnvironmentObject private var scanQueue: ScanQueueManager

    @State private var showCamera = false
    @State private var showLibrary = false
    @State private var showVirtual = false
    @State private var showQuickSplit = false
    @State private var quickSplitPrefill: QuickSplitPrefill?
    /// Multi-select picker — the user can grab as many receipts as they want
    /// in one go and they upload in the background via `ScanQueueManager`.
    @State private var pickedItems: [PhotosPickerItem] = []

    struct QuickSplitPrefill: Identifiable, Hashable {
        let id = UUID()
        let total: Double?
        let description: String?
        let currency: String?
        let receiptId: String?
    }

    var body: some View {
        VStack(spacing: 0) {
            AppMobileHeader()
            ZStack(alignment: .bottom) {
                contentStack
                    .padding(.bottom, 64) // reserve for custom tab bar
                VStack(spacing: 0) {
                    // Floating progress widget for active scans. Sits above
                    // the tab bar so it's visible no matter what tab the
                    // user is on. Hides itself when the queue is empty.
                    ScanQueueWidget()
                        .padding(.bottom, 6)
                    NBTabBar()
                }
            }
        }
        .background(Theme.background)
        .ignoresSafeArea(.keyboard)
        .sheet(isPresented: $router.showingMoreSheet, onDismiss: {
            if let route = router.pendingMoreRoute {
                router.pendingMoreRoute = nil
                let target = router.tabForMoreRoute(route)
                router.selectedTab = target
                let routePath = AppRoute.more(route)
                switch target {
                case .deals:    router.dealsStack.append(routePath)
                case .savings:  router.savingsStack.append(routePath)
                case .dashboard: router.dashboardStack.append(routePath)
                case .expenses: router.expensesStack.append(routePath)
                case .groups:   router.groupsStack.append(routePath)
                }
            }
        }) {
            MoreSheet()
                .environmentObject(router)
        }
        .sheet(isPresented: $router.showingScanSheet, onDismiss: handleScanSheetDismiss) {
            ScanFabSheet()
                .environmentObject(router)
                .environmentObject(locale)
        }
        .fullScreenCover(isPresented: $showCamera) {
            CameraPicker { image in
                // Camera is single-shot. Push it through the background queue
                // so the user gets the same floating-chip UX as multi-pick.
                scanQueue.enqueue([image])
                toast.success(locale.t("scanQueue.batchSavedSingle"))
            }
            .ignoresSafeArea()
        }
        .photosPicker(
            isPresented: $showLibrary,
            selection: $pickedItems,
            maxSelectionCount: 20,
            matching: .images
        )
        .onChange(of: pickedItems) { newItems in
            guard !newItems.isEmpty else { return }
            // Snapshot + clear immediately so the picker dismisses cleanly,
            // then load the data off-main and hand it to the queue.
            let captured = newItems
            pickedItems = []
            Task {
                var images: [UIImage] = []
                for item in captured {
                    if let data = try? await item.loadTransferable(type: Data.self),
                       let ui = UIImage(data: data) {
                        images.append(ui)
                    }
                }
                guard !images.isEmpty else { return }
                scanQueue.enqueue(images)
                if images.count == 1 {
                    toast.success(locale.t("scanQueue.batchSavedSingle"))
                } else {
                    toast.success(String(format: locale.t("scanQueue.batchSaved"), images.count))
                }
            }
        }
        .sheet(isPresented: $showVirtual) {
            NavigationStack {
                VirtualReceiptCreateView { created in
                    toast.success(locale.t("receipts.saved"), description: created.vendor ?? locale.t("receipts.virtualReceipt"))
                    showVirtual = false
                    router.push(.receiptDetail(id: created.id))
                }
            }
            .environmentObject(locale)
        }
        .sheet(isPresented: $showQuickSplit) {
            QuickSplitStandaloneSheet()
                .environmentObject(locale)
                .environmentObject(toast)
        }
        .sheet(item: $quickSplitPrefill) { prefill in
            QuickSplitStandaloneSheet(
                prefillTotal: prefill.total,
                prefillDescription: prefill.description,
                prefillCurrency: prefill.currency,
                receiptId: prefill.receiptId
            )
            .environmentObject(locale)
            .environmentObject(toast)
        }
    }

    /// SwiftUI can't stack two full-screen presentations in the same tick, so
    /// we wait for the scan sheet to finish dismissing before launching the
    /// chosen sub-flow. `pendingScanMode` is set inside `ScanFabSheet`.
    private func handleScanSheetDismiss() {
        guard let mode = router.pendingScanMode else { return }
        router.pendingScanMode = nil
        switch mode {
        case .camera:      showCamera = true
        case .library:     showLibrary = true
        case .virtual:     showVirtual = true
        case .quickSplit:
            showQuickSplit = true
        }
    }

    @ViewBuilder
    private var contentStack: some View {
        switch router.selectedTab {
        case .dashboard:
            NavigationStack(path: $router.dashboardStack) {
                DashboardView()
                    .routeDestinations()
            }
        case .expenses:
            NavigationStack(path: $router.expensesStack) {
                ExpensesListView()
                    .routeDestinations()
            }
        case .deals:
            NavigationStack(path: $router.dealsStack) {
                OkazjeHubView()
                    .routeDestinations()
            }
        case .groups:
            NavigationStack(path: $router.groupsStack) {
                GroupsListView()
                    .routeDestinations()
            }
        case .savings:
            NavigationStack(path: $router.savingsStack) {
                SavingsHubView()
                    .routeDestinations()
            }
        }
    }
}

private extension View {
    func routeDestinations() -> some View {
        self.navigationDestination(for: AppRoute.self) { route in
            switch route {
            case .expenseDetail(let id):
                ExpenseDetailView(expenseId: id)
            case .receiptDetail(let id):
                ReceiptDetailView(receiptId: id)
            case .groupDetail(let id):
                GroupDetailView(groupId: id)
            case .groupReceipts(let id):
                GroupReceiptsView(groupId: id)
            case .groupSettlements(let id):
                GroupSettlementsView(groupId: id)
            case .goalDetail(let id):
                GoalDetailView(goalId: id)
            case .more(let more):
                switch more {
                case .receipts: ReceiptsListView()
                case .goals: GoalsListView()
                case .challenges: ChallengesView()
                case .loyalty: LoyaltyView()
                case .prices: PricesView()
                case .audit: AuditView()
                case .analysis: AnalysisView()
                case .reports: ReportsView()
                case .categories: CategoriesManagerView()
                case .shoppingAdvisor: ShoppingAdvisorView()
                case .nearbyStores: NearbyStoresView()
                case .productSearch: ProductSearchView()
                case .settings: SettingsView()
                }
            }
        }
    }
}

/// Sticky top header — hamburger, centered Solvio logo, language + theme
/// controls on the right. PWA `app-mobile-header.tsx`.
struct AppMobileHeader: View {
    @EnvironmentObject private var router: AppRouter
    @EnvironmentObject private var locale: AppLocale
    @EnvironmentObject private var appTheme: AppTheme

    var body: some View {
        HStack(spacing: 0) {
            Button { router.showingMoreSheet = true } label: {
                Image(systemName: "line.3.horizontal")
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundColor(Theme.foreground)
                    .frame(width: 36, height: 36)
                    .background(Theme.card)
                    .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.sm))
                    .overlay(
                        RoundedRectangle(cornerRadius: Theme.Radius.sm)
                            .stroke(Theme.foreground, lineWidth: Theme.Border.widthThin)
                    )
            }
            Spacer()
            HStack(spacing: 8) {
                Image(systemName: "wallet.pass.fill")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(Theme.background)
                    .frame(width: 32, height: 32)
                    .background(Theme.foreground)
                    .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.sm))
                    .overlay(
                        RoundedRectangle(cornerRadius: Theme.Radius.sm)
                            .stroke(Theme.foreground, lineWidth: Theme.Border.widthThin)
                    )
                    .nbShadow(Theme.Shadow.sm)
                Text(locale.t("login.brand"))
                    .font(AppFont.black(14))
                    .foregroundColor(Theme.foreground)
                    .tracking(-0.5)
            }
            Spacer()
            HStack(spacing: 6) {
                HeaderIconButton(systemImage: languageIcon) {
                    locale.language = (locale.language == .pl) ? .en : .pl
                }
                HeaderIconButton(systemImage: themeIcon) {
                    appTheme.mode = nextTheme(from: appTheme.mode)
                }
            }
            .frame(width: 78, alignment: .trailing)
        }
        .padding(.horizontal, Theme.Spacing.sm)
        .frame(height: 56)
        .background(Theme.background.opacity(0.95))
        .overlay(
            Rectangle()
                .fill(Theme.foreground)
                .frame(height: Theme.Border.width),
            alignment: .bottom
        )
    }

    private var languageIcon: String { "globe" }

    private var themeIcon: String {
        switch appTheme.mode {
        case .system: return "circle.lefthalf.filled"
        case .light:  return "sun.max.fill"
        case .dark:   return "moon.fill"
        }
    }

    private func nextTheme(from current: AppTheme.Mode) -> AppTheme.Mode {
        switch current {
        case .system: return .light
        case .light:  return .dark
        case .dark:   return .system
        }
    }
}

private struct HeaderIconButton: View {
    let systemImage: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: systemImage)
                .font(.system(size: 14, weight: .semibold))
                .foregroundColor(Theme.foreground)
                .frame(width: 32, height: 32)
                .background(Theme.card)
                .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.sm))
                .overlay(
                    RoundedRectangle(cornerRadius: Theme.Radius.sm)
                        .stroke(Theme.foreground, lineWidth: Theme.Border.widthThin)
                )
        }
    }
}

/// Bottom tab bar — 6 slots: 5 real tabs flanking a centered FAB.
///   Dashboard | Expenses | **FAB(camera)** | Deals | Groups | Savings
///
/// The FAB is a centered, elevated black tile that opens the scan sheet
/// (or quick-split when on Groups). Tab labels use the smaller tracked
/// mono font so 5 tab labels fit comfortably on a 6.1" screen.
struct NBTabBar: View {
    @EnvironmentObject private var router: AppRouter
    @EnvironmentObject private var locale: AppLocale

    var body: some View {
        HStack(spacing: 0) {
            tabSlot(.dashboard, systemImage: "house.fill", label: locale.t("nav.dashboard"))
            tabSlot(.expenses, systemImage: "dollarsign.circle.fill", label: locale.t("nav.expenses"))
            fabSlot
            tabSlot(.deals, systemImage: "tag.fill", label: locale.t("nav.deals"))
            tabSlot(.groups, systemImage: "person.3.fill", label: locale.t("nav.groups"))
            tabSlot(.savings, systemImage: "chart.line.uptrend.xyaxis", label: locale.t("nav.savings"))
        }
        .padding(.horizontal, 2)
        .frame(height: 56)
        .background(Theme.background)
        .overlay(
            Rectangle()
                .fill(Theme.foreground)
                .frame(height: Theme.Border.width),
            alignment: .top
        )
    }

    private var fabSlot: some View {
        Button {
            if router.selectedTab == .groups {
                // PWA swaps to Zap icon + quick-split; for now open scan.
                router.showingScanSheet = true
            } else {
                router.showingScanSheet = true
            }
        } label: {
            VStack(spacing: 0) {
                ZStack {
                    RoundedRectangle(cornerRadius: Theme.Radius.md)
                        .fill(Theme.foreground)
                        .frame(width: 48, height: 48)
                    Image(systemName: router.selectedTab == .groups ? "bolt.fill" : "camera.fill")
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundColor(Theme.background)
                }
                .overlay(
                    RoundedRectangle(cornerRadius: Theme.Radius.md)
                        .stroke(Theme.foreground, lineWidth: Theme.Border.width)
                )
                .nbShadow(3)
                .offset(y: -20)
            }
            .frame(maxWidth: .infinity)
        }
        .buttonStyle(.plain)
    }

    private func tabSlot(_ tab: AppTab, systemImage: String, label: String) -> some View {
        let isActive = router.selectedTab == tab
        return Button {
            if router.selectedTab == tab {
                router.popToRoot()
            } else {
                router.selectedTab = tab
            }
        } label: {
            VStack(spacing: 2) {
                Image(systemName: systemImage)
                    .font(.system(size: 17, weight: isActive ? .bold : .semibold))
                // Smaller font + tighter tracking so 5 labels fit
                // alongside the centered FAB on a 6.1" phone without
                // truncation.
                Text(label)
                    .font(isActive ? AppFont.monoBold(9) : AppFont.mono(9))
                    .tracking(0.5)
                    .textCase(.uppercase)
                    .lineLimit(1)
                    .minimumScaleFactor(0.85)
            }
            .foregroundColor(isActive ? Theme.foreground : Theme.mutedForeground)
            .frame(maxWidth: .infinity)
            .padding(.top, isActive ? 6 : 8)
            .overlay(
                Rectangle()
                    .fill(isActive ? Theme.foreground : Color.clear)
                    .frame(height: 3)
                    .offset(y: -2),
                alignment: .top
            )
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Hamburger drawer sheet

/// Drawer revealed by the header hamburger. Mirrors the PWA sidebar
/// (which is collapsed into a tray on mobile). Scrollable list of all
/// secondary routes — same icons/labels as the PWA sidebar nav.
private struct MoreSheet: View {
    @EnvironmentObject private var router: AppRouter
    @EnvironmentObject private var session: SessionStore
    @EnvironmentObject private var locale: AppLocale
    @Environment(\.dismiss) private var dismiss

    /// Drawer is intentionally minimal now — just Settings.
    /// Everything that used to live here is reachable from the bottom
    /// nav (Deals tab covers product/store search, audit, advisor,
    /// trending promos; Savings tab covers planner/goals; Receipts
    /// surface from Expenses → expense detail). Sign-out lives below
    /// the list as a destructive button so it has the affordance
    /// users expect.
    private var items: [(MoreRoute, String, String)] {
        [
            (.settings, "gearshape.fill", locale.t("nav.settings")),
        ]
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
                    if let email = session.currentUser?.email {
                        Text(email)
                            .font(AppFont.caption)
                            .foregroundColor(Theme.mutedForeground)
                            .padding(.horizontal, Theme.Spacing.md)
                    }
                    VStack(spacing: Theme.Spacing.xs) {
                        ForEach(items, id: \.0) { route, icon, title in
                            Button {
                                router.pushFromMore(route)
                            } label: {
                                HStack(spacing: Theme.Spacing.sm) {
                                    Image(systemName: icon)
                                        .font(.system(size: 16, weight: .semibold))
                                        .foregroundColor(Theme.foreground)
                                        .frame(width: 36, height: 36)
                                        .background(Theme.muted)
                                        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.sm))
                                        .overlay(
                                            RoundedRectangle(cornerRadius: Theme.Radius.sm)
                                                .stroke(Theme.foreground, lineWidth: Theme.Border.widthThin)
                                        )
                                    Text(title)
                                        .font(AppFont.bodyMedium)
                                        .foregroundColor(Theme.foreground)
                                    Spacer()
                                    Image(systemName: "chevron.right")
                                        .font(.system(size: 13, weight: .semibold))
                                        .foregroundColor(Theme.mutedForeground)
                                }
                                .padding(Theme.Spacing.sm)
                                .nbCard(radius: Theme.Radius.sm, shadow: Theme.Shadow.sm)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .padding(.horizontal, Theme.Spacing.md)
                    Button {
                        Task { await session.logout() }
                    } label: {
                        Label(locale.t("settings.signOut"), systemImage: "rectangle.portrait.and.arrow.right")
                    }
                    .buttonStyle(NBDestructiveButtonStyle())
                    .padding(.horizontal, Theme.Spacing.md)
                    .padding(.top, Theme.Spacing.md)
                    Spacer(minLength: Theme.Spacing.xl)
                }
                .padding(.top, Theme.Spacing.md)
            }
            .background(Theme.background)
            .navigationTitle(locale.t("nav.more"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button(locale.t("common.close")) { dismiss() }
                }
            }
        }
    }
}

// MARK: - Scan FAB sheet

/// Options presented when the center FAB is tapped. Each option sets
/// `router.pendingScanMode` and dismisses — the parent (`MainTabView`) then
/// presents the matching picker / editor on the next runloop tick.
private struct ScanFabSheet: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var router: AppRouter
    @EnvironmentObject private var locale: AppLocale

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
                Text(locale.t("scanFab.title"))
                    .font(AppFont.pageTitle)
                    .foregroundColor(Theme.foreground)
                Text(locale.t("scanFab.subtitle"))
                    .font(AppFont.caption)
                    .foregroundColor(Theme.mutedForeground)

                VStack(spacing: Theme.Spacing.sm) {
                    option(icon: "camera.fill",
                           title: locale.t("receipts.takePhoto"),
                           subtitle: locale.t("scanFab.cameraSub"),
                           primary: true) {
                        router.pendingScanMode = .camera
                        dismiss()
                    }
                    option(icon: "photo.on.rectangle.angled",
                           title: locale.t("receipts.photoLibrary"),
                           subtitle: locale.t("scanFab.librarySub")) {
                        router.pendingScanMode = .library
                        dismiss()
                    }
                    option(icon: "square.and.pencil",
                           title: locale.t("receipts.virtual"),
                           subtitle: locale.t("scanFab.virtualSub")) {
                        router.pendingScanMode = .virtual
                        dismiss()
                    }
                    option(icon: "person.2.fill",
                           title: locale.t("quickSplit.title"),
                           subtitle: locale.t("scanFab.quickSplitSub")) {
                        router.pendingScanMode = .quickSplit
                        dismiss()
                    }
                }
                .padding(.top, Theme.Spacing.xs)

                Spacer()
            }
            .padding(Theme.Spacing.md)
            .background(Theme.background)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(locale.t("common.cancel")) { dismiss() }
                }
            }
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
    }

    private func option(icon: String, title: String, subtitle: String, primary: Bool = false, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: Theme.Spacing.sm) {
                Image(systemName: icon)
                    .font(.system(size: 20, weight: .bold))
                    .foregroundColor(primary ? Theme.background : Theme.foreground)
                    .frame(width: 44, height: 44)
                    .background(primary ? Theme.foreground : Theme.muted)
                    .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.sm))
                    .overlay(
                        RoundedRectangle(cornerRadius: Theme.Radius.sm)
                            .stroke(Theme.foreground, lineWidth: Theme.Border.widthThin)
                    )
                VStack(alignment: .leading, spacing: 2) {
                    Text(title)
                        .font(AppFont.bodyMedium)
                        .foregroundColor(Theme.foreground)
                    Text(subtitle)
                        .font(AppFont.caption)
                        .foregroundColor(Theme.mutedForeground)
                        .multilineTextAlignment(.leading)
                }
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundColor(Theme.mutedForeground)
            }
            .padding(Theme.Spacing.sm)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Theme.card)
            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.md))
            .overlay(
                RoundedRectangle(cornerRadius: Theme.Radius.md)
                    .stroke(Theme.foreground, lineWidth: Theme.Border.widthThin)
            )
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Scan flow view-model

/// Shared OCR runner — sits on `MainTabView` so any scan (FAB, ReceiptsList,
/// post-OCR quick split) goes through the same upload + draft pipeline.
@MainActor
final class ScanFlowViewModel: ObservableObject {
    @Published var isScanning = false
    @Published var ocrDraft: OcrDraft?

    /// Vercel serverless functions cap request bodies at ~4.5 MB. Anything
    /// larger gets a `413 Payload Too Large` *before* our route handler
    /// runs, so we keep the first-pass upload comfortably under that.
    private static let maxPixelDimension: CGFloat = 1600
    private static let maxUploadBytes = 4 * 1024 * 1024 // 4 MB — Vercel limit ~4.5 MB
    /// Used when the first upload was already too large for Vercel — we
    /// downscale aggressively and try one more time before giving up.
    private static let retryPixelDimension: CGFloat = 1024
    private static let retryUploadBytes = 2 * 1024 * 1024 // 2 MB

    func run(image: UIImage, locale: AppLocale, toast: ToastCenter) async {
        let resized = Self.resizeForUpload(image)

        guard let jpeg = Self.compressForUpload(resized) else {
            toast.error(locale.t("receipts.imageConversionFailed"))
            return
        }
        Self.logScanAttempt(stage: "primary", original: image.size, resized: resized.size, bytes: jpeg.count)
        isScanning = true
        defer { isScanning = false }
        do {
            let response = try await ReceiptsRepo.scan(imageData: jpeg)
            guard let first = response.firstSuccess,
                  let receiptId = first.receiptId else {
                let msg = response.results.first?.error ?? locale.t("receipts.noReceiptDetected")
                toast.error(locale.t("receipts.scanFailed"), description: msg)
                return
            }
            ocrDraft = OcrDraft(receiptId: receiptId, data: first.data)
        } catch ApiError.cancelled {
            // User dismissed the scan flow (camera sheet closed, view torn
            // down) before the upload finished — don't surface a "Scan
            // failed" toast for what's effectively a user cancellation.
        } catch ApiError.payloadTooLarge {
            // Vercel rejected the body. One last attempt with aggressive
            // resize/compress before we tell the user.
            await retryWithAggressiveCompression(image: image, locale: locale, toast: toast)
        } catch let apiError as ApiError {
            toast.error(locale.t("receipts.scanFailed"), description: Self.friendlyMessage(for: apiError, locale: locale))
        } catch {
            #if DEBUG
            print("[ScanFlow] Unexpected error: \(error)")
            #endif
            toast.error(locale.t("receipts.scanFailed"), description: locale.t("errors.unknown"))
        }
    }

    private func retryWithAggressiveCompression(image: UIImage, locale: AppLocale, toast: ToastCenter) async {
        let resized = Self.resize(image, maxDimension: Self.retryPixelDimension)
        guard let jpeg = Self.compressProgressive(resized, maxBytes: Self.retryUploadBytes) else {
            toast.error(locale.t("receipts.scanFailed"), description: locale.t("errors.payloadTooLarge"))
            return
        }
        Self.logScanAttempt(stage: "retry", original: image.size, resized: resized.size, bytes: jpeg.count)
        do {
            let response = try await ReceiptsRepo.scan(imageData: jpeg)
            guard let first = response.firstSuccess,
                  let receiptId = first.receiptId else {
                let msg = response.results.first?.error ?? locale.t("receipts.noReceiptDetected")
                toast.error(locale.t("receipts.scanFailed"), description: msg)
                return
            }
            ocrDraft = OcrDraft(receiptId: receiptId, data: first.data)
        } catch ApiError.cancelled {
            // ignore
        } catch ApiError.payloadTooLarge {
            toast.error(locale.t("receipts.scanFailed"), description: locale.t("errors.payloadTooLarge"))
        } catch let apiError as ApiError {
            toast.error(locale.t("receipts.scanFailed"), description: Self.friendlyMessage(for: apiError, locale: locale))
        } catch {
            #if DEBUG
            print("[ScanFlow] Retry unexpected error: \(error)")
            #endif
            toast.error(locale.t("receipts.scanFailed"), description: locale.t("errors.unknown"))
        }
    }

    /// Map every ApiError case to a user-friendly localized message — never
    /// surface raw `error.localizedDescription` (which leaks NSURLError /
    /// HTTP-status text) to the user.
    static func friendlyMessage(for error: ApiError, locale: AppLocale) -> String {
        switch error {
        case .invalidURL: return locale.t("errors.unknown")
        case .transport: return locale.t("errors.network")
        case .decoding: return locale.t("errors.serverUnexpected")
        case .unauthorized: return locale.t("errors.sessionExpired")
        case .forbidden: return locale.t("errors.forbidden")
        case .notFound: return locale.t("errors.notFound")
        case .rateLimited: return locale.t("errors.rateLimited")
        case .timeout: return locale.t("errors.timeout")
        case .noConnection: return locale.t("errors.network")
        case .server(let status, _) where status >= 500: return locale.t("errors.serverDown")
        case .server: return locale.t("errors.serverUnexpected")
        case .payloadTooLarge: return locale.t("errors.payloadTooLarge")
        case .cancelled: return locale.t("errors.cancelled")
        case .unknown: return locale.t("errors.unknown")
        }
    }

    static func resizeForUpload(_ image: UIImage) -> UIImage {
        resize(image, maxDimension: maxPixelDimension)
    }

    static func compressForUpload(_ image: UIImage) -> Data? {
        compressProgressive(image, maxBytes: maxUploadBytes)
    }

    fileprivate static func resize(_ image: UIImage, maxDimension: CGFloat) -> UIImage {
        let size = image.size
        guard max(size.width, size.height) > maxDimension else { return image }
        let scale = maxDimension / max(size.width, size.height)
        let newSize = CGSize(width: size.width * scale, height: size.height * scale)
        let renderer = UIGraphicsImageRenderer(size: newSize)
        return renderer.image { _ in
            image.draw(in: CGRect(origin: .zero, size: newSize))
        }
    }

    fileprivate static func compressProgressive(_ image: UIImage, maxBytes: Int) -> Data? {
        for quality: CGFloat in [0.75, 0.55, 0.35, 0.20] {
            if let data = image.jpegData(compressionQuality: quality),
               data.count <= maxBytes {
                return data
            }
        }
        return image.jpegData(compressionQuality: 0.15)
    }

    private static func logScanAttempt(stage: String, original: CGSize, resized: CGSize, bytes: Int) {
        #if DEBUG
        let kb = Double(bytes) / 1024.0
        print(String(format: "[ScanFlow] %@: original %.0f×%.0f → resized %.0f×%.0f → %.1f KB",
                     stage, original.width, original.height, resized.width, resized.height, kb))
        #endif
    }
}
