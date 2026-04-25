import SwiftUI

struct GoalDetailView: View {
    let goalId: String

    @EnvironmentObject private var toast: ToastCenter
    @EnvironmentObject private var router: AppRouter
    @EnvironmentObject private var locale: AppLocale
    @StateObject private var vm = GoalDetailViewModel()
    @State private var showDepositSheet = false
    @State private var showDelete = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Theme.Spacing.md) {
                if vm.isLoading && vm.goal == nil {
                    NBLoadingCard()
                } else if let message = vm.errorMessage, vm.goal == nil {
                    NBErrorCard(message: message) { Task { await vm.load(id: goalId, locale: locale) } }
                } else if let g = vm.goal {
                    hero(g)
                    kpiRow(g)
                    if let tips = g.aiTips, !tips.isEmpty {
                        aiTips(tips)
                    }
                    actions(g)
                    if let deposits = g.deposits, !deposits.isEmpty {
                        depositsSection(deposits, currency: g.currency)
                    }
                }
                Spacer(minLength: Theme.Spacing.xl)
            }
            .padding(.horizontal, Theme.Spacing.md)
            .padding(.top, Theme.Spacing.md)
        }
        .background(Theme.background)
        .navigationTitle(locale.t("goalDetail.title"))
        .navigationBarTitleDisplayMode(.inline)
        .task { await vm.load(id: goalId, locale: locale) }
        .refreshable { await vm.load(id: goalId, locale: locale) }
        .sheet(isPresented: $showDepositSheet) {
            if let g = vm.goal {
                DepositSheet(goal: g) { amount, note in
                    Task {
                        do {
                            _ = try await GoalsRepo.deposit(goalId: goalId, amount: amount, note: note)
                            toast.success(locale.t("goalDetail.fundsAdded"))
                            showDepositSheet = false
                            await vm.load(id: goalId, locale: locale)
                        } catch {
                            toast.error(locale.t("goalDetail.failed"), description: error.localizedDescription)
                        }
                    }
                }
                .environmentObject(locale)
            }
        }
        .alert(locale.t("goalDetail.deleteConfirm"), isPresented: $showDelete) {
            Button(locale.t("common.cancel"), role: .cancel) {}
            Button(locale.t("common.delete"), role: .destructive) {
                Task {
                    do {
                        try await GoalsRepo.delete(id: goalId)
                        toast.success(locale.t("goalDetail.deleted"))
                        router.popToRoot()
                    } catch {
                        toast.error(locale.t("goalDetail.deleteFailed"), description: error.localizedDescription)
                    }
                }
            }
        } message: {
            Text(locale.t("goalDetail.deleteMsg"))
        }
    }

    private func hero(_ g: SavingsGoal) -> some View {
        let target = g.targetAmount.double
        let current = g.currentAmount.double
        let pct = target > 0 ? min(current / target, 1) : 0
        let pctLabel = Int((pct * 100).rounded())
        let remaining = max(target - current, 0)
        return VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
            HStack(spacing: Theme.Spacing.sm) {
                Text(g.emoji ?? "🎯")
                    .font(.system(size: 44))
                    .frame(width: 56, height: 56)
                    .background(Theme.muted)
                    .overlay(RoundedRectangle(cornerRadius: Theme.Radius.md).stroke(Theme.foreground, lineWidth: Theme.Border.width))
                VStack(alignment: .leading, spacing: 2) {
                    NBEyebrow(text: g.category?.uppercased() ?? locale.t("goalDetail.goalFallback"))
                    Text(g.name)
                        .font(AppFont.pageTitle)
                        .foregroundColor(Theme.foreground)
                        .multilineTextAlignment(.leading)
                }
                Spacer()
                if g.isCompleted == true {
                    Image(systemName: "checkmark.seal.fill")
                        .font(.title2)
                        .foregroundColor(Theme.success)
                }
            }

            Text(Fmt.amount(g.currentAmount, currency: g.currency))
                .font(AppFont.black(34))
                .foregroundColor(Theme.foreground)
            Text(String(format: locale.t("goalDetail.ofFmt"), Fmt.amount(g.targetAmount, currency: g.currency), "\(pctLabel)"))
                .font(AppFont.caption)
                .foregroundColor(Theme.mutedForeground)

            NBProgressBar(value: pct)

            HStack(spacing: Theme.Spacing.md) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(locale.t("goalDetail.remaining")).font(AppFont.caption).foregroundColor(Theme.mutedForeground)
                    Text(Fmt.amount(MoneyString(remaining), currency: g.currency))
                        .font(AppFont.cardTitle)
                        .foregroundColor(Theme.foreground)
                }
                if let deadline = g.deadline {
                    Spacer()
                    VStack(alignment: .trailing, spacing: 2) {
                        Text(locale.t("goalDetail.deadlineLabel")).font(AppFont.caption).foregroundColor(Theme.mutedForeground)
                        Text(Fmt.date(deadline))
                            .font(AppFont.cardTitle)
                            .foregroundColor(Theme.foreground)
                    }
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(Theme.Spacing.md)
        .nbCard(radius: Theme.Radius.lg, shadow: Theme.Shadow.lg)
    }

    private func kpiRow(_ g: SavingsGoal) -> some View {
        let target = g.targetAmount.double
        let current = g.currentAmount.double
        let remaining = max(target - current, 0)
        let monthlyNeeded = monthsRemaining(deadline: g.deadline).map { months in
            months > 0 ? remaining / Double(months) : remaining
        } ?? (remaining / 12)
        let depositCount = g.deposits?.count ?? 0
        return HStack(spacing: Theme.Spacing.sm) {
            miniKPI(
                label: locale.t("goalDetail.perMonth"),
                value: Fmt.amount(MoneyString(monthlyNeeded), currency: g.currency),
                systemImage: "calendar"
            )
            miniKPI(
                label: locale.t("goalDetail.deposits"),
                value: "\(depositCount)",
                systemImage: "arrow.down.circle"
            )
            if let priority = g.priority {
                miniKPI(
                    label: locale.t("goalDetail.priority"),
                    value: priority.capitalized,
                    systemImage: priorityIcon(priority)
                )
            }
        }
    }

    private func miniKPI(label: String, value: String, systemImage: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 4) {
                Image(systemName: systemImage)
                    .font(.caption)
                    .foregroundColor(Theme.mutedForeground)
                Text(label)
                    .font(AppFont.caption)
                    .foregroundColor(Theme.mutedForeground)
            }
            Text(value)
                .font(AppFont.cardTitle)
                .foregroundColor(Theme.foreground)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(Theme.Spacing.sm)
        .nbCard(radius: Theme.Radius.md, shadow: Theme.Shadow.sm)
    }

    private func aiTips(_ tips: [String]) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
            HStack(spacing: 6) {
                Image(systemName: "sparkles")
                NBEyebrow(text: locale.t("goalDetail.aiCoach"))
            }
            ForEach(Array(tips.enumerated()), id: \.offset) { _, tip in
                HStack(alignment: .top, spacing: 6) {
                    Text("•").foregroundColor(Theme.mutedForeground)
                    Text(tip)
                        .font(AppFont.body)
                        .foregroundColor(Theme.foreground)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(Theme.Spacing.md)
        .nbCard(radius: Theme.Radius.md, shadow: Theme.Shadow.sm)
    }

    private func actions(_ g: SavingsGoal) -> some View {
        VStack(spacing: Theme.Spacing.xs) {
            if g.isCompleted != true {
                Button { showDepositSheet = true } label: {
                    Label(locale.t("goalDetail.addFunds"), systemImage: "plus")
                }
                .buttonStyle(NBPrimaryButtonStyle())
            }

            Button { showDelete = true } label: {
                Label(locale.t("goalDetail.deleteGoal"), systemImage: "trash")
            }
            .buttonStyle(NBDestructiveButtonStyle())
        }
    }

    private func depositsSection(_ deposits: [SavingsDeposit], currency: String) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
            NBEyebrow(text: locale.t("goalDetail.depositsHistory"))
            VStack(spacing: 0) {
                ForEach(deposits) { dep in
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(Fmt.amount(dep.amount, currency: currency))
                                .font(AppFont.cardTitle)
                                .foregroundColor(Theme.foreground)
                            if let note = dep.note, !note.isEmpty {
                                Text(note)
                                    .font(AppFont.caption)
                                    .foregroundColor(Theme.mutedForeground)
                            }
                        }
                        Spacer()
                        if let created = dep.createdAt {
                            Text(Fmt.date(created))
                                .font(AppFont.caption)
                                .foregroundColor(Theme.mutedForeground)
                        }
                    }
                    .padding(.vertical, Theme.Spacing.xs)
                    if dep.id != deposits.last?.id {
                        Divider().background(Theme.foreground)
                    }
                }
            }
            .padding(Theme.Spacing.md)
            .frame(maxWidth: .infinity, alignment: .leading)
            .nbCard(radius: Theme.Radius.md, shadow: Theme.Shadow.sm)
        }
    }

    private func priorityIcon(_ priority: String) -> String {
        switch priority.lowercased() {
        case "high": return "flame"
        case "medium": return "equal.circle"
        default: return "leaf"
        }
    }

    private func monthsRemaining(deadline: String?) -> Int? {
        guard let deadline else { return nil }
        let iso = ISO8601DateFormatter()
        let df = DateFormatter()
        df.dateFormat = "yyyy-MM-dd"
        let date = iso.date(from: deadline) ?? df.date(from: deadline)
        guard let target = date else { return nil }
        let days = Calendar.current.dateComponents([.day], from: Date(), to: target).day ?? 0
        return max(days / 30, 0)
    }
}

@MainActor
final class GoalDetailViewModel: ObservableObject {
    @Published var goal: SavingsGoal?
    @Published var isLoading = false
    @Published var errorMessage: String?

    func load(id: String, locale: AppLocale) async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            let all = try await GoalsRepo.list()
            goal = all.first(where: { $0.id == id })
            if goal == nil { errorMessage = locale.t("goalDetail.notFound") }
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
