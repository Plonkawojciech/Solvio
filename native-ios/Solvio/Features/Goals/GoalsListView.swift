import SwiftUI

/// Savings goals list — parity with `/app/(protected)/goals`. Emoji-first
/// card, progress bar, quick deposit action via `/api/personal/goals/[id]/deposit`.
///
/// Reads from `AppDataStore.goals` so tab switches don't re-fetch.
struct GoalsListView: View {
    @EnvironmentObject private var router: AppRouter
    @EnvironmentObject private var toast: ToastCenter
    @EnvironmentObject private var locale: AppLocale
    @EnvironmentObject private var store: AppDataStore
    @State private var showCreate = false
    @State private var depositTarget: SavingsGoal?
    @State private var pendingDelete: SavingsGoal?
    @State private var showCompleted = false
    @State private var showAiTip = false

    // MARK: - Derived state

    private var goals: [SavingsGoal] { store.goals }
    private var isLoading: Bool { store.goalsLoading }
    private var errorMessage: String? { store.goalsError }
    private var activeGoals: [SavingsGoal] { goals.filter { $0.isCompleted != true } }
    private var completedGoals: [SavingsGoal] { goals.filter { $0.isCompleted == true } }
    private var totalSaved: Double { goals.reduce(0) { $0 + $1.currentAmount.double } }

    /// Fallback currency for summary tiles when goals have mixed or missing currencies.
    private var currencyHint: String { goals.first?.currency ?? store.currency }

    /// Monthly savings needed across active goals.
    /// FIX (2026-05-06): previously used `(remaining / daysLeft) * 30` which
    /// produced absurd values for short deadlines (e.g. 1 day left, 1000 PLN
    /// remaining → 30000/mo). Now: spread over months remaining (min 1
    /// month), default 12 months when no deadline. **Overdue goals are
    /// excluded** — `max(1, …)` clamping was dumping the entire remaining
    /// into "this month" for every overdue goal, inflating the KPI.
    private var monthlyNeeded: Double {
        let cal = Calendar.current
        let today = cal.startOfDay(for: Date())
        return activeGoals.reduce(0) { sum, g in
            let target = g.targetAmount.double
            let current = g.currentAmount.double
            let remaining = target - current
            guard remaining > 0 else { return sum }
            if let deadlineIso = g.deadline,
               let deadline = Self.parseIsoDay(deadlineIso) {
                let dl = cal.startOfDay(for: deadline)
                if dl < today { return sum } // overdue — surfaced elsewhere
                let daysLeft = cal.dateComponents([.day], from: today, to: dl).day ?? 0
                let monthsLeft = max(1, Int(ceil(Double(daysLeft) / 30.0)))
                return sum + remaining / Double(monthsLeft)
            }
            return sum + remaining / 12
        }
    }

    private static func parseIsoDay(_ s: String) -> Date? {
        // Use UTC + POSIX locale — backend stores deadlines as `yyyy-MM-dd`
        // strings without time/zone, so we anchor at UTC midnight to avoid
        // off-by-one days in different client timezones.
        let df = DateFormatter()
        df.calendar = Calendar(identifier: .gregorian)
        df.locale = Locale(identifier: "en_US_POSIX")
        df.timeZone = TimeZone(identifier: "UTC")
        df.dateFormat = "yyyy-MM-dd"
        return df.date(from: String(s.prefix(10)))
    }

