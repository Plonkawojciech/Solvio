import SwiftUI

/// **Savings / Planner** — month budget planner. Was previously a 4-tab
/// roll-up (Planner / Products / Stores / Deals); the shopping-
/// intelligence tabs have moved to the new bottom-nav **Deals** tab
/// (`OkazjeHubView`). What remains here is the budget-focused half:
/// month budget plan (income / budget / savings target + alerts +
/// top-spend categories) plus an edit sheet.
///
/// The other three tabs' code (`productsTab`, `storesTab`, `dealsTab`)
/// is left in place as dead code — gutting them mid-session is risky
/// because their VM state is interwoven with the planner. They simply
/// stop being rendered. A follow-up pass can prune the VM cleanly.
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
                // Goals preview — surfaces the 2-3 closest goals directly
                // in Savings hub so the user doesn't have to dig through
                // "More → Cele" to see them. Tapping a goal pushes onto
                // the savings nav stack via `.more(.goals)`.
                goalsPreviewSection
                // Tab picker is intentionally hidden — Products / Stores
                // / Deals moved to the new bottom-nav `Deals` tab. The
                // planner is the only thing this hub renders now.
                plannerTab

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
        // Watch for store-side updates so the planner reflects fresh
        // budget / health payloads as soon as the prefetch lands.
        .onChange(of: store.budgetLoadedAt) { _ in vm.syncFromStore() }
        .onChange(of: store.financialHealthLoadedAt) { _ in vm.syncFromStore() }
        .onChange(of: store.goals) { _ in vm.syncFromStore() }
        .sheet(isPresented: $showBudgetEdit) {
            BudgetEditSheet(
                month: vm.currentMonth,
                existing: vm.budget?.budget
            ) { body in
                Task {
                    do {
                        _ = try await BudgetRepo.upsert(body)
                        Haptics.success()
                        toast.success(locale.t("savings.budgetSaved"))
                        store.didMutateBudget()
                    } catch {
                        toast.error(locale.t("savings.saveFailed"), description: error.localizedDescription)
                    }
                }
            }
            .environmentObject(locale)
            .presentationDetents([.medium, .large])
            .presentationDragIndicator(.visible)
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

    /// 2×2 grid (or 4-up): Spent / Remaining / Health (or Savings target) /
    /// Total saved across goals. Removed `potentialDealSavings` tile —
    /// promotions live in the dedicated Deals tab now, surfacing them here
    /// duplicated information and pinned a $0 placeholder for users
    /// without scanned receipts.
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
                label: locale.t("savings.totalSavedTile"),
                value: Fmt.amount(vm.totalSavedAcrossGoals, currency: vm.currency)
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

    // MARK: - Smart hero insight banner
    //
    // Replaces the previous static "firstTip" banner. Computes a single
    // data-driven insight from the user's actual budget + goals state.
    // Priority: overspending category (>=90%) > goal nearly done (>=80%) >
    // overdue goal > generic encouragement. Returns nothing when there's
    // nothing useful to say (so we never fake "AI advice").

    private enum InsightTone { case warn, good, info }
    private struct HeroInsight {
        let tone: InsightTone
        let emoji: String
        let title: String
        let body: String
    }

    private var heroInsight: HeroInsight? {
        // 1) Overspending category (>=90% of budget)
        if let b = vm.budget {
            let heavy = b.categoryBreakdown
                .filter { $0.budgeted > 0 }
                .map { (row: $0, pct: $0.spent / $0.budgeted) }
                .sorted { $0.pct > $1.pct }
                .first
            if let h = heavy, h.pct >= 0.9 {
                return HeroInsight(
                    tone: .warn,
                    emoji: "⚠️",
                    title: locale.t("savings.insightOverBudget").replacingOccurrences(of: "{cat}", with: h.row.name),
                    body: locale.t("savings.insightOverBudgetBody")
                        .replacingOccurrences(of: "{pct}", with: "\(Int((h.pct * 100).rounded()))")
                        .replacingOccurrences(of: "{cat}", with: h.row.name)
                )
            }
        }
        // 2) Goal nearly complete (>=80%, not yet completed)
        let activeGoals = vm.goals.filter { $0.isCompleted != true }
        let close = activeGoals
            .map { (g: $0, pct: $0.targetAmount.double > 0 ? $0.currentAmount.double / $0.targetAmount.double : 0) }
            .filter { $0.pct >= 0.8 && $0.pct < 1 }
            .sorted { $0.pct > $1.pct }
            .first
        if let c = close {
            return HeroInsight(
                tone: .good,
                emoji: c.g.emoji ?? "🎯",
                title: locale.t("savings.insightNearGoal").replacingOccurrences(of: "{name}", with: c.g.name),
                body: locale.t("savings.insightNearGoalBody")
                    .replacingOccurrences(of: "{pct}", with: "\(Int((c.pct * 100).rounded()))")
            )
        }
        // 3) Overdue goal — use startOfDay comparison so a goal with
        // today's date isn't flagged as overdue (matches `hubDeadlineStatus`
        // which uses the same calendar logic for consistency).
        if let overdue = activeGoals.first(where: { g in
            guard let iso = g.deadline,
                  let deadline = SavingsHubView.parseIsoDay(iso) else { return false }
            let cal = Calendar.current
            let today = cal.startOfDay(for: Date())
            let dl = cal.startOfDay(for: deadline)
            return dl < today
        }) {
            return HeroInsight(
                tone: .warn,
                emoji: overdue.emoji ?? "⏰",
                title: locale.t("savings.insightOverdue").replacingOccurrences(of: "{name}", with: overdue.name),
                body: locale.t("savings.insightOverdueBody")
            )
        }
        // 4) Generic encouragement (only if there are active goals)
        if !activeGoals.isEmpty {
            let monthly = monthlyNeededForActive(activeGoals)
            if monthly > 0 {
                return HeroInsight(
                    tone: .info,
                    emoji: "💪",
                    title: locale.t("savings.insightOnTrack"),
                    body: locale.t("savings.insightOnTrackBody")
                        .replacingOccurrences(of: "{amount}", with: Fmt.amount(monthly, currency: vm.currency))
                )
            }
        }
        // 5) No-data fallback — always show *something* so the user can
        // see this banner exists and what it does. Picks the right CTA
        // based on what's missing: budget vs goals vs both.
        // FIX: parens around the `??` operand — `?? 0 > 0` would have
        // been parsed as `?? (0 > 0)` (Comparison binds tighter than
        // NilCoalescing), which would type-mismatch `Double?` vs `Bool`.
        let hasBudget = ((vm.budget?.budget?.totalBudget).flatMap(Double.init) ?? 0) > 0
        if !hasBudget && activeGoals.isEmpty {
            return HeroInsight(
                tone: .info,
                emoji: "💡",
                title: locale.t("savings.insightSetupTitle"),
                body: locale.t("savings.insightSetupBody")
            )
        }
        if !hasBudget {
            return HeroInsight(
                tone: .info,
                emoji: "💡",
                title: locale.t("savings.insightAddBudgetTitle"),
                body: locale.t("savings.insightAddBudgetBody")
            )
        }
        if activeGoals.isEmpty {
            return HeroInsight(
                tone: .info,
                emoji: "🎯",
                title: locale.t("savings.insightAddGoalTitle"),
                body: locale.t("savings.insightAddGoalBody")
            )
        }
        return nil
    }

    private static func parseIsoDay(_ s: String) -> Date? {
        // UTC + POSIX locale — same rationale as GoalsListView's parser:
        // backend stores deadlines as `yyyy-MM-dd` so we need an absolute
        // anchor or different timezones flip "today" to "yesterday".
        let df = DateFormatter()
        df.calendar = Calendar(identifier: .gregorian)
        df.locale = Locale(identifier: "en_US_POSIX")
        df.timeZone = TimeZone(identifier: "UTC")
        df.dateFormat = "yyyy-MM-dd"
        return df.date(from: String(s.prefix(10)))
    }

    /// Sum of remaining-amount divided by months-left across all active
    /// goals. Skip overdue goals — they're surfaced separately by the
    /// hero insight (priority 3) and dumping the whole remaining into
    /// "this month" inflates the figure misleadingly.
    private func monthlyNeededForActive(_ goals: [SavingsGoal]) -> Double {
        let cal = Calendar.current
        let today = cal.startOfDay(for: Date())
        return goals.reduce(0) { sum, g in
            let target = g.targetAmount.double
            let current = g.currentAmount.double
            let remaining = target - current
            guard remaining > 0 else { return sum }
            if let iso = g.deadline,
               let deadline = SavingsHubView.parseIsoDay(iso) {
                let dl = cal.startOfDay(for: deadline)
                if dl < today { return sum } // overdue — handled elsewhere
                let days = cal.dateComponents([.day], from: today, to: dl).day ?? 0
                let months = max(1, Int(ceil(Double(days) / 30.0)))
                return sum + remaining / Double(months)
            }
            return sum + remaining / 12
        }
    }

    @ViewBuilder
    private var aiTipBanner: some View {
        if let insight = heroInsight {
            let bg: Color = {
                switch insight.tone {
                case .warn: return Theme.warning.opacity(0.10)
                case .good: return Theme.success.opacity(0.10)
                case .info: return Theme.muted
                }
            }()
            let stroke: Color = {
                switch insight.tone {
                case .warn: return Theme.warning
                case .good: return Theme.success
                case .info: return Theme.foreground
                }
            }()
            let titleColor: Color = {
                switch insight.tone {
                case .warn: return Theme.warning
                case .good: return Theme.success
                case .info: return Theme.foreground
                }
            }()
            HStack(alignment: .top, spacing: Theme.Spacing.sm) {
                Text(insight.emoji)
                    .font(.system(size: 22))
                    .frame(width: 36, height: 36)
                    .background(bg)
                    .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.sm))
                    .overlay(
                        RoundedRectangle(cornerRadius: Theme.Radius.sm)
                            .stroke(stroke.opacity(0.5), lineWidth: Theme.Border.widthThin)
                    )
                VStack(alignment: .leading, spacing: 2) {
                    Text(insight.title)
                        .font(AppFont.bodyMedium)
                        .foregroundColor(titleColor)
                        .fixedSize(horizontal: false, vertical: true)
                    Text(insight.body)
                        .font(AppFont.body)
                        .foregroundColor(Theme.foreground)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 0)
            }
            .padding(Theme.Spacing.sm)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(bg)
            .overlay(
                RoundedRectangle(cornerRadius: Theme.Radius.md)
                    .stroke(stroke.opacity(0.3), lineWidth: Theme.Border.widthThin)
            )
            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.md))
        }
    }

    // MARK: - Goals preview section
    //
    // Surfaces a compact 2-3 row preview of the user's most relevant active
    // goals right inside Savings hub. Without this section the user had to
    // navigate through "More → Cele" to see goals, which made the hub feel
    // empty and hid the deadline / quick-amount UX changes shipped today.

    @ViewBuilder
    private var goalsPreviewSection: some View {
        let active = vm.goals.filter { $0.isCompleted != true }
        // Sort: closest deadline first, then highest progress. Goals
        // without deadline fall to the back.
        let sorted = active.sorted { (a, b) in
            let da = a.deadline.flatMap(SavingsHubView.parseIsoDay)
            let db = b.deadline.flatMap(SavingsHubView.parseIsoDay)
            switch (da, db) {
            case let (l?, r?): return l < r
            case (_?, nil): return true
            case (nil, _?): return false
            default:
                let pa = a.targetAmount.double > 0 ? a.currentAmount.double / a.targetAmount.double : 0
                let pb = b.targetAmount.double > 0 ? b.currentAmount.double / b.targetAmount.double : 0
                return pa > pb
            }
        }
        let preview = Array(sorted.prefix(3))

        VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
            HStack {
                Text(locale.t("savings.goalsTitle"))
                    .font(AppFont.sectionTitle)
                    .foregroundColor(Theme.foreground)
                Spacer()
                Button {
                    Haptics.selection()
                    router.push(.more(.goals))
                } label: {
                    HStack(spacing: 4) {
                        Text(locale.t("savings.viewAllGoals"))
                        Image(systemName: "chevron.right")
                            .font(.system(size: 11, weight: .bold))
                    }
                    .font(AppFont.caption)
                    .foregroundColor(Theme.foreground)
                }
                .buttonStyle(.plain)
            }

            if preview.isEmpty {
                Button {
                    Haptics.impact(.light)
                    router.push(.more(.goals))
                } label: {
                    HStack(spacing: Theme.Spacing.sm) {
                        Image(systemName: "target")
                            .font(.system(size: 18, weight: .semibold))
                            .foregroundColor(Theme.foreground)
                            .frame(width: 36, height: 36)
                            .background(Theme.muted)
                            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.sm))
                            .overlay(
                                RoundedRectangle(cornerRadius: Theme.Radius.sm)
                                    .stroke(Theme.border, lineWidth: Theme.Border.widthThin)
                            )
                        VStack(alignment: .leading, spacing: 2) {
                            Text(locale.t("savings.goalsEmptyTitle"))
                                .font(AppFont.bodyMedium)
                                .foregroundColor(Theme.foreground)
                            Text(locale.t("savings.goalsEmptySub"))
                                .font(AppFont.caption)
                                .foregroundColor(Theme.mutedForeground)
                        }
                        Spacer()
                        Image(systemName: "plus")
                            .foregroundColor(Theme.mutedForeground)
                    }
                    .padding(Theme.Spacing.sm)
                    .nbCard(radius: Theme.Radius.md, shadow: Theme.Shadow.sm)
                }
                .buttonStyle(.plain)
            } else {
                VStack(spacing: Theme.Spacing.xs) {
                    ForEach(preview) { g in
                        Button {
                            Haptics.selection()
                            router.push(.goalDetail(id: g.id))
                        } label: {
                            goalPreviewRow(g)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
    }

    private func goalPreviewRow(_ g: SavingsGoal) -> some View {
        let pct = g.targetAmount.double > 0 ? g.currentAmount.double / g.targetAmount.double : 0
        let status = g.deadline.flatMap { hubDeadlineStatus($0) }
        return HStack(alignment: .top, spacing: Theme.Spacing.sm) {
            Text(g.emoji ?? "🎯")
                .font(.system(size: 24))
                .frame(width: 40, height: 40)
                .background(Theme.muted)
                .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.sm))
                .overlay(
                    RoundedRectangle(cornerRadius: Theme.Radius.sm)
                        .stroke(Theme.border, lineWidth: Theme.Border.widthThin)
                )
            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    Text(g.name)
                        .font(AppFont.bodyMedium)
                        .foregroundColor(Theme.foreground)
                        .lineLimit(1)
                    Spacer()
                    Text("\(Int(min(100, pct * 100)))%")
                        .font(AppFont.mono(11))
                        .foregroundColor(Theme.mutedForeground)
                }
                NBProgressBar(value: pct)
                HStack {
                    Text("\(Fmt.amount(g.currentAmount, currency: g.currency)) / \(Fmt.amount(g.targetAmount, currency: g.currency))")
                        .font(AppFont.caption)
                        .foregroundColor(Theme.mutedForeground)
                        .lineLimit(1)
                    Spacer()
                    if let status {
                        switch status {
                        case .overdue:
                            Text(locale.t("goals.overdue"))
                                .font(AppFont.mono(11))
                                .foregroundColor(Theme.destructive)
                        case .today:
                            Text(locale.t("goals.today"))
                                .font(AppFont.mono(11))
                                .foregroundColor(Theme.warning)
                        case .tomorrow:
                            Text(locale.t("goals.tomorrow"))
                                .font(AppFont.caption)
                                .foregroundColor(Theme.mutedForeground)
                        case .normal:
                            if let iso = g.deadline {
                                Text(Fmt.dayMonth(iso))
                                    .font(AppFont.caption)
                                    .foregroundColor(Theme.mutedForeground)
                            }
                        }
                    }
                }
            }
        }
        .padding(Theme.Spacing.sm)
        .frame(maxWidth: .infinity, alignment: .leading)
        .nbCard(radius: Theme.Radius.md, shadow: Theme.Shadow.sm)
    }

    private enum HubDeadlineStatus { case overdue, today, tomorrow, normal }

    private func hubDeadlineStatus(_ iso: String) -> HubDeadlineStatus? {
        guard let deadline = SavingsHubView.parseIsoDay(iso) else { return nil }
        let cal = Calendar.current
        let today = cal.startOfDay(for: Date())
        let dl = cal.startOfDay(for: deadline)
        let days = cal.dateComponents([.day], from: today, to: dl).day ?? 0
        if days < 0 { return .overdue }
        if days == 0 { return .today }
        if days == 1 { return .tomorrow }
        return .normal
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
                    Haptics.selection()
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

            // Quick-link to the multi-income editor — Wojtek's request
            // was to support several named income streams instead of
            // a single `monthlyBudget.totalIncome` field.
            Button {
                Haptics.selection()
                router.push(.more(.incomes))
            } label: {
                HStack(spacing: Theme.Spacing.sm) {
                    Image(systemName: "banknote")
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundColor(Theme.foreground)
                        .frame(width: 36, height: 36)
                        .background(Theme.success.opacity(0.15))
                        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.sm))
                        .overlay(
                            RoundedRectangle(cornerRadius: Theme.Radius.sm)
                                .stroke(Theme.success.opacity(0.5), lineWidth: Theme.Border.widthThin)
                        )
                    VStack(alignment: .leading, spacing: 2) {
                        Text(locale.t("incomes.title"))
                            .font(AppFont.bodyMedium)
                            .foregroundColor(Theme.foreground)
                        Text(locale.t("incomes.linkSub"))
                            .font(AppFont.caption)
                            .foregroundColor(Theme.mutedForeground)
                    }
                    Spacer()
                    Image(systemName: "chevron.right")
                        .foregroundColor(Theme.mutedForeground)
                }
                .padding(Theme.Spacing.sm)
                .nbCard(radius: Theme.Radius.md, shadow: Theme.Shadow.sm)
            }
            .buttonStyle(.plain)

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
                    action: (label: locale.t("savings.setBudget"), run: {
                        Haptics.impact(.light)
                        showBudgetEdit = true
                    })
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
                            .overlay(Circle().stroke(Theme.border, lineWidth: 0.5))
                        Text("\(Int(b.monthProgress * 100))% \(locale.t("savings.monthShort"))")
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

}

