import SwiftUI

/// Savings goals list — parity with `/app/(protected)/goals`. Emoji-first
/// card, progress bar, quick deposit action via `/api/personal/goals/[id]/deposit`.
struct GoalsListView: View {
    @EnvironmentObject private var router: AppRouter
    @EnvironmentObject private var toast: ToastCenter
    @EnvironmentObject private var locale: AppLocale
    @StateObject private var vm = GoalsViewModel()
    @State private var showCreate = false
    @State private var depositTarget: SavingsGoal?
    @State private var pendingDelete: SavingsGoal?
    @State private var showCompleted = false
    @State private var showAiTip = false

    var body: some View {
        ZStack(alignment: .bottomTrailing) {
            List {
                Section {
                    VStack(alignment: .leading, spacing: Theme.Spacing.md) {
                        NBScreenHeader(
                            eyebrow: locale.t("goals.eyebrow"),
                            title: locale.t("goals.headerTitle"),
                            subtitle: "\(vm.activeGoals.count) \(locale.t("goals.sectionActive").lowercased()) · \(vm.completedGoals.count) \(locale.t("goals.statCompleted").lowercased())"
                        )
                    }
                    .padding(.horizontal, Theme.Spacing.md)
                    .padding(.top, Theme.Spacing.md)
                }
                .listRowBackground(Color.clear)
                .listRowSeparator(.hidden)
                .listRowInsets(EdgeInsets())

                if vm.isLoading && vm.goals.isEmpty {
                    Section {
                        NBLoadingCard()
                            .padding(.horizontal, Theme.Spacing.md)
                    }
                    .listRowBackground(Color.clear)
                    .listRowSeparator(.hidden)
                    .listRowInsets(EdgeInsets())
                } else if let message = vm.errorMessage {
                    Section {
                        NBErrorCard(message: message) { Task { await vm.load() } }
                            .padding(.horizontal, Theme.Spacing.md)
                    }
                    .listRowBackground(Color.clear)
                    .listRowSeparator(.hidden)
                    .listRowInsets(EdgeInsets())
                } else if vm.goals.isEmpty {
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
                            sectionHeader(locale.t("goals.sectionActive"), count: vm.activeGoals.count)
                        }
                        .padding(.horizontal, Theme.Spacing.md)
                    }
                    .listRowBackground(Color.clear)
                    .listRowSeparator(.hidden)
                    .listRowInsets(EdgeInsets())

                    Section {
                        ForEach(vm.activeGoals) { g in
                            Button {
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
                            .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                                Button(role: .destructive) {
                                    pendingDelete = g
                                } label: {
                                    Label(locale.t("common.delete"), systemImage: "trash")
                                }
                            }
                            .swipeActions(edge: .leading, allowsFullSwipe: false) {
                                Button {
                                    depositTarget = g
                                } label: {
                                    Label(locale.t("goals.addFunds"), systemImage: "plus.circle")
                                }
                                .tint(Theme.foreground)
                            }
                            .contextMenu {
                                Button(locale.t("goals.addFunds")) { depositTarget = g }
                                Button(locale.t("common.delete"), role: .destructive) {
                                    pendingDelete = g
                                }
                            }
                        }
                    }

                    if !vm.completedGoals.isEmpty {
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
            .refreshable { await vm.load() }
            .task { if vm.goals.isEmpty { await vm.load() } }
            .animation(.nbSpring, value: showCompleted)
            .animation(.nbSpring, value: showAiTip)

            Button { showCreate = true } label: {
                Image(systemName: "plus")
                    .font(.system(size: 22, weight: .bold))
                    .foregroundColor(Theme.background)
                    .frame(width: 56, height: 56)
                    .background(Theme.foreground)
                    .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.md))
                    .overlay(RoundedRectangle(cornerRadius: Theme.Radius.md).stroke(Theme.foreground, lineWidth: Theme.Border.width))
                    .nbShadow(Theme.Shadow.md)
            }
            .buttonStyle(.plain)
            .padding(.trailing, Theme.Spacing.md)
            .padding(.bottom, Theme.Spacing.md)
        }
        .sheet(isPresented: $showCreate) {
            GoalCreateSheet { body in
                Task {
                    do {
                        _ = try await GoalsRepo.create(body)
                        toast.success(locale.t("goals.created"))
                        await vm.load()
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
                Task { await vm.delete(id: g.id, locale: locale, toast: toast) }
            }
        } message: { g in
            Text(g.name)
        }
        .sheet(item: $depositTarget) { goal in
            DepositSheet(goal: goal) { amount, note in
                Task {
                    do {
                        _ = try await GoalsRepo.deposit(goalId: goal.id, amount: amount, note: note)
                        toast.success(locale.t("goals.fundsAdded"))
                        depositTarget = nil
                        await vm.load()
                    } catch {
                        toast.error(locale.t("goals.failed"), description: error.localizedDescription)
                    }
                }
            }
            .environmentObject(locale)
        }
    }

    private var kpiStrip: some View {
        LazyVGrid(columns: [GridItem(.flexible(), spacing: Theme.Spacing.xs), GridItem(.flexible(), spacing: Theme.Spacing.xs)], spacing: Theme.Spacing.xs) {
            NBStatTile(label: locale.t("goals.statSaved"), value: Fmt.amount(vm.totalSaved, currency: vm.currencyHint))
            NBStatTile(label: locale.t("goals.statActive"), value: "\(vm.activeGoals.count)")
            NBStatTile(label: locale.t("goals.statPerMonth"), value: Fmt.amount(vm.monthlyNeeded, currency: vm.currencyHint))
            NBStatTile(label: locale.t("goals.statCompleted"), value: "\(vm.completedGoals.count)")
        }
    }

    /// Tappable AI tip banner that expands in-place — one line collapsed,
    /// a concise suggestion when open. Keeps the list chrome quiet while
    /// still surfacing the tip.
    @ViewBuilder
    private var aiTipBanner: some View {
        let active = vm.activeGoals.count
        let perMonth = Fmt.amount(vm.monthlyNeeded, currency: vm.currencyHint)
        Button {
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
                                .stroke(Theme.foreground, lineWidth: Theme.Border.widthThin)
                        )
                    Text(locale.t("savings.aiTip"))
                        .font(AppFont.mono(10))
                        .tracking(1)
                        .textCase(.uppercase)
                        .foregroundColor(Theme.mutedForeground)
                    Spacer()
                    Image(systemName: showAiTip ? "chevron.up" : "chevron.down")
                        .font(.system(size: 11, weight: .bold))
                        .foregroundColor(Theme.mutedForeground)
                }
                if showAiTip {
                    Text("\(active) · \(perMonth)")
                        .font(AppFont.caption)
                        .foregroundColor(Theme.foreground)
                        .multilineTextAlignment(.leading)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .padding(Theme.Spacing.sm)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Theme.card.opacity(0.5))
            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.md))
            .overlay(
                RoundedRectangle(cornerRadius: Theme.Radius.md)
                    .stroke(Theme.foreground.opacity(0.3), lineWidth: Theme.Border.widthThin)
            )
        }
        .buttonStyle(.plain)
    }

    /// Collapsed list of completed goals — keeps the screen uncluttered
    /// while still letting users browse wins.
    private var completedDisclosure: some View {
        DisclosureGroup(isExpanded: Binding(
            get: { showCompleted },
            set: { newValue in
                withAnimation(.nbSpring) { showCompleted = newValue }
            }
        )) {
            VStack(spacing: Theme.Spacing.xs) {
                ForEach(vm.completedGoals) { g in
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
                Text("(\(vm.completedGoals.count))")
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
                .stroke(Theme.foreground.opacity(0.3), lineWidth: Theme.Border.widthThin)
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
                        .tracking(1)
                        .foregroundColor(Theme.mutedForeground)
                }
                NBProgressBar(value: pct)
                HStack {
                    Text("\(Fmt.amount(g.currentAmount, currency: g.currency)) / \(Fmt.amount(g.targetAmount, currency: g.currency))")
                        .font(AppFont.caption)
                        .foregroundColor(Theme.mutedForeground)
                    Spacer()
                    if let deadline = g.deadline {
                        Text(Fmt.dayMonth(deadline))
                            .font(AppFont.caption)
                            .foregroundColor(Theme.mutedForeground)
                    }
                }
            }
        }
    }

    private func completedRow(_ g: SavingsGoal) -> some View {
        HStack(spacing: Theme.Spacing.sm) {
            Text(g.emoji ?? "🎯").font(.title2)
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
        }
        .padding(Theme.Spacing.sm)
        .nbCard(radius: Theme.Radius.sm, shadow: Theme.Shadow.sm)
    }
}