    var body: some View {
        ZStack(alignment: .bottomTrailing) {
            List {
                Section {
                    VStack(alignment: .leading, spacing: Theme.Spacing.md) {
                        NBScreenHeader(
                            eyebrow: locale.t("goals.eyebrow"),
                            title: locale.t("goals.headerTitle"),
                            subtitle: "\(activeGoals.count) \(locale.t("goals.sectionActive").lowercased()) · \(completedGoals.count) \(locale.t("goals.statCompleted").lowercased())"
                        )
                        .accessibilityElement(children: .combine)
                        .accessibilityAddTraits(.isHeader)
                    }
                    .padding(.horizontal, Theme.Spacing.md)
                    .padding(.top, Theme.Spacing.md)
                }
                .listRowBackground(Color.clear)
                .listRowSeparator(.hidden)
                .listRowInsets(EdgeInsets())

                if isLoading && goals.isEmpty {
                    Section {
                        NBSkeletonList(rows: 4)
                            .padding(.horizontal, Theme.Spacing.md)
                    }
                    .listRowBackground(Color.clear)
                    .listRowSeparator(.hidden)
                    .listRowInsets(EdgeInsets())
                } else if let message = errorMessage, goals.isEmpty {
                    Section {
                        NBErrorCard(message: message) { Task { await store.awaitGoals(force: true) } }
                            .padding(.horizontal, Theme.Spacing.md)
                    }
                    .listRowBackground(Color.clear)
                    .listRowSeparator(.hidden)
                    .listRowInsets(EdgeInsets())
                } else if goals.isEmpty {
                    Section {
                        NBEmptyState(
                            systemImage: "target",
                            title: locale.t("goals.emptyTitle"),
                            subtitle: locale.t("goals.emptySub"),
                            action: (label: locale.t("goals.new"), run: { showCreate = true })
                        )
                        .padding(.horizontal, Theme.Spacing.md)
                    }
                    .listRowBackground(Color.clear)
                    .listRowSeparator(.hidden)
                    .listRowInsets(EdgeInsets())
                } else {
                    Section {
                        VStack(alignment: .leading, spacing: Theme.Spacing.md) {
                            kpiStrip
                            aiTipBanner
                            sectionHeader(locale.t("goals.sectionActive"), count: activeGoals.count)
                        }
                        .padding(.horizontal, Theme.Spacing.md)
                    }
                    .listRowBackground(Color.clear)
                    .listRowSeparator(.hidden)
                    .listRowInsets(EdgeInsets())

                    Section {
                        ForEach(activeGoals) { g in
                            Button {
                                Haptics.selection()
                                router.push(.goalDetail(id: g.id))
                            } label: {
                                goalCard(g)
                                    .padding(Theme.Spacing.sm)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                    .nbCard(radius: Theme.Radius.md, shadow: Theme.Shadow.sm)
                            }
                            .buttonStyle(.plain)
                            .listRowBackground(Color.clear)
                            .listRowSeparator(.hidden)
                            .listRowInsets(EdgeInsets(
                                top: Theme.Spacing.xxs,
                                leading: Theme.Spacing.md,
                                bottom: Theme.Spacing.xxs,
                                trailing: Theme.Spacing.md
                            ))
                            // Single VoiceOver utterance per row instead of
                            // emoji + name + percent + amount + deadline read
                            // as 5 separate elements. Hint guides the user to
                            // open detail; swipe affordances are surfaced
                            // through standard `swipeActions` rotor.
                            .accessibilityElement(children: .combine)
                            .accessibilityLabel(goalCardA11y(g))
                            .accessibilityHint(locale.t("goals.openDetailHint"))
                            .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                                Button(role: .destructive) {
                                    Haptics.warning()
                                    pendingDelete = g
                                } label: {
                                    Label(locale.t("common.delete"), systemImage: "trash")
                                }
                            }
                            .swipeActions(edge: .leading, allowsFullSwipe: false) {
                                Button {
                                    Haptics.selection()
                                    depositTarget = g
                                } label: {
                                    Label(locale.t("goals.addFunds"), systemImage: "plus.circle")
                                }
                                .tint(Theme.foreground)
                            }
                            .contextMenu {
                                Button(locale.t("goals.addFunds")) {
                                    Haptics.selection()
                                    depositTarget = g
                                }
                                Button(locale.t("common.delete"), role: .destructive) {
                                    Haptics.warning()
                                    pendingDelete = g
                                }
                            }
                        }
                    }

                    if !completedGoals.isEmpty {
                        Section {
                            completedDisclosure
                                .padding(.horizontal, Theme.Spacing.md)
                                .padding(.top, Theme.Spacing.sm)
                        }
                        .listRowBackground(Color.clear)
                        .listRowSeparator(.hidden)
                        .listRowInsets(EdgeInsets())
                    }
                }

                Section {
                    Color.clear.frame(height: 96)
                }
                .listRowBackground(Color.clear)
                .listRowSeparator(.hidden)
                .listRowInsets(EdgeInsets())
            }
            .listStyle(.plain)
            .scrollContentBackground(.hidden)
            .background(Theme.background)
            .refreshable {
                // Match Dashboard pattern: light tick on pull, success after
                // fresh data lands without an error. Reuses central store
                // so we never re-fetch on tab swap.
                Haptics.impact(.light)
                await store.awaitGoals(force: true)
                if store.goalsError == nil {
                    Haptics.success()
                }
            }
            .task { store.ensureGoals() }
            .animation(.nbSpring, value: showCompleted)
            .animation(.nbSpring, value: showAiTip)

            Button {
                Haptics.impact(.medium)
                showCreate = true
            } label: {
                Image(systemName: "plus")
                    .font(.system(size: 22, weight: .bold))
                    .foregroundColor(Theme.background)
                    .frame(width: 56, height: 56)
                    .background(Theme.foreground)
                    .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.md))
                    .overlay(RoundedRectangle(cornerRadius: Theme.Radius.md).stroke(Theme.border, lineWidth: Theme.Border.width))
                    .nbShadow(Theme.Shadow.md)
            }
            .buttonStyle(.plain)
            .padding(.trailing, Theme.Spacing.md)
            .padding(.bottom, Theme.Spacing.md)
            .accessibilityLabel(locale.t("goals.new"))
            .accessibilityHint(locale.t("goals.newHint"))
        }
        .sheet(isPresented: $showCreate) {
            GoalCreateSheet { body in
                Task {
                    do {
                        _ = try await GoalsRepo.create(body)
                        Haptics.success()
                        toast.success(locale.t("goals.created"))
                        store.didMutateGoals()
                    } catch {
                        toast.error(locale.t("goals.createFailed"), description: error.localizedDescription)
                    }
                }
            }
            .environmentObject(locale)
        }
        .alert(
            locale.t("common.delete"),
            isPresented: Binding(
                get: { pendingDelete != nil },
                set: { if !$0 { pendingDelete = nil } }
            ),
            presenting: pendingDelete
        ) { g in
            Button(locale.t("common.cancel"), role: .cancel) {}
            Button(locale.t("common.delete"), role: .destructive) {
                Task { await deleteGoal(id: g.id) }
            }
        } message: { g in
            Text(g.name)
        }
        .sheet(item: $depositTarget) { goal in
            DepositSheet(goal: goal) { amount, note in
                Task {
                    do {
                        _ = try await GoalsRepo.deposit(goalId: goal.id, amount: amount, note: note)
                        Haptics.success()
                        toast.success(locale.t("goals.fundsAdded"))
                        depositTarget = nil
                        store.didMutateGoals()
                    } catch {
                        toast.error(locale.t("goals.failed"), description: error.localizedDescription)
                    }
                }
            }
            .environmentObject(locale)
        }
    }

    private func deleteGoal(id: String) async {
        do {
            try await GoalsRepo.delete(id: id)
            toast.success(locale.t("goals.deleted"))
            store.didMutateGoals()
        } catch {
            toast.error(locale.t("goals.deleteFailed"), description: error.localizedDescription)
        }
    }

    private var kpiStrip: some View {
        LazyVGrid(columns: [GridItem(.flexible(), spacing: Theme.Spacing.xs), GridItem(.flexible(), spacing: Theme.Spacing.xs)], spacing: Theme.Spacing.xs) {
            NBStatTile(label: locale.t("goals.statSaved"), value: Fmt.amount(totalSaved, currency: currencyHint))
            NBStatTile(label: locale.t("goals.statActive"), value: "\(activeGoals.count)")
            NBStatTile(label: locale.t("goals.statPerMonth"), value: Fmt.amount(monthlyNeeded, currency: currencyHint))
            NBStatTile(label: locale.t("goals.statCompleted"), value: "\(completedGoals.count)")
        }
    }

    /// Pick up to 3 AI tips across all active goals in a round-robin order
    /// so the user sees variety, not just the first goal's tips.
    private var roundRobinTips: [String] {
        var collected: [String] = []
        let perGoal = activeGoals.map { $0.aiTips ?? [] }
        for i in 0..<3 {
            for tips in perGoal {
                if i < tips.count {
                    collected.append(tips[i])
                    if collected.count >= 3 { return collected }
                }
            }
        }
        return collected
    }

    /// Tappable AI tip banner that expands in-place. Collapsed: shows
    /// summary (active goals count + monthly target). Expanded: surfaces
    /// up to 3 round-robin tips drawn from across all active goals so the
    /// 2nd/3rd goal's tips aren't permanently buried.
    @ViewBuilder
    private var aiTipBanner: some View {
        let active = activeGoals.count
        let perMonth = Fmt.amount(monthlyNeeded, currency: currencyHint)
        let tips = roundRobinTips
        Button {
            Haptics.selection()
            withAnimation(.nbSpring) { showAiTip.toggle() }
        } label: {
            VStack(alignment: .leading, spacing: showAiTip ? Theme.Spacing.xs : 0) {
                HStack(spacing: 8) {
                    Image(systemName: "sparkles")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(Theme.foreground)
                        .frame(width: 24, height: 24)
                        .background(Theme.accent)
                        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.sm))
                        .overlay(
                            RoundedRectangle(cornerRadius: Theme.Radius.sm)
                                .stroke(Theme.border, lineWidth: Theme.Border.widthThin)
                        )
                        .accessibilityHidden(true)
                    Text(locale.t("savings.aiTip"))
                        .font(AppFont.mono(10))
                        .tracking(1)
                        .textCase(.uppercase)
                        .foregroundColor(Theme.mutedForeground)
                    Spacer()
                    Image(systemName: showAiTip ? "chevron.up" : "chevron.down")
                        .font(.system(size: 11, weight: .bold))
                        .foregroundColor(Theme.mutedForeground)
                        .accessibilityHidden(true)
                }
                if showAiTip {
                    Text("\(active) · \(perMonth)")
                        .font(AppFont.caption)
                        .foregroundColor(Theme.foreground)
                        .multilineTextAlignment(.leading)
                        .fixedSize(horizontal: false, vertical: true)
                    if !tips.isEmpty {
                        VStack(alignment: .leading, spacing: 4) {
                            ForEach(Array(tips.enumerated()), id: \.offset) { _, tip in
                                HStack(alignment: .top, spacing: 6) {
                                    Text("•")
                                        .font(AppFont.caption)
                                        .foregroundColor(Theme.foreground)
                                    Text(tip)
                                        .font(AppFont.caption)
                                        .foregroundColor(Theme.mutedForeground)
                                        .multilineTextAlignment(.leading)
                                        .fixedSize(horizontal: false, vertical: true)
                                }
                            }
                        }
                        .padding(.top, 4)
                    }
                }
            }
            .padding(Theme.Spacing.sm)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Theme.card.opacity(0.5))
            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.md))
            .overlay(
                RoundedRectangle(cornerRadius: Theme.Radius.md)
                    .stroke(Theme.border.opacity(0.3), lineWidth: Theme.Border.widthThin)
            )
        }
        .buttonStyle(.plain)
        .accessibilityLabel(locale.t("savings.aiTip"))
        .accessibilityHint(showAiTip ? locale.t("goals.tipsCollapseHint") : locale.t("goals.tipsExpandHint"))
    }

    /// Collapsed list of completed goals — keeps the screen uncluttered
    /// while still letting users browse wins.
    private var completedDisclosure: some View {
        DisclosureGroup(isExpanded: Binding(
            get: { showCompleted },
            set: { newValue in
                Haptics.selection()
                withAnimation(.nbSpring) { showCompleted = newValue }
            }
        )) {
            VStack(spacing: Theme.Spacing.xs) {
                ForEach(completedGoals) { g in
                    completedRow(g)
                }
            }
            .padding(.top, Theme.Spacing.xs)
        } label: {
            HStack(spacing: 6) {
                Image(systemName: "checkmark.seal")
                    .font(.system(size: 11))
                    .foregroundColor(Theme.mutedForeground)
                Text(locale.t("goals.sectionCompleted"))
                    .font(AppFont.mono(11))
                    .tracking(1)
                    .textCase(.uppercase)
                    .foregroundColor(Theme.mutedForeground)
                Text("(\(completedGoals.count))")
                    .font(AppFont.mono(10))
                    .foregroundColor(Theme.mutedForeground)
            }
        }
        .tint(Theme.foreground)
        .padding(.horizontal, Theme.Spacing.sm)
        .padding(.vertical, Theme.Spacing.xxs)
        .background(Theme.card.opacity(0.5))
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.sm))
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Radius.sm)
                .stroke(Theme.border.opacity(0.3), lineWidth: Theme.Border.widthThin)
        )
    }

    private func sectionHeader(_ title: String, count: Int) -> some View {
        HStack {
            NBEyebrow(text: title)
            Spacer()
            Text("\(count)")
                .font(AppFont.mono(11))
                .foregroundColor(Theme.mutedForeground)
        }
        .padding(.top, Theme.Spacing.sm)
    }

    /// Deadline urgency state — Today/Tomorrow/Overdue/Normal — drives
    /// color (red for overdue, amber for today, normal otherwise) and the
    /// label shown on the goal card.
    private enum DeadlineStatus { case overdue, today, tomorrow, normal(daysLeft: Int) }

    private func deadlineStatus(_ iso: String) -> DeadlineStatus? {
        guard let deadline = Self.parseIsoDay(iso) else { return nil }
        let cal = Calendar.current
        let today = cal.startOfDay(for: Date())
        let dl = cal.startOfDay(for: deadline)
        let days = cal.dateComponents([.day], from: today, to: dl).day ?? 0
        if days < 0 { return .overdue }
        if days == 0 { return .today }
        if days == 1 { return .tomorrow }
        return .normal(daysLeft: days)
    }

    private func goalCard(_ g: SavingsGoal) -> some View {
        let pct = g.targetAmount.double > 0 ? g.currentAmount.double / g.targetAmount.double : 0
        let status: DeadlineStatus? = g.deadline.flatMap { deadlineStatus($0) }
        return HStack(alignment: .top, spacing: Theme.Spacing.sm) {
            Text(g.emoji ?? "🎯")
                .font(.system(size: 28))
                .frame(width: 44, height: 44)
                .background(Theme.muted)
                .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.sm))
                .overlay(
                    RoundedRectangle(cornerRadius: Theme.Radius.sm)
                        .stroke(Theme.border, lineWidth: Theme.Border.widthThin)
                )
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 6) {
                HStack {
                    Text(g.name)
                        .font(AppFont.bodyMedium)
                        .foregroundColor(Theme.foreground)
                    Spacer()
                    Text("\(Int(min(100, pct * 100)))%")
                        .font(AppFont.mono(11))
                        .tracking(1)
                        .foregroundColor(Theme.mutedForeground)
                }
                NBProgressBar(value: pct)
                HStack {
                    Text("\(Fmt.amount(g.currentAmount, currency: g.currency)) / \(Fmt.amount(g.targetAmount, currency: g.currency))")
                        .font(AppFont.caption)
                        .foregroundColor(Theme.mutedForeground)
                    Spacer()
                    if let status {
                        deadlineLabel(status: status, isoDate: g.deadline)
                    }
                }
            }
        }
    }

    /// Renders deadline as "Today" / "Tomorrow" / "Overdue" / a short date
    /// string, with red/amber tinting for the urgent cases.
    @ViewBuilder
    private func deadlineLabel(status: DeadlineStatus, isoDate: String?) -> some View {
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
            if let iso = isoDate {
                Text(Fmt.dayMonth(iso))
                    .font(AppFont.caption)
                    .foregroundColor(Theme.mutedForeground)
            }
        }
    }

    private func completedRow(_ g: SavingsGoal) -> some View {
        HStack(spacing: Theme.Spacing.sm) {
            Text(g.emoji ?? "🎯")
                .font(.title2)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                Text(g.name)
                    .font(AppFont.bodyMedium)
                    .foregroundColor(Theme.foreground)
                Text(Fmt.amount(g.targetAmount, currency: g.currency))
                    .font(AppFont.caption)
                    .foregroundColor(Theme.mutedForeground)
            }
            Spacer()
            Image(systemName: "checkmark.seal.fill")
                .foregroundColor(Theme.success)
                .accessibilityHidden(true)
        }
        .padding(Theme.Spacing.sm)
        .nbCard(radius: Theme.Radius.sm, shadow: Theme.Shadow.sm)
        // Composed VoiceOver utterance: name + completed status + amount.
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(g.name), \(locale.t("goals.statCompleted")), \(Fmt.amount(g.targetAmount, currency: g.currency))")
    }

    /// Composed VoiceOver label for an active goal row.
    /// Reads as a single sentence: "Wakacje, 50%, 1500 z 3000 PLN, termin: 12 lipca".
    /// Without this, VoiceOver iterates the emoji, name, percent, amounts and
    /// deadline as 5 separate elements which is verbose and confusing.
    private func goalCardA11y(_ g: SavingsGoal) -> String {
        let pct = g.targetAmount.double > 0 ? g.currentAmount.double / g.targetAmount.double : 0
        let pctLabel = "\(Int(min(100, pct * 100)))%"
        let amounts = "\(Fmt.amount(g.currentAmount, currency: g.currency)) / \(Fmt.amount(g.targetAmount, currency: g.currency))"
        var parts: [String] = [g.name, pctLabel, amounts]
        if let iso = g.deadline, let status = deadlineStatus(iso) {
            switch status {
            case .overdue: parts.append(locale.t("goals.overdue"))
            case .today: parts.append(locale.t("goals.today"))
            case .tomorrow: parts.append(locale.t("goals.tomorrow"))
            case .normal: parts.append("\(locale.t("goals.deadline")): \(Fmt.dayMonth(iso))")
            }
        }
        return parts.joined(separator: ", ")
    }
}

