import SwiftUI
import Charts

/// **Dochody** — multi-income editor + share breakdown chart.
/// Replaces the single `monthlyBudget.totalIncome` field with a list
/// of named income sources (Pensja, Freelance, Wynajem…). Each row
/// has an emoji, name, amount + period chip, swipe-to-delete. Donut
/// at the top shows percentage share per source so the user sees at
/// a glance what's carrying the bulk of their monthly income.
struct IncomesView: View {
    @EnvironmentObject private var locale: AppLocale
    @EnvironmentObject private var toast: ToastCenter

    @State private var incomes: [Income] = []
    @State private var isLoading = true
    @State private var errorMessage: String?
    @State private var showAdd = false
    @State private var editing: Income?
    @State private var pendingDelete: Income?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Theme.Spacing.md) {
                NBScreenHeader(
                    eyebrow: locale.t("incomes.eyebrow"),
                    title: locale.t("incomes.title"),
                    subtitle: locale.t("incomes.subtitle")
                )

                if isLoading && incomes.isEmpty {
                    NBLoadingCard()
                } else if let err = errorMessage, incomes.isEmpty {
                    NBErrorCard(message: err) { Task { await load() } }
                } else if incomes.isEmpty {
                    NBEmptyState(
                        systemImage: "banknote",
                        title: locale.t("incomes.emptyTitle"),
                        subtitle: locale.t("incomes.emptySubtitle"),
                        action: (label: locale.t("incomes.addFirst"), run: { showAdd = true })
                    )
                } else {
                    summaryCard
                    donutCard
                    incomesList
                    Button {
                        showAdd = true
                    } label: {
                        Label(locale.t("incomes.addAnother"), systemImage: "plus")
                    }
                    .buttonStyle(NBSecondaryButtonStyle())
                }

                Spacer(minLength: Theme.Spacing.xl)
            }
            .padding(.horizontal, Theme.Spacing.md)
            .padding(.top, Theme.Spacing.md)
        }
        .background(Theme.background)
        .navigationTitle(locale.t("incomes.title"))
        .navigationBarTitleDisplayMode(.inline)
        .task { if incomes.isEmpty { await load() } }
        .refreshable { await load() }
        .sheet(isPresented: $showAdd) {
            IncomeEditorSheet(mode: .create) { create in
                Task { await save(create: create) }
            }
            .environmentObject(locale)
        }
        .sheet(item: $editing) { income in
            IncomeEditorSheet(mode: .edit(income)) { create in
                Task { await save(update: create, id: income.id) }
            }
            .environmentObject(locale)
        }
        .alert(
            locale.t("incomes.deleteConfirm"),
            isPresented: Binding(
                get: { pendingDelete != nil },
                set: { if !$0 { pendingDelete = nil } }
            ),
            presenting: pendingDelete
        ) { inc in
            Button(locale.t("common.cancel"), role: .cancel) {}
            Button(locale.t("common.delete"), role: .destructive) {
                Task { await delete(income: inc) }
            }
        } message: { inc in
            Text(String(format: locale.t("incomes.deleteConfirmMsg"), inc.name))
        }
    }

    // MARK: - Summary KPI

    private var totalMonthly: Double {
        incomes.filter { $0.isActive != false }.reduce(0) { $0 + $1.monthlyAmount }
    }

    private var summaryCard: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
            NBEyebrow(text: locale.t("incomes.totalEyebrow"), color: Theme.mutedForeground)
            Text(Fmt.amount(totalMonthly))
                .font(AppFont.hero)
                .foregroundColor(Theme.foreground)
                .minimumScaleFactor(0.6)
                .lineLimit(1)
            Text(locale.t("incomes.perMonth"))
                .font(AppFont.caption)
                .foregroundColor(Theme.mutedForeground)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(Theme.Spacing.md)
        .nbCard(radius: Theme.Radius.lg, shadow: Theme.Shadow.lg)
    }

    // MARK: - Donut chart

    /// Income share visualisation. iOS 17+ gets a proper SectorMark
    /// donut; iOS 16 falls back to a horizontal stacked bar (Charts
    /// `BarMark` was the only segmented-share primitive available
    /// before SectorMark shipped). Both render the same data — share
    /// of `monthlyAmount` per income source.
    @ViewBuilder
    private var donutCard: some View {
        let active = incomes.filter { $0.isActive != false && $0.monthlyAmount > 0 }
        if active.count > 1, totalMonthly > 0 {
            VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
                NBEyebrow(text: locale.t("incomes.shareEyebrow"), color: Theme.mutedForeground)
                if #available(iOS 17.0, *) {
                    Chart(active) { inc in
                        SectorMark(
                            angle: .value("share", inc.monthlyAmount),
                            innerRadius: .ratio(0.6),
                            angularInset: 1.5
                        )
                        .cornerRadius(3)
                        .foregroundStyle(by: .value("source", inc.name))
                    }
                    .frame(height: 160)
                    .chartLegend(position: .trailing, alignment: .leading, spacing: 4)
                } else {
                    // iOS 16 fallback — single horizontal bar split into
                    // segments, plus an inline legend underneath.
                    Chart(active) { inc in
                        BarMark(
                            x: .value("share", inc.monthlyAmount),
                            y: .value("row", "income")
                        )
                        .foregroundStyle(by: .value("source", inc.name))
                    }
                    .frame(height: 36)
                    .chartXAxis(.hidden)
                    .chartYAxis(.hidden)
                    .chartLegend(position: .bottom, alignment: .leading, spacing: 4)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(Theme.Spacing.md)
            .nbCard(radius: Theme.Radius.md, shadow: Theme.Shadow.sm)
        }
    }

    // MARK: - List

    private var incomesList: some View {
        VStack(spacing: Theme.Spacing.xs) {
            ForEach(incomes) { inc in
                Button {
                    editing = inc
                } label: {
                    HStack(spacing: Theme.Spacing.sm) {
                        Text(inc.emoji ?? "💼")
                            .font(.system(size: 28))
                            .frame(width: 44, height: 44)
                            .background(Theme.muted)
                            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.sm))
                            .overlay(
                                RoundedRectangle(cornerRadius: Theme.Radius.sm)
                                    .stroke(Theme.border, lineWidth: Theme.Border.widthThin)
                            )
                        VStack(alignment: .leading, spacing: 2) {
                            HStack(spacing: 6) {
                                Text(inc.name)
                                    .font(AppFont.bodyMedium)
                                    .foregroundColor(Theme.foreground)
                                periodTag(inc.period)
                                if inc.isActive == false {
                                    Text(locale.t("incomes.inactive"))
                                        .font(AppFont.mono(9))
                                        .tracking(0.5)
                                        .padding(.horizontal, 5)
                                        .padding(.vertical, 2)
                                        .background(Theme.mutedForeground.opacity(0.15))
                                        .foregroundColor(Theme.mutedForeground)
                                        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.sm))
                                }
                            }
                            Text(Fmt.amount(inc.monthlyAmount) + locale.t("dashboard.perDayShort").replacingOccurrences(of: "/", with: " /m"))
                                .font(AppFont.caption)
                                .foregroundColor(Theme.mutedForeground)
                        }
                        Spacer()
                        Text(Fmt.amount(inc.amount.double))
                            .font(AppFont.amount)
                            .foregroundColor(Theme.foreground)
                    }
                    .padding(Theme.Spacing.sm)
                    .nbCard(radius: Theme.Radius.md, shadow: Theme.Shadow.sm)
                }
                .buttonStyle(.plain)
                .contextMenu {
                    Button(role: .destructive) {
                        pendingDelete = inc
                    } label: {
                        Label(locale.t("common.delete"), systemImage: "trash")
                    }
                }
            }
        }
    }

    private func periodTag(_ period: String) -> some View {
        let label: String = {
            switch period {
            case "weekly":  return locale.t("incomes.periodWeekly")
            case "yearly":  return locale.t("incomes.periodYearly")
            case "oneoff":  return locale.t("incomes.periodOneoff")
            default:        return locale.t("incomes.periodMonthly")
            }
        }()
        return Text(label.uppercased())
            .font(AppFont.mono(9))
            .tracking(0.5)
            .padding(.horizontal, 5)
            .padding(.vertical, 2)
            .background(Theme.success.opacity(0.15))
            .foregroundColor(Theme.success)
            .overlay(
                RoundedRectangle(cornerRadius: Theme.Radius.sm)
                    .stroke(Theme.success.opacity(0.5), lineWidth: 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.sm))
    }

    // MARK: - I/O

    private func load() async {
        if !isLoading { isLoading = true }
        defer { isLoading = false }
        do {
            incomes = try await IncomesRepo.list()
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func save(create body: IncomeEditorSheet.Draft) async {
        do {
            _ = try await IncomesRepo.create(IncomeCreate(
                name: body.name,
                amount: body.amount,
                period: body.period,
                emoji: body.emoji
            ))
            toast.success(locale.t("toast.created"))
            await load()
        } catch {
            toast.error(locale.t("toast.error"), description: error.localizedDescription)
        }
    }

    private func save(update body: IncomeEditorSheet.Draft, id: String) async {
        do {
            try await IncomesRepo.update(IncomeUpdate(
                id: id,
                name: body.name,
                amount: body.amount,
                period: body.period,
                emoji: body.emoji,
                isActive: nil
            ))
            toast.success(locale.t("toast.updated"))
            await load()
        } catch {
            toast.error(locale.t("toast.error"), description: error.localizedDescription)
        }
    }

    private func delete(income: Income) async {
        do {
            try await IncomesRepo.delete(id: income.id)
            incomes.removeAll { $0.id == income.id }
            toast.success(locale.t("toast.deleted"))
        } catch {
            toast.error(locale.t("toast.error"), description: error.localizedDescription)
        }
    }
}

// MARK: - Editor sheet

struct IncomeEditorSheet: View {
    enum Mode { case create, edit(Income) }
    struct Draft {
        var name: String
        var amount: Double
        var period: String
        var emoji: String
    }

    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var locale: AppLocale
    let mode: Mode
    let onSubmit: (Draft) -> Void

    @State private var name: String = ""
    @State private var amountText: String = ""
    @State private var period: String = "monthly"
    @State private var emoji: String = "💼"

    private let emojiOptions = ["💼", "💰", "🧑‍💻", "🏠", "📈", "🎁", "🎓", "🛠️"]

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: Theme.Spacing.md) {
                    NBTextField(label: locale.t("incomes.name"), text: $name, placeholder: locale.t("incomes.namePlaceholder"))
                    NBTextField(label: locale.t("incomes.amount"), text: $amountText, keyboardType: .decimalPad)

                    VStack(alignment: .leading, spacing: 6) {
                        Text(locale.t("incomes.period")).font(AppFont.bodyMedium).foregroundColor(Theme.foreground)
                        NBSegmented(
                            selection: $period,
                            options: [
                                (value: "monthly", label: locale.t("incomes.periodMonthly")),
                                (value: "weekly", label: locale.t("incomes.periodWeekly")),
                                (value: "yearly", label: locale.t("incomes.periodYearly")),
                                (value: "oneoff", label: locale.t("incomes.periodOneoff")),
                            ]
                        )
                    }

                    VStack(alignment: .leading, spacing: 6) {
                        Text(locale.t("incomes.emoji")).font(AppFont.bodyMedium).foregroundColor(Theme.foreground)
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 8) {
                                ForEach(emojiOptions, id: \.self) { e in
                                    Button { emoji = e } label: {
                                        Text(e)
                                            .font(.system(size: 28))
                                            .frame(width: 44, height: 44)
                                            .background(emoji == e ? Theme.foreground.opacity(0.10) : Theme.muted)
                                            .overlay(
                                                RoundedRectangle(cornerRadius: Theme.Radius.sm)
                                                    .stroke(emoji == e ? Theme.foreground : Theme.border, lineWidth: emoji == e ? Theme.Border.width : Theme.Border.widthThin)
                                            )
                                            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.sm))
                                    }
                                    .buttonStyle(.plain)
                                }
                            }
                        }
                    }

                    Button {
                        let trimmed = name.trimmingCharacters(in: .whitespaces)
                        let normalized = amountText.replacingOccurrences(of: ",", with: ".")
                        guard !trimmed.isEmpty, let amount = Double(normalized), amount > 0 else { return }
                        onSubmit(Draft(name: trimmed, amount: amount, period: period, emoji: emoji))
                        dismiss()
                    } label: {
                        Text(isEditMode ? locale.t("common.save") : locale.t("incomes.add"))
                    }
                    .buttonStyle(NBPrimaryButtonStyle())
                    .disabled(name.trimmingCharacters(in: .whitespaces).isEmpty || (Double(amountText.replacingOccurrences(of: ",", with: ".")) ?? 0) <= 0)
                }
                .padding(Theme.Spacing.md)
            }
            .background(Theme.background)
            .navigationTitle(isEditMode ? locale.t("incomes.editTitle") : locale.t("incomes.addTitle"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(locale.t("common.cancel")) { dismiss() }
                }
            }
            .onAppear(perform: prefill)
        }
    }

    private var isEditMode: Bool {
        if case .edit = mode { return true }
        return false
    }

    private func prefill() {
        if case .edit(let inc) = mode {
            name = inc.name
            amountText = String(format: "%.2f", inc.amount.double)
            period = inc.period
            emoji = inc.emoji ?? "💼"
        }
    }
}
