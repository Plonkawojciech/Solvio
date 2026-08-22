import SwiftUI

/// Ustawienia — arkusz, nie zakładka. Solvio ma dwa ekrany, a to jest
/// narzędzie: waluta, budżet, kategorie, wpięcie w CRM Programo, wylogowanie.
struct SettingsView: View {
    @EnvironmentObject private var store: AppDataStore
    @EnvironmentObject private var session: SessionStore
    @EnvironmentObject private var locale: AppLocale
    @EnvironmentObject private var theme: AppTheme
    @EnvironmentObject private var toast: ToastCenter
    @Environment(\.dismiss) private var dismiss

    @State private var monthlyBudget = ""
    @State private var newCategory = ""
    @State private var savingBudget = false

    var body: some View {
        NavigationStack {
            ZStack {
                PaperBackground()
                ScrollView {
                    VStack(alignment: .leading, spacing: Theme.Spacing.md) {
                        accountCard
                        budgetCard
                        categoriesCard
                        PasswordCard()
                        CrmConnectionCard()
                        appearanceCard
                        signOutButton
                    }
                    .padding(Theme.Spacing.md)
                    .padding(.bottom, Theme.Spacing.xl)
                }
            }
            .navigationTitle(locale.t("nav.settings"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button(locale.t("common.close")) { dismiss() }
                        .foregroundColor(Theme.primary)
                }
            }
        }
        .onAppear {
            monthlyBudget = store.settings?.monthlyBudget ?? ""
        }
    }

    // MARK: - Konto

    private var accountCard: some View {
        PaperCard(label: locale.t("settings.account")) {
            HStack(spacing: Theme.Spacing.sm) {
                Circle()
                    .fill(Theme.accent)
                    .frame(width: 40, height: 40)
                    .overlay(
                        Text(Fmt.initials(session.currentUser?.email ?? "?"))
                            .font(AppFont.chip)
                            .foregroundColor(Theme.primary)
                    )
                Text(session.currentUser?.email ?? "—")
                    .font(AppFont.body)
                    .foregroundColor(Theme.foreground)
                    .lineLimit(1)
                Spacer(minLength: 0)
            }
        }
    }

    // MARK: - Budżet

    /// Panel liczy budżet jako SUMĘ limitów kategorii; to pole zapisuje
    /// `user_settings.monthly_budget`, czyli fallback dla kont bez limitów.
    /// Bez tego podpisu ustawienia pokazywały 0, a Panel 3500 zł i wyglądało
    /// to na błąd, a nie na dwa różne pojęcia.
    private var effectiveBudget: Double {
        store.budgets.reduce(0) { $0 + $1.amount.double }
    }

    private var budgetCard: some View {
        PaperCard(title: locale.t("settings.monthlyBudget"), label: locale.t("settings.budget")) {
            HStack(spacing: Theme.Spacing.sm) {
                TextField("0", text: $monthlyBudget)
                    .font(AppFont.amountLarge)
                    .keyboardType(.decimalPad)
                Text(store.currency)
                    .font(AppFont.captionMedium)
                    .foregroundColor(Theme.mutedForeground)
                Button(locale.t("common.save")) { saveBudget() }
                    .buttonStyle(SecondaryButtonStyle(fullWidth: false))
                    .disabled(savingBudget)
            }
            if effectiveBudget > 0 {
                Text(locale.t("settings.budgetFromCategories") + " " + Fmt.amount(effectiveBudget, currency: store.currency))
                    .font(AppFont.caption)
                    .foregroundColor(Theme.mutedForeground)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    private func saveBudget() {
        let value = Double(monthlyBudget.replacingOccurrences(of: ",", with: "."))
        savingBudget = true
        Task {
            defer { savingBudget = false }
            do {
                try await SettingsRepo.updateSettings(SettingsRepo.SettingsData(
                    currency: nil, language: nil, productType: nil,
                    monthlyBudget: value, notificationsEnabled: nil, timezone: nil
                ))
                store.didMutateCategoriesOrBudgetsOrSettings()
                toast.success(locale.t("settings.saved"))
            } catch {
                toast.error(locale.t("common.error"))
            }
        }
    }

    // MARK: - Kategorie

    private var categoriesCard: some View {
        PaperCard(title: locale.t("settings.categories"), label: locale.t("settings.categoriesLabel")) {
            VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 6) {
                        ForEach(store.categories) { category in
                            Text(category.name)
                                .font(AppFont.captionMedium)
                                .foregroundColor(Theme.mutedForeground)
                                .padding(.horizontal, 11)
                                .padding(.vertical, 6)
                                .background(Theme.muted)
                                .clipShape(Capsule())
                        }
                    }
                }
                HStack(spacing: Theme.Spacing.sm) {
                    TextField(locale.t("settings.newCategory"), text: $newCategory)
                        .font(AppFont.body)
                    Button(locale.t("common.add")) { addCategory() }
                        .buttonStyle(SecondaryButtonStyle(fullWidth: false))
                        .disabled(newCategory.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
        }
    }

    private func addCategory() {
        let name = newCategory.trimmingCharacters(in: .whitespaces)
        guard !name.isEmpty else { return }
        newCategory = ""
        Task {
            do {
                _ = try await CategoriesRepo.create(CategoriesRepo.Create(name: name, icon: nil))
                store.didMutateCategoriesOrBudgetsOrSettings()
                toast.success(locale.t("settings.categoryAdded"))
            } catch {
                toast.error(locale.t("common.error"))
            }
        }
    }

    // MARK: - Wygląd

    private var appearanceCard: some View {
        PaperCard(label: locale.t("settings.appearance")) {
            VStack(spacing: Theme.Spacing.sm) {
                Picker("", selection: Binding(get: { theme.mode }, set: { theme.mode = $0 })) {
                    Text(locale.t("theme.system")).tag(AppTheme.Mode.system)
                    Text(locale.t("theme.light")).tag(AppTheme.Mode.light)
                    Text(locale.t("theme.dark")).tag(AppTheme.Mode.dark)
                }
                .pickerStyle(.segmented)

                Picker("", selection: Binding(get: { locale.language }, set: { locale.language = $0 })) {
                    Text("Polski").tag(AppLocale.Language.pl)
                    Text("English").tag(AppLocale.Language.en)
                }
                .pickerStyle(.segmented)
            }
        }
    }

    private var signOutButton: some View {
        Button(locale.t("common.signOut")) {
            Task {
                await session.logout()
                store.resetAll()
                dismiss()
            }
        }
        .buttonStyle(SecondaryButtonStyle())
    }
}

// MARK: - Hasło

/// Zmiana hasła. Do tej pory apka nie miała jak tego zrobić: hasło powstawało
/// przy pierwszym logowaniu i zostawało na zawsze.
private struct PasswordCard: View {
    @EnvironmentObject private var locale: AppLocale
    @EnvironmentObject private var toast: ToastCenter

    @State private var current = ""
    @State private var new = ""
    @State private var busy = false

    private var canSave: Bool { !current.isEmpty && new.count >= 8 && !busy }

    var body: some View {
        PaperCard(title: locale.t("settings.changePassword"), label: locale.t("settings.security")) {
            VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
                secureField(locale.t("settings.currentPassword"), text: $current)
                secureField(locale.t("settings.newPassword"), text: $new)
                Text(locale.t("settings.passwordRule"))
                    .font(AppFont.caption)
                    .foregroundColor(Theme.mutedForeground)
                Button(locale.t("common.save")) { save() }
                    .buttonStyle(SecondaryButtonStyle(fullWidth: false))
                    .disabled(!canSave)
            }
        }
    }

    private func secureField(_ placeholder: String, text: Binding<String>) -> some View {
        SecureField(placeholder, text: text)
            .font(AppFont.body)
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()
            .padding(.horizontal, Theme.Spacing.sm)
            .frame(height: 40)
            .background(Theme.muted)
            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.sm, style: .continuous))
    }

