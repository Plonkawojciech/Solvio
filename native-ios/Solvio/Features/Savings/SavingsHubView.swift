import SwiftUI

/// Planner & deals hub — the last bottom-tab. Was previously a roll-up of
/// goals / budget / challenges / loyalty / deals; Wojtek explicitly asked
/// to drop the goal-tracking parts and refocus this tab on **planning +
/// shopping intelligence**:
///
///   1. **Planner** — month budget plan (income / budget / savings target
///      + alerts + top-spend categories) — useful at-a-glance, edit sheet
///      when the user wants to adjust.
///   2. **Products** — AI price comparison (`/api/prices/compare`) inlined
///      from `PricesView`, since this is now the primary surface for it.
///   3. **Stores** — AI shopping audit (`/api/audit/generate`) inlined
///      from `AuditView` — best stores, top products, current promotions.
///   4. **Deals** — personalised deals from `/api/personal/promotions`,
///      kept 1:1 with the previous version.
///
/// Goals / challenges / loyalty cards are still accessible via the More
/// drawer (`MoreRoute.goals` / `.challenges` / `.loyalty`) — they were not
/// removed from the app, just unhooked from this hub.
struct SavingsHubView: View {
    @EnvironmentObject private var router: AppRouter
    @EnvironmentObject private var toast: ToastCenter
    @EnvironmentObject private var locale: AppLocale
    @EnvironmentObject private var store: AppDataStore
    @StateObject private var vm = SavingsHubViewModel()
    @State private var showBudgetEdit = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Theme.Spacing.md) {
                header
                topKpiStrip
                aiTipBanner
                tabPicker

                SwiftUI.Group {
                    switch vm.activeTab {
                    case .planner: plannerTab
                    case .products: productsTab
                    case .stores: storesTab
                    case .deals: dealsTab
                    }
                }

                Spacer(minLength: Theme.Spacing.xl)
            }
            .padding(.horizontal, Theme.Spacing.md)
            .padding(.top, Theme.Spacing.md)
        }
        .background(Theme.background)
        .refreshable { await vm.loadAll() }
        .task {
            vm.bind(store: store, locale: locale)
            if vm.needsInitialLoad { await vm.loadAll() }
        }
        // Watch for store-side updates so the planner reflects fresh budget
        // / health / promotion payloads as soon as the prefetch lands.
        .onChange(of: store.budgetLoadedAt) { _ in vm.syncFromStore() }
        .onChange(of: store.financialHealthLoadedAt) { _ in vm.syncFromStore() }
        .onChange(of: store.promotionsLoadedAt) { _ in vm.syncFromStore() }
        // Goals are still mirrored even though there's no Goals tab here —
        // the planner uses `monthlyNeeded` from active goals as a sanity
        // check on the user's savings target.
        .onChange(of: store.goals) { _ in vm.syncFromStore() }
        .sheet(isPresented: $showBudgetEdit) {
            BudgetEditSheet(
                month: vm.currentMonth,
                existing: vm.budget?.budget
            ) { body in
                Task {
                    do {
                        _ = try await BudgetRepo.upsert(body)
                        toast.success(locale.t("savings.budgetSaved"))
                        store.didMutateBudget()
                    } catch {
                        toast.error(locale.t("savings.saveFailed"), description: error.localizedDescription)
                    }
                }
            }
            .environmentObject(locale)
        }
    }

    // MARK: - Header

    private var header: some View {
        NBScreenHeader(
            eyebrow: locale.t("savings.eyebrow"),
            title: locale.t("savings.title"),
            subtitle: locale.t("savings.hubSubtitle")
        )
    }

    // MARK: - Top KPI strip (planner-focused)

    /// Four-tile grid:
    ///   - Spent this month / Budget remaining
    ///   - Health score (or savings target) / Potential savings from deals
    private var topKpiStrip: some View {
        LazyVGrid(columns: [
            GridItem(.flexible(), spacing: Theme.Spacing.xs),
            GridItem(.flexible(), spacing: Theme.Spacing.xs),
        ], spacing: Theme.Spacing.xs) {
            NBStatTile(
                label: locale.t("savings.spentThisMonth"),
                value: Fmt.amount(vm.spentThisMonth, currency: vm.currency)
            )
            NBStatTile(
                label: locale.t("savings.budgetRemaining"),
                value: Fmt.amount(vm.budgetRemaining, currency: vm.currency)
            )
            if vm.healthScore != nil {
                healthScoreTile
            } else {
                NBStatTile(
                    label: locale.t("savings.savingsTargetTile"),
                    value: Fmt.amount(vm.savingsTarget, currency: vm.currency)
                )
            }
            NBStatTile(
                label: locale.t("savings.potentialSavingsTile"),
                value: Fmt.amount(vm.potentialDealSavings, currency: vm.currency)
            )
        }
    }

    @ViewBuilder
    private var healthScoreTile: some View {
        if let score = vm.healthScore {
            HStack(spacing: Theme.Spacing.sm) {
                ZStack {
                    Circle()
                        .stroke(Theme.muted, lineWidth: 4)
                        .frame(width: 40, height: 40)
                    Circle()
                        .trim(from: 0, to: CGFloat(min(100, score)) / 100)
                        .stroke(healthColor(for: score), style: StrokeStyle(lineWidth: 4, lineCap: .round))
                        .rotationEffect(.degrees(-90))
                        .frame(width: 40, height: 40)
                    Text("\(score)")
                        .font(AppFont.monoBold(10))
                        .foregroundColor(Theme.foreground)
                }
                VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
                    Text(locale.t("savings.health"))
                        .font(AppFont.mono(10))
                        .tracking(1.2)
                        .foregroundColor(Theme.mutedForeground)
                    Text("\(score)/100")
                        .font(AppFont.bold(18))
                        .foregroundColor(Theme.foreground)
                }
                Spacer(minLength: 0)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(Theme.Spacing.sm)
            .nbCard(radius: Theme.Radius.md, shadow: Theme.Shadow.sm)
        }
    }

    private func healthColor(for score: Int) -> Color {
        if score >= 70 { return Theme.success }
        if score >= 40 { return Theme.warning }
        return Theme.destructive
    }

    // MARK: - AI tip banner

    @ViewBuilder
    private var aiTipBanner: some View {
        if let tip = vm.firstTip {
            HStack(alignment: .top, spacing: Theme.Spacing.sm) {
                NBIconBadge(systemImage: "sparkles", tint: Theme.foreground, background: Theme.muted, size: 32)
                VStack(alignment: .leading, spacing: 2) {
                    Text(locale.t("savings.aiTip"))
                        .font(AppFont.mono(10))
                        .tracking(1.2)
                        .foregroundColor(Theme.mutedForeground)
                    Text(tip)
                        .font(AppFont.body)
                        .foregroundColor(Theme.foreground)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 0)
            }
            .padding(Theme.Spacing.sm)
            .frame(maxWidth: .infinity, alignment: .leading)
            .nbCard(radius: Theme.Radius.md, shadow: Theme.Shadow.sm)
        }
    }

    // MARK: - Tab picker

    private var tabPicker: some View {
        NBSegmented<SavingsHubViewModel.Tab>(
            selection: Binding(
                get: { vm.activeTab },
                set: { vm.activeTab = $0 }
            ),
            options: [
                (.planner, locale.t("savings.segPlanner")),
                (.products, locale.t("savings.segProducts")),
                (.stores, locale.t("savings.segStores")),
                (.deals, locale.t("savings.segDeals")),
            ]
        )
    }

    // MARK: - Planner tab (month budget plan)

    @ViewBuilder
    private var plannerTab: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
            HStack {
                Text(locale.t("savings.plannerTitle"))
                    .font(AppFont.sectionTitle)
                    .foregroundColor(Theme.foreground)
                Spacer()
                Button {
                    showBudgetEdit = true
                } label: {
                    HStack(spacing: 4) {
                        Image(systemName: "pencil")
                        Text(locale.t("savings.edit"))
                    }
                    .font(AppFont.caption)
                }
                .buttonStyle(.plain)
                .foregroundColor(Theme.foreground)
            }

            if vm.isBudgetLoading && vm.budget == nil {
                NBSkeletonHero()
                NBSkeletonList(rows: 3)
            } else if let err = vm.budgetError, vm.budget == nil {
                NBErrorCard(message: err) { Task { await vm.loadBudget(force: true) } }
            } else if let b = vm.budget {
                budgetSummaryCard(b)
                if !b.alerts.isEmpty {
                    alertsSection(alerts: b.alerts)
                }
                if !b.categoryBreakdown.filter({ $0.budgeted > 0 }).isEmpty {
                    topCategoriesSection(rows: b.categoryBreakdown)
                }
            } else {
                NBEmptyState(
                    systemImage: "dollarsign.circle.fill",
                    title: locale.t("savings.emptyPlanner"),
                    subtitle: locale.t("savings.emptyPlannerSub"),
                    action: (label: locale.t("savings.setBudget"), run: { showBudgetEdit = true })
                )
            }
        }
    }

    private func budgetSummaryCard(_ b: BudgetResponse) -> some View {
        let totalBudget = Double(b.budget?.totalBudget ?? "0") ?? 0
        let income = Double(b.budget?.totalIncome ?? "0") ?? 0
        let savingsTarget = Double(b.budget?.savingsTarget ?? "0") ?? 0
        let pct = totalBudget > 0 ? b.totalSpent / totalBudget : 0
        let savingsRate = income > 0 ? min(1, savingsTarget / income) : 0
        // Burn rate vs month progress: if we've spent 60% but the month is
        // only 40% over, we're burning faster than we should — paint amber.
        let burnDelta = pct - b.monthProgress
        let onPaceColor: Color = {
            if burnDelta > 0.10 { return Theme.destructive }
            if burnDelta > 0.0  { return Theme.warning }
            return Theme.success
        }()

        return VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
            LazyVGrid(columns: [
                GridItem(.flexible(), spacing: Theme.Spacing.xs),
                GridItem(.flexible(), spacing: Theme.Spacing.xs),
                GridItem(.flexible(), spacing: Theme.Spacing.xs),
            ], spacing: Theme.Spacing.xs) {
                miniFact(locale.t("savings.income"), Fmt.amount(income, currency: vm.currency))
                miniFact(locale.t("savings.budget"), Fmt.amount(totalBudget, currency: vm.currency))
                miniFact(locale.t("savings.savingsTargetShort"), Fmt.amount(savingsTarget, currency: vm.currency))
            }
            HStack {
                Text(locale.t("savings.spent"))
                    .font(AppFont.caption)
                    .foregroundColor(Theme.mutedForeground)
                Spacer()
                Text("\(Fmt.amount(b.totalSpent, currency: vm.currency)) / \(Fmt.amount(totalBudget, currency: vm.currency))")
                    .font(AppFont.mono(11))
                    .foregroundColor(Theme.mutedForeground)
            }
            if totalBudget > 0 {
                NBProgressBar(value: pct, over: pct > 1)
                HStack {
                    Text(String(format: locale.t("savings.pctUsed"), Int(min(100, pct * 100))))
                        .font(AppFont.mono(11))
                        .foregroundColor(Theme.mutedForeground)
                    Spacer()
                    // Pace indicator — visual signal whether we're burning
                    // through the budget faster than the month is passing.
                    HStack(spacing: 4) {
                        Circle()
                            .fill(onPaceColor)
                            .frame(width: 6, height: 6)
                            .overlay(Circle().stroke(Theme.foreground, lineWidth: 0.5))
                        Text("\(Int(b.monthProgress * 100))% \(locale.t("savings.monthLabelFmt").replacingOccurrences(of: ": %@", with: "").lowercased())")
                            .font(AppFont.mono(11))
                            .foregroundColor(onPaceColor)
                    }
                }
            }
            if income > 0, savingsTarget > 0 {
                Text(String(format: locale.t("budgetSheet.savingsRateFmt"), Int(savingsRate * 100)))
                    .font(AppFont.mono(11))
                    .foregroundColor(savingsRate >= 0.2 ? Theme.success : Theme.mutedForeground)
            }
        }
        .padding(Theme.Spacing.sm)
        .frame(maxWidth: .infinity, alignment: .leading)
        .nbCard(radius: Theme.Radius.md, shadow: Theme.Shadow.sm)
    }

    private func miniFact(_ label: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label.uppercased())
                .font(AppFont.mono(10))
                .tracking(1.2)
                .foregroundColor(Theme.mutedForeground)
            Text(value)
                .font(AppFont.bodyMedium)
                .foregroundColor(Theme.foreground)
        }
    }

    private func alertsSection(alerts: [BudgetAlert]) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
            NBEyebrow(text: locale.t("savings.alerts"))
            ForEach(alerts) { a in
                HStack(alignment: .top, spacing: Theme.Spacing.sm) {
                    Image(systemName: a.type == "critical" ? "exclamationmark.octagon.fill" : "exclamationmark.triangle.fill")
                        .foregroundColor(a.type == "critical" ? Theme.destructive : Theme.warning)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(a.category == "__total__" ? locale.t("savings.totalBudget") : a.category)
                            .font(AppFont.bodyMedium)
                            .foregroundColor(Theme.foreground)
                        Text("\(Fmt.amount(a.spent, currency: vm.currency)) / \(Fmt.amount(a.budgeted, currency: vm.currency)) — \(Int(a.pct * 100))%")
                            .font(AppFont.caption)
                            .foregroundColor(Theme.mutedForeground)
                    }
                    Spacer()
                }
                .padding(Theme.Spacing.sm)
                .frame(maxWidth: .infinity, alignment: .leading)
                .nbCard(radius: Theme.Radius.sm, shadow: Theme.Shadow.sm)
            }
        }
    }

    private func topCategoriesSection(rows: [BudgetCategoryRow]) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
            NBEyebrow(text: locale.t("savings.topCategories"))
            ForEach(Array(rows.filter { $0.budgeted > 0 }.prefix(5))) { row in
                categoryRowView(row)
            }
        }
    }

    private func categoryRowView(_ row: BudgetCategoryRow) -> some View {
        let pct = row.budgeted > 0 ? row.spent / row.budgeted : 0
        return VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(row.name)
                    .font(AppFont.bodyMedium)
                    .foregroundColor(Theme.foreground)
                Spacer()
                Text("\(Fmt.amount(row.spent, currency: vm.currency)) / \(Fmt.amount(row.budgeted, currency: vm.currency))")
                    .font(AppFont.mono(11))
                    .foregroundColor(pct > 1 ? Theme.destructive : Theme.mutedForeground)
            }
            NBProgressBar(value: pct, over: pct > 1)
        }
        .padding(Theme.Spacing.sm)
        .frame(maxWidth: .infinity, alignment: .leading)
        .nbCard(radius: Theme.Radius.sm, shadow: Theme.Shadow.sm)
    }

    // MARK: - Products tab (AI price comparison)

    @ViewBuilder
    private var productsTab: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
            HStack {
                Text(locale.t("savings.productsTitle"))
                    .font(AppFont.sectionTitle)
                    .foregroundColor(Theme.foreground)
                Spacer()
            }
            productsRunCard
            if vm.isPriceLoading && vm.priceResult == nil {
                NBProgressCard(
                    title: locale.t("prices.runningTitle"),
                    stages: [
                        locale.t("progress.preparingRequest"),
                        locale.t("progress.scanningWeb"),
                        locale.t("progress.matchingProducts"),
                        locale.t("progress.almostDone")
                    ],
                    estimatedSeconds: 14
                )
            }
            if let msg = vm.priceError, vm.priceResult == nil {
                NBErrorCard(message: msg) { Task { await vm.loadPriceComparison(force: true) } }
            }
            if let r = vm.priceResult {
                if let topError = r.error, !topError.isEmpty {
                    NBEmptyState(
                        systemImage: "doc.text.magnifyingglass",
                        title: locale.t("prices.emptyTitle"),
                        subtitle: r.message ?? topError,
                        action: nil
                    )
                } else {
                    priceSummaryCard(r)
                    if !r.comparisons.isEmpty {
                        priceComparisonsList(r.comparisons, currency: vm.currency)
                    } else if let msg = r.message, !msg.isEmpty {
                        NBEmptyState(
                            systemImage: "doc.text.magnifyingglass",
                            title: locale.t("prices.emptyTitle"),
                            subtitle: msg,
                            action: nil
                        )
                    }
                }
            }
        }
    }

    private var productsRunCard: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
            Text(locale.t("prices.description"))
                .font(AppFont.body)
                .foregroundColor(Theme.mutedForeground)
                .fixedSize(horizontal: false, vertical: true)
            Button {
                Task { await vm.loadPriceComparison(force: true) }
            } label: {
                HStack {
                    if vm.isPriceLoading { ProgressView().tint(Theme.background) }
                    Text(vm.isPriceLoading
                         ? locale.t("prices.checking")
                         : (vm.priceResult == nil ? locale.t("prices.compare") : locale.t("prices.recompare")))
                }
            }
            .buttonStyle(NBPrimaryButtonStyle())
            .disabled(vm.isPriceLoading)
        }
        .padding(Theme.Spacing.md)
        .frame(maxWidth: .infinity, alignment: .leading)
        .nbCard(radius: Theme.Radius.md, shadow: Theme.Shadow.sm)
    }

    private func priceSummaryCard(_ r: PriceComparisonResponse) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 2) {
                    NBEyebrow(text: locale.t("prices.totalSavings"))
                    Text(locale.t("prices.acrossProducts"))
                        .font(AppFont.caption)
                        .foregroundColor(Theme.mutedForeground)
                }
                Spacer()
                NBIconBadge(systemImage: "sparkles", tint: Theme.success, size: 36)
            }
            Text(Fmt.amount(r.totalPotentialSavings, currency: vm.currency))
                .font(AppFont.hero)
                .foregroundColor(Theme.success)
                .minimumScaleFactor(0.6)
                .lineLimit(1)
            HStack(spacing: Theme.Spacing.xs) {
                if let analyzed = r.productsAnalyzed {
                    NBTag(text: String(format: locale.t("prices.productsCountFmt"), analyzed))
                }
                if r.isEstimated == true {
                    NBTag(
                        text: locale.t("prices.estimated"),
                        background: Theme.warning.opacity(0.15),
                        foreground: Theme.warning
                    )
                }
            }
            if let best = r.bestStoreOverall, !best.isEmpty {
                HStack(spacing: Theme.Spacing.sm) {
                    NBIconBadge(systemImage: "star.fill", tint: Theme.success)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(locale.t("prices.bestStoreOverall"))
                            .font(AppFont.caption)
                            .foregroundColor(Theme.mutedForeground)
                        Text(best)
                            .font(AppFont.bodyMedium)
                            .foregroundColor(Theme.foreground)
                    }
                    Spacer()
                }
            }
            if let summary = r.summary, !summary.isEmpty {
                NBDivider()
                Text(summary)
                    .font(AppFont.body)
                    .foregroundColor(Theme.foreground)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(Theme.Spacing.md)
        .frame(maxWidth: .infinity, alignment: .leading)
        .nbCard(radius: Theme.Radius.lg, shadow: Theme.Shadow.lg)
    }

    private func priceComparisonsList(_ items: [PriceComparison], currency: String) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
            NBSectionHeader(eyebrow: locale.t("prices.productsSection"),
                            title: String(format: locale.t("prices.comparisonsCountFmt"), items.count))
            ForEach(items) { c in
                priceComparisonCard(c, currency: currency)
            }
        }
    }

    private func priceComparisonCard(_ c: PriceComparison, currency: String) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
            HStack(alignment: .top) {
                Text(c.productName)
                    .font(AppFont.bodyMedium)
                    .foregroundColor(Theme.foreground)
                    .lineLimit(2)
                Spacer()
                if c.buyNow == true {
                    NBTag(
                        text: locale.t("prices.buyNow"),
                        background: Theme.success.opacity(0.15),
                        foreground: Theme.success
                    )
                }
            }
            HStack(alignment: .top, spacing: Theme.Spacing.md) {
                if let price = c.userLastPrice {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(locale.t("prices.youPaid"))
                            .font(AppFont.mono(10)).tracking(1)
                            .foregroundColor(Theme.mutedForeground)
                        Text(Fmt.amount(price, currency: currency))
                            .font(AppFont.bodyMedium)
                            .foregroundColor(Theme.foreground)
                        if let store = c.userLastStore, !store.isEmpty {
                            Text(store).font(AppFont.caption).foregroundColor(Theme.mutedForeground)
                        }
                    }
                }
                if let bestPrice = c.bestPrice, let bestStore = c.bestStore {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(locale.t("prices.bestLabel"))
                            .font(AppFont.mono(10)).tracking(1)
                            .foregroundColor(Theme.mutedForeground)
                        Text(Fmt.amount(bestPrice, currency: currency))
                            .font(AppFont.bodyMedium)
                            .foregroundColor(Theme.success)
                        Text(bestStore).font(AppFont.caption).foregroundColor(Theme.success)
                    }
                }
                Spacer(minLength: 0)
            }
            if let savings = c.savingsAmount, savings > 0 {
                HStack(spacing: 6) {
                    NBTag(
                        text: String(format: locale.t("prices.saveFmt"), Fmt.amount(savings, currency: currency)),
                        background: Theme.success.opacity(0.15),
                        foreground: Theme.success
                    )
                    if let pct = c.savingsPercent {
                        NBTag(
                            text: String(format: "%.0f%%", pct),
                            background: Theme.success.opacity(0.15),
                            foreground: Theme.success
                        )
                    }
                }
            }
            if let recommendation = c.recommendation, !recommendation.isEmpty {
                Text(recommendation)
                    .font(AppFont.caption)
                    .foregroundColor(Theme.foreground)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(Theme.Spacing.sm)
        .nbCard(radius: Theme.Radius.md, shadow: Theme.Shadow.sm)
    }

    // MARK: - Stores tab (AI shopping audit)

    @ViewBuilder
    private var storesTab: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
            HStack {
                Text(locale.t("savings.storesTitle"))
                    .font(AppFont.sectionTitle)
                    .foregroundColor(Theme.foreground)
                Spacer()
            }
            storesRunCard
            if vm.isAuditLoading && vm.auditResult == nil {
                NBProgressCard(
                    title: locale.t("audit.runningTitle"),
                    stages: [
                        locale.t("progress.preparingRequest"),
                        locale.t("progress.scanningWeb"),
                        locale.t("progress.matchingProducts"),
                        locale.t("progress.findingDeals"),
                        locale.t("progress.almostDone")
                    ],
                    estimatedSeconds: 18
                )
            }
            if let msg = vm.auditError, vm.auditResult == nil {
                NBErrorCard(message: msg) { Task { await vm.loadAudit(force: true) } }
            }
            if let r = vm.auditResult {
                auditKpiCard(r)
                if !r.aiSummary.isEmpty {
                    auditSummaryCard(r.aiSummary)
                }
                if let best = r.bestStore, !best.isEmpty {
                    auditBestStoreCard(best)
                }
                if let tip = r.topTip, !tip.isEmpty {
                    auditTopTipCard(tip)
                }
                if !r.topStores.isEmpty {
                    auditTopStoresSection(r.topStores, currency: r.currency)
                }
                if !r.topProducts.isEmpty {
                    auditTopProductsSection(r.topProducts, currency: r.currency)
                }
                if let promotions = r.currentPromotions, !promotions.isEmpty {
                    auditPromotionsSection(promotions, currency: r.currency)
                }
            }
        }
    }

    private var storesRunCard: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
            Text(locale.t("audit.description"))
                .font(AppFont.body)
                .foregroundColor(Theme.mutedForeground)
                .fixedSize(horizontal: false, vertical: true)
            Button {
                Task { await vm.loadAudit(force: true) }
            } label: {
                HStack {
                    if vm.isAuditLoading { ProgressView().tint(Theme.background) }
                    Text(vm.isAuditLoading
                         ? locale.t("audit.auditing")
                         : (vm.auditResult == nil ? locale.t("audit.generate") : locale.t("audit.regenerate")))
                }
            }
            .buttonStyle(NBPrimaryButtonStyle())
            .disabled(vm.isAuditLoading)
        }
        .padding(Theme.Spacing.md)
        .frame(maxWidth: .infinity, alignment: .leading)
        .nbCard(radius: Theme.Radius.md, shadow: Theme.Shadow.sm)
    }

    private func auditKpiCard(_ r: AuditResult) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 2) {
                    NBEyebrow(text: locale.t("audit.period"))
                    Text("\(Fmt.date(r.period.from)) – \(Fmt.date(r.period.to))")
                        .font(AppFont.bodyMedium)
                        .foregroundColor(Theme.foreground)
                }
                Spacer()
                NBIconBadge(systemImage: "cart.fill", size: 36)
            }
            Text(Fmt.amount(r.totalSpent, currency: r.currency))
                .font(AppFont.hero)
                .foregroundColor(Theme.foreground)
                .minimumScaleFactor(0.6)
                .lineLimit(1)
            Text(String(format: locale.t("audit.txnsFmt"), r.transactionCount))
                .font(AppFont.caption)
                .foregroundColor(Theme.mutedForeground)
            HStack(spacing: Theme.Spacing.sm) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(locale.t("audit.potentialSavingLabel"))
                        .font(AppFont.mono(10)).tracking(1)
                        .foregroundColor(Theme.mutedForeground)
                    Text(Fmt.amount(r.totalPotentialSaving, currency: r.currency))
                        .font(AppFont.bold(20))
                        .foregroundColor(Theme.success)
                }
                Spacer()
                if r.webSearchUsed == true {
                    NBTag(
                        text: locale.t("audit.webSearchTag"),
                        background: Theme.info.opacity(0.15),
                        foreground: Theme.info
                    )
                }
            }
            .padding(Theme.Spacing.sm)
            .background(Theme.success.opacity(0.08))
            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.md))
            .overlay(
                RoundedRectangle(cornerRadius: Theme.Radius.md)
                    .stroke(Theme.success, lineWidth: Theme.Border.widthThin)
            )
        }
        .padding(Theme.Spacing.md)
        .frame(maxWidth: .infinity, alignment: .leading)
        .nbCard(radius: Theme.Radius.lg, shadow: Theme.Shadow.lg)
    }

    private func auditSummaryCard(_ text: String) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
            NBEyebrow(text: locale.t("audit.aiSummaryEyebrow"))
            Text(text)
                .font(AppFont.body)
                .foregroundColor(Theme.foreground)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(Theme.Spacing.md)
        .nbCard(radius: Theme.Radius.md, shadow: Theme.Shadow.sm)
    }

    private func auditBestStoreCard(_ name: String) -> some View {
        HStack(spacing: Theme.Spacing.sm) {
            NBIconBadge(systemImage: "star.fill", tint: Theme.success)
            VStack(alignment: .leading, spacing: 2) {
                Text(locale.t("audit.bestStoreOverall"))
                    .font(AppFont.caption)
                    .foregroundColor(Theme.mutedForeground)
                Text(name)
                    .font(AppFont.bodyMedium)
                    .foregroundColor(Theme.foreground)
            }
            Spacer()
        }
        .padding(Theme.Spacing.md)
        .frame(maxWidth: .infinity, alignment: .leading)
        .nbCard(radius: Theme.Radius.md, shadow: Theme.Shadow.sm)
    }

    private func auditTopTipCard(_ text: String) -> some View {
        HStack(alignment: .top, spacing: Theme.Spacing.sm) {
            NBIconBadge(systemImage: "lightbulb.fill", tint: Theme.warning)
            Text(text)
                .font(AppFont.body)
                .foregroundColor(Theme.foreground)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 0)
        }
        .padding(Theme.Spacing.md)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.warning.opacity(0.08))
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.md))
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Radius.md)
                .stroke(Theme.warning, lineWidth: Theme.Border.widthThin)
        )
    }

    private func auditTopStoresSection(_ stores: [AuditTopStore], currency: String) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
            NBSectionHeader(eyebrow: locale.t("audit.storesEyebrow"), title: locale.t("audit.topSpendTitle"))
            ForEach(Array(stores.enumerated()), id: \.element.id) { idx, s in
                HStack(spacing: Theme.Spacing.sm) {
                    Text("#\(idx + 1)")
                        .font(AppFont.mono(12))
                        .foregroundColor(Theme.mutedForeground)
                        .frame(width: 28, alignment: .leading)
                    Text(s.store)
                        .font(AppFont.bodyMedium)
                        .foregroundColor(Theme.foreground)
                    Spacer()
                    Text(Fmt.amount(s.amount, currency: currency))
                        .font(AppFont.mono(13))
                        .foregroundColor(Theme.foreground)
                }
                .padding(Theme.Spacing.sm)
                .nbCard(radius: Theme.Radius.sm, shadow: Theme.Shadow.sm)
            }
        }
    }

    private func auditTopProductsSection(_ products: [AuditTopProduct], currency: String) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
            NBSectionHeader(eyebrow: locale.t("audit.productsEyebrow"), title: locale.t("audit.topPurchasedTitle"))
            ForEach(products) { p in
                VStack(alignment: .leading, spacing: 4) {
                    HStack {
                        Text(p.name)
                            .font(AppFont.bodyMedium)
                            .foregroundColor(Theme.foreground)
                            .lineLimit(2)
                        Spacer()
                        Text(Fmt.amount(p.totalPaid, currency: currency))
                            .font(AppFont.mono(12))
                            .foregroundColor(Theme.foreground)
                    }
                    HStack(spacing: 6) {
                        NBTag(text: String(format: locale.t("audit.timesBoughtFmt"), p.count))
                        NBTag(text: String(format: locale.t("audit.avgFmt"), Fmt.amount(p.avgPrice, currency: currency)))
                        if let vendor = p.vendor, !vendor.isEmpty {
                            NBTag(text: vendor)
                        }
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(Theme.Spacing.sm)
                .nbCard(radius: Theme.Radius.sm, shadow: Theme.Shadow.sm)
            }
        }
    }

    private func auditPromotionsSection(_ items: [AuditPromotion], currency: String) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
            NBSectionHeader(eyebrow: locale.t("audit.promotionsEyebrow"), title: locale.t("audit.activeDeals"))
            ForEach(Array(items.enumerated()), id: \.offset) { _, promo in
                VStack(alignment: .leading, spacing: 4) {
                    HStack {
                        if let store = promo.store, !store.isEmpty {
                            Text(store)
                                .font(AppFont.bodyMedium)
                                .foregroundColor(Theme.foreground)
                        }
                        Spacer()
                        if let price = promo.price {
                            Text(Fmt.amount(price, currency: currency))
                                .font(AppFont.mono(12))
                                .foregroundColor(Theme.success)
                        }
                    }
                    if let product = promo.product, !product.isEmpty {
                        Text(product)
                            .font(AppFont.caption)
                            .foregroundColor(Theme.mutedForeground)
                    }
                    if let desc = promo.description, !desc.isEmpty {
                        Text(desc)
                            .font(AppFont.caption)
                            .foregroundColor(Theme.mutedForeground)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    if let valid = promo.validUntil, !valid.isEmpty {
                        Text(String(format: locale.t("audit.validUntilFmt"), Fmt.date(valid)))
                            .font(AppFont.mono(11))
                            .foregroundColor(Theme.mutedForeground)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(Theme.Spacing.sm)
                .nbCard(radius: Theme.Radius.sm, shadow: Theme.Shadow.sm)
            }
        }
    }

    // MARK: - Deals tab (personalised promotions — unchanged from old hub)

    @ViewBuilder
    private var dealsTab: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
            dealsHeader

            if vm.isPromotionsLoading && vm.promotions == nil {
                NBSkeletonList(rows: 4)
            } else if let err = vm.promotionsError, vm.promotions == nil {
                NBErrorCard(message: err) { Task { await vm.loadPromotions(force: true) } }
            } else if let promos = vm.promotions {
                if let potential = promos.totalPotentialSavings, potential > 0 {
                    potentialSavingsTile(potential)
                }
                if !promos.personalizedDeals.isEmpty {
                    NBEyebrow(text: locale.t("savings.personalized"))
                    ForEach(promos.personalizedDeals) { offer in
                        dealCard(offer, personalized: true)
                    }
                }
                if !promos.promotions.isEmpty {
                    NBEyebrow(text: locale.t("savings.allDeals"))
                    ForEach(promos.promotions) { offer in
                        dealCard(offer, personalized: false)
                    }
                }
                if promos.personalizedDeals.isEmpty && promos.promotions.isEmpty {
                    NBEmptyState(
                        systemImage: "tag.fill",
                        title: locale.t("savings.emptyDeals"),
                        subtitle: locale.t("savings.emptyDealsSub")
                    )
                }
                if let summary = promos.weeklySummary {
                    weeklySummaryCard(summary)
                }
            }
        }
    }

    private var dealsHeader: some View {
        HStack {
            Text(locale.t("savings.personalizedDeals"))
                .font(AppFont.sectionTitle)
                .foregroundColor(Theme.foreground)
            Spacer()
            Button {
                Task { await vm.loadPromotions(force: true) }
            } label: {
                HStack(spacing: 4) {
                    Image(systemName: "arrow.clockwise")
                    Text(locale.t("savings.refresh"))
                }
                .font(AppFont.caption)
            }
            .buttonStyle(.plain)
            .foregroundColor(Theme.foreground)
        }
    }

    private func potentialSavingsTile(_ value: Double) -> some View {
        HStack(spacing: Theme.Spacing.sm) {
            NBIconBadge(systemImage: "sparkles", tint: Theme.foreground, background: Theme.muted, size: 36)
            VStack(alignment: .leading, spacing: 2) {
                Text(locale.t("savings.potentialSavings"))
                    .font(AppFont.mono(10))
                    .tracking(1.2)
                    .foregroundColor(Theme.mutedForeground)
                Text(Fmt.amount(value, currency: vm.currency))
                    .font(AppFont.bold(22))
                    .foregroundColor(Theme.success)
            }
            Spacer(minLength: 0)
        }
        .padding(Theme.Spacing.sm)
        .frame(maxWidth: .infinity, alignment: .leading)
        .nbCard(radius: Theme.Radius.md, shadow: Theme.Shadow.sm)
    }

    private func dealCard(_ offer: PromoOffer, personalized: Bool) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(offer.productName ?? offer.store ?? locale.t("savings.offerFallback"))
                    .font(AppFont.bodyMedium)
                    .foregroundColor(Theme.foreground)
                Spacer()
                if personalized || offer.matchesPurchases == true {
                    NBTag(text: locale.t("savings.matchTag"), background: Theme.success.opacity(0.15), foreground: Theme.success)
                }
            }
            if let store = offer.store {
                Text(store)
                    .font(AppFont.caption)
                    .foregroundColor(Theme.mutedForeground)
            }
            HStack(spacing: 8) {
                if let promo = offer.promoPrice {
                    Text(Fmt.amount(promo, currency: offer.currency ?? vm.currency))
                        .font(AppFont.monoBold(16))
                        .foregroundColor(Theme.foreground)
                }
                if let reg = offer.regularPrice, let promo = offer.promoPrice, reg > promo {
                    Text(Fmt.amount(reg, currency: offer.currency ?? vm.currency))
                        .font(AppFont.mono(11))
                        .strikethrough()
                        .foregroundColor(Theme.mutedForeground)
                }
                if let discount = offer.discount {
                    NBTag(text: discount)
                }
                Spacer()
            }
            // Validity row — show "from – until" when both are present
            // (gives the user the full window the deal applies for),
            // fall back to "until X" otherwise. The full range matters
            // because leaflet promotions typically last 7 days; if the
            // user opens the app on day 5 and only sees "until day 7"
            // they don't know the price wasn't already that low for
            // the past 5 days.
            validityLine(for: offer)
            // Link buttons for the official chain leaflet and (when AI
            // provided one) a direct deep-link to the deal page. Tapping
            // either opens the URL in Safari via the system handler.
            if offer.leafletUrl != nil || offer.dealUrl != nil {
                HStack(spacing: 8) {
                    if let leaflet = offer.leafletUrl, let url = URL(string: leaflet) {
                        Link(destination: url) {
                            Label(locale.t("savings.openLeaflet"), systemImage: "newspaper")
                                .font(AppFont.caption)
                                .padding(.horizontal, 10)
                                .padding(.vertical, 6)
                                .background(Theme.accent)
                                .foregroundColor(Theme.foreground)
                                .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.sm))
                        }
                    }
                    if let deal = offer.dealUrl, let url = URL(string: deal) {
                        Link(destination: url) {
                            Label(locale.t("savings.openDeal"), systemImage: "link")
                                .font(AppFont.caption)
                                .padding(.horizontal, 10)
                                .padding(.vertical, 6)
                                .background(Theme.foreground)
                                .foregroundColor(Theme.background)
                                .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.sm))
                        }
                    }
                    Spacer()
                }
                .padding(.top, 4)
            }
        }
        .padding(Theme.Spacing.sm)
        .frame(maxWidth: .infinity, alignment: .leading)
        .nbCard(radius: Theme.Radius.md, shadow: Theme.Shadow.sm)
    }

    /// Renders the deal validity line. Three cases:
    /// - both `validFrom` and `validUntil` → "Promocja: 22 kwi – 28 kwi"
    /// - only `validUntil` → "Ważna do 28 kwi"
    /// - nothing → empty view (still a valid SwiftUI return type)
    @ViewBuilder
    private func validityLine(for offer: PromoOffer) -> some View {
        if let from = offer.validFrom, let until = offer.validUntil {
            Text(String(format: locale.t("savings.validRangeFmt"),
                        Fmt.dayMonth(from),
                        Fmt.dayMonth(until)))
                .font(AppFont.caption)
                .foregroundColor(Theme.mutedForeground)
        } else if let until = offer.validUntil {
            Text(String(format: locale.t("savings.validUntilFmt"), Fmt.dayMonth(until)))
                .font(AppFont.caption)
                .foregroundColor(Theme.mutedForeground)
        }
    }

    private func weeklySummaryCard(_ s: WeeklySummary) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            NBEyebrow(text: locale.t("savings.weeklySummary"))
            if let start = s.weekStart, let end = s.weekEnd {
                Text("\(Fmt.dayMonth(start)) – \(Fmt.dayMonth(end))")
                    .font(AppFont.caption)
                    .foregroundColor(Theme.mutedForeground)
            }
            if let total = s.totalSpent {
                Text(String(format: locale.t("savings.spentFmt"), Fmt.amount(total, currency: vm.currency)))
                    .font(AppFont.bodyMedium)
                    .foregroundColor(Theme.foreground)
            }
            if let summary = s.summary {
                Text(summary)
                    .font(AppFont.body)
                    .foregroundColor(Theme.foreground)
                    .fixedSize(horizontal: false, vertical: true)
            }
            if let top = s.topCategory {
                Text(String(format: locale.t("savings.topCategoryFmt"), top))
                    .font(AppFont.caption)
                    .foregroundColor(Theme.mutedForeground)
            }
        }
        .padding(Theme.Spacing.sm)
        .frame(maxWidth: .infinity, alignment: .leading)
        .nbCard(radius: Theme.Radius.md, shadow: Theme.Shadow.sm)
    }
}

