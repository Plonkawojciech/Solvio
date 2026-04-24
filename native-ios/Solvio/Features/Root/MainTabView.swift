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
    @StateObject private var scanFlow = ScanFlowViewModel()

    @State private var showCamera = false
    @State private var showLibrary = false
    @State private var showVirtual = false
    @State private var showQuickSplit = false
    @State private var quickSplitPrefill: QuickSplitPrefill?
    @State private var pickedItem: PhotosPickerItem?

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
                NBTabBar()
            }
        }
        .background(Theme.background)
        .ignoresSafeArea(.keyboard)
        .sheet(isPresented: $router.showingMoreSheet, onDismiss: {
            if let route = router.pendingMoreRoute {
                router.pendingMoreRoute = nil
                router.selectedTab = .savings
                router.savingsStack.append(AppRoute.more(route))
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
                Task { await scanFlow.run(image: image, locale: locale, toast: toast) }
            }
            .ignoresSafeArea()
        }
        .photosPicker(isPresented: $showLibrary, selection: $pickedItem, matching: .images)
        .onChange(of: pickedItem) { newItem in
            guard let newItem else { return }
            Task {
                if let data = try? await newItem.loadTransferable(type: Data.self),
                   let ui = UIImage(data: data) {
                    await scanFlow.run(image: ui, locale: locale, toast: toast)
                }
                pickedItem = nil
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
        .sheet(item: $scanFlow.ocrDraft) { draft in
            OcrConfirmSheet(draft: draft) { saved in
                scanFlow.ocrDraft = nil
                toast.success(locale.t("receipts.saved"), description: saved.vendor ?? locale.t("receipts.savedScan"))
                router.push(.receiptDetail(id: saved.id))
            } onSplit: { saved in
                scanFlow.ocrDraft = nil
                quickSplitPrefill = QuickSplitPrefill(
                    total: saved.total?.double,
                    description: saved.vendor,
                    currency: saved.currency,
                    receiptId: saved.id
                )
            } onCancel: {
                scanFlow.ocrDraft = nil
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
        .overlay {
            if scanFlow.isScanning {
                VStack(spacing: Theme.Spacing.sm) {
                    ProgressView().tint(Theme.foreground)
                    Text(locale.t("receipts.scanning"))
                        .font(AppFont.bodyMedium)
                        .foregroundColor(Theme.foreground)
                }
                .padding(Theme.Spacing.md)
                .nbCard(radius: Theme.Radius.md, shadow: Theme.Shadow.lg)
            }
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

/// Bottom tab bar — exact PWA layout: 5 slots (Dashboard, Expenses, FAB,
/// Groups, Savings). The FAB is a centered, elevated black tile that
/// opens the scan sheet (or quick-split when on Groups).
struct NBTabBar: View {
    @EnvironmentObject private var router: AppRouter
    @EnvironmentObject private var locale: AppLocale

    var body: some View {
        HStack(spacing: 0) {
            tabSlot(.dashboard, systemImage: "house.fill", label: locale.t("nav.dashboard"))
            tabSlot(.expenses, systemImage: "dollarsign.circle.fill", label: locale.t("nav.expenses"))
            fabSlot
            tabSlot(.groups, systemImage: "person.3.fill", label: locale.t("nav.groups"))
            tabSlot(.savings, systemImage: "chart.line.uptrend.xyaxis", label: locale.t("nav.savings"))
        }
        .padding(.horizontal, Theme.Spacing.xs)
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
                    .font(.system(size: 18, weight: isActive ? .bold : .semibold))
                Text(label)
                    .font(isActive ? AppFont.monoBold(10) : AppFont.mono(10))
                    .tracking(1)
                    .textCase(.uppercase)
                    .lineLimit(1)
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

    private var items: [(MoreRoute, String, String)] {
        [
            (.receipts, "doc.text.magnifyingglass", locale.t("nav.receipts")),
            (.goals, "target", locale.t("nav.goals")),
            (.challenges, "trophy.fill", locale.t("nav.challenges")),
            (.loyalty, "creditcard.fill", locale.t("nav.loyalty")),
            (.prices, "tag.fill", locale.t("nav.prices")),
            (.audit, "magnifyingglass.circle.fill", locale.t("nav.audit")),
            (.analysis, "brain.head.profile", locale.t("nav.analysis")),
            (.reports, "doc.richtext", locale.t("nav.reports")),
            (.categories, "folder.fill", locale.t("nav.categories")),
            (.shoppingAdvisor, "cart.badge.questionmark", locale.t("nav.shoppingAdvisor")),
            (.nearbyStores, "mappin.and.ellipse", locale.t("nav.nearbyStores")),
            (.productSearch, "magnifyingglass", locale.t("nav.productSearch")),
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

    private static let maxPixelDimension: CGFloat = 2048
    private static let maxUploadBytes = 8 * 1024 * 1024 // 8MB safety margin (backend limit 10MB)

    func run(image: UIImage, locale: AppLocale, toast: ToastCenter) async {
        let resized = Self.resizeForUpload(image)

        guard let jpeg = Self.compressForUpload(resized) else {
            toast.error(locale.t("receipts.imageConversionFailed"))
            return
        }
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
        } catch {
            toast.error(locale.t("receipts.scanFailed"), description: error.localizedDescription)
        }
    }

    static func resizeForUpload(_ image: UIImage) -> UIImage {
        resize(image, maxDimension: maxPixelDimension)
    }

    static func compressForUpload(_ image: UIImage) -> Data? {
        compressProgressive(image, maxBytes: maxUploadBytes)
    }

    private static func resize(_ image: UIImage, maxDimension: CGFloat) -> UIImage {
        let size = image.size
        guard max(size.width, size.height) > maxDimension else { return image }
        let scale = maxDimension / max(size.width, size.height)
        let newSize = CGSize(width: size.width * scale, height: size.height * scale)
        let renderer = UIGraphicsImageRenderer(size: newSize)
        return renderer.image { _ in
            image.draw(in: CGRect(origin: .zero, size: newSize))
        }
    }

    private static func compressProgressive(_ image: UIImage, maxBytes: Int) -> Data? {
        for quality: CGFloat in [0.75, 0.55, 0.35, 0.20] {
            if let data = image.jpegData(compressionQuality: quality),
               data.count <= maxBytes {
                return data
            }
        }
        return image.jpegData(compressionQuality: 0.15)
    }
}
