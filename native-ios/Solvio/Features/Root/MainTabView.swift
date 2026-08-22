import SwiftUI
import PhotosUI

/// Powłoka zalogowanej apki — nagłówek, treść zakładki i dolny pasek
/// z FAB-em skanowania pośrodku. Dwa ekrany, nic więcej:
///
///     ┌─ Nagłówek: logo · ustawienia ─┐
///     │           Treść                │
///     └─ Panel · (FAB) · Wydatki ─────┘
struct MainTabView: View {
    @EnvironmentObject private var router: AppRouter
    @EnvironmentObject private var locale: AppLocale
    @EnvironmentObject private var toast: ToastCenter
    @EnvironmentObject private var scanQueue: ScanQueueManager

    @State private var showCamera = false
    @State private var pickedItems: [PhotosPickerItem] = []

    var body: some View {
        ZStack {
            PaperBackground()

            VStack(spacing: 0) {
                header
                ZStack(alignment: .bottom) {
                    content
                    VStack(spacing: 0) {
                        ScanQueueWidget().padding(.bottom, 6)
                        TabBar()
                    }
                }
            }
        }
        .sheet(isPresented: $router.showingScanSheet, onDismiss: handleScanChoice) {
            ScanSourceSheet()
                .presentationDetents([.height(280)])
        }
        .sheet(isPresented: $router.showingSettings) {
            SettingsView()
        }
        .sheet(isPresented: $router.showingExpenseEditor) {
            ExpenseEditorSheet(expense: nil)
        }
        .fullScreenCover(isPresented: $showCamera) {
            CameraPicker { image in
                showCamera = false
                scanQueue.enqueue([image])
            }
            .ignoresSafeArea()
        }
        .photosPicker(isPresented: photoPickerBinding, selection: $pickedItems, maxSelectionCount: 10, matching: .images)
        .onChange(of: pickedItems) { items in
            guard !items.isEmpty else { return }
            let selected = items
            pickedItems = []
            Task { await loadAndEnqueue(selected) }
        }
    }

    // MARK: - Nagłówek

    private var header: some View {
        HStack(spacing: Theme.Spacing.sm) {
            RoundedRectangle(cornerRadius: 9, style: .continuous)
                .fill(Theme.primary)
                .frame(width: 32, height: 32)
                .overlay(
                    Image(systemName: "wallet.pass")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundColor(.white)
                )
            VStack(alignment: .leading, spacing: 1) {
                Text("Solvio")
                    .font(AppFont.semibold(15))
                    .foregroundColor(Theme.foreground)
                SectionLabel(text: locale.t("nav.finances"))
            }
            Spacer()
            Button {
                Haptics.impact(.light)
                router.showingSettings = true
            } label: {
                Image(systemName: "gearshape")
                    .font(.system(size: 16, weight: .medium))
                    .foregroundColor(Theme.mutedForeground)
                    .frame(width: 36, height: 36)
            }
        }
        .padding(.horizontal, Theme.Spacing.md)
        .padding(.vertical, Theme.Spacing.sm)
        .background(Theme.background.opacity(0.92))
        .overlay(alignment: .bottom) {
            Rectangle().fill(Theme.border).frame(height: 1)
        }
    }

    // MARK: - Treść

    @ViewBuilder
    private var content: some View {
        switch router.selectedTab {
        case .dashboard:
            NavigationStack(path: $router.dashboardStack) {
                DashboardView().navigationDestination(for: AppRoute.self, destination: destination)
            }
        case .expenses:
            NavigationStack(path: $router.expensesStack) {
                ExpensesListView().navigationDestination(for: AppRoute.self, destination: destination)
            }
        }
    }

    @ViewBuilder
    private func destination(_ route: AppRoute) -> some View {
        switch route {
        case .expenseDetail(let id): ExpenseDetailView(expenseId: id)
        }
    }

    // MARK: - Skanowanie