// MARK: - View model

@MainActor
final class SavingsHubViewModel: ObservableObject {
    enum Tab: Hashable { case planner, products, stores, deals }

    @Published var activeTab: Tab = .planner

    weak var store: AppDataStore?
    weak var locale: AppLocale?

    // Goals (mirrored from store; no longer rendered here, but used for
    // the `monthlyNeeded` sanity-check on the planner KPI strip).
    @Published var goals: [SavingsGoal] = []

    // Budget (planner tab)
    @Published var budget: BudgetResponse?
    @Published var isBudgetLoading = false
    @Published var budgetError: String?

    // Financial health (top KPI tile)
    @Published var healthScore: Int?
    @Published var healthTips: [String] = []

    // Promotions (deals tab)
    @Published var promotions: PromotionsResponse?
    @Published var isPromotionsLoading = false
    @Published var promotionsError: String?

    // Price comparison (products tab) — fetched lazily on first tap
    @Published var priceResult: PriceComparisonResponse?
    @Published var isPriceLoading = false
    @Published var priceError: String?

    // Shopping audit (stores tab) — fetched lazily on first tap
    @Published var auditResult: AuditResult?
    @Published var isAuditLoading = false
    @Published var auditError: String?

    @Published private(set) var hasLoadedOnce = false

    var needsInitialLoad: Bool { !hasLoadedOnce }

