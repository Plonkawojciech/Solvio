import SwiftUI
import Charts

/// Dashboard — parity with PWA `app/(protected)/dashboard/page.tsx`.
/// The backend returns raw data; all aggregations (MoM change, weekly
/// spend, forecast, savings rate, wellness, anomalies, over-budget)
/// are computed client-side so the neobrutalism layout stays in lockstep
/// with the web build.
struct DashboardView: View {
    @EnvironmentObject private var router: AppRouter
    @EnvironmentObject private var session: SessionStore
    @EnvironmentObject private var locale: AppLocale
    @EnvironmentObject private var toast: ToastCenter
    @StateObject private var vm = DashboardViewModel()

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Theme.Spacing.md) {
                header
                if vm.isLoading && vm.display == nil {
                    NBLoadingCard()
                } else if vm.display == nil, let message = vm.errorMessage {
                    NBErrorCard(message: message) { Task { await vm.load(toast: toast) } }
                } else if let d = vm.display {
                    hero(d)
                    noRecentDataCard(d)
                    recentExpenses(d)
                    overBudgetAlerts(d)
                    anomalies(d)
                    forecastAndSavings(d)
                    metricCards(d)
                    dailyTrendChart(d)
                    categoryPieChart(d)
                    categoryChart(d)
                    wellness(d)
                    budgetOverview(d)
                    aiInsightsCTA(d)
                }
                Spacer(minLength: Theme.Spacing.xl)
            }
            .padding(.horizontal, Theme.Spacing.md)
            .padding(.top, Theme.Spacing.md)
            .animation(.spring(response: 0.35, dampingFraction: 0.85), value: vm.display?.totalTransactions)
        }
        .background(Theme.background)
        .refreshable { await vm.load(toast: toast) }
        .task { if vm.display == nil { await vm.load(toast: toast) } }
    }

    // MARK: - Header

    private var header: some View {
        NBScreenHeader(
            eyebrow: locale.t("dashboard.eyebrow"),
            title: locale.t("dashboard.yourMoney"),
            subtitle: session.currentUser?.email,
            trailing: AnyView(
                Button {
                    Task { await vm.load(toast: toast) }
                } label: {
                    Image(systemName: "arrow.clockwise")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundColor(Theme.foreground)
                        .frame(width: 40, height: 40)
                        .background(Theme.muted)
                        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.sm))
                        .overlay(
                            RoundedRectangle(cornerRadius: Theme.Radius.sm)
                                .stroke(Theme.foreground, lineWidth: Theme.Border.widthThin)
                        )
                }
            )
        )
    }

    // MARK: - Hero

    private func hero(_ d: DashboardDisplay) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 2) {
                    NBEyebrow(text: locale.t("dashboard.totalSpent").uppercased())
                    Text(locale.t("dashboard.rolling30"))
                        .font(AppFont.caption)
                        .foregroundColor(Theme.mutedForeground)
                }
                Spacer()
                NBIconBadge(systemImage: "creditcard.fill", size: 36)
            }

            Text(Fmt.amount(d.totalSpent, currency: d.currency))
                .font(AppFont.hero)
                .foregroundColor(Theme.foreground)
                .minimumScaleFactor(0.6)
                .lineLimit(1)
                .contentTransition(.numericText())
                .animation(.nbSpring, value: d.totalSpent)

            HStack(spacing: Theme.Spacing.xs) {
                NBTag(text: "\(d.totalTransactions) \(locale.t("dashboard.txns"))")
                NBTag(text: "\(Fmt.amount(d.avgDaily, currency: d.currency))\(locale.t("dashboard.perDayShort"))")
                if let mom = d.momChange {
                    NBTag(
                        text: "\(mom >= 0 ? "+" : "")\(mom)\(locale.t("dashboard.vsPrev"))",
                        background: mom < 0 ? Theme.success.opacity(0.15) : Theme.destructive.opacity(0.15),
                        foreground: mom < 0 ? Theme.success : Theme.destructive
                    )
                }
            }

            if d.totalBudget > 0 {
                budgetProgressSection(d)
            }
        }
        .padding(Theme.Spacing.md)
        .frame(maxWidth: .infinity, alignment: .leading)
        .nbCard(radius: Theme.Radius.lg, shadow: Theme.Shadow.lg)
    }

    private func budgetProgressSection(_ d: DashboardDisplay) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(locale.t("dashboard.budgetProgress"))
                    .font(AppFont.mono(10))
                    .tracking(1)
                    .textCase(.uppercase)
                    .foregroundColor(Theme.mutedForeground)
                Spacer()
                let remaining = d.budgetRemaining
                if remaining >= 0 {
                    Text("\(Fmt.amount(remaining, currency: d.currency)) \(locale.t("dashboard.left"))")
                        .font(AppFont.bodyMedium)
                        .foregroundColor(Theme.success)
                } else {
                    Text("\(Fmt.amount(abs(remaining), currency: d.currency)) \(locale.t("dashboard.over"))")
                        .font(AppFont.bodyMedium)
                        .foregroundColor(Theme.destructive)
                }
            }
            NBProgressBar(value: d.budgetProgress / 100, over: d.budgetProgress > 100)
            Text(String(format: "%.1f%% \(locale.t("dashboard.ofUsed"))", d.budgetProgress, Fmt.amount(d.totalBudget, currency: d.currency)))
                .font(AppFont.caption)
                .foregroundColor(Theme.mutedForeground)
        }
        .padding(Theme.Spacing.sm)
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Radius.md)
                .stroke(Theme.foreground.opacity(0.6), lineWidth: Theme.Border.widthThin)
        )
    }

    // MARK: - No recent data card

    /// Shown when the 30-day window has zero expenses but the user has
    /// historical data (receipts/expenses). Explains why the dashboard
    /// looks empty and points to the full receipts/expenses archive.
    @ViewBuilder
    private func noRecentDataCard(_ d: DashboardDisplay) -> some View {
        let hasHistory = vm.totalReceipts > 0 || vm.totalExpenses > 0
        if d.totalTransactions == 0 && hasHistory {
            VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
                HStack(alignment: .top, spacing: Theme.Spacing.sm) {
                    NBIconBadge(systemImage: "calendar.badge.clock", tint: Theme.info, size: 40)
                    VStack(alignment: .leading, spacing: 4) {
                        Text(locale.t("dashboard.noRecentTitle"))
                            .font(AppFont.bold(16))
                            .foregroundColor(Theme.foreground)
                        Text(locale.t("dashboard.noRecentSubtitle"))
                            .font(AppFont.body)
                            .foregroundColor(Theme.mutedForeground)
                    }
                }

                LazyVGrid(columns: [GridItem(.flexible(), spacing: Theme.Spacing.sm), GridItem(.flexible(), spacing: Theme.Spacing.sm)], spacing: Theme.Spacing.sm) {
                    if vm.totalReceipts > 0 {
                        archiveStat(icon: "doc.text.fill", value: "\(vm.totalReceipts)", label: locale.t("dashboard.totalReceipts"))
                    }
                    if vm.totalExpenses > 0 {
                        archiveStat(icon: "creditcard.fill", value: "\(vm.totalExpenses)", label: locale.t("dashboard.totalExpenses"))
                    }
                }

                HStack(spacing: Theme.Spacing.sm) {
                    Button {
                        router.selectedTab = .expenses
                    } label: {
                        HStack(spacing: 6) {
                            Image(systemName: "list.bullet")
                                .font(.system(size: 12, weight: .bold))
                            Text(locale.t("dashboard.goToExpenses"))
                                .font(AppFont.mono(11))
                                .tracking(0.5)
                                .textCase(.uppercase)
                        }
                        .frame(maxWidth: .infinity)
                        .foregroundColor(Theme.foreground)
                        .padding(.vertical, 10)
                        .background(Theme.muted)
                        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.sm))
                        .overlay(
                            RoundedRectangle(cornerRadius: Theme.Radius.sm)
                                .stroke(Theme.foreground, lineWidth: Theme.Border.widthThin)
                        )
                    }
                    .buttonStyle(.plain)

                    Button {
                        router.showingScanSheet = true
                    } label: {
                        HStack(spacing: 6) {
                            Image(systemName: "camera.fill")
                                .font(.system(size: 12, weight: .bold))
                            Text(locale.t("dashboard.scanReceipt"))
                                .font(AppFont.mono(11))
                                .tracking(0.5)
                                .textCase(.uppercase)
                        }
                        .frame(maxWidth: .infinity)
                        .foregroundColor(Theme.background)
                        .padding(.vertical, 10)
                        .background(Theme.foreground)
                        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.sm))
                        .overlay(
                            RoundedRectangle(cornerRadius: Theme.Radius.sm)
                                .stroke(Theme.foreground, lineWidth: Theme.Border.widthThin)
                        )
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(Theme.Spacing.md)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Theme.info.opacity(0.08))
            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.lg))
            .overlay(
                RoundedRectangle(cornerRadius: Theme.Radius.lg)
                    .stroke(Theme.info.opacity(0.4), lineWidth: Theme.Border.widthThin)
            )
        } else if d.totalTransactions == 0 && !hasHistory {
            NBEmptyState(
                systemImage: "wallet.pass",
                title: locale.t("dashboard.emptyTitle"),
                subtitle: locale.t("dashboard.emptySubtitle"),
                action: (label: locale.t("dashboard.scanReceipt"), run: {
                    router.showingScanSheet = true
                })
            )
        }
    }

    private func archiveStat(icon: String, value: String, label: String) -> some View {
        HStack(spacing: Theme.Spacing.sm) {
            Image(systemName: icon)
                .font(.system(size: 14, weight: .semibold))
                .foregroundColor(Theme.info)
            VStack(alignment: .leading, spacing: 2) {
                Text(value)
                    .font(AppFont.bold(16))
                    .foregroundColor(Theme.foreground)
                Text(label)
                    .font(AppFont.mono(10))
                    .tracking(0.5)
                    .textCase(.uppercase)
                    .foregroundColor(Theme.mutedForeground)
            }
            Spacer(minLength: 0)
        }
        .padding(Theme.Spacing.sm)
        .background(Theme.card)
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.sm))
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Radius.sm)
                .stroke(Theme.foreground.opacity(0.15), lineWidth: Theme.Border.widthThin)
        )
    }

    // MARK: - Forecast + savings rate row

    @ViewBuilder
    private func forecastAndSavings(_ d: DashboardDisplay) -> some View {
        if d.totalSpent > 0 && (d.monthlyForecast != nil || d.savingsRate != nil) {
            LazyVGrid(columns: [GridItem(.flexible(), spacing: Theme.Spacing.sm), GridItem(.flexible(), spacing: Theme.Spacing.sm)], spacing: Theme.Spacing.sm) {
                if let forecast = d.monthlyForecast {
                    smallStat(icon: "gauge", label: locale.t("dashboard.monthlyForecast"), value: Fmt.amount(forecast, currency: d.currency), tint: Theme.foreground)
                }
                if let rate = d.savingsRate {
                    let tint: Color = rate >= 20 ? Theme.success : rate >= 10 ? Theme.warning : Theme.destructive
                    smallStat(icon: "banknote", label: locale.t("dashboard.savingsRate"), value: "\(rate)%", tint: tint)
                }
            }
        }
    }

    private func smallStat(icon: String, label: String, value: String, tint: Color) -> some View {
        HStack(spacing: Theme.Spacing.sm) {
            NBIconBadge(systemImage: icon, tint: tint, size: 36)
            VStack(alignment: .leading, spacing: 2) {
                Text(label.uppercased())
                    .font(AppFont.mono(10))
                    .tracking(1)
                    .foregroundColor(Theme.mutedForeground)
                Text(value)
                    .font(AppFont.bold(16))
                    .foregroundColor(tint)
            }
            Spacer(minLength: 0)
        }
        .padding(Theme.Spacing.sm)
        .frame(maxWidth: .infinity, alignment: .leading)
        .nbCard(radius: Theme.Radius.md, shadow: Theme.Shadow.sm)
    }

    // MARK: - Over-budget alerts

    @ViewBuilder
    private func overBudgetAlerts(_ d: DashboardDisplay) -> some View {
        if !d.overBudget.isEmpty {
            VStack(spacing: Theme.Spacing.xs) {
                ForEach(d.overBudget) { cat in
                    HStack(spacing: Theme.Spacing.sm) {
                        Image(systemName: "exclamationmark.triangle.fill")
                            .foregroundColor(cat.pct >= 1 ? Theme.destructive : Theme.warning)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(cat.name)
                                .font(AppFont.bodyMedium)
                                .foregroundColor(Theme.foreground)
                            Text(String(format: "%.0f%% %@", cat.pct * 100, cat.pct >= 1 ? locale.t("dashboard.exceeded") : locale.t("dashboard.used")))
                                .font(AppFont.caption)
                                .foregroundColor(Theme.mutedForeground)
                        }
                        Spacer()
                        Text("\(Fmt.amount(cat.spent, currency: d.currency)) / \(Fmt.amount(cat.budget, currency: d.currency))")
                            .font(AppFont.mono(12))
                            .foregroundColor(Theme.foreground)
                    }
                    .padding(Theme.Spacing.sm)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background((cat.pct >= 1 ? Theme.destructive : Theme.warning).opacity(0.12))
                    .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.md))
                    .overlay(
                        RoundedRectangle(cornerRadius: Theme.Radius.md)
                            .stroke(cat.pct >= 1 ? Theme.destructive : Theme.warning, lineWidth: Theme.Border.widthThin)
                    )
                }
            }
        }
    }

    // MARK: - Anomaly alerts

    @ViewBuilder
    private func anomalies(_ d: DashboardDisplay) -> some View {
        if !d.anomalies.isEmpty {
            VStack(spacing: Theme.Spacing.xs) {
                ForEach(d.anomalies, id: \.name) { a in
                    HStack(spacing: Theme.Spacing.sm) {
                        Text(a.icon).font(.title3)
                        Text(a.name)
                            .font(AppFont.bodyMedium)
                            .foregroundColor(Theme.foreground)
                        Spacer()
                        Text(String(format: "%.1f\(locale.t("dashboard.moreTimes"))", a.ratio))
                            .font(AppFont.mono(12))
                            .foregroundColor(Theme.info)
                    }
                    .padding(Theme.Spacing.sm)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Theme.info.opacity(0.12))
                    .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.md))
                    .overlay(
                        RoundedRectangle(cornerRadius: Theme.Radius.md)
                            .stroke(Theme.info, lineWidth: Theme.Border.widthThin)
                    )
                }
            }
        }
    }

    // MARK: - Metric cards

    private func metricCards(_ d: DashboardDisplay) -> some View {
        LazyVGrid(columns: [GridItem(.flexible(), spacing: Theme.Spacing.sm), GridItem(.flexible(), spacing: Theme.Spacing.sm)], spacing: Theme.Spacing.sm) {
            NBStatTile(label: locale.t("dashboard.receipts"), value: "\(d.receiptsCount)", sub: locale.t("dashboard.aiProcessed"))
            NBStatTile(label: locale.t("dashboard.biggest"), value: Fmt.amount(d.mostExpensive, currency: d.currency), sub: locale.t("dashboard.largestTxn"))
            NBStatTile(label: locale.t("dashboard.thisWeek"), value: Fmt.amount(d.thisWeekSpent, currency: d.currency), sub: locale.t("dashboard.weeklySpend"))
            NBStatTile(label: locale.t("dashboard.topCategory"), value: d.topCategory, sub: locale.t("dashboard.highestSpend"))
        }
    }

    // MARK: - Wellness score

    @ViewBuilder
    private func wellness(_ d: DashboardDisplay) -> some View {
        if let total = d.wellnessScore {
            VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
                NBSectionHeader(eyebrow: locale.t("dashboard.wellnessEyebrow"), title: locale.t("dashboard.financialScore"))
                HStack(alignment: .top, spacing: Theme.Spacing.md) {
                    VStack(spacing: 2) {
                        Text("\(total)")
                            .font(AppFont.black(34))
                            .foregroundColor(Theme.foreground)
                        Text("/100")
                            .font(AppFont.caption)
                            .foregroundColor(Theme.mutedForeground)
                    }
                    .frame(width: 80, height: 80)
                    .background(Theme.muted)
                    .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.md))
                    .overlay(
                        RoundedRectangle(cornerRadius: Theme.Radius.md)
                            .stroke(Theme.foreground, lineWidth: Theme.Border.width)
                    )

                    VStack(alignment: .leading, spacing: 6) {
                        if let s = d.savingsScore {
                            scoreRow(label: locale.t("dashboard.savings"), score: s, max: 40)
                        }
                        if let b = d.budgetScore {
                            scoreRow(label: locale.t("dashboard.budget"), score: b, max: 40)
                        }
                        if let t = d.trendScore {
                            scoreRow(label: locale.t("dashboard.trend"), score: t, max: 20)
                        }
                    }
                    .frame(maxWidth: .infinity)
                }
                .padding(Theme.Spacing.sm)
                .nbCard(radius: Theme.Radius.md, shadow: Theme.Shadow.sm)
            }
        }
    }

    private func scoreRow(label: String, score: Int, max: Int) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack {
                Text(label)
                    .font(AppFont.caption)
                    .foregroundColor(Theme.mutedForeground)
                Spacer()
                Text("\(score)/\(max)")
                    .font(AppFont.mono(11))
                    .foregroundColor(Theme.foreground)
            }
            NBProgressBar(value: Double(score) / Double(max))
        }
    }

    // MARK: - Category chart (top 5)

    @ViewBuilder
    private func categoryChart(_ d: DashboardDisplay) -> some View {
        if !d.categorySpending.isEmpty {
            VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
                NBSectionHeader(eyebrow: locale.t("dashboard.breakdownEyebrow"), title: locale.t("dashboard.topCategories"))
                Chart(d.categorySpending) { cat in
                    BarMark(
                        x: .value("Amount", cat.total),
                        y: .value("Category", cat.name)
                    )
                    .foregroundStyle(categoryColor(for: cat.colorIndex))
                    .cornerRadius(4)
                }
                .chartXAxis {
                    AxisMarks { _ in
                        AxisValueLabel().foregroundStyle(Theme.mutedForeground)
                    }
                }
                .chartYAxis {
                    AxisMarks(position: .leading) { _ in
                        AxisValueLabel().foregroundStyle(Theme.foreground)
                    }
                }
                .frame(height: max(160, CGFloat(d.categorySpending.count) * 36))
                .padding(Theme.Spacing.sm)
                .nbCard(radius: Theme.Radius.md, shadow: Theme.Shadow.sm)

                VStack(spacing: 4) {
                    ForEach(d.categorySpending) { cat in
                        HStack(spacing: 8) {
                            RoundedRectangle(cornerRadius: 3)
                                .fill(categoryColor(for: cat.colorIndex))
                                .frame(width: 10, height: 10)
                            Text(cat.name)
                                .font(AppFont.body)
                                .foregroundColor(Theme.mutedForeground)
                            Spacer()
                            Text(Fmt.amount(cat.total, currency: d.currency))
                                .font(AppFont.mono(12))
                                .foregroundColor(Theme.foreground)
                        }
                        .padding(.horizontal, 4)
                    }
                }
            }
        }
    }

    // MARK: - Daily stacked-by-category chart (interactive)

    private func dailyTrendChart(_ d: DashboardDisplay) -> some View {
        DailyStackedChartCard(
            display: d,
            colorFor: categoryColor(for:)
        )
    }

    // MARK: - Category mix (share by proportion)

    @ViewBuilder
    private func categoryPieChart(_ d: DashboardDisplay) -> some View {
        if !d.categorySpending.isEmpty {
            VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
                NBSectionHeader(eyebrow: locale.t("dashboard.spendingMixEyebrow"), title: locale.t("dashboard.spendingMixTitle"))
                stackedMixBar(d)
                    .padding(Theme.Spacing.sm)
                    .nbCard(radius: Theme.Radius.md, shadow: Theme.Shadow.sm)
            }
        }
    }

    private func stackedMixBar(_ d: DashboardDisplay) -> some View {
        let total = max(0.0001, d.categorySpending.reduce(0) { $0 + $1.total })
        return VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
            GeometryReader { geo in
                HStack(spacing: 2) {
                    ForEach(d.categorySpending) { cat in
                        categoryColor(for: cat.colorIndex)
                            .frame(width: max(4, geo.size.width * cat.total / total))
                    }
                }
                .clipShape(RoundedRectangle(cornerRadius: 4))
            }
            .frame(height: 32)
            .overlay(
                RoundedRectangle(cornerRadius: 4)
                    .stroke(Theme.foreground.opacity(0.5), lineWidth: Theme.Border.widthThin)
            )
            VStack(spacing: 4) {
                ForEach(d.categorySpending) { cat in
                    HStack(spacing: 8) {
                        RoundedRectangle(cornerRadius: 3)
                            .fill(categoryColor(for: cat.colorIndex))
                            .frame(width: 10, height: 10)
                        Text(cat.name)
                            .font(AppFont.caption)
                            .foregroundColor(Theme.mutedForeground)
                        Spacer()
                        Text(String(format: "%.0f%%", cat.total / total * 100))
                            .font(AppFont.mono(11))
                            .foregroundColor(Theme.foreground)
                    }
                }
            }
        }
    }

    private func categoryColor(for index: Int) -> Color {
        switch index % 6 {
        case 0: return Theme.chart1
        case 1: return Theme.chart2
        case 2: return Theme.chart3
        case 3: return Theme.chart4
        case 4: return Theme.chart5
        default: return Theme.chart6
        }
    }

    // MARK: - Recent expenses

    @ViewBuilder
    private func recentExpenses(_ d: DashboardDisplay) -> some View {
        if !d.recent.isEmpty {
            VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
                NBSectionHeader(
                    eyebrow: locale.t("dashboard.latestEyebrow"),
                    title: locale.t("dashboard.recentActivity"),
                    trailing: AnyView(
                        Button {
                            router.selectedTab = .expenses
                        } label: {
                            Text(locale.t("common.seeAll"))
                                .font(AppFont.mono(11))
                                .tracking(1)
                                .textCase(.uppercase)
                                .foregroundColor(Theme.foreground)
                        }
                    )
                )
                VStack(spacing: Theme.Spacing.xs) {
                    ForEach(d.recent.prefix(8)) { e in
                        NBRow(action: { router.push(.expenseDetail(id: e.id)) }) {
                            HStack(spacing: Theme.Spacing.sm) {
                                NBIconBadge(systemImage: e.iconName)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(e.title)
                                        .font(AppFont.bodyMedium)
                                        .foregroundColor(Theme.foreground)
                                        .lineLimit(1)
                                    HStack(spacing: 4) {
                                        Text(e.subtitle)
                                            .font(AppFont.caption)
                                            .foregroundColor(Theme.mutedForeground)
                                    }
                                }
                                Spacer()
                                Text(Fmt.amount(e.displayAmount, currency: d.currency))
                                    .font(AppFont.mono(14))
                                    .foregroundColor(Theme.foreground)
                            }
                        }
                    }
                }
            }
        }
    }

    // MARK: - Category budgets

    @ViewBuilder
    private func budgetOverview(_ d: DashboardDisplay) -> some View {
        if !d.budgetRows.isEmpty {
            VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
                NBSectionHeader(eyebrow: locale.t("dashboard.budgetEyebrow"), title: locale.t("dashboard.categoryProgress"))
                VStack(spacing: Theme.Spacing.xs) {
                    ForEach(d.budgetRows) { b in
                        VStack(alignment: .leading, spacing: 4) {
                            HStack {
                                Text(b.name)
                                    .font(AppFont.bodyMedium)
                                    .foregroundColor(Theme.foreground)
                                Spacer()
                                Text("\(Fmt.amount(b.spent, currency: d.currency)) / \(Fmt.amount(b.budget, currency: d.currency))")
                                    .font(AppFont.mono(11))
                                    .foregroundColor(Theme.mutedForeground)
                            }
                            NBProgressBar(value: b.pct, over: b.pct > 1)
                        }
                        .padding(Theme.Spacing.sm)
                        .nbCard(radius: Theme.Radius.sm, shadow: Theme.Shadow.sm)
                    }
                }
            }
        }
    }

    // MARK: - AI Insights CTA (bottom of dashboard)

    private func aiInsightsCTA(_ d: DashboardDisplay) -> some View {
        Button {
            router.push(.more(.analysis))
        } label: {
            VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 4) {
                        NBEyebrow(text: locale.t("dashboard.aiInsightsEyebrow"))
                        Text(locale.t("dashboard.aiInsightsTitle"))
                            .font(AppFont.bold(18))
                            .foregroundColor(Theme.foreground)
                            .multilineTextAlignment(.leading)
                    }
                    Spacer()
                    NBIconBadge(systemImage: "sparkles", tint: Theme.info, size: 40)
                }
                Text(locale.t("dashboard.aiInsightsSubtitle"))
                    .font(AppFont.body)
                    .foregroundColor(Theme.mutedForeground)
                    .multilineTextAlignment(.leading)
                HStack(spacing: 6) {
                    Text(locale.t("dashboard.aiInsightsAction"))
                        .font(AppFont.mono(11))
                        .tracking(1)
                        .textCase(.uppercase)
                        .foregroundColor(Theme.foreground)
                    Image(systemName: "arrow.right")
                        .font(.system(size: 11, weight: .bold))
                        .foregroundColor(Theme.foreground)
                }
                .padding(.horizontal, 10)
                .padding(.vertical, 6)
                .background(Theme.muted)
                .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.sm))
                .overlay(
                    RoundedRectangle(cornerRadius: Theme.Radius.sm)
                        .stroke(Theme.foreground, lineWidth: Theme.Border.widthThin)
                )
            }
            .padding(Theme.Spacing.md)
            .frame(maxWidth: .infinity, alignment: .leading)
            .nbCard(radius: Theme.Radius.lg, shadow: Theme.Shadow.lg)
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Progress bar

