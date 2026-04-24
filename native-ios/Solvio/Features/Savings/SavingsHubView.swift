import SwiftUI

/// Savings hub — mirrors `/app/(protected)/savings/client-page.tsx`.
/// Four tabs: Goals · Budget · Challenges · Deals.
///
/// Aggregates data from 5 endpoints in parallel (goals, budget,
/// financial-health, challenges, promotions). Each section degrades
/// gracefully on per-tab failure — the hub is summary-only, so
/// partial data is better than a full error.
struct SavingsHubView: View {
    @EnvironmentObject private var router: AppRouter
    @EnvironmentObject private var toast: ToastCenter
    @EnvironmentObject private var locale: AppLocale
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
                    case .goals: goalsTab
                    case .budget: budgetTab
                    case .challenges: challengesTab
                    case .loyalty: loyaltyTab
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
        .task { if vm.needsInitialLoad { await vm.loadAll() } }
        .sheet(isPresented: $showBudgetEdit) {
            BudgetEditSheet(
                month: vm.currentMonth,
                existing: vm.budget?.budget
            ) { body in
                Task {
                    do {
                        _ = try await BudgetRepo.upsert(body)
                        toast.success(locale.t("savings.budgetSaved"))
                        await vm.loadBudget()
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

    // MARK: - Top KPI strip (4 tiles)

    private var topKpiStrip: some View {
        LazyVGrid(columns: [
            GridItem(.flexible(), spacing: Theme.Spacing.xs),
            GridItem(.flexible(), spacing: Theme.Spacing.xs),
        ], spacing: Theme.Spacing.xs) {
            NBStatTile(
                label: locale.t("savings.totalSaved"),
                value: Fmt.amount(vm.totalSaved, currency: vm.currency)
            )
            if vm.healthScore != nil {
                healthScoreTile
            }
            NBStatTile(
                label: locale.t("savings.activeGoals"),
                value: "\(vm.activeGoals.count)"
            )
            NBStatTile(
                label: locale.t("savings.monthlyNeeded"),
                value: Fmt.amount(vm.monthlyNeeded, currency: vm.currency)
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
                (.goals, locale.t("savings.segGoals")),
                (.budget, locale.t("savings.segBudget")),
                (.challenges, locale.t("savings.segChallenges")),
                (.loyalty, locale.t("savings.segLoyalty")),
                (.deals, locale.t("savings.segDeals")),
            ]
        )
    }

    // MARK: - Goals tab

    @ViewBuilder
    private var goalsTab: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
            HStack {
                Text(locale.t("savings.sectionGoals"))
                    .font(AppFont.sectionTitle)
                    .foregroundColor(Theme.foreground)
                Spacer()
                Button {
                    router.push(.more(.goals))
                } label: {
                    HStack(spacing: 4) {
                        Text(locale.t("savings.seeAll"))
                        Image(systemName: "arrow.right")
                    }
                    .font(AppFont.caption)
                }
                .buttonStyle(.plain)
                .foregroundColor(Theme.foreground)
            }

            if vm.isGoalsLoading && vm.goals.isEmpty {
                NBLoadingCard()
            } else if let err = vm.goalsError {
                NBErrorCard(message: err) { Task { await vm.loadGoals() } }
            } else if vm.activeGoals.isEmpty {
                NBEmptyState(
                    systemImage: "target",
                    title: locale.t("savings.emptyGoals"),
                    subtitle: locale.t("savings.emptyGoalsSub"),
                    action: (label: locale.t("savings.seeGoals"), run: { router.push(.more(.goals)) })
                )
            } else {
                goalsKpiRow
                ForEach(vm.activeGoals.prefix(3)) { g in
                    Button {
                        router.push(.goalDetail(id: g.id))
                    } label: {
                        goalCard(g)
                    }
                    .buttonStyle(.plain)
                }
                if vm.activeGoals.count > 3 {
                    Button {
                        router.push(.more(.goals))
                    } label: {
                        HStack {
                            Text(String(format: locale.t("savings.seeAllGoalsFmt"), vm.activeGoals.count))
                                .font(AppFont.bodyMedium)
                            Spacer()
                            Image(systemName: "arrow.right")
                        }
                        .padding(Theme.Spacing.sm)
                        .frame(maxWidth: .infinity)
                        .foregroundColor(Theme.foreground)
                        .nbCard(radius: Theme.Radius.md, shadow: Theme.Shadow.sm)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private var goalsKpiRow: some View {
        LazyVGrid(columns: [
            GridItem(.flexible(), spacing: Theme.Spacing.xs),
            GridItem(.flexible(), spacing: Theme.Spacing.xs),
            GridItem(.flexible(), spacing: Theme.Spacing.xs),
            GridItem(.flexible(), spacing: Theme.Spacing.xs),
        ], spacing: Theme.Spacing.xs) {
            NBStatTile(label: locale.t("goals.statSaved"), value: Fmt.amount(vm.totalSaved, currency: vm.currency))
            NBStatTile(label: locale.t("savings.statActive"), value: "\(vm.activeGoals.count)")
            NBStatTile(label: locale.t("savings.statPerMonth"), value: Fmt.amount(vm.monthlyNeeded, currency: vm.currency))
            NBStatTile(label: locale.t("savings.statDone"), value: "\(vm.completedGoalsCount)")
        }
    }

    private func goalCard(_ g: SavingsGoal) -> some View {
        let pct = g.targetAmount.double > 0 ? g.currentAmount.double / g.targetAmount.double : 0
        return HStack(alignment: .top, spacing: Theme.Spacing.sm) {
            Text(g.emoji ?? "🎯")
                .font(.system(size: 28))
                .frame(width: 44, height: 44)
                .background(Theme.muted)
                .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.sm))
                .overlay(
                    RoundedRectangle(cornerRadius: Theme.Radius.sm)
                        .stroke(Theme.foreground, lineWidth: Theme.Border.widthThin)
                )
            VStack(alignment: .leading, spacing: 6) {
                HStack {
                    Text(g.name)
                        .font(AppFont.bodyMedium)
                        .foregroundColor(Theme.foreground)
                    Spacer()
                    Text("\(Int(min(100, pct * 100)))%")
                        .font(AppFont.mono(11))
                        .foregroundColor(Theme.mutedForeground)
                }
                NBProgressBar(value: pct)
                Text("\(Fmt.amount(g.currentAmount, currency: g.currency)) / \(Fmt.amount(g.targetAmount, currency: g.currency))")
                    .font(AppFont.caption)
                    .foregroundColor(Theme.mutedForeground)
            }
        }
        .padding(Theme.Spacing.sm)
        .frame(maxWidth: .infinity, alignment: .leading)
        .nbCard(radius: Theme.Radius.md, shadow: Theme.Shadow.sm)
    }

    // MARK: - Budget tab

    @ViewBuilder
    private var budgetTab: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
            HStack {
                Text(locale.t("savings.monthOverview"))
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
                NBLoadingCard()
            } else if let err = vm.budgetError {
                NBErrorCard(message: err) { Task { await vm.loadBudget() } }
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
                    title: locale.t("savings.emptyBudget"),
                    subtitle: locale.t("savings.emptyBudgetSub"),
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

        return VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
            LazyVGrid(columns: [
                GridItem(.flexible(), spacing: Theme.Spacing.xs),
                GridItem(.flexible(), spacing: Theme.Spacing.xs),
                GridItem(.flexible(), spacing: Theme.Spacing.xs),
            ], spacing: Theme.Spacing.xs) {
                miniFact(locale.t("savings.income"), Fmt.amount(income, currency: vm.currency))
                miniFact(locale.t("savings.budget"), Fmt.amount(totalBudget, currency: vm.currency))
                miniFact(locale.t("goals.statSaved"), Fmt.amount(savingsTarget, currency: vm.currency))
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
                Text(String(format: locale.t("savings.pctUsed"), Int(min(100, pct * 100))))
                    .font(AppFont.mono(11))
                    .foregroundColor(Theme.mutedForeground)
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

    // MARK: - Challenges tab

    @ViewBuilder
    private var challengesTab: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
            HStack {
                Text(locale.t("savings.activeChallenges"))
                    .font(AppFont.sectionTitle)
                    .foregroundColor(Theme.foreground)
                Spacer()
                Button {
                    router.push(.more(.challenges))
                } label: {
                    HStack(spacing: 4) {
                        Text(locale.t("savings.seeAll"))
                        Image(systemName: "arrow.right")
                    }
                    .font(AppFont.caption)
                }
                .buttonStyle(.plain)
                .foregroundColor(Theme.foreground)
            }

            if vm.isChallengesLoading && vm.challenges.isEmpty {
                NBLoadingCard()
            } else if let err = vm.challengesError {
                NBErrorCard(message: err) { Task { await vm.loadChallenges() } }
            } else if vm.activeChallenges.isEmpty {
                NBEmptyState(
                    systemImage: "trophy.fill",
                    title: locale.t("savings.emptyChallenges"),
                    subtitle: locale.t("savings.emptyChallengesSub"),
                    action: (label: locale.t("savings.newChallenge"), run: { router.push(.more(.challenges)) })
                )
            } else {
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 160), spacing: Theme.Spacing.xs)], spacing: Theme.Spacing.xs) {
                    ForEach(vm.activeChallenges.prefix(4)) { c in
                        challengeMiniCard(c)
                    }
                }
            }
        }
    }

    private func challengeMiniCard(_ c: Challenge) -> some View {
        let target = c.targetAmount?.double ?? 0
        let progress = c.currentProgress?.double ?? 0
        let pct = target > 0 ? progress / target : 0
        let daysLeft = Self.daysUntil(c.endDate)

        return VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(c.emoji ?? "💪").font(.title3)
                Text(c.name)
                    .font(AppFont.bodyMedium)
                    .foregroundColor(Theme.foreground)
                    .lineLimit(1)
                Spacer(minLength: 0)
            }
            NBProgressBar(value: pct, over: pct > 1)
            HStack {
                if target > 0 {
                    Text("\(Int(min(100, pct * 100)))%")
                        .font(AppFont.mono(10))
                        .foregroundColor(Theme.mutedForeground)
                }
                Spacer()
                if let d = daysLeft {
                    Text(String(format: locale.t("savings.daysLeftShortFmt"), d))
                        .font(AppFont.mono(10))
                        .foregroundColor(Theme.mutedForeground)
                }
            }
        }
        .padding(Theme.Spacing.sm)
        .frame(maxWidth: .infinity, alignment: .leading)
        .nbCard(radius: Theme.Radius.md, shadow: Theme.Shadow.sm)
    }

    private static func daysUntil(_ iso: String?) -> Int? {
        guard let iso else { return nil }
        let df = DateFormatter()
        df.dateFormat = "yyyy-MM-dd"
        guard let target = df.date(from: String(iso.prefix(10))) else { return nil }
        let days = Calendar.current.dateComponents([.day], from: Date(), to: target).day ?? 0
        return max(0, days)
    }

    // MARK: - Loyalty tab

    @ViewBuilder
    private var loyaltyTab: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
            HStack {
                Text(locale.t("savings.loyaltyTitle"))
                    .font(AppFont.sectionTitle)
                    .foregroundColor(Theme.foreground)
                Spacer()
                Button {
                    router.push(.more(.loyalty))
                } label: {
                    HStack(spacing: 4) {
                        Text(locale.t("savings.seeAll"))
                        Image(systemName: "arrow.right")
                    }
                    .font(AppFont.caption)
                }
                .buttonStyle(.plain)
                .foregroundColor(Theme.foreground)
            }

            if vm.isLoyaltyLoading && vm.loyaltyCards.isEmpty {
                NBLoadingCard()
            } else if let err = vm.loyaltyError {
                NBErrorCard(message: err) { Task { await vm.loadLoyalty() } }
            } else if vm.loyaltyCards.isEmpty {
                NBEmptyState(
                    systemImage: "creditcard.fill",
                    title: locale.t("savings.emptyLoyalty"),
                    subtitle: locale.t("savings.emptyLoyaltySub"),
                    action: (label: locale.t("savings.addLoyalty"), run: { router.push(.more(.loyalty)) })
                )
            } else {
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 160), spacing: Theme.Spacing.xs)], spacing: Theme.Spacing.xs) {
                    ForEach(vm.loyaltyCards.prefix(6)) { card in
                        loyaltyMiniCard(card)
                    }
                }
            }
        }
    }

    private func loyaltyMiniCard(_ card: LoyaltyCard) -> some View {
        Button {
            router.push(.more(.loyalty))
        } label: {
            VStack(alignment: .leading, spacing: 6) {
                HStack {
                    Image(systemName: "creditcard.fill")
                        .foregroundColor(Theme.foreground)
                    Text(card.store)
                        .font(AppFont.bodyMedium)
                        .foregroundColor(Theme.foreground)
                        .lineLimit(1)
                    Spacer(minLength: 0)
                }
                if let num = card.cardNumber, !num.isEmpty {
                    Text(num)
                        .font(AppFont.mono(11))
                        .foregroundColor(Theme.mutedForeground)
                        .lineLimit(1)
                }
                if let member = card.memberName, !member.isEmpty {
                    Text(member)
                        .font(AppFont.caption)
                        .foregroundColor(Theme.mutedForeground)
                        .lineLimit(1)
                }
            }
            .padding(Theme.Spacing.sm)
            .frame(maxWidth: .infinity, alignment: .leading)
            .nbCard(radius: Theme.Radius.md, shadow: Theme.Shadow.sm)
        }
        .buttonStyle(.plain)
    }

    // MARK: - Deals tab

    @ViewBuilder
    private var dealsTab: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
            dealsHeader

            if vm.isPromotionsLoading && vm.promotions == nil {
                NBLoadingCard()
            } else if let err = vm.promotionsError {
                NBErrorCard(message: err) { Task { await vm.loadPromotions() } }
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
                Task { await vm.loadPromotions() }
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
            if let until = offer.validUntil {
                Text(String(format: locale.t("savings.validUntilFmt"), Fmt.dayMonth(until)))
                    .font(AppFont.caption)
                    .foregroundColor(Theme.mutedForeground)
            }
        }
        .padding(Theme.Spacing.sm)
        .frame(maxWidth: .infinity, alignment: .leading)
        .nbCard(radius: Theme.Radius.md, shadow: Theme.Shadow.sm)
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
    enum Tab: Hashable { case goals, budget, challenges, loyalty, deals }

    @Published var activeTab: Tab = .goals

    // Goals
    @Published var goals: [SavingsGoal] = []
    @Published var isGoalsLoading = false
    @Published var goalsError: String?

    // Budget
    @Published var budget: BudgetResponse?
    @Published var isBudgetLoading = false
    @Published var budgetError: String?

    // Financial health
    @Published var healthScore: Int?
    @Published var healthTips: [String] = []

    // Challenges
    @Published var challenges: [Challenge] = []
    @Published var isChallengesLoading = false
    @Published var challengesError: String?

    // Loyalty
    @Published var loyaltyCards: [LoyaltyCard] = []
    @Published var isLoyaltyLoading = false
    @Published var loyaltyError: String?

    // Promotions
    @Published var promotions: PromotionsResponse?
    @Published var isPromotionsLoading = false
    @Published var promotionsError: String?

    @Published private(set) var hasLoadedOnce = false

    var needsInitialLoad: Bool { !hasLoadedOnce }

    /// Current month in `YYYY-MM` format — used for both budget fetch and upsert.
    var currentMonth: String {
        let df = DateFormatter()
        df.dateFormat = "yyyy-MM"
        return df.string(from: Date())
    }

    /// Fallback currency — first goal wins, then budget income units, then PLN.
    var currency: String {
        goals.first?.currency ?? "PLN"
    }

    var activeGoals: [SavingsGoal] { goals.filter { $0.isCompleted != true } }
    var completedGoalsCount: Int { goals.filter { $0.isCompleted == true }.count }

    var totalSaved: Double {
        goals.reduce(0) { $0 + $1.currentAmount.double }
    }

    var monthlyNeeded: Double {
        activeGoals.reduce(0) { sum, g in
            let target = g.targetAmount.double
            let current = g.currentAmount.double
            let remaining = target - current
            guard remaining > 0 else { return sum }
            if let deadlineIso = g.deadline,
               let deadline = Self.parseIsoDay(deadlineIso) {
                let daysLeft = max(1, Calendar.current.dateComponents([.day], from: Date(), to: deadline).day ?? 1)
                return sum + (remaining / Double(daysLeft)) * 30
            }
            return sum + remaining / 12
        }
    }

    var activeChallenges: [Challenge] {
        challenges.filter { ($0.isActive ?? false) && ($0.isCompleted != true) }
    }

    var firstTip: String? { healthTips.first }

    // MARK: - Loaders

    func loadAll() async {
        await withTaskGroup(of: Void.self) { group in
            group.addTask { await self.loadGoals() }
            group.addTask { await self.loadBudget() }
            group.addTask { await self.loadFinancialHealth() }
            group.addTask { await self.loadChallenges() }
            group.addTask { await self.loadLoyalty() }
            group.addTask { await self.loadPromotions() }
        }
        hasLoadedOnce = true
    }

    func loadLoyalty() async {
        isLoyaltyLoading = true
        loyaltyError = nil
        defer { isLoyaltyLoading = false }
        do {
            loyaltyCards = try await LoyaltyRepo.list()
        } catch {
            loyaltyError = error.localizedDescription
        }
    }

    func loadGoals() async {
        isGoalsLoading = true
        goalsError = nil
        defer { isGoalsLoading = false }
        do {
            goals = try await GoalsRepo.list()
        } catch {
            goalsError = error.localizedDescription
        }
    }

    func loadBudget() async {
        isBudgetLoading = true
        budgetError = nil
        defer { isBudgetLoading = false }
        do {
            budget = try await BudgetRepo.fetch(month: currentMonth)
        } catch {
            budgetError = error.localizedDescription
        }
    }

    func loadFinancialHealth() async {
        do {
            let res = try await FinancialHealthRepo.fetch()
            healthScore = res.score
            healthTips = res.tips
        } catch {
            // Non-fatal — keep default score.
        }
    }

    func loadChallenges() async {
        isChallengesLoading = true
        challengesError = nil
        defer { isChallengesLoading = false }
        do {
            challenges = try await ChallengesRepo.list()
        } catch {
            challengesError = error.localizedDescription
        }
    }

    func loadPromotions() async {
        isPromotionsLoading = true
        promotionsError = nil
        defer { isPromotionsLoading = false }
        do {
            promotions = try await PromotionsRepo.fetch(lang: nil, currency: currency)
        } catch {
            promotionsError = error.localizedDescription
        }
    }

    // MARK: - Helpers

    private static func parseIsoDay(_ s: String) -> Date? {
        let df = DateFormatter()
        df.dateFormat = "yyyy-MM-dd"
        return df.date(from: String(s.prefix(10)))
    }
}