    var currentMonth: String {
        let df = DateFormatter()
        df.dateFormat = "yyyy-MM"
        return df.string(from: Date())
    }

    /// Currency from settings via the central store; PLN if nothing.
    var currency: String {
        store?.currency ?? "PLN"
    }

    var spentThisMonth: Double {
        budget?.totalSpent ?? 0
    }

    var budgetRemaining: Double {
        let total = Double(budget?.budget?.totalBudget ?? "0") ?? 0
        return max(0, total - spentThisMonth)
    }

    var savingsTarget: Double {
        Double(budget?.budget?.savingsTarget ?? "0") ?? 0
    }

    var potentialDealSavings: Double {
        promotions?.totalPotentialSavings ?? 0
    }

    var firstTip: String? { healthTips.first }

    // MARK: - Loaders

    func bind(store: AppDataStore, locale: AppLocale) {
        self.store = store
        self.locale = locale
        syncFromStore()
    }

    func syncFromStore() {
        guard let store else { return }
        goals = store.goals
        budget = store.budget
        if let h = store.financialHealth {
            healthScore = h.score
            healthTips = h.tips
        }
        promotions = store.promotions

        budgetError = (store.budget == nil ? store.budgetError : nil)
        promotionsError = (store.promotions == nil ? store.promotionsError : nil)

        isBudgetLoading = store.budgetLoading && store.budget == nil
        isPromotionsLoading = store.promotionsLoading && store.promotions == nil
    }