struct NBProgressBar: View {
    let value: Double
    var over: Bool = false

    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                RoundedRectangle(cornerRadius: 3)
                    .fill(Theme.muted)
                    .frame(height: 10)
                RoundedRectangle(cornerRadius: 3)
                    .fill(over ? Theme.destructive : Theme.foreground)
                    .frame(width: max(0, min(1, value)) * geo.size.width, height: 10)
            }
            .overlay(
                RoundedRectangle(cornerRadius: 3)
                    .stroke(Theme.foreground, lineWidth: Theme.Border.widthThin)
            )
        }
        .frame(height: 10)
    }
}

// MARK: - View Model (aggregation mirrors web client)

@MainActor
final class DashboardViewModel: ObservableObject {
    @Published var display: DashboardDisplay?
    @Published var isLoading = false
    @Published var errorMessage: String?
    /// Total receipts across all time (fetched separately from the
    /// dashboard's 30-day-window count). Lets us show "you have X
    /// receipts in archive" even when the dashboard window is empty.
    @Published var totalReceipts: Int = 0
    /// Total expenses across all time.
    @Published var totalExpenses: Int = 0

    func load(toast: ToastCenter? = nil) async {
        isLoading = true
        if display == nil { errorMessage = nil }
        defer { isLoading = false }
        do {
            #if DEBUG
            print("[Dashboard] Fetching (since=all)…")
            #endif
            let raw = try await DashboardRepo.fetch()

            totalReceipts = raw.receiptsCount
            totalExpenses = raw.expenses.count

            #if DEBUG
            print("[Dashboard] Got \(raw.expenses.count) expenses, \(raw.categories.count) categories, receiptsCount=\(raw.receiptsCount)")
            #endif
            let built = await Task.detached { DashboardDisplay.build(from: raw) }.value
            display = built
            errorMessage = nil
            #if DEBUG
            print("[Dashboard] Display built OK: total=\(built.totalSpent) txns=\(built.totalTransactions)")
            #endif
        } catch {
            #if DEBUG
            print("[Dashboard] load FAILED: \(error)")
            if let api = error as? ApiError, case let .decoding(inner) = api {
                print("[Dashboard] decoding detail: \(inner)")
            }
            #endif
            if display == nil {
                errorMessage = error.localizedDescription
            } else {
                toast?.error(error.localizedDescription)
            }
        }
    }
}

