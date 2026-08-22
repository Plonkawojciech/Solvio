import SwiftUI

/// Panel — ten sam układ, co `/dashboard` na webie:
/// powitanie → ostrzeżenia budżetowe → karta bohatera z paskiem →
/// trzy kafelki → podział wydatków → kategorie vs poprzedni miesiąc →
/// ostatnie transakcje.
///
/// Zasada produktu: żadnych przycisków akcji w karcie bohatera i lista
/// ostatnich wydatków wysoko, nie schowana pod wykresami.
struct DashboardView: View {
    @EnvironmentObject private var store: AppDataStore
    @EnvironmentObject private var router: AppRouter
    @EnvironmentObject private var locale: AppLocale

    private var model: DashboardModel {
        DashboardModel(
            expenses: store.expenses,
            categories: store.categories,
            budgets: store.budgets,
            monthlyBudget: store.settings?.monthlyBudget,
            prevTotal: store.dashboard?.prevTotal,
            prevByCategory: store.dashboard?.prevByCategory,
            currency: store.currency
        )
    }

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: Theme.Spacing.md) {
                greeting

                if store.dashboardLoading && store.dashboard == nil {
                    skeleton
                } else if let error = store.dashboardError, store.dashboard == nil {
                    ErrorBanner(message: error) { store.ensureDashboard(force: true) }
                } else {
                    let m = model
                    ForEach(m.alerts) { alert in
                        AlertRow(title: alert.title, detail: alert.detail, level: alert.level)
                    }
                    heroCard(m)
                    tiles(m)
                    if !m.split.isEmpty { splitCard(m) }
                    if !m.topCategories.isEmpty { categoriesCard(m) }
                    recentCard(m)
                }
            }
            .padding(Theme.Spacing.md)
            .padding(.bottom, 96)
        }
        .refreshable { await store.awaitDashboard(force: true) }
        .task { store.ensureDashboard() }
    }

    // MARK: - Powitanie

    private var greeting: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(greetingText)
                .font(AppFont.pageTitle)
                .foregroundColor(Theme.foreground)
            SectionLabel(text: currentMonthLabel)
        }
        .padding(.top, Theme.Spacing.xs)
    }

    private var greetingText: String {
        let hour = Calendar.current.component(.hour, from: Date())
        if hour < 12 { return locale.t("dashboard.goodMorning") }
        if hour < 18 { return locale.t("dashboard.goodAfternoon") }
        return locale.t("dashboard.goodEvening")
    }

    private var currentMonthLabel: String {
        let f = DateFormatter()
        f.locale = Locale(identifier: locale.language == .pl ? "pl_PL" : "en_US")
        f.setLocalizedDateFormatFromTemplate("LLLL yyyy")
        return f.string(from: Date())
    }

    // MARK: - Karta bohatera

    private func heroCard(_ m: DashboardModel) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
            SectionLabel(text: locale.t("dashboard.spentThisMonth"))

            HStack(alignment: .firstTextBaseline, spacing: Theme.Spacing.sm) {
                Text(Fmt.amount(m.total, currency: m.currency))
                    .font(AppFont.hero)
                    .foregroundColor(Theme.foreground)
                    .lineLimit(1)
                    .minimumScaleFactor(0.5)
                if let trend = m.trendPercent {
                    TrendBadge(percent: trend)
                }
            }

            if let budget = m.budget, budget > 0 {
                Text("/ \(Fmt.amount(budget, currency: m.currency))")
                    .font(AppFont.caption)
                    .foregroundColor(Theme.mutedForeground)

                BudgetBar(progress: m.total / budget, pace: m.idealPace)
                    .padding(.top, 2)

                HStack {
                    Text("\(Int((m.total / budget * 100).rounded()))% · \(remainingLabel(m, budget: budget))")
                        .font(AppFont.caption)
                        .foregroundColor(Theme.mutedForeground)
                    Spacer()
                    Text(locale.t("dashboard.idealPace") + " \(Int(((m.idealPace ?? 0) * 100).rounded()))%")
                        .font(AppFont.caption)
                        .foregroundColor(Theme.mutedForeground)
                }
            } else {
                Text(locale.pluralized("dashboard.transactions", count: m.count))
                    .font(AppFont.caption)
                    .foregroundColor(Theme.mutedForeground)
            }
        }
        .padding(Theme.Spacing.md)
        .frame(maxWidth: .infinity, alignment: .leading)
        .paperCard()
    }

    private func remainingLabel(_ m: DashboardModel, budget: Double) -> String {
        let left = budget - m.total
        if left >= 0 {
            return locale.t("dashboard.left") + " " + Fmt.amount(left, currency: m.currency)
        }
        return locale.t("dashboard.over") + " " + Fmt.amount(-left, currency: m.currency)
    }

    // MARK: - Kafelki

    private func tiles(_ m: DashboardModel) -> some View {
        HStack(spacing: Theme.Spacing.sm) {
            StatTile(
                label: locale.t("dashboard.forecast"),
                value: Fmt.amount(m.forecast, currency: m.currency),
                caption: m.forecastOverBudget.map { locale.t("dashboard.overBy") + " " + Fmt.amount($0, currency: m.currency) },
                captionColor: Theme.destructive,
                icon: "chart.line.uptrend.xyaxis"
            )
            StatTile(
                label: locale.t("dashboard.dailyAllowance"),
                value: Fmt.amount(m.dailyAllowance, currency: m.currency),
                caption: locale.pluralized("dashboard.daysLeft", count: m.daysLeft),
                icon: "calendar"
            )
        }
    }

    // MARK: - Podział wydatków

    private func splitCard(_ m: DashboardModel) -> some View {
        PaperCard(label: locale.t("dashboard.spendingSplit")) {
            VStack(spacing: 10) {
                SplitBar(slices: m.split)
                ForEach(Array(m.split.enumerated()), id: \.element.id) { _, slice in
                    HStack(spacing: Theme.Spacing.sm) {
                        CategoryDot(color: slice.color)
                        Text(slice.name)
                            .font(AppFont.caption)
                            .foregroundColor(Theme.foreground)
                            .lineLimit(1)
                        Spacer(minLength: Theme.Spacing.sm)
                        Text("\(Int((slice.share * 100).rounded()))%")
                            .font(AppFont.mono(11))
                            .foregroundColor(Theme.mutedForeground)
                    }
                }
            }
        }
    }

    // MARK: - Kategorie

    private func categoriesCard(_ m: DashboardModel) -> some View {
        PaperCard(title: locale.t("dashboard.topCategories"), label: locale.t("dashboard.vsPrevious")) {
            VStack(spacing: Theme.Spacing.sm + 2) {
                ForEach(m.topCategories) { row in
                    VStack(alignment: .leading, spacing: 5) {
                        HStack(spacing: Theme.Spacing.sm) {
                            CategoryDot(color: row.color)
                            Text(row.name)
                                .font(AppFont.captionMedium)
                                .foregroundColor(Theme.foreground)
                                .lineLimit(1)
                            Spacer(minLength: Theme.Spacing.sm)
                            Text(Fmt.amount(row.amount, currency: m.currency))
                                .font(AppFont.mono(12))
                                .foregroundColor(Theme.foreground)
                            if let delta = row.deltaPercent {
                                TrendBadge(percent: delta, compact: true)
                            }
                        }
                        // Pasek pełny = ten miesiąc, wyblakły = poprzedni.
                        // Ta sama konwencja, co „solid / faded" na webie.
                        GeometryReader { geo in
                            ZStack(alignment: .leading) {
                                Capsule().fill(row.color.opacity(0.22))
                                    .frame(width: geo.size.width * row.prevRatio, height: 4)
                                    .offset(y: 6)
                                Capsule().fill(row.color)
                                    .frame(width: geo.size.width * row.ratio, height: 6)
                            }
                        }
                        .frame(height: 14)
                    }
                }
            }
        }
    }

    // MARK: - Ostatnie transakcje

    private func recentCard(_ m: DashboardModel) -> some View {
        PaperCard(title: locale.t("dashboard.recentActivity")) {
            if m.recent.isEmpty {
                EmptyStateView(
                    icon: "tray",
                    title: locale.t("expenses.empty"),
                    subtitle: locale.t("expenses.emptyHint")
                )
            } else {
                VStack(spacing: 0) {
                    ForEach(m.recent) { row in
                        Button {
                            Haptics.selection()
                            router.push(.expenseDetail(id: row.expense.id))
                        } label: {
                            ExpenseRow(row: row, currency: m.currency)
                        }
                        if row.id != m.recent.last?.id {
                            Divider().overlay(Theme.border)
                        }
                    }
                }
            }
        } trailing: {
            Button {
                router.selectedTab = .expenses
            } label: {
                Text(locale.t("dashboard.viewAll"))
                    .font(AppFont.captionMedium)
                    .foregroundColor(Theme.primary)
            }
        }
    }

    // MARK: - Szkielet

    private var skeleton: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.md) {
            SkeletonBlock(height: 132)
            HStack(spacing: Theme.Spacing.sm) {
                SkeletonBlock(height: 96)
                SkeletonBlock(height: 96)
            }
            SkeletonBlock(height: 180)
        }
    }
}

