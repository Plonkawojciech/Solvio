import SwiftUI

/// Settings — account, preferences (language / currency / theme),
/// categories, and per-category budgets. Writes through `SettingsRepo`
/// which wraps every mutation in a `{ type, data }` discriminated-union
/// payload matching `/api/data/settings` POST.
struct SettingsView: View {
    @EnvironmentObject private var session: SessionStore
    @EnvironmentObject private var toast: ToastCenter
    @EnvironmentObject private var appTheme: AppTheme
    @EnvironmentObject private var locale: AppLocale
    @StateObject private var vm = SettingsViewModel()

    @State private var showAddCategory = false
    @State private var editingCategory: Category?
    @State private var pendingDeleteCategoryId: String?
    @State private var showAddBudget = false
    @State private var editingBudget: CategoryBudget?
    @State private var showSignOutConfirm = false
    @State private var pendingDeleteRuleVendor: String?
    @State private var deletingRuleVendor: String?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Theme.Spacing.md) {
                NBScreenHeader(
                    eyebrow: locale.t("settings.title"),
                    title: locale.t("settings.title"),
                    subtitle: session.currentUser?.email
                )

                if vm.isLoading && vm.bundle == nil {
                    NBLoadingCard()
                } else if let message = vm.errorMessage, vm.bundle == nil {
                    // Only block the screen with an error when we have
                    // nothing cached. Otherwise keep the existing settings
                    // visible and let pull-to-refresh retry silently.
                    NBErrorCard(message: message) { Task { await vm.load() } }
                } else if vm.bundle != nil {
                    accountCard
                    appearanceCard
                    preferencesCard
                    categoriesCard
                    budgetsCard
                    merchantRulesCard
                    exportDataCard
                    signOutButton
                }
                Spacer(minLength: Theme.Spacing.xl)
            }
            .padding(.horizontal, Theme.Spacing.md)
            .padding(.top, Theme.Spacing.md)
        }
        .background(Theme.background)
        .task { if vm.bundle == nil { await vm.load(locale: locale) } }
        .refreshable { await vm.load(locale: locale) }
        .sheet(isPresented: $showAddCategory) {
            CategoryEditorSheet(mode: .create) { name, icon, color in
                Task {
                    do {
                        try await SettingsRepo.addCategory(
                            .init(name: name, icon: icon, color: color, isDefault: false)
                        )
                        toast.success(locale.t("toast.created"))
                        await vm.load(locale: locale)
                    } catch {
                        toast.error(locale.t("toast.error"), description: error.localizedDescription)
                    }
                }
            }
        }
        .sheet(item: $editingCategory) { cat in
            CategoryEditorSheet(mode: .edit(cat)) { name, icon, _ in
                Task {
                    do {
                        try await CategoriesRepo.update(
                            .init(id: cat.id, name: name, icon: icon)
                        )
                        toast.success(locale.t("toast.updated"))
                        await vm.load(locale: locale)
                    } catch {
                        toast.error(locale.t("toast.error"), description: error.localizedDescription)
                    }
                }
            }
        }
        .sheet(isPresented: $showAddBudget) {
            BudgetEditorSheet(
                categories: vm.categories,
                existingCategoryIds: Set(vm.budgets.map(\.categoryId)),
                mode: .create
            ) { categoryId, amount in
                Task {
                    do {
                        try await SettingsRepo.upsertBudget(
                            .init(categoryId: categoryId, amount: amount, period: "monthly")
                        )
                        toast.success(locale.t("toast.saved"))
                        await vm.load(locale: locale)
                    } catch {
                        toast.error(locale.t("toast.error"), description: error.localizedDescription)
                    }
                }
            }
        }
        .sheet(item: $editingBudget) { b in
            BudgetEditorSheet(
                categories: vm.categories,
                existingCategoryIds: [],
                mode: .edit(b)
            ) { categoryId, amount in
                Task {
                    do {
                        try await SettingsRepo.upsertBudget(
                            .init(categoryId: categoryId, amount: amount, period: "monthly")
                        )
                        toast.success(locale.t("toast.updated"))
                        await vm.load(locale: locale)
                    } catch {
                        toast.error(locale.t("toast.error"), description: error.localizedDescription)
                    }
                }
            }
        }
        .alert(
            locale.t("settings.deleteCategoryConfirm"),
            isPresented: Binding(
                get: { pendingDeleteCategoryId != nil },
                set: { if !$0 { pendingDeleteCategoryId = nil } }
            )
        ) {
            Button(locale.t("common.cancel"), role: .cancel) {}
            Button(locale.t("common.delete"), role: .destructive) {
                if let id = pendingDeleteCategoryId {
                    Task {
                        do {
                            try await CategoriesRepo.delete(id: id)
                            toast.success(locale.t("toast.deleted"))
                            await vm.load(locale: locale)
                        } catch {
                            toast.error(locale.t("toast.error"), description: error.localizedDescription)
                        }
                    }
                }
            }
        } message: {
            Text(locale.t("settings.deleteCategoryMessage"))
        }
        .alert(locale.t("settings.signOutConfirm"), isPresented: $showSignOutConfirm) {
            Button(locale.t("common.cancel"), role: .cancel) {}
            Button(locale.t("settings.signOut"), role: .destructive) {
                Task { await session.logout() }
            }
        } message: {
            Text(locale.t("settings.signOutMessage"))
        }
        .alert(
            locale.t("settings.ruleDeleteTitle"),
            isPresented: Binding(
                get: { pendingDeleteRuleVendor != nil },
                set: { if !$0 { pendingDeleteRuleVendor = nil } }
            )
        ) {
            Button(locale.t("common.cancel"), role: .cancel) {}
            Button(locale.t("common.delete"), role: .destructive) {
                if let vendor = pendingDeleteRuleVendor { deleteRule(vendor: vendor) }
            }
        } message: {
            Text(
                locale.t("settings.ruleDeleteDesc")
                    .replacingOccurrences(of: "{vendor}", with: pendingDeleteRuleVendor ?? "")
            )
        }
    }

    private func deleteRule(vendor: String) {
        deletingRuleVendor = vendor
        Task {
            defer { deletingRuleVendor = nil }
            do {
                try await MerchantRulesRepo.delete(vendor: vendor)
                vm.merchantRules.removeAll { $0.vendor == vendor }
                toast.success(locale.t("settings.ruleDeleted"))
            } catch {
                toast.error(locale.t("settings.ruleDeleteFailed"), description: error.localizedDescription)
            }
        }
    }

    private func exportData() {
        vm.isExporting = true
        Task {
            defer { vm.isExporting = false }
            do {
                let (data, suggestedName) = try await ExportDataRepo.download()
                let df = DateFormatter()
                df.dateFormat = "yyyy-MM-dd"
                let fallback = "solvio-export-\(df.string(from: Date())).json"
                let filename = suggestedName ?? fallback
                let tmp = FileManager.default.temporaryDirectory.appendingPathComponent(filename)
                try data.write(to: tmp, options: .atomic)
                presentShareSheet(url: tmp)
                toast.success(locale.t("settings.exportSuccess"), description: filename)
            } catch {
                toast.error(locale.t("settings.exportFailed"), description: error.localizedDescription)
            }
        }
    }

    @MainActor
    private func presentShareSheet(url: URL) {
        guard
            let scene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
            let root = scene.windows.first(where: { $0.isKeyWindow })?.rootViewController
        else { return }
        let vc = UIActivityViewController(activityItems: [url], applicationActivities: nil)
        // iPad: source the popover from the top of the window so the sheet is reachable.
        vc.popoverPresentationController?.sourceView = root.view
        vc.popoverPresentationController?.sourceRect = CGRect(x: root.view.bounds.midX, y: 40, width: 0, height: 0)
        vc.popoverPresentationController?.permittedArrowDirections = []
        root.present(vc, animated: true)
    }

    // MARK: - Account

    private var accountCard: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
            NBSectionHeader(eyebrow: "// " + locale.t("settings.account").uppercased(),
                            title: locale.t("settings.signedInAs"))
            HStack(spacing: Theme.Spacing.sm) {
                NBIconBadge(systemImage: "person.fill")
                VStack(alignment: .leading, spacing: 2) {
                    Text(session.currentUser?.email ?? "—")
                        .font(AppFont.bodyMedium)
                        .foregroundColor(Theme.foreground)
                        .textSelection(.enabled)
                    Text(locale.t("settings.cookieSessionDesc"))
                        .font(AppFont.caption)
                        .foregroundColor(Theme.mutedForeground)
                }
                Spacer()
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(Theme.Spacing.md)
        .nbCard(radius: Theme.Radius.md, shadow: Theme.Shadow.sm)
    }

    // MARK: - Appearance (theme picker)

    private var appearanceCard: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
            NBSectionHeader(eyebrow: "// " + locale.t("settings.appearance").uppercased(),
                            title: locale.t("settings.theme"))

            NBSegmented(selection: Binding(
                get: { appTheme.mode.rawValue },
                set: { appTheme.mode = AppTheme.Mode(rawValue: $0) ?? .system }
            ), options: [
                (value: "system", label: locale.t("settings.themeSystem")),
                (value: "light",  label: locale.t("settings.themeLight")),
                (value: "dark",   label: locale.t("settings.themeDark"))
            ])
        }
        .padding(Theme.Spacing.md)
        .nbCard(radius: Theme.Radius.md, shadow: Theme.Shadow.sm)
    }

    // MARK: - Preferences (language + currency)

    private var preferencesCard: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
            NBSectionHeader(eyebrow: "// " + locale.t("settings.preferences").uppercased(),
                            title: "\(locale.t("settings.language")) & \(locale.t("settings.currency"))")

            VStack(alignment: .leading, spacing: Theme.Spacing.xxs) {
                Text(locale.t("settings.language")).font(AppFont.bodyMedium)
                NBSegmented(selection: Binding(
                    get: { locale.language.rawValue },
                    set: { newVal in
                        if let lang = AppLocale.Language(rawValue: newVal) {
                            locale.language = lang
                            vm.language = newVal
                            saveSettings(language: newVal, currency: vm.currency)
                        }
                    }
                ), options: [
                    (value: "pl", label: "PL"),
                    (value: "en", label: "EN")
                ])
            }

            VStack(alignment: .leading, spacing: Theme.Spacing.xxs) {
                Text(locale.t("settings.currency")).font(AppFont.bodyMedium)
                // PWA supports: PLN, USD, EUR, GBP, CHF, CZK
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 6) {
                        ForEach(["PLN", "USD", "EUR", "GBP", "CHF", "CZK"], id: \.self) { code in
                            Button {
                                vm.currency = code
                                saveSettings(language: vm.language, currency: code)
                            } label: {
                                Text(code)
                                    .font(AppFont.monoBold(11))
                                    .tracking(1)
                                    .padding(.horizontal, 14)
                                    .padding(.vertical, 8)
                                    .foregroundColor(vm.currency == code ? Theme.background : Theme.foreground)
                                    .background(vm.currency == code ? Theme.foreground : Theme.card)
                                    .overlay(
                                        RoundedRectangle(cornerRadius: Theme.Radius.sm)
                                            .stroke(Theme.foreground, lineWidth: Theme.Border.widthThin)
                                    )
                                    .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.sm))
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
            }

            if vm.isSavingSettings {
                HStack(spacing: 6) {
                    ProgressView().tint(Theme.foreground)
                    Text(locale.t("common.saving"))
                        .font(AppFont.caption)
                        .foregroundColor(Theme.mutedForeground)
                }
            }
        }
        .padding(Theme.Spacing.md)
        .nbCard(radius: Theme.Radius.md, shadow: Theme.Shadow.sm)
    }

    private func saveSettings(language: String, currency: String) {
        vm.isSavingSettings = true
        Task {
            defer { vm.isSavingSettings = false }
            do {
                try await SettingsRepo.updateSettings(
                    .init(
                        currency: currency,
                        language: language,
                        productType: nil,
                        monthlyBudget: nil,
                        notificationsEnabled: nil,
                        timezone: nil
                    )
                )
                toast.success(locale.t("settings.preferencesSaved"))
                await session.refresh()
            } catch {
                toast.error(locale.t("toast.error"), description: error.localizedDescription)
            }
        }
    }

    // MARK: - Categories

    private var categoriesCard: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
            NBSectionHeader(
                eyebrow: "// " + locale.t("settings.categories").uppercased(),
                title: locale.t("settings.yourCategories"),
                trailing: AnyView(
                    Button { showAddCategory = true } label: {
                        Label(locale.t("common.add"), systemImage: "plus")
                            .font(AppFont.mono(11))
                            .tracking(1)
                            .textCase(.uppercase)
                            .foregroundColor(Theme.foreground)
                    }
                )
            )
            if vm.categories.isEmpty {
                Text(locale.t("settings.noCategories"))
                    .font(AppFont.caption)
                    .foregroundColor(Theme.mutedForeground)
            } else {
                VStack(spacing: Theme.Spacing.xs) {
                    ForEach(vm.categories) { cat in
                        HStack(spacing: Theme.Spacing.sm) {
                            NBIconBadge(systemImage: cat.icon ?? "folder.fill")
                            VStack(alignment: .leading, spacing: 2) {
                                Text(cat.name)
                                    .font(AppFont.bodyMedium)
                                    .foregroundColor(Theme.foreground)
                                if cat.isDefault == true {
                                    Text(locale.t("categories.default"))
                                        .font(AppFont.caption)
                                        .foregroundColor(Theme.mutedForeground)
                                }
                            }
                            Spacer()
                            Button { editingCategory = cat } label: {
                                Image(systemName: "pencil")
                                    .foregroundColor(Theme.foreground)
                            }
                            Button { pendingDeleteCategoryId = cat.id } label: {
                                Image(systemName: "trash")
                                    .foregroundColor(Theme.destructive)
                            }
                        }
                        .padding(Theme.Spacing.sm)
                        .nbCard(radius: Theme.Radius.sm, shadow: Theme.Shadow.sm)
                    }
                }
            }
        }
        .padding(Theme.Spacing.md)
        .nbCard(radius: Theme.Radius.md, shadow: Theme.Shadow.sm)
    }

    // MARK: - Budgets

    private var budgetsCard: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
            NBSectionHeader(
                eyebrow: "// " + locale.t("settings.budgets").uppercased(),
                title: locale.t("settings.monthlyLimits"),
                trailing: AnyView(
                    Button { showAddBudget = true } label: {
                        Label(locale.t("common.add"), systemImage: "plus")
                            .font(AppFont.mono(11))
                            .tracking(1)
                            .textCase(.uppercase)
                            .foregroundColor(Theme.foreground)
                    }
                    .disabled(vm.categoriesWithoutBudget.isEmpty)
                )
            )
            if vm.budgets.isEmpty {
                Text(locale.t("settings.noBudgets"))
                    .font(AppFont.caption)
                    .foregroundColor(Theme.mutedForeground)
            } else {
                VStack(spacing: Theme.Spacing.xs) {
                    ForEach(vm.budgets) { b in
                        Button { editingBudget = b } label: {
                            HStack(spacing: Theme.Spacing.sm) {
                                NBIconBadge(
                                    systemImage: vm.categoryFor(id: b.categoryId)?.icon ?? "folder.fill"
                                )
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(vm.categoryFor(id: b.categoryId)?.name ?? "—")
                                        .font(AppFont.bodyMedium)
                                        .foregroundColor(Theme.foreground)
                                    Text(locale.t("reports.monthly"))
                                        .font(AppFont.caption)
                                        .foregroundColor(Theme.mutedForeground)
                                }
                                Spacer()
                                Text(Fmt.amount(b.amount, currency: vm.currency))
                                    .font(AppFont.mono(14))
                                    .foregroundColor(Theme.foreground)
                            }
                            .padding(Theme.Spacing.sm)
                            .nbCard(radius: Theme.Radius.sm, shadow: Theme.Shadow.sm)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
        .padding(Theme.Spacing.md)
        .nbCard(radius: Theme.Radius.md, shadow: Theme.Shadow.sm)
    }

    // MARK: - Merchant rules

    private var merchantRulesCard: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
            NBSectionHeader(
                eyebrow: "// " + locale.t("settings.merchantRules").uppercased(),
                title: locale.t("settings.merchantRules")
            )
            Text(locale.t("settings.merchantRulesDesc"))
                .font(AppFont.caption)
                .foregroundColor(Theme.mutedForeground)
            if vm.merchantRules.isEmpty {
                Text(locale.t("settings.noRules"))
                    .font(AppFont.caption)
                    .foregroundColor(Theme.mutedForeground)
            } else {
                VStack(spacing: Theme.Spacing.xs) {
                    ForEach(vm.merchantRules.prefix(10)) { rule in
                        HStack(spacing: Theme.Spacing.sm) {
                            NBIconBadge(systemImage: "building.2")
                            VStack(alignment: .leading, spacing: 2) {
                                Text(rule.vendor.capitalized)
                                    .font(AppFont.bodyMedium)
                                    .foregroundColor(Theme.foreground)
                                HStack(spacing: 4) {
                                    if let cat = vm.categoryFor(id: rule.categoryId) {
                                        if let icon = cat.icon {
                                            Image(systemName: icon).font(.caption2).foregroundColor(Theme.mutedForeground)
                                        }
                                        Text(cat.name)
                                            .font(AppFont.caption)
                                            .foregroundColor(Theme.mutedForeground)
                                    } else {
                                        Text(rule.categoryId)
                                            .font(AppFont.caption)
                                            .foregroundColor(Theme.mutedForeground)
                                    }
                                    if let count = rule.count, count > 0 {
                                        Text("· \(count)\(locale.t("settings.timesBought"))")
                                            .font(AppFont.caption)
                                            .foregroundColor(Theme.mutedForeground.opacity(0.7))
                                    }
                                }
                            }
                            Spacer()
                            Button {
                                pendingDeleteRuleVendor = rule.vendor
                            } label: {
                                if deletingRuleVendor == rule.vendor {
                                    ProgressView().tint(Theme.foreground)
                                } else {
                                    Image(systemName: "trash")
                                        .foregroundColor(Theme.destructive)
                                }
                            }
                            .disabled(deletingRuleVendor == rule.vendor)
                            .accessibilityLabel("\(locale.t("settings.clearRule")): \(rule.vendor)")
                        }
                        .padding(Theme.Spacing.sm)
                        .nbCard(radius: Theme.Radius.sm, shadow: Theme.Shadow.sm)
                    }
                }
            }
        }
        .padding(Theme.Spacing.md)
        .nbCard(radius: Theme.Radius.md, shadow: Theme.Shadow.sm)
    }

    // MARK: - GDPR export

    private var exportDataCard: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
            NBSectionHeader(
                eyebrow: "// " + locale.t("settings.exportData").uppercased(),
                title: locale.t("settings.exportData")
            )
            Text(locale.t("settings.exportDataDesc"))
                .font(AppFont.caption)
                .foregroundColor(Theme.mutedForeground)
            Button {
                exportData()
            } label: {
                HStack(spacing: 8) {
                    if vm.isExporting {
                        ProgressView().tint(Theme.background)
                        Text(locale.t("settings.exporting"))
                    } else {
                        Image(systemName: "arrow.down.doc")
                        Text(locale.t("settings.downloadJson"))
                    }
                }
                .frame(maxWidth: .infinity)
            }
            .buttonStyle(NBPrimaryButtonStyle())
            .disabled(vm.isExporting)
        }
        .padding(Theme.Spacing.md)
        .nbCard(radius: Theme.Radius.md, shadow: Theme.Shadow.sm)
    }

    // MARK: - Sign out

    private var signOutButton: some View {
        Button { showSignOutConfirm = true } label: {
            Label(locale.t("settings.signOut"), systemImage: "rectangle.portrait.and.arrow.right")
        }
        .buttonStyle(NBDestructiveButtonStyle())
    }
}