/// Aggregated, display-ready snapshot derived from a raw `DashboardResponse`.
/// Mirrors the `calculatedData` memo in `app/(protected)/dashboard/page.tsx`.
struct DashboardDisplay {
    let currency: String
    let totalSpent: Double
    let totalTransactions: Int
    let avgDaily: Double
    let receiptsCount: Int
    let mostExpensive: Double
    let thisWeekSpent: Double
    let categorySpending: [CatRow]
    let dailySpending: [DayRow]
    /// Per-day × per-category breakdown for up to 90 days back. Rendered by
    /// the interactive stacked bar chart — each slice is one stack segment.
    let dailySlices: [DailySlice]
    /// All expenses converted to the user's currency + expense metadata, so
    /// the interactive chart can surface a "tap a day" detail sheet without
    /// another API round-trip.
    let allExpensesConverted: [ExpenseWithAmount]
    let topCategory: String
    let budgetRows: [BudgetRow]
    let totalBudget: Double
    let budgetRemaining: Double
    let budgetProgress: Double
    let momChange: Int?
    let monthlyForecast: Double?
    let savingsRate: Int?
    let overBudget: [OverBudget]
    let anomalies: [Anomaly]
    let wellnessScore: Int?
    let savingsScore: Int?
    let budgetScore: Int?
    let trendScore: Int?
    let recent: [RecentExpense]
    /// Passed through so the inline Add Expense sheet can populate its category picker
    /// without a second API round-trip.
    let categories: [Category]
    /// Stable category colour assignment so every widget (pie, stacked, daily
    /// chart, legend, day sheet) paints the same category in the same colour.
    let categoryColorIndex: [String: Int]