    /// Loads everything every Savings tab needs on first appear.
    ///
    /// Products + Stores hit LLM endpoints (10-25 s on cache miss) so
    /// they used to wait for an explicit user tap. Wojtek wanted them
    /// auto-prefetched: `/api/prices/compare` now caches 24 h and
    /// `/api/audit/generate` caches 6 h, so the first visit eats the
    /// AI call but everything after is instant. We fire all five slices
    /// in parallel — price + audit run in the background while the
    /// user is staring at the planner / deals, so by the time they
    /// switch tabs the data is already there.
    func loadAll() async {
        await withTaskGroup(of: Void.self) { group in
            group.addTask { await self.loadBudget() }
            group.addTask { await self.loadFinancialHealth() }
            group.addTask { await self.loadPromotions() }
            group.addTask { await self.loadPriceComparison() }
            group.addTask { await self.loadAudit() }
        }
        hasLoadedOnce = true
    }

    func loadBudget(force: Bool = false) async {
        guard let store else { return }
        if store.budget == nil { isBudgetLoading = true }
        budgetError = nil
        await store.awaitBudget(force: force)
        syncFromStore()
    }

    func loadFinancialHealth(force: Bool = false) async {
        guard let store else { return }
        await store.awaitFinancialHealth(force: force)
        syncFromStore()
    }