// MARK: - View model

@MainActor
final class SettingsViewModel: ObservableObject {
    @Published var bundle: SettingsRepo.Bundle?
    @Published var categories: [Category] = []
    @Published var budgets: [CategoryBudget] = []
    @Published var merchantRules: [MerchantRule] = []
    @Published var currency = "PLN"
    @Published var language = "pl"
    @Published var isLoading = false
    @Published var isSavingSettings = false
    @Published var isExporting = false
    @Published var errorMessage: String?

    var categoriesWithoutBudget: [Category] {
        let budgetedIds = Set(budgets.map(\.categoryId))
        return categories.filter { !budgetedIds.contains($0.id) }
    }

    func categoryFor(id: String) -> Category? {
        categories.first(where: { $0.id == id })
    }

    func load(locale: AppLocale? = nil) async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        async let rulesFetch: [MerchantRule] = (try? MerchantRulesRepo.list()) ?? []
        do {
            let b = try await SettingsRepo.fetch()
            bundle = b
            categories = b.categories
            budgets = b.budgets
            if let s = b.settings {
                if let c = s.currency { currency = c }
                if let l = s.language {
                    language = l
                    // Sync backend language into local AppLocale so the UI flips
                    // without a reload when the server is the source of truth.
                    if let locale = locale,
                       let lang = AppLocale.Language(rawValue: l),
                       locale.language != lang {
                        locale.language = lang
                    }
                }
            }
            merchantRules = await rulesFetch
        } catch {
            errorMessage = error.localizedDescription
            merchantRules = await rulesFetch
        }
    }
}