    struct CatRow: Identifiable {
        let id = UUID()
        let name: String
        let total: Double
        let colorIndex: Int
    }

    struct DayRow: Identifiable {
        let id = UUID()
        let date: Date
        let total: Double
    }

    struct DailySlice: Identifiable, Hashable {
        let id: String  // "yyyy-MM-dd|categoryId"
        let date: Date
        let categoryId: String
        let categoryName: String
        let categoryIcon: String?
        let amount: Double
        let colorIndex: Int
    }

    struct ExpenseWithAmount: Identifiable, Hashable {
        var id: String { expenseId }
        let expenseId: String
        let title: String
        let amount: Double
        let dateString: String
        let date: Date
        let categoryId: String
        let categoryName: String
        let colorIndex: Int
        let iconName: String
    }

    struct BudgetRow: Identifiable {
        let id: String
        let name: String
        let spent: Double
        let budget: Double
        var pct: Double { budget > 0 ? spent / budget : 0 }
    }

    struct OverBudget: Identifiable {
        let id: String
        let name: String
        let spent: Double
        let budget: Double
        let pct: Double
    }

    struct Anomaly {
        let name: String
        let icon: String
        let ratio: Double
    }

    struct RecentExpense: Identifiable {
        let id: String
        let title: String
        let subtitle: String
        let displayAmount: Double
        let iconName: String
    }