    func loadPromotions(force: Bool = false) async {
        guard let store else { return }
        if store.promotions == nil { isPromotionsLoading = true }
        promotionsError = nil
        await store.awaitPromotions(force: force)
        syncFromStore()
    }

    /// Fetches AI price comparison. Auto-fired from `loadAll()` on tab
    /// entry; refresh button on the Products card calls with `force: true`.
    /// Backend caches 24 h, so cold call after first visit is ~50 ms.
    func loadPriceComparison(force: Bool = false) async {
        if isPriceLoading { return }
        isPriceLoading = true
        priceError = nil
        defer { isPriceLoading = false }
        do {
            let lang = locale?.language.rawValue ?? "pl"
            priceResult = try await PricesRepo.compare(lang: lang, currency: currency, force: force)
        } catch ApiError.cancelled {
            // User left the tab — no toast.
        } catch let api as ApiError {
            // Don't show error if we already have data on screen — user
            // shouldn't see a "couldn't load" banner over content that's
            // visible. Background prefetch failure is silent.
            if priceResult == nil { priceError = friendlyMessage(for: api) }
        } catch {
            if priceResult == nil { priceError = locale?.t("errors.unknown") ?? error.localizedDescription }
        }
    }

    /// Fetches AI shopping audit. Auto-fired from `loadAll()` on tab
    /// entry; refresh button on the Stores card calls with `force: true`.
    /// Backend caches 6 h.
    func loadAudit(force: Bool = false) async {
        if isAuditLoading { return }
        isAuditLoading = true
        auditError = nil
        defer { isAuditLoading = false }
        do {
            let lang = locale?.language.rawValue ?? "pl"
            auditResult = try await AuditRepo.generate(lang: lang, currency: currency, force: force)
        } catch ApiError.cancelled {
            // ignore
        } catch let api as ApiError {
            if auditResult == nil { auditError = friendlyMessage(for: api) }
        } catch {
            if auditResult == nil { auditError = locale?.t("errors.unknown") ?? error.localizedDescription }
        }
    }