    /// Arkusz z wyborem źródła zamyka się PRZED podniesieniem pickera —
    /// arkusz w arkuszu potrafi się w SwiftUI zaciąć na amen.
    private func handleScanChoice() {
        guard let mode = router.pendingScanMode else { return }
        router.pendingScanMode = nil
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) {
            switch mode {
            case .camera: showCamera = true
            case .library: showLibrary = true
            }
        }
    }

    @State private var showLibrary = false

    private var photoPickerBinding: Binding<Bool> {
        Binding(get: { showLibrary }, set: { showLibrary = $0 })
    }

    private func loadAndEnqueue(_ items: [PhotosPickerItem]) async {
        var images: [UIImage] = []
        for item in items {
            if let data = try? await item.loadTransferable(type: Data.self), let image = UIImage(data: data) {
                images.append(image)
            }
        }
        if images.isEmpty {
            toast.error(locale.t("scan.loadFailed"))
            return
        }
        scanQueue.enqueue(images)
    }
}

// MARK: - Pasek zakładek

private struct TabBar: View {
    @EnvironmentObject private var router: AppRouter
    @EnvironmentObject private var locale: AppLocale

    var body: some View {
        HStack(spacing: 0) {
            tab(.dashboard, icon: "square.grid.2x2", activeIcon: "square.grid.2x2.fill", label: locale.t("nav.dashboard"))

            Button {
                Haptics.impact(.medium)
                router.showingScanSheet = true
            } label: {
                Circle()
                    .fill(Theme.primary)
                    .frame(width: 52, height: 52)
                    .overlay(
                        Image(systemName: "camera.fill")
                            .font(.system(size: 19, weight: .semibold))
                            .foregroundColor(.white)
                    )
                    .softShadow(2)
            }
            .frame(maxWidth: .infinity)
            .offset(y: -14)
            .accessibilityLabel(locale.t("receipts.scan"))

            // `list.bullet` nie ma wariantu `.fill` — stan aktywny niesie
            // kolor, nie wypełnienie. Bez tego ikona po prostu znikała.
            tab(.expenses, icon: "list.bullet", activeIcon: "list.bullet", label: locale.t("nav.expenses"))
        }
        .padding(.horizontal, Theme.Spacing.md)
        .frame(height: 58)
        .background(Theme.card)
        .overlay(alignment: .top) { Rectangle().fill(Theme.border).frame(height: 1) }
    }

    private func tab(_ target: AppTab, icon: String, activeIcon: String, label: String) -> some View {
        let active = router.selectedTab == target
        return Button {
            Haptics.selection()
            if active { router.popToRoot() } else { router.selectedTab = target }
        } label: {
            VStack(spacing: 4) {
                Image(systemName: active ? activeIcon : icon)
                    .font(.system(size: 17, weight: .medium))
                Text(label.uppercased())
                    .font(AppFont.chip)
                    .tracking(1.2)
            }
            .foregroundColor(active ? Theme.primary : Theme.mutedForeground)
            .frame(maxWidth: .infinity)
        }
    }
}

// MARK: - Wybór źródła paragonu

private struct ScanSourceSheet: View {
    @EnvironmentObject private var router: AppRouter
    @EnvironmentObject private var locale: AppLocale
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.md) {
            Text(locale.t("receipts.scan"))
                .font(AppFont.sectionTitle)
                .foregroundColor(Theme.foreground)

            option(icon: "camera.fill", title: locale.t("scanFab.camera"), subtitle: locale.t("scanFab.cameraSub")) {
                router.pendingScanMode = .camera
                dismiss()
            }
            option(icon: "photo.on.rectangle", title: locale.t("scanFab.library"), subtitle: locale.t("scanFab.librarySub")) {
                router.pendingScanMode = .library
                dismiss()
            }
            Spacer(minLength: 0)
        }
        .padding(Theme.Spacing.md)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(PaperBackground())
    }

    private func option(icon: String, title: String, subtitle: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: Theme.Spacing.md) {
                Image(systemName: icon)
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundColor(Theme.primary)
                    .frame(width: 40, height: 40)
                    .background(Theme.accent)
                    .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.sm, style: .continuous))
                VStack(alignment: .leading, spacing: 2) {
                    Text(title)
                        .font(AppFont.bodySemibold)
                        .foregroundColor(Theme.foreground)
                    Text(subtitle)
                        .font(AppFont.caption)
                        .foregroundColor(Theme.mutedForeground)
                }
                Spacer(minLength: 0)
                Image(systemName: "chevron.right")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(Theme.mutedForeground)
            }
            .padding(Theme.Spacing.sm + 2)
            .frame(maxWidth: .infinity, alignment: .leading)
            .paperCard(radius: Theme.Radius.md)
        }
    }
}
