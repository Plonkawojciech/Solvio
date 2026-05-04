import SwiftUI

/// Financial challenges — parity with `/app/(protected)/challenges`.
/// The backend auto-maintains `isActive` / `isCompleted` / `currentProgress`
/// based on expense activity; create lets the user pick a type + target.
///
/// NOTE: `ChallengesRepo` exposes only `list()` + `create(_:)` — the web
/// API has no PATCH/DELETE endpoints, so the iOS UI mirrors that.
///
/// Reads from `AppDataStore.challenges` so tab switches don't re-fetch.
struct ChallengesView: View {
    @EnvironmentObject private var toast: ToastCenter
    @EnvironmentObject private var locale: AppLocale
    @EnvironmentObject private var store: AppDataStore
    @State private var showCreate = false
    @State private var showCompleted = false

    private var challenges: [Challenge] { store.challenges }
    private var isLoading: Bool { store.challengesLoading }
    private var errorMessage: String? { store.challengesError }
    private var currency: String { store.currency }
    private var activeChallenges: [Challenge] {
        challenges.filter { ($0.isActive ?? false) && ($0.isCompleted != true) }
    }
    private var completedChallenges: [Challenge] {
        challenges.filter { $0.isCompleted == true }
    }
    /// Sum of current progress across all challenges — best-effort "saved" KPI.
    private var totalSaved: Double {
        challenges.reduce(0) { $0 + ($1.currentProgress?.double ?? 0) }
    }