// MARK: - View model

/// Lean planner-only view-model. Was previously a multi-tab roll-up
/// (planner / products / stores / deals); products and stores moved to the
/// Deals tab (`OkazjeHubView`), so this VM only owns the planner data
/// (budget + financial health) plus a goals mirror used by the KPI strip
/// and the smart hero insight banner.
@MainActor
final class SavingsHubViewModel: ObservableObject {
    weak var store: AppDataStore?
    weak var locale: AppLocale?

    // Goals mirror — used by the goals preview row + heroInsight + the
    // monthlyNeeded calculation behind the planner KPI strip.
    @Published var goals: [SavingsGoal] = []

    // Budget (planner)
    @Published var budget: BudgetResponse?
    @Published var isBudgetLoading = false
    @Published var budgetError: String?

    // Financial health score (top KPI tile)
    @Published var healthScore: Int?
    @Published var healthTips: [String] = []

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

    /// Sum of `currentAmount` across active goals — drives the "Saved"
    /// KPI tile that replaced `potentialDealSavings`.
    var totalSavedAcrossGoals: Double {
        goals.filter { $0.isCompleted != true }
            .reduce(0) { $0 + $1.currentAmount.double }
    }

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
        budgetError = (store.budget == nil ? store.budgetError : nil)
        // Always reflect store loading flag — covers both initial load and
        // explicit refresh. Avoids the wedge-state where `awaitBudget`
        // failed and `isBudgetLoading` stayed `true` forever.
        isBudgetLoading = store.budgetLoading && store.budget == nil
    }

    /// Fires the two slices the planner actually renders. Previously
    /// triggered LLM-backed price comparison + shopping audit endpoints
    /// (~10-25 s each, ~$0.02 a call) on every Savings tab visit, even
    /// though their views were never rendered. Removed.
    func loadAll() async {
        await withTaskGroup(of: Void.self) { group in
            group.addTask { await self.loadBudget() }
            group.addTask { await self.loadFinancialHealth() }
        }
        hasLoadedOnce = true
    }

    func loadBudget(force: Bool = false) async {
        guard let store else { return }
        if store.budget == nil { isBudgetLoading = true }
        budgetError = nil
        await store.awaitBudget(force: force)
        // Hard reset — `syncFromStore` only resets the flag when budget
        // is non-nil; a failed load with no cached budget would otherwise
        // leave the spinner spinning forever.
        isBudgetLoading = false
        syncFromStore()
    }

    func loadFinancialHealth(force: Bool = false) async {
        guard let store else { return }
        await store.awaitFinancialHealth(force: force)
        syncFromStore()
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
                    .stroke(Theme.border, lineWidth: Theme.Border.widthThin)
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
                        Haptics.selection()
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
            Haptics.selection()
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
                    .stroke(Theme.border, lineWidth: Theme.Border.widthThin)
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
                .stroke(Theme.border, lineWidth: Theme.Border.widthThin)
        )
    }

    private func legend(label: String, value: Double, color: Color) -> some View {
        HStack(spacing: 4) {
            Circle()
                .fill(color)
                .frame(width: 8, height: 8)
                .overlay(Circle().stroke(Theme.border, lineWidth: 0.5))
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