// MARK: - Elementy współdzielone

/// Zielony spadek / czerwony wzrost — na wydatkach mniej znaczy lepiej,
/// więc kolory są odwrotne niż przy przychodach.
struct TrendBadge: View {
    let percent: Double
    var compact: Bool = false

    private var isUp: Bool { percent > 0 }

    var body: some View {
        HStack(spacing: 2) {
            Image(systemName: isUp ? "arrowtriangle.up.fill" : "arrowtriangle.down.fill")
                .font(.system(size: compact ? 7 : 8))
            Text("\(abs(Int(percent.rounded())))%")
                .font(AppFont.mono(compact ? 10 : 11))
        }
        .foregroundColor(isUp ? Theme.destructive : Theme.success)
    }
}

/// Poziomy pasek podziału wydatków — płaski odpowiednik pierścienia z weba.
struct SplitBar: View {
    let slices: [DashboardModel.Slice]

    var body: some View {
        GeometryReader { geo in
            HStack(spacing: 2) {
                ForEach(slices) { slice in
                    Capsule()
                        .fill(slice.color)
                        .frame(width: max(2, geo.size.width * slice.share - 2))
                }
            }
        }
        .frame(height: 10)
    }
}

/// Wiersz wydatku — tytuł, sprzedawca i kategoria pod spodem, kwota po prawej.
struct ExpenseRow: View {
    let row: DashboardModel.Row
    let currency: String

    var body: some View {
        HStack(spacing: Theme.Spacing.sm) {
            CategoryDot(color: row.color)
            VStack(alignment: .leading, spacing: 2) {
                Text(row.expense.title)
                    .font(AppFont.bodyMedium)
                    .foregroundColor(Theme.foreground)
                    .lineLimit(1)
                Text(row.subtitle)
                    .font(AppFont.caption)
                    .foregroundColor(Theme.mutedForeground)
                    .lineLimit(1)
            }
            Spacer(minLength: Theme.Spacing.sm)
            Text(Fmt.amount(row.expense.amount, currency: row.expense.currency ?? currency))
                .font(AppFont.amount)
                .foregroundColor(Theme.foreground)
        }
        .padding(.vertical, 10)
        .contentShape(Rectangle())
    }
}