    var body: some View {
        ZStack(alignment: .bottomTrailing) {
            ScrollView {
                VStack(alignment: .leading, spacing: Theme.Spacing.md) {
                    NBScreenHeader(
                        eyebrow: locale.t("challenges.eyebrow"),
                        title: locale.t("challenges.headerTitle"),
                        subtitle: "\(activeChallenges.count) \(locale.t("challenges.active").lowercased()) · \(completedChallenges.count) \(locale.t("challenges.completed").lowercased())"
                    )

                    if isLoading && challenges.isEmpty {
                        NBSkeletonList(rows: 4)
                    } else if let message = errorMessage, challenges.isEmpty {
                        NBErrorCard(message: message) { Task { await store.awaitChallenges(force: true) } }
                    } else if challenges.isEmpty {
                        NBEmptyState(
                            systemImage: "trophy.fill",
                            title: locale.t("challenges.emptyTitle"),
                            subtitle: locale.t("challenges.emptySub"),
                            action: (label: locale.t("challenges.new"), run: { showCreate = true })
                        )
                    } else {
                        kpiStrip
                        if !activeChallenges.isEmpty {
                            sectionHeader(locale.t("challenges.sectionActive"), count: activeChallenges.count)
                            LazyVStack(spacing: Theme.Spacing.xs) {
                                ForEach(activeChallenges) { c in
                                    activeCard(c)
                                }
                            }
                        }
                        if !completedChallenges.isEmpty {
                            completedSection
                        }
                    }
                    Spacer(minLength: 96)
                }
                .padding(.horizontal, Theme.Spacing.md)
                .padding(.top, Theme.Spacing.md)
            }
            .background(Theme.background)
            .refreshable { await store.awaitChallenges(force: true) }
            .task { store.ensureChallenges() }

            Button { showCreate = true } label: {
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
        }
        .sheet(isPresented: $showCreate) {
            ChallengeCreateSheet { body in
                Task {
                    do {
                        _ = try await ChallengesRepo.create(body)
                        toast.success(locale.t("challenges.created"))
                        store.didMutateChallenges()
                    } catch {
                        toast.error(locale.t("challenges.createFailed"), description: error.localizedDescription)
                    }
                }
            }
            .environmentObject(locale)
        }
    }

    // MARK: - KPI

    private var kpiStrip: some View {
        LazyVGrid(columns: [
            GridItem(.flexible(), spacing: Theme.Spacing.xs),
            GridItem(.flexible(), spacing: Theme.Spacing.xs),
            GridItem(.flexible(), spacing: Theme.Spacing.xs),
        ], spacing: Theme.Spacing.xs) {
            NBStatTile(label: locale.t("challenges.statActive"), value: "\(activeChallenges.count)")
            NBStatTile(label: locale.t("challenges.statCompleted"), value: "\(completedChallenges.count)")
            NBStatTile(label: locale.t("challenges.statSaved"), value: Fmt.amount(totalSaved, currency: currency))
        }
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

    // MARK: - Active card

    private func activeCard(_ c: Challenge) -> some View {
        let target = c.targetAmount?.double ?? 0
        let progress = c.currentProgress?.double ?? 0
        let pct = target > 0 ? progress / target : 0
        let daysLeft = Self.daysUntil(c.endDate)

        return VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .top, spacing: Theme.Spacing.sm) {
                Text(c.emoji ?? "💪")
                    .font(.system(size: 28))
                    .frame(width: 44, height: 44)
                    .background(Theme.muted)
                    .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.sm))
                    .overlay(
                        RoundedRectangle(cornerRadius: Theme.Radius.sm)
                            .stroke(Theme.border, lineWidth: Theme.Border.widthThin)
                    )
                VStack(alignment: .leading, spacing: 4) {
                    Text(c.name)
                        .font(AppFont.bodyMedium)
                        .foregroundColor(Theme.foreground)
                    HStack(spacing: 6) {
                        NBTag(text: c.type.uppercased())
                        if let cat = c.targetCategory {
                            Text(cat)
                                .font(AppFont.caption)
                                .foregroundColor(Theme.mutedForeground)
                        }
                    }
                }
                Spacer()
                if let days = daysLeft {
                    VStack(alignment: .trailing, spacing: 2) {
                        Text("\(days)")
                            .font(AppFont.monoBold(16))
                            .foregroundColor(Theme.foreground)
                        Text(days == 1 ? locale.t("challenges.dayLeft") : locale.t("challenges.daysLeft"))
                            .font(AppFont.mono(10))
                            .foregroundColor(Theme.mutedForeground)
                    }
                }
            }
            if target > 0 {
                NBProgressBar(value: pct, over: pct > 1)
                HStack {
                    Text("\(Fmt.amount(progress, currency: currency)) / \(Fmt.amount(target, currency: currency))")
                        .font(AppFont.caption)
                        .foregroundColor(Theme.mutedForeground)
                    Spacer()
                    Text("\(Int(min(100, pct * 100)))%")
                        .font(AppFont.mono(11))
                        .foregroundColor(Theme.mutedForeground)
                }
            }
            HStack {
                Text("\(Fmt.dayMonth(c.startDate)) – \(Fmt.dayMonth(c.endDate))")
                    .font(AppFont.caption)
                    .foregroundColor(Theme.mutedForeground)
                Spacer()
            }
        }
        .padding(Theme.Spacing.sm)
        .nbCard(radius: Theme.Radius.md, shadow: Theme.Shadow.sm)
    }

    // MARK: - Completed collapsible

    private var completedSection: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
            Button {
                showCompleted.toggle()
            } label: {
                HStack {
                    Image(systemName: "checkmark.seal.fill")
                        .foregroundColor(Theme.success)
                    Text(String(format: locale.t("challenges.completedCountFmt"), completedChallenges.count))
                        .font(AppFont.bodyMedium)
                        .foregroundColor(Theme.foreground)
                    Spacer()
                    Image(systemName: showCompleted ? "chevron.up" : "chevron.down")
                        .foregroundColor(Theme.mutedForeground)
                }
                .padding(Theme.Spacing.sm)
                .frame(maxWidth: .infinity)
                .nbCard(radius: Theme.Radius.md, shadow: Theme.Shadow.sm)
            }
            .buttonStyle(.plain)

            if showCompleted {
                ForEach(completedChallenges) { c in
                    completedRow(c)
                }
            }
        }
        .padding(.top, Theme.Spacing.sm)
    }

    private func completedRow(_ c: Challenge) -> some View {
        HStack(spacing: Theme.Spacing.sm) {
            Text(c.emoji ?? "🏆").font(.title2)
            VStack(alignment: .leading, spacing: 2) {
                Text(c.name)
                    .font(AppFont.bodyMedium)
                    .foregroundColor(Theme.foreground)
                if let target = c.targetAmount {
                    Text(Fmt.amount(target, currency: currency))
                        .font(AppFont.caption)
                        .foregroundColor(Theme.mutedForeground)
                }
            }
            Spacer()
            Image(systemName: "checkmark.seal.fill")
                .foregroundColor(Theme.success)
        }
        .padding(Theme.Spacing.sm)
        .nbCard(radius: Theme.Radius.sm, shadow: Theme.Shadow.sm)
    }

    // MARK: - Helpers

    private static func daysUntil(_ iso: String?) -> Int? {
        guard let iso else { return nil }
        let df = DateFormatter()
        df.dateFormat = "yyyy-MM-dd"
        guard let target = df.date(from: String(iso.prefix(10))) else { return nil }
        let days = Calendar.current.dateComponents([.day], from: Date(), to: target).day ?? 0
        return max(0, days)
    }
}

// MARK: - Create sheet

struct ChallengeCreateSheet: View {
    let onSubmit: (ChallengeCreate) -> Void
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var locale: AppLocale