@MainActor
final class GoalsViewModel: ObservableObject {
    @Published var goals: [SavingsGoal] = []
    @Published var isLoading = false
    @Published var errorMessage: String?

    var activeGoals: [SavingsGoal] { goals.filter { $0.isCompleted != true } }
    var completedGoals: [SavingsGoal] { goals.filter { $0.isCompleted == true } }
    var totalSaved: Double { goals.reduce(0) { $0 + $1.currentAmount.double } }

    /// Fallback currency for summary tiles when goals have mixed or missing currencies.
    var currencyHint: String { goals.first?.currency ?? "PLN" }

    /// Monthly savings needed across active goals — matches web helper.
    var monthlyNeeded: Double {
        activeGoals.reduce(0) { sum, g in
            let target = g.targetAmount.double
            let current = g.currentAmount.double
            let remaining = target - current
            guard remaining > 0 else { return sum }
            if let deadlineIso = g.deadline,
               let deadline = parseIsoDay(deadlineIso) {
                let daysLeft = max(1, Calendar.current.dateComponents([.day], from: Date(), to: deadline).day ?? 1)
                return sum + (remaining / Double(daysLeft)) * 30
            }
            return sum + remaining / 12
        }
    }

    private func parseIsoDay(_ s: String) -> Date? {
        let df = DateFormatter()
        df.dateFormat = "yyyy-MM-dd"
        return df.date(from: String(s.prefix(10)))
    }