    /// Localized fallback for ApiError cases — same mapping as ScanFlow.
    private func friendlyMessage(for error: ApiError) -> String {
        let l = locale
        switch error {
        case .invalidURL: return l?.t("errors.unknown") ?? "Unknown error"
        case .transport: return l?.t("errors.network") ?? "Network error"
        case .decoding: return l?.t("errors.serverUnexpected") ?? "Unexpected server response"
        case .unauthorized: return l?.t("errors.sessionExpired") ?? "Session expired"
        case .forbidden: return l?.t("errors.forbidden") ?? "Forbidden"
        case .notFound: return l?.t("errors.notFound") ?? "Not found"
        case .rateLimited: return l?.t("errors.rateLimited") ?? "Rate limited"
        case .timeout: return l?.t("errors.timeout") ?? "Timed out"
        case .noConnection: return l?.t("errors.network") ?? "No connection"
        case .server(let status, _) where status >= 500: return l?.t("errors.serverDown") ?? "Server down"
        case .server: return l?.t("errors.serverUnexpected") ?? "Server error"
        case .payloadTooLarge: return l?.t("errors.payloadTooLarge") ?? "Too large"
        case .cancelled: return l?.t("errors.cancelled") ?? "Cancelled"
        case .unknown: return l?.t("errors.unknown") ?? "Unknown error"
        }
    }
}