    nonisolated static func build(from r: DashboardResponse) -> DashboardDisplay {
        let currency = (r.settings?.currency ?? "PLN").uppercased()
        let catById: [String: Category] = Dictionary(uniqueKeysWithValues: r.categories.map { ($0.id, $0) })
        let budgetByCat: [String: Double] = Dictionary(uniqueKeysWithValues: r.budgets.map { ($0.categoryId, $0.amount.double) })

        let convert: (Expense) -> Double = { e in
            let raw = e.amount.double
            let exp = (e.currency ?? currency).uppercased()
            guard exp != currency, let rate = e.exchangeRate?.double else { return raw }
            return raw * rate
        }

        let convertedNow: [(expense: Expense, converted: Double)] = r.expenses.map { ($0, convert($0)) }
        let totalSpent = convertedNow.reduce(0) { $0 + $1.converted }
        let count = convertedNow.count

        // Compute actual date span for avg daily (not hardcoded 30)
        let avgDaily: Double = {
            guard count > 0 else { return 0 }
            let dates = r.expenses.compactMap { Fmt.parseISO($0.date) }
            guard let earliest = dates.min() else { return totalSpent / 30 }
            let days = max(1, Calendar.current.dateComponents([.day], from: earliest, to: Date()).day ?? 1)
            return totalSpent / Double(days)
        }()
        let mostExpensive = convertedNow.map(\.converted).max() ?? 0

        var spentByCat: [String: Double] = [:]
        for item in convertedNow {
            let key = item.expense.categoryId ?? "__other__"
            spentByCat[key, default: 0] += item.converted
        }

        // Sort all categories by spend descending so colour assignment is
        // stable across widgets (biggest category always gets colour index 0).
        let orderedCatIds: [String] = spentByCat
            .sorted { $0.value > $1.value }
            .map { $0.key }
        var categoryColorIndex: [String: Int] = [:]
        for (i, id) in orderedCatIds.enumerated() {
            categoryColorIndex[id] = i
        }

        let categorySpending: [CatRow] = orderedCatIds
            .prefix(5)
            .map { id -> CatRow in
                let name = id == "__other__" ? "Other" : (catById[id]?.name ?? "Other")
                return CatRow(name: name, total: spentByCat[id] ?? 0, colorIndex: categoryColorIndex[id] ?? 0)
            }

        let topCategory = categorySpending.first?.name ?? "—"

        // Category budgets (only ones with amount > 0), sorted by spent desc.
        let budgetRows: [BudgetRow] = r.categories
            .compactMap { cat -> BudgetRow? in
                guard let budget = budgetByCat[cat.id], budget > 0 else { return nil }
                return BudgetRow(id: cat.id, name: cat.name, spent: spentByCat[cat.id] ?? 0, budget: budget)
            }
            .sorted { $0.spent > $1.spent }

        let totalBudget = budgetByCat.values.reduce(0, +)
        let budgetRemaining = totalBudget - totalSpent
        let budgetProgress = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0

        // Previous period — prefer server-side aggregation, fallback to client-side
        var prevSpentByCat: [String: Double] = r.prevByCategory ?? [:]
        var prevTotal: Double = r.prevTotal ?? 0
        if r.prevTotal == nil, let prevExps = r.prevExpenses {
            for e in prevExps {
                let raw = e.amount.double
                let exp = (e.currency ?? currency).uppercased()
                let converted = (exp != currency && e.exchangeRate != nil) ? raw * (e.exchangeRate?.double ?? 1) : raw
                prevTotal += converted
                prevSpentByCat[e.categoryId ?? "__other__", default: 0] += converted
            }
        }

        let momChange: Int? = prevTotal > 0
            ? Int((((totalSpent - prevTotal) / prevTotal) * 100).rounded())
            : nil

        // Month progress / forecast
        let today = Date()
        let cal = Calendar.current
        let dayOfMonth = cal.component(.day, from: today)
        let range = cal.range(of: .day, in: .month, for: today) ?? (1..<31)
        let daysInMonth = range.count
        let monthProgress = Double(dayOfMonth) / Double(daysInMonth)
        let monthlyForecast: Double? = monthProgress > 0 ? totalSpent / monthProgress : nil

        // This week (Mon-today)
        let weekday = cal.component(.weekday, from: today) // 1=Sun...7=Sat
        // Map to 0=Mon...6=Sun offset
        let daysFromMonday = (weekday + 5) % 7
        let weekStart = cal.date(byAdding: .day, value: -daysFromMonday, to: cal.startOfDay(for: today))!
        let df = DateFormatter()
        df.dateFormat = "yyyy-MM-dd"
        let weekStartStr = df.string(from: weekStart)
        let thisWeekSpent = convertedNow
            .filter { ($0.expense.date) >= weekStartStr }
            .reduce(0) { $0 + $1.converted }

        // Daily spending for last 30 days (fills gaps with zeros) — used by
        // the legacy line widget. The stacked interactive chart uses
        // `dailySlices` (up to 90 days) built right after.
        let todayStart = cal.startOfDay(for: today)
        var totalsByDayStr: [String: Double] = [:]
        for item in convertedNow {
            totalsByDayStr[item.expense.date, default: 0] += item.converted
        }
        let dailySpending: [DayRow] = (0..<30).reversed().compactMap { offset -> DayRow? in
            guard let day = cal.date(byAdding: .day, value: -offset, to: todayStart) else { return nil }
            let dayStr = df.string(from: day)
            return DayRow(date: day, total: totalsByDayStr[dayStr] ?? 0)
        }

        // Build per-day × per-category slices for the interactive chart.
        // Window = 90 days; the view filters down to the picker range (7/14/30/90).
        var slicesByKey: [String: Double] = [:]
        for item in convertedNow {
            let catKey = item.expense.categoryId ?? "__other__"
            let key = "\(item.expense.date)|\(catKey)"
            slicesByKey[key, default: 0] += item.converted
        }
        var dailySlices: [DailySlice] = []
        for offset in (0..<90).reversed() {
            guard let day = cal.date(byAdding: .day, value: -offset, to: todayStart) else { continue }
            let dayStr = df.string(from: day)
            for catId in orderedCatIds {
                let amount = slicesByKey["\(dayStr)|\(catId)"] ?? 0
                guard amount > 0 else { continue }
                let name = catId == "__other__" ? "Other" : (catById[catId]?.name ?? "Other")
                let icon = catId == "__other__" ? nil : catById[catId]?.icon
                dailySlices.append(DailySlice(
                    id: "\(dayStr)|\(catId)",
                    date: day,
                    categoryId: catId,
                    categoryName: name,
                    categoryIcon: icon,
                    amount: amount,
                    colorIndex: categoryColorIndex[catId] ?? 0
                ))
            }
        }

        // Flat per-expense list for the "tap a day" detail sheet.
        let allExpensesConverted: [ExpenseWithAmount] = convertedNow.compactMap { pair -> ExpenseWithAmount? in
            let e = pair.expense
            guard let date = df.date(from: e.date) else { return nil }
            let catKey = e.categoryId ?? "__other__"
            let name = catKey == "__other__" ? "Other" : (catById[catKey]?.name ?? "Other")
            let icon: String
            if e.receiptId != nil { icon = "doc.text.fill" }
            else if e.isRecurring == true { icon = "arrow.triangle.2.circlepath" }
            else { icon = "creditcard.fill" }
            return ExpenseWithAmount(
                expenseId: e.id,
                title: e.title,
                amount: pair.converted,
                dateString: e.date,
                date: date,
                categoryId: catKey,
                categoryName: name,
                colorIndex: categoryColorIndex[catKey] ?? 0,
                iconName: icon
            )
        }

        // Over-budget (≥80%)
        let overBudget: [OverBudget] = r.budgets
            .compactMap { b -> OverBudget? in
                let spent = spentByCat[b.categoryId] ?? 0
                let budget = b.amount.double
                guard budget > 0 else { return nil }
                let pct = spent / budget
                guard pct >= 0.8 else { return nil }
                let name = catById[b.categoryId]?.name ?? "Category"
                return OverBudget(id: b.categoryId, name: name, spent: spent, budget: budget, pct: pct)
            }
            .sorted { $0.pct > $1.pct }
            .prefix(3)
            .map { $0 }

        // Savings rate
        let income = r.monthIncome ?? 0
        let savingsRate: Int? = income > 0
            ? max(0, Int((((income - totalSpent) / income) * 100).rounded()))
            : nil

        // Anomalies — cat where curr > 15 && prev > 0 && curr/prev >= 1.5
        let anomalies: [Anomaly] = r.categories
            .compactMap { cat -> Anomaly? in
                let curr = spentByCat[cat.id] ?? 0
                let prev = prevSpentByCat[cat.id] ?? 0
                guard curr > 15, prev > 0, curr / prev >= 1.5 else { return nil }
                return Anomaly(name: cat.name, icon: cat.icon ?? "📊", ratio: curr / prev)
            }
            .sorted { $0.ratio > $1.ratio }
            .prefix(2)
            .map { $0 }

        // Wellness score — each sub-score is only computed when we have the
        // raw data to back it. If no component can be measured we return
        // `nil` for the aggregate so the UI hides the widget instead of
        // flashing a hardcoded "0/100" / "65/100".
        let savingsSub: Int? = savingsRate.map { rate in
            if rate >= 20 { return 40 }
            if rate >= 10 { return 25 }
            if rate >= 5 { return 15 }
            if rate > 0 { return 8 }
            return 0
        }
        let budgetSub: Int? = r.budgets.isEmpty ? nil : {
            let withinBudget = r.budgets.filter {
                (spentByCat[$0.categoryId] ?? 0) < $0.amount.double
            }.count
            return Int((Double(withinBudget) / Double(r.budgets.count) * 40).rounded())
        }()
        let trendSub: Int? = prevTotal > 0 ? {
            let changePct = (totalSpent - prevTotal) / prevTotal
            if changePct < -0.1 { return 20 }
            if changePct <= 0.1 { return 12 }
            if changePct <= 0.3 { return 6 }
            return 0
        }() : nil
        let wellness: Int? = (savingsSub != nil || budgetSub != nil || trendSub != nil)
            ? min(100, max(0, (savingsSub ?? 0) + (budgetSub ?? 0) + (trendSub ?? 0)))
            : nil

        // Recent expenses — sorted by date desc
        let recent: [RecentExpense] = r.expenses
            .sorted { ($0.date) > ($1.date) }
            .map { e in
                let cat = e.categoryId.flatMap { catById[$0]?.name } ?? "—"
                let icon: String
                if e.receiptId != nil { icon = "doc.text.fill" }
                else if e.isRecurring == true { icon = "arrow.triangle.2.circlepath" }
                else { icon = "creditcard.fill" }
                let sub = "\(Fmt.dayMonth(e.date)) · \(cat)"
                return RecentExpense(
                    id: e.id,
                    title: e.title,
                    subtitle: sub,
                    displayAmount: convert(e),
                    iconName: icon
                )
            }

        return DashboardDisplay(
            currency: currency,
            totalSpent: totalSpent,
            totalTransactions: count,
            avgDaily: avgDaily,
            receiptsCount: r.receiptsCount,
            mostExpensive: mostExpensive,
            thisWeekSpent: thisWeekSpent,
            categorySpending: categorySpending,
            dailySpending: dailySpending,
            dailySlices: dailySlices,
            allExpensesConverted: allExpensesConverted,
            topCategory: topCategory,
            budgetRows: budgetRows,
            totalBudget: totalBudget,
            budgetRemaining: budgetRemaining,
            budgetProgress: budgetProgress,
            momChange: momChange,
            monthlyForecast: monthlyForecast,
            savingsRate: savingsRate,
            overBudget: overBudget,
            anomalies: anomalies,
            wellnessScore: wellness,
            savingsScore: savingsSub,
            budgetScore: budgetSub,
            trendScore: trendSub,
            recent: recent,
            categories: r.categories,
            categoryColorIndex: categoryColorIndex
        )
    }
}