    @State private var name = ""
    @State private var emoji = "💪"
    @State private var type = "no_spend"
    @State private var targetCategory = ""
    @State private var targetAmount = ""
    @State private var startDate = Date()
    @State private var endDate = Date().addingTimeInterval(60 * 60 * 24 * 30)

    private let emojiChoices = ["🏆", "🎯", "💪", "🔥", "⭐️", "💎", "🚀", "🎁"]
    private var typeChoices: [(id: String, label: String)] {
        [
            ("no_spend", locale.t("challenges.typeNoSpend")),
            ("budget_cap", locale.t("challenges.typeBudget")),
            ("savings", locale.t("challenges.typeSavings")),
            ("streak", locale.t("challenges.typeStreak")),
        ]
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: Theme.Spacing.md) {
                    NBTextField(label: locale.t("challenges.nameLabel"), text: $name, placeholder: locale.t("challenges.namePh"))

                    VStack(alignment: .leading, spacing: Theme.Spacing.xxs) {
                        Text(locale.t("challenges.emojiLabel"))
                            .font(AppFont.bodyMedium)
                            .foregroundColor(Theme.foreground)
                        LazyVGrid(columns: [GridItem(.adaptive(minimum: 52), spacing: 6)], spacing: 6) {
                            ForEach(emojiChoices, id: \.self) { e in
                                Button {
                                    emoji = e
                                } label: {
                                    Text(e)
                                        .font(.system(size: 22))
                                        .frame(width: 44, height: 44)
                                        .background(emoji == e ? Theme.foreground : Theme.muted)
                                        .foregroundColor(emoji == e ? Theme.background : Theme.foreground)
                                        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.sm))
                                        .overlay(
                                            RoundedRectangle(cornerRadius: Theme.Radius.sm)
                                                .stroke(Theme.border, lineWidth: Theme.Border.widthThin)
                                        )
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }

                    VStack(alignment: .leading, spacing: Theme.Spacing.xxs) {
                        Text(locale.t("challenges.typeLabel"))
                            .font(AppFont.bodyMedium)
                            .foregroundColor(Theme.foreground)
                        LazyVGrid(columns: [GridItem(.adaptive(minimum: 100), spacing: 6)], spacing: 6) {
                            ForEach(typeChoices, id: \.id) { opt in
                                Button {
                                    type = opt.id
                                } label: {
                                    Text(opt.label)
                                        .font(AppFont.caption)
                                        .padding(.horizontal, 10)
                                        .padding(.vertical, 8)
                                        .frame(maxWidth: .infinity)
                                        .background(type == opt.id ? Theme.foreground : Theme.muted)
                                        .foregroundColor(type == opt.id ? Theme.background : Theme.foreground)
                                        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.sm))
                                        .overlay(
                                            RoundedRectangle(cornerRadius: Theme.Radius.sm)
                                                .stroke(Theme.border, lineWidth: Theme.Border.widthThin)
                                        )
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }

                    NBTextField(label: locale.t("challenges.categoryLabel"), text: $targetCategory, placeholder: "Food")
                    NBTextField(label: locale.t("challenges.targetLabel"), text: $targetAmount, placeholder: "0.00", keyboardType: .decimalPad)

                    VStack(alignment: .leading, spacing: Theme.Spacing.xxs) {
                        Text(locale.t("challenges.startDate"))
                            .font(AppFont.bodyMedium)
                            .foregroundColor(Theme.foreground)
                        DatePicker("", selection: $startDate, displayedComponents: .date)
                            .labelsHidden()
                    }

                    VStack(alignment: .leading, spacing: Theme.Spacing.xxs) {
                        Text(locale.t("challenges.endDate"))
                            .font(AppFont.bodyMedium)
                            .foregroundColor(Theme.foreground)
                        DatePicker("", selection: $endDate, in: startDate..., displayedComponents: .date)
                            .labelsHidden()
                    }
                }
                .padding(Theme.Spacing.md)
            }
            .background(Theme.background)
            .navigationTitle(locale.t("challenges.new"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button(locale.t("common.cancel")) { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button(locale.t("common.save")) {
                        let df = DateFormatter(); df.dateFormat = "yyyy-MM-dd"
                        let body = ChallengeCreate(
                            name: name,
                            emoji: emoji,
                            type: type,
                            targetCategory: targetCategory.isEmpty ? nil : targetCategory,
                            targetAmount: Double(targetAmount),
                            startDate: df.string(from: startDate),
                            endDate: df.string(from: endDate)
                        )
                        onSubmit(body)
                        dismiss()
                    }
                    .disabled(name.isEmpty)
                }
            }
        }
    }
}