    func load() async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            goals = try await GoalsRepo.list()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func delete(id: String, locale: AppLocale, toast: ToastCenter) async {
        do {
            try await GoalsRepo.delete(id: id)
            toast.success(locale.t("goals.deleted"))
            await load()
        } catch {
            toast.error(locale.t("goals.deleteFailed"), description: error.localizedDescription)
        }
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
                                    category = c.id
                                    emoji = c.emoji
                                } label: {
                                    HStack(spacing: 4) {
                                        Text(c.emoji)
                                        Text(c.label).font(AppFont.caption)
                                    }
                                    .padding(.horizontal, 8)
                                    .padding(.vertical, 6)
                                    .background(category == c.id ? Theme.foreground : Theme.muted)
                                    .foregroundColor(category == c.id ? Theme.background : Theme.foreground)
                                    .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.sm))
                                    .overlay(
                                        RoundedRectangle(cornerRadius: Theme.Radius.sm)
                                            .stroke(Theme.foreground, lineWidth: Theme.Border.widthThin)
                                    )
                                }
                                .buttonStyle(.plain)
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
                ToolbarItem(placement: .cancellationAction) { Button(locale.t("common.cancel")) { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button(locale.t("common.save")) {
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
    }
}

struct DepositSheet: View {
    let goal: SavingsGoal
    let onSubmit: (Double, String?) -> Void

    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var locale: AppLocale
    @State private var amount = ""
    @State private var note = ""

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: Theme.Spacing.md) {
                    VStack(alignment: .leading, spacing: 4) {
                        HStack {
                            Text(goal.emoji ?? "🎯").font(.largeTitle)
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

                    NBTextField(label: locale.t("goals.amountLabel"), text: $amount, placeholder: "0.00", keyboardType: .decimalPad)
                    NBTextField(label: locale.t("goals.noteLabel"), text: $note, placeholder: locale.t("goals.notePh"))
                }
                .padding(Theme.Spacing.md)
            }
            .background(Theme.background)
            .navigationTitle(locale.t("goals.addFundsTitle"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button(locale.t("common.cancel")) { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button(locale.t("common.save")) {
                        guard let v = Double(amount) else { return }
                        onSubmit(v, note.isEmpty ? nil : note)
                    }
                    .disabled(Double(amount) == nil)
                }
            }
        }
    }
}