// MARK: - Budget edit sheet

/// Monthly-budget planner with live allocation preview, validation, and
/// quick presets (50/30/20, 70/20/10, 80/20). Sticky currency comes from
/// `AppDataStore.currency` so the preview formatting matches the rest of
/// the app the moment the sheet opens.
struct BudgetEditSheet: View {
    let month: String
    let existing: MonthlyBudget?
    let onSubmit: (BudgetUpsert) -> Void

    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var locale: AppLocale
    @EnvironmentObject private var store: AppDataStore

    @State private var incomeText: String = ""
    @State private var budgetText: String = ""
    @State private var savingsText: String = ""

    /// Sticky currency — read from the central store so the planner preview
    /// uses the same format string as Dashboard / Expenses.
    private var currency: String { store.currency }

    // MARK: - Parsed values + derived state

    private var income: Double { parse(incomeText) }
    private var totalBudget: Double { parse(budgetText) }
    private var savingsTarget: Double { parse(savingsText) }

    private var allocated: Double { totalBudget + savingsTarget }
    private var unallocated: Double { max(0, income - allocated) }
    private var overflow: Double { max(0, allocated - income) }
    private var savingsRate: Double {
        guard income > 0 else { return 0 }
        return min(1, savingsTarget / income)
    }

    private var hasNegative: Bool {
        income < 0 || totalBudget < 0 || savingsTarget < 0
    }