    private func save() {
        busy = true
        Task {
            defer { busy = false }
            do {
                try await PasswordRepo.change(current: current, new: new)
                current = ""; new = ""
                toast.success(locale.t("settings.passwordChanged"))
            } catch {
                Log.error(.session, "nie udało się zmienić hasła", error)
                toast.error(locale.t("settings.passwordChangeFailed"))
            }
        }
    }
}

// MARK: - CRM

/// Wpięcie zakładki Finanse w crm.programo.pl. Klucz wkleja Wojtek i po
/// zapisie nie wraca — apka widzi tylko cztery ostatnie znaki, a sekret
/// leży zaszyfrowany po stronie Solvio.
private struct CrmConnectionCard: View {
    @EnvironmentObject private var locale: AppLocale
    @EnvironmentObject private var toast: ToastCenter

    @State private var connection: CrmRepo.Connection?
    @State private var apiKey = ""
    @State private var autoPush = false
    @State private var busy = false

    var body: some View {
        PaperCard(title: "CRM Programo", label: locale.t("crm.section")) {
            VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
                Text(statusText)
                    .font(AppFont.caption)
                    .foregroundColor(connection?.lastError != nil ? Theme.destructive : Theme.mutedForeground)
                    .fixedSize(horizontal: false, vertical: true)

                SecureField(locale.t("crm.apiKeyPlaceholder"), text: $apiKey)
                    .font(AppFont.body)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .padding(.horizontal, Theme.Spacing.sm)
                    .frame(height: 40)
                    .background(Theme.muted)
                    .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.sm, style: .continuous))

                Toggle(isOn: $autoPush) {
                    Text(locale.t("crm.autoPush"))
                        .font(AppFont.caption)
                        .foregroundColor(Theme.foreground)
                }
                .tint(Theme.primary)

                HStack(spacing: Theme.Spacing.sm) {
                    Button(connection?.connected == true ? locale.t("crm.reconnect") : locale.t("crm.connect")) {
                        connect()
                    }
                    .buttonStyle(PrimaryButtonStyle(fullWidth: false))
                    .disabled(busy || (apiKey.isEmpty && connection?.connected != true))

                    if connection?.connected == true {
                        Button(locale.t("crm.disconnect")) { disconnect() }
                            .buttonStyle(SecondaryButtonStyle(fullWidth: false))
                            .disabled(busy)
                    }
                }
            }
        }
        .task { await load() }
    }

    private var statusText: String {
        guard let connection, connection.connected else { return locale.t("crm.notConnectedHint") }
        if let error = connection.lastError { return locale.t("crm.lastError") + " " + error }
        return locale.t("crm.connectedHint") + " ***" + (connection.apiKeyHint ?? "")
    }

    private func load() async {
        connection = try? await CrmRepo.connection()
        autoPush = connection?.autoPush ?? false
    }

    private func connect() {
        busy = true
        Task {
            defer { busy = false }
            do {
                connection = try await CrmRepo.connect(CrmRepo.ConnectBody(
                    baseUrl: connection?.baseUrl ?? "https://crm.programo.pl",
                    apiKey: apiKey,
                    autoPush: autoPush,
                    defaultCategory: connection?.defaultCategory ?? "solvio"
                ))
                apiKey = ""
                toast.success(locale.t("crm.connected"))
            } catch {
                toast.error(locale.t("crm.connectFailed"))
            }
        }
    }

    private func disconnect() {
        busy = true
        Task {
            defer { busy = false }
            try? await CrmRepo.disconnect()
            await load()
            toast.success(locale.t("crm.disconnected"))
        }
    }
}