struct GoalCreateSheet: View {
    let onSubmit: (GoalCreate) -> Void
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var locale: AppLocale

    @State private var name = ""
    @State private var target = ""
    @State private var currency = "PLN"
    @State private var deadline = Date().addingTimeInterval(60*60*24*90)
    @State private var hasDeadline = false
    @State private var emoji = "🎯"
    @State private var priority = "medium"
    @State private var category = "vacation"

    private var categoryChoices: [(id: String, emoji: String, label: String)] {
        [
            ("vacation", "🏖️", locale.t("goals.catVacation")),
            ("car", "🚗", locale.t("goals.catCar")),
            ("electronics", "💻", locale.t("goals.catElectronics")),
            ("home", "🏠", locale.t("goals.catHome")),
            ("emergency", "🛡️", locale.t("goals.catEmergency")),
            ("education", "🎓", locale.t("goals.catEducation")),
            ("wedding", "💍", locale.t("goals.catWedding")),
            ("retirement", "🌴", locale.t("goals.catRetirement")),
            ("other", "🎯", locale.t("goals.catOther")),
        ]
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: Theme.Spacing.md) {
                    NBTextField(label: locale.t("goals.nameLabel"), text: $name, placeholder: locale.t("goals.namePh"))
                    NBTextField(label: locale.t("goals.targetLabel"), text: $target, placeholder: locale.t("goals.targetPh"), keyboardType: .decimalPad)
                    NBTextField(label: locale.t("goals.currencyLabel"), text: $currency, placeholder: "PLN", autocapitalization: .characters)
                    NBTextField(label: locale.t("goals.emojiLabel"), text: $emoji, placeholder: "🎯", autocapitalization: .never)

                    VStack(alignment: .leading, spacing: Theme.Spacing.xxs) {
                        Text(locale.t("goals.categoryLabel"))
                            .font(AppFont.bodyMedium)
                            .foregroundColor(Theme.foreground)
                        LazyVGrid(columns: [GridItem(.adaptive(minimum: 100), spacing: 6)], spacing: 6) {
                            ForEach(categoryChoices, id: \.id) { c in
                                Button {
                                    Haptics.selection()
                                    category = c.id
                                    emoji = c.emoji
                                } label: {
                                    HStack(spacing: 4) {
                                        Text(c.emoji)
                                            .accessibilityHidden(true)
                                        Text(c.label).font(AppFont.caption)
                                    }
                                    .padding(.horizontal, 8)
                                    .padding(.vertical, 6)
                                    .background(category == c.id ? Theme.foreground : Theme.muted)
                                    .foregroundColor(category == c.id ? Theme.background : Theme.foreground)
                                    .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.sm))
                                    .overlay(
                                        RoundedRectangle(cornerRadius: Theme.Radius.sm)
                                            .stroke(Theme.border, lineWidth: Theme.Border.widthThin)
                                    )
                                }
                                .buttonStyle(.plain)
                                .accessibilityLabel(c.label)
                                .accessibilityAddTraits(category == c.id ? [.isButton, .isSelected] : .isButton)
                            }
                        }
                    }

                    Toggle(locale.t("goals.hasDeadline"), isOn: $hasDeadline)
                        .font(AppFont.bodyMedium)
                        .tint(Theme.foreground)
                    if hasDeadline {
                        VStack(alignment: .leading, spacing: Theme.Spacing.xxs) {
                            Text(locale.t("goals.deadlineLabel"))
                                .font(AppFont.bodyMedium)
                                .foregroundColor(Theme.foreground)
                            DatePicker("", selection: $deadline, displayedComponents: .date)
                                .labelsHidden()
                        }
                    }
                }
                .padding(Theme.Spacing.md)
            }
            .background(Theme.background)
            .navigationTitle(locale.t("goals.newTitle"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(locale.t("common.cancel")) {
                        Haptics.selection()
                        dismiss()
                    }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(locale.t("common.save")) {
                        // Primary CTA — medium impact at commit so the press
                        // feels acknowledged before the network round-trip
                        // resolves. Success/error notification fires from
                        // the parent `onSubmit` callback.
                        Haptics.impact(.medium)
                        let df = DateFormatter(); df.dateFormat = "yyyy-MM-dd"
                        let body = GoalCreate(
                            name: name,
                            emoji: emoji.isEmpty ? nil : emoji,
                            targetAmount: Double(target) ?? 0,
                            deadline: hasDeadline ? df.string(from: deadline) : nil,
                            priority: priority,
                            color: nil,
                            category: category,
                            currency: currency.uppercased(),
                            lang: nil
                        )
                        onSubmit(body)
                        dismiss()
                    }
                    .disabled(name.isEmpty || Double(target) == nil)
                }
            }
        }
        // Multi-detent sheet — `.medium` shows the form preview; the user
        // drags to `.large` for the full keyboard + scroll. Standard iOS
        // 17 pattern matching Apple Wallet / Photos.
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
    }
}