    private var canSave: Bool {
        !hasNegative && (income > 0 || totalBudget > 0 || savingsTarget > 0)
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: Theme.Spacing.md) {
                    intro
                    inputs
                    presets
                    livePreview
                    warnings
                    Spacer(minLength: Theme.Spacing.lg)
                }
                .padding(Theme.Spacing.md)
            }
            .background(Theme.background)
            .navigationTitle(locale.t("budgetSheet.title"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(locale.t("common.cancel")) { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(locale.t("common.save")) { commit() }
                        .disabled(!canSave)
                }
            }
            .onAppear(perform: hydrateFromExisting)
            .animation(.spring(response: 0.35, dampingFraction: 0.85), value: allocated)
        }
    }

    // MARK: - Sections

    private var intro: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(String(format: locale.t("savings.monthLabelFmt"), month))
                .font(AppFont.mono(11))
                .tracking(0.5)
                .textCase(.uppercase)
                .foregroundColor(Theme.mutedForeground)
            Text(locale.t("budgetSheet.intro"))
                .font(AppFont.caption)
                .foregroundColor(Theme.mutedForeground)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private var inputs: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
            field(
                label: locale.t("savings.monthlyIncome"),
                text: $incomeText,
                hint: locale.t("budgetSheet.incomeHint"),
                share: nil // income is the denominator, no share line
            )
            field(
                label: locale.t("savings.totalBudget"),
                text: $budgetText,
                hint: locale.t("budgetSheet.budgetHint"),
                share: shareOfIncome(totalBudget)
            )
            field(
                label: locale.t("savings.savingsTarget"),
                text: $savingsText,
                hint: locale.t("budgetSheet.savingsHint"),
                share: shareOfIncome(savingsTarget)
            )
        }
    }

    private func field(
        label: String,
        text: Binding<String>,
        hint: String,
        share: Int?
    ) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(label.uppercased())
                    .font(AppFont.mono(10))
                    .tracking(1.2)
                    .foregroundColor(Theme.mutedForeground)
                Spacer()
                if let pct = share {
                    Text("\(pct)% \(locale.t("budgetSheet.allocPreviewLabel").lowercased())")
                        .font(AppFont.mono(10))
                        .foregroundColor(pct > 100 ? Theme.destructive : Theme.mutedForeground)
                }
            }
            HStack(spacing: 8) {
                TextField("0.00", text: text)
                    .keyboardType(.decimalPad)
                    .font(AppFont.bold(20))
                    .foregroundColor(Theme.foreground)
                Text(currency)
                    .font(AppFont.mono(12))
                    .foregroundColor(Theme.mutedForeground)
            }
            .padding(.horizontal, Theme.Spacing.md)
            .frame(height: 52)
            .background(Theme.card)
            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.md))
            .overlay(
                RoundedRectangle(cornerRadius: Theme.Radius.md)
                    .stroke(Theme.foreground, lineWidth: Theme.Border.widthThin)
            )
            Text(hint)
                .font(AppFont.caption)
                .foregroundColor(Theme.mutedForeground)
        }
    }

    private var presets: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
            HStack {
                NBEyebrow(text: locale.t("budgetSheet.applyPreset"))
                Spacer()
                if existing == nil, hasLastMonthValues {
                    Button {
                        copyLastMonth()
                    } label: {
                        Label(locale.t("budgetSheet.copyLastMonth"), systemImage: "arrow.uturn.backward")
                            .font(AppFont.mono(10))
                            .foregroundColor(Theme.foreground)
                    }
                    .buttonStyle(.plain)
                }
            }
            VStack(spacing: Theme.Spacing.xs) {
                presetRow(
                    title: locale.t("budgetSheet.preset50_30_20"),
                    subtitle: locale.t("budgetSheet.preset50_30_20Desc"),
                    budgetShare: 0.80, // 50% needs + 30% wants → spend
                    savingsShare: 0.20
                )
                presetRow(
                    title: locale.t("budgetSheet.preset70_20_10"),
                    subtitle: locale.t("budgetSheet.preset70_20_10Desc"),
                    budgetShare: 0.70,
                    savingsShare: 0.30 // 20% save + 10% invest both go to savings
                )
                presetRow(
                    title: locale.t("budgetSheet.preset80_20"),
                    subtitle: locale.t("budgetSheet.preset80_20Desc"),
                    budgetShare: 0.80,
                    savingsShare: 0.20
                )
            }
        }
    }

    private func presetRow(
        title: String,
        subtitle: String,
        budgetShare: Double,
        savingsShare: Double
    ) -> some View {
        Button {
            applyPreset(budgetShare: budgetShare, savingsShare: savingsShare)
        } label: {
            HStack(alignment: .center, spacing: Theme.Spacing.sm) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(title)
                        .font(AppFont.bodyMedium)
                        .foregroundColor(Theme.foreground)
                    Text(subtitle)
                        .font(AppFont.caption)
                        .foregroundColor(Theme.mutedForeground)
                        .lineLimit(2)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer()
                Image(systemName: "arrow.right")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundColor(Theme.foreground)
            }
            .padding(Theme.Spacing.sm)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Theme.card)
            .overlay(
                RoundedRectangle(cornerRadius: Theme.Radius.sm)
                    .stroke(Theme.foreground, lineWidth: Theme.Border.widthThin)
            )
            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.sm))
            .opacity(income > 0 ? 1.0 : 0.5)
        }
        .buttonStyle(.plain)
        .disabled(income <= 0)
    }

    private var livePreview: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
            NBEyebrow(text: locale.t("savings.monthOverview"))
            HStack(alignment: .center, spacing: Theme.Spacing.sm) {
                allocationBar
            }
            HStack(spacing: Theme.Spacing.md) {
                legend(label: locale.t("savings.budget"), value: totalBudget, color: Theme.foreground)
                legend(label: locale.t("savings.savingsTargetShort"), value: savingsTarget, color: Theme.success)
                if overflow == 0 {
                    legend(label: locale.t("budgetSheet.unallocated"), value: unallocated, color: Theme.mutedForeground)
                } else {
                    legend(label: locale.t("budgetSheet.over"), value: overflow, color: Theme.destructive)
                }
            }
            if income > 0 {
                Text(String(format: locale.t("budgetSheet.savingsRateFmt"), Int(savingsRate * 100)))
                    .font(AppFont.mono(11))
                    .foregroundColor(savingsRate >= 0.2 ? Theme.success : Theme.mutedForeground)
            }
        }
        .padding(Theme.Spacing.sm)
        .frame(maxWidth: .infinity, alignment: .leading)
        .nbCard(radius: Theme.Radius.md, shadow: Theme.Shadow.sm)
    }

    /// Stacked horizontal bar — budget (foreground) + savings (success) +
    /// remainder (muted) when income > 0. When allocations exceed income
    /// we paint the overflow in destructive red instead of remainder.
    private var allocationBar: some View {
        GeometryReader { geo in
            let total = max(income, allocated, 1)
            let budgetW = CGFloat(totalBudget / total) * geo.size.width
            let savingsW = CGFloat(savingsTarget / total) * geo.size.width
            let remW = max(0, geo.size.width - budgetW - savingsW)
            HStack(spacing: 0) {
                Rectangle()
                    .fill(Theme.foreground)
                    .frame(width: budgetW)
                Rectangle()
                    .fill(Theme.success)
                    .frame(width: savingsW)
                Rectangle()
                    .fill(overflow > 0 ? Theme.destructive : Theme.muted)
                    .frame(width: remW)
            }
        }
        .frame(height: 14)
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.sm))
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Radius.sm)
                .stroke(Theme.foreground, lineWidth: Theme.Border.widthThin)
        )
    }

    private func legend(label: String, value: Double, color: Color) -> some View {
        HStack(spacing: 4) {
            Circle()
                .fill(color)
                .frame(width: 8, height: 8)
                .overlay(Circle().stroke(Theme.foreground, lineWidth: 0.5))
            VStack(alignment: .leading, spacing: 0) {
                Text(label.uppercased())
                    .font(AppFont.mono(9))
                    .tracking(0.8)
                    .foregroundColor(Theme.mutedForeground)
                Text(Fmt.amount(value, currency: currency))
                    .font(AppFont.mono(11))
                    .foregroundColor(Theme.foreground)
            }
        }
    }

    @ViewBuilder
    private var warnings: some View {
        if hasNegative {
            warningCard(text: locale.t("budgetSheet.warnNegative"), kind: .error)
        }
        if overflow > 0 {
            warningCard(
                text: String(format: locale.t("budgetSheet.warnExceeds"), Fmt.amount(overflow, currency: currency)),
                kind: .warn
            )
        }
        if income <= 0 && (totalBudget > 0 || savingsTarget > 0) {
            warningCard(text: locale.t("budgetSheet.warnNoIncome"), kind: .info)
        }
    }

    private enum WarnKind { case error, warn, info }

    private func warningCard(text: String, kind: WarnKind) -> some View {
        let (icon, tint): (String, Color) = {
            switch kind {
            case .error: return ("exclamationmark.octagon.fill", Theme.destructive)
            case .warn:  return ("exclamationmark.triangle.fill", Theme.warning)
            case .info:  return ("info.circle.fill", Theme.info)
            }
        }()
        return HStack(alignment: .top, spacing: Theme.Spacing.sm) {
            Image(systemName: icon).foregroundColor(tint)
            Text(text)
                .font(AppFont.caption)
                .foregroundColor(Theme.foreground)
                .fixedSize(horizontal: false, vertical: true)
            Spacer()
        }
        .padding(Theme.Spacing.sm)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(tint.opacity(0.08))
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Radius.sm)
                .stroke(tint, lineWidth: Theme.Border.widthThin)
        )
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.sm))
    }

    // MARK: - Helpers

    private func parse(_ text: String) -> Double {
        Double(text.replacingOccurrences(of: ",", with: ".")) ?? 0
    }

    private func format(_ value: Double) -> String {
        if value == value.rounded() {
            return String(format: "%.0f", value)
        }
        return String(format: "%.2f", value)
    }

    private func shareOfIncome(_ value: Double) -> Int? {
        guard income > 0, value > 0 else { return nil }
        return Int((value / income) * 100)
    }

    private func applyPreset(budgetShare: Double, savingsShare: Double) {
        guard income > 0 else { return }
        budgetText = format(income * budgetShare)
        savingsText = format(income * savingsShare)
    }

    private var hasLastMonthValues: Bool {
        // Quick proxy — the main view passed in `existing` for THIS month;
        // if no existing record + the dashboard has prevTotal data, the
        // user has at least one previous month's worth of activity.
        existing == nil && (store.dashboard?.prevTotal ?? 0) > 0
    }

    private func copyLastMonth() {
        // We don't yet have a per-month budget history endpoint — fall
        // back to using prevTotal as a budget seed when the user hasn't
        // set anything for this month yet.
        let prev = store.dashboard?.prevTotal ?? 0
        guard prev > 0 else { return }
        budgetText = format(prev)
        // Default 20% savings seed so the planner shows a balanced split.
        if income > 0 {
            savingsText = format(income * 0.20)
        }
    }

    private func hydrateFromExisting() {
        if let e = existing {
            incomeText = e.totalIncome ?? ""
            budgetText = e.totalBudget ?? ""
            savingsText = e.savingsTarget ?? ""
        }
    }

    private func commit() {
        guard canSave else { return }
        let body = BudgetUpsert(
            month: month,
            totalIncome: income > 0 ? income : nil,
            totalBudget: totalBudget > 0 ? totalBudget : nil,
            savingsTarget: savingsTarget > 0 ? savingsTarget : nil
        )
        onSubmit(body)
        dismiss()
    }
}