// MARK: - Category editor sheet

private struct CategoryEditorSheet: View {
    enum Mode {
        case create
        case edit(Category)
    }

    let mode: Mode
    let onSubmit: (_ name: String, _ icon: String?, _ color: String?) -> Void
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var locale: AppLocale

    @State private var name: String = ""
    @State private var icon: String = ""
    @State private var color: String = ""

    private let iconOptions = [
        "fork.knife", "cart", "car.fill", "house.fill", "bag",
        "heart.fill", "gamecontroller.fill", "bolt.fill", "airplane",
        "book.fill", "wrench.and.screwdriver.fill", "folder.fill"
    ]

    init(mode: Mode, onSubmit: @escaping (_ name: String, _ icon: String?, _ color: String?) -> Void) {
        self.mode = mode
        self.onSubmit = onSubmit
        switch mode {
        case .create:
            _name = State(initialValue: "")
            _icon = State(initialValue: "")
            _color = State(initialValue: "")
        case .edit(let cat):
            _name = State(initialValue: cat.name)
            _icon = State(initialValue: cat.icon ?? "")
            _color = State(initialValue: cat.color ?? "")
        }
    }

    private var title: String {
        switch mode {
        case .create: return locale.t("settings.newCategory")
        case .edit:   return locale.t("settings.editCategory")
        }
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: Theme.Spacing.md) {
                    NBTextField(label: locale.t("settings.name"), text: $name, placeholder: "—")

                    VStack(alignment: .leading, spacing: Theme.Spacing.xxs) {
                        Text(locale.t("settings.icon"))
                            .font(AppFont.bodyMedium)
                            .foregroundColor(Theme.foreground)
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: Theme.Spacing.xs) {
                                iconChoice(name: "")
                                ForEach(iconOptions, id: \.self) { iconChoice(name: $0) }
                            }
                        }
                    }

                    NBTextField(
                        label: locale.t("settings.color"),
                        text: $color,
                        placeholder: "#f59e0b",
                        keyboardType: .asciiCapable,
                        autocapitalization: .never
                    )
                }
                .padding(Theme.Spacing.md)
            }
            .background(Theme.background)
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button(locale.t("common.cancel")) { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button(locale.t("common.save")) {
                        let trimmedName = name.trimmingCharacters(in: .whitespacesAndNewlines)
                        let trimmedColor = color.trimmingCharacters(in: .whitespacesAndNewlines)
                        onSubmit(
                            trimmedName,
                            icon.isEmpty ? nil : icon,
                            trimmedColor.isEmpty ? nil : trimmedColor
                        )
                        dismiss()
                    }
                    .disabled(name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
        }
    }

    private func iconChoice(name value: String) -> some View {
        Button { icon = value } label: {
            let selected = icon == value
            SwiftUI.Group {
                if value.isEmpty {
                    Image(systemName: "xmark")
                        .font(.system(size: 12, weight: .semibold))
                } else {
                    Image(systemName: value)
                        .font(.system(size: 18, weight: .semibold))
                }
            }
            .foregroundColor(selected ? Theme.background : Theme.foreground)
            .frame(width: 40, height: 40)
            .background(selected ? Theme.foreground : Theme.card)
            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.sm))
            .overlay(
                RoundedRectangle(cornerRadius: Theme.Radius.sm)
                    .stroke(Theme.foreground, lineWidth: Theme.Border.widthThin)
            )
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Budget editor sheet (monthly-only per PWA)