struct DepositSheet: View {
    let goal: SavingsGoal
    let onSubmit: (Double, String?) -> Void

    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var locale: AppLocale
    @State private var amount = ""
    @State private var note = ""

    /// Round to a "human-friendly" denomination so quick-amount buttons
    /// always show clean numbers regardless of how big the goal is.
    private static func roundQuick(_ n: Double) -> Int {
        guard n > 0 else { return 0 }
        if n < 10 { return max(1, Int(n.rounded())) }
        if n < 100 { return Int((n / 5).rounded()) * 5 }
        if n < 1000 { return Int((n / 10).rounded()) * 10 }
        if n < 10000 { return Int((n / 50).rounded()) * 50 }
        return Int((n / 100).rounded()) * 100
    }

    private static let fallbackQuickAmounts: [Int] = [50, 100, 200, 500]

    /// Smart quick amounts: 5%/10%/25%/50% of remaining, deduped + rounded.
    /// Falls back to fixed values when the goal is missing target data.
    private var quickAmounts: [Int] {
        let remaining = goal.targetAmount.double - goal.currentAmount.double
        guard remaining > 0 else { return Self.fallbackQuickAmounts }
        let raw = [remaining * 0.05, remaining * 0.10, remaining * 0.25, remaining * 0.50]
            .map { Self.roundQuick($0) }
            .filter { $0 > 0 }
        var unique: [Int] = []
        for v in raw where !unique.contains(v) { unique.append(v) }
        if unique.count < 4 {
            for v in Self.fallbackQuickAmounts where !unique.contains(v) {
                unique.append(v)
                if unique.count >= 4 { break }
            }
        }
        return Array(unique.sorted().prefix(4))
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: Theme.Spacing.md) {
                    VStack(alignment: .leading, spacing: 4) {
                        HStack {
                            Text(goal.emoji ?? "🎯")
                                .font(.largeTitle)
                                .accessibilityHidden(true)
                            VStack(alignment: .leading) {
                                Text(goal.name).font(AppFont.cardTitle)
                                Text("\(Fmt.amount(goal.currentAmount, currency: goal.currency)) / \(Fmt.amount(goal.targetAmount, currency: goal.currency))")
                                    .font(AppFont.caption)
                                    .foregroundColor(Theme.mutedForeground)
                            }
                        }
                    }
                    .padding(Theme.Spacing.sm)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .nbCard(radius: Theme.Radius.md, shadow: Theme.Shadow.sm)
                    // Header card — let VoiceOver announce as one element so
                    // user hears "Wakacje, 1500 z 3000 PLN" without iterating
                    // the emoji.
                    .accessibilityElement(children: .combine)
                    .accessibilityAddTraits(.isHeader)

                    NBTextField(label: locale.t("goals.amountLabel"), text: $amount, placeholder: "0.00", keyboardType: .decimalPad)

                    // Smart quick amounts — scales to remaining goal so big
                    // goals don't show meaningless "+50" buttons.
                    VStack(alignment: .leading, spacing: Theme.Spacing.xxs) {
                        Text(locale.t("goals.quickAmounts"))
                            .font(AppFont.bodyMedium)
                            .foregroundColor(Theme.foreground)
                        LazyVGrid(columns: [
                            GridItem(.flexible(), spacing: 6),
                            GridItem(.flexible(), spacing: 6),
                            GridItem(.flexible(), spacing: 6),
                            GridItem(.flexible(), spacing: 6),
                        ], spacing: 6) {
                            ForEach(quickAmounts, id: \.self) { qa in
                                Button {
                                    Haptics.selection()
                                    amount = String(qa)
                                } label: {
                                    Text("+\(Fmt.intGrouped(qa))")
                                        .font(AppFont.bodyMedium)
                                        .foregroundColor(amount == String(qa) ? Theme.background : Theme.foreground)
                                        .frame(maxWidth: .infinity, minHeight: 40)
                                        .background(amount == String(qa) ? Theme.foreground : Theme.muted)
                                        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.sm))
                                        .overlay(
                                            RoundedRectangle(cornerRadius: Theme.Radius.sm)
                                                .stroke(Theme.border, lineWidth: Theme.Border.widthThin)
                                        )
                                }
                                .buttonStyle(.plain)
                                .accessibilityLabel("+\(Fmt.intGrouped(qa)) \(goal.currency)")
                                .accessibilityAddTraits(amount == String(qa) ? [.isButton, .isSelected] : .isButton)
                            }
                        }
                    }

                    NBTextField(label: locale.t("goals.noteLabel"), text: $note, placeholder: locale.t("goals.notePh"))
                }
                .padding(Theme.Spacing.md)
            }
            .background(Theme.background)
            .navigationTitle(locale.t("goals.addFundsTitle"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(locale.t("common.cancel")) {
                        Haptics.selection()
                        dismiss()
                    }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(locale.t("common.save")) {
                        // Money commit — medium impact so the deposit feels
                        // weighty. Parent fires success/error notification
                        // once the API confirms.
                        guard let v = Double(amount) else { return }
                        Haptics.impact(.medium)
                        onSubmit(v, note.isEmpty ? nil : note)
                    }
                    .disabled(Double(amount) == nil)
                }
            }
        }
        // Compact sheet — deposit form is short, medium detent is enough.
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
    }
}