// MARK: - Budget edit sheet

struct BudgetEditSheet: View {
    let month: String
    let existing: MonthlyBudget?
    let onSubmit: (BudgetUpsert) -> Void

    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var locale: AppLocale
    @State private var income: String = ""
    @State private var totalBudget: String = ""
    @State private var savingsTarget: String = ""

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: Theme.Spacing.md) {
                    Text(String(format: locale.t("savings.monthLabelFmt"), month))
                        .font(AppFont.caption)
                        .foregroundColor(Theme.mutedForeground)
                    NBTextField(label: locale.t("savings.monthlyIncome"), text: $income, placeholder: "0.00", keyboardType: .decimalPad)
                    NBTextField(label: locale.t("savings.totalBudget"), text: $totalBudget, placeholder: "0.00", keyboardType: .decimalPad)
                    NBTextField(label: locale.t("savings.savingsTarget"), text: $savingsTarget, placeholder: "0.00", keyboardType: .decimalPad)
                }
                .padding(Theme.Spacing.md)
            }
            .background(Theme.background)
            .navigationTitle(locale.t("savings.editBudget"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button(locale.t("common.cancel")) { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button(locale.t("common.save")) {
                        let body = BudgetUpsert(
                            month: month,
                            totalIncome: Double(income),
                            totalBudget: Double(totalBudget),
                            savingsTarget: Double(savingsTarget)
                        )
                        onSubmit(body)
                        dismiss()
                    }
                }
            }
            .onAppear {
                if let e = existing {
                    income = e.totalIncome ?? ""
                    totalBudget = e.totalBudget ?? ""
                    savingsTarget = e.savingsTarget ?? ""
                }
            }
        }
    }
}