private struct BudgetEditorSheet: View {
    enum Mode {
        case create
        case edit(CategoryBudget)
    }

    let categories: [Category]
    let existingCategoryIds: Set<String>
    let mode: Mode
    let onSubmit: (_ categoryId: String, _ amount: Double) -> Void

    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var locale: AppLocale
    @State private var categoryId: String = ""
    @State private var amountText: String = ""

    init(
        categories: [Category],
        existingCategoryIds: Set<String>,
        mode: Mode,
        onSubmit: @escaping (_ categoryId: String, _ amount: Double) -> Void
    ) {
        self.categories = categories
        self.existingCategoryIds = existingCategoryIds
        self.mode = mode
        self.onSubmit = onSubmit
        switch mode {
        case .create:
            let available = categories.filter { !existingCategoryIds.contains($0.id) }
            _categoryId = State(initialValue: available.first?.id ?? categories.first?.id ?? "")
            _amountText = State(initialValue: "")
        case .edit(let b):
            _categoryId = State(initialValue: b.categoryId)
            _amountText = State(initialValue: b.amount.description)
        }
    }

    private var isEdit: Bool {
        if case .edit = mode { return true }
        return false
    }

    private var selectable: [Category] {
        if isEdit { return categories }
        return categories.filter { !existingCategoryIds.contains($0.id) }
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: Theme.Spacing.md) {
                    VStack(alignment: .leading, spacing: Theme.Spacing.xxs) {
                        Text(locale.t("expenses.category"))
                            .font(AppFont.bodyMedium)
                            .foregroundColor(Theme.foreground)
                        if selectable.isEmpty {
                            Text("—")
                                .font(AppFont.caption)
                                .foregroundColor(Theme.mutedForeground)
                        } else {
                            ScrollView(.horizontal, showsIndicators: false) {
                                HStack(spacing: 6) {
                                    ForEach(selectable) { c in
                                        Button { categoryId = c.id } label: {
                                            Text(c.name)
                                                .font(AppFont.mono(11))
                                                .tracking(0.5)
                                                .textCase(.uppercase)
                                                .padding(.horizontal, 10)
                                                .padding(.vertical, 8)
                                                .foregroundColor(categoryId == c.id ? Theme.background : Theme.foreground)
                                                .background(categoryId == c.id ? Theme.foreground : Theme.card)
                                                .overlay(
                                                    RoundedRectangle(cornerRadius: Theme.Radius.sm)
                                                        .stroke(Theme.foreground, lineWidth: Theme.Border.widthThin)
                                                )
                                                .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.sm))
                                        }
                                        .buttonStyle(.plain)
                                        .disabled(isEdit && c.id != categoryId)
                                    }
                                }
                            }
                        }
                    }

                    NBTextField(
                        label: locale.t("expenses.amount"),
                        text: $amountText,
                        placeholder: "0.00",
                        keyboardType: .decimalPad
                    )
                }
                .padding(Theme.Spacing.md)
            }
            .background(Theme.background)
            .navigationTitle(isEdit ? locale.t("settings.editBudget") : locale.t("settings.newBudget"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button(locale.t("common.cancel")) { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button(locale.t("common.save")) {
                        if let amount = Double(amountText.replacingOccurrences(of: ",", with: ".")),
                           amount > 0,
                           !categoryId.isEmpty {
                            onSubmit(categoryId, amount)
                            dismiss()
                        }
                    }
                    .disabled(
                        categoryId.isEmpty ||
                        Double(amountText.replacingOccurrences(of: ",", with: ".")) ?? 0 <= 0
                    )
                }
            }
        }
    }
}
