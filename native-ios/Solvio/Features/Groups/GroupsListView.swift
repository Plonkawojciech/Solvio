import SwiftUI

/// List of split-expense groups (trips, roommates, shared household).
/// Matches web `/app/(protected)/groups/page.tsx` — two top CTAs
/// (Quick Split + New Group), unsettled-debts banner, rich group
/// cards with member avatars + balance, and Recent Activity footer.
///
/// Reads from `AppDataStore.groups` so tab switches don't re-fetch.
struct GroupsListView: View {
    @EnvironmentObject private var router: AppRouter
    @EnvironmentObject private var session: SessionStore
    @EnvironmentObject private var toast: ToastCenter
    @EnvironmentObject private var locale: AppLocale
    @EnvironmentObject private var store: AppDataStore
    @State private var showCreate = false
    @State private var tipDismissed = false
    @State private var showRecentActivity = false
    @State private var pendingDelete: Group?

    /// Hex palette matching web `MEMBER_COLORS` in
    /// `app/(protected)/groups/page.tsx` for avatar backgrounds.
    private static let memberAvatarColors: [String] = [
        "#6366f1", "#ec4899", "#f59e0b", "#10b981",
        "#3b82f6", "#8b5cf6", "#ef4444", "#14b8a6",
    ]

    private var groups: [Group] { store.groups }
    private var isLoading: Bool { store.groupsLoading }
    private var errorMessage: String? { store.groupsError }

    /// Groups with a non-zero balance — used for both the AI tip banner
    /// and the Recent Activity preview (matches web's `.filter(abs > 0)`).
    private var unsettledGroups: [Group] {
        groups.filter { abs($0.totalBalance ?? 0) > 0.01 }
    }

    /// Sum of |balance| across all groups — shown in the banner.
    private var totalUnsettled: Double {
        groups.reduce(0) { $0 + abs($1.totalBalance ?? 0) }
    }

    var body: some View {
        List {
            Section {
                VStack(alignment: .leading, spacing: Theme.Spacing.md) {
                    header
                    topCTAs
                    if !tipDismissed && !unsettledGroups.isEmpty {
                        unsettledBanner
                    }
                }
                .padding(.horizontal, Theme.Spacing.md)
                .padding(.top, Theme.Spacing.md)
                .padding(.bottom, Theme.Spacing.xs)
            }
            .listRowBackground(Color.clear)
            .listRowSeparator(.hidden)
            .listRowInsets(EdgeInsets())

            content

            if !groups.isEmpty && !unsettledGroups.isEmpty {
                Section {
                    recentActivityDisclosure
                        .padding(.horizontal, Theme.Spacing.md)
                        .padding(.top, Theme.Spacing.sm)
                }
                .listRowBackground(Color.clear)
                .listRowSeparator(.hidden)
                .listRowInsets(EdgeInsets())
            }

            Section {
                Color.clear.frame(height: Theme.Spacing.xl)
            }
            .listRowBackground(Color.clear)
            .listRowSeparator(.hidden)
            .listRowInsets(EdgeInsets())
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .background(Theme.background)
        .refreshable { await store.awaitGroups(force: true) }
        .task { store.ensureGroups() }
        .animation(.nbSpring, value: showRecentActivity)
        .animation(.nbSpring, value: tipDismissed)
        .sheet(isPresented: $showCreate) {
            GroupCreateSheet { payload in
                Task {
                    do {
                        let finalPayload = payloadWithCreator(payload)
                        _ = try await GroupsRepo.create(finalPayload)
                        toast.success(locale.t("toast.created"))
                        store.didMutateGroups()
                    } catch {
                        toast.error(locale.t("toast.error"), description: error.localizedDescription)
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
                Task {
                    do {
                        try await GroupsRepo.delete(id: g.id)
                        toast.success(locale.t("toast.deleted"))
                        store.didMutateGroups()
                    } catch {
                        toast.error(locale.t("toast.error"), description: error.localizedDescription)
                    }
                }
            }
        } message: { g in
            Text(g.name)
        }
    }

    // MARK: - Top CTAs

    /// Two primary buttons matching web — Quick Split (secondary, bolt icon)
    /// and New Group (primary, plus icon). Quick Split routes to the first
    /// available group's detail view; if no groups yet, shows a toast hint
    /// (web opens QuickSplitSheet directly — native doesn't have a shared
    /// sheet yet, so we route through the first group).
    private var topCTAs: some View {
        HStack(spacing: Theme.Spacing.sm) {
            Button {
                if let first = groups.first {
                    router.push(.groupDetail(id: first.id))
                } else {
                    toast.info(locale.t("groups.quickSplitUnavailable"))
                }
            } label: {
                HStack(spacing: 6) {
                    Image(systemName: "bolt.fill")
                    Text(locale.t("groups.quickSplit"))
                }
            }
            .buttonStyle(NBSecondaryButtonStyle())

            Button { showCreate = true } label: {
                HStack(spacing: 6) {
                    Image(systemName: "plus")
                    Text(locale.t("groups.newGroup"))
                }
            }
            .buttonStyle(NBPrimaryButtonStyle())
        }
    }

    // MARK: - Unsettled banner

    private var unsettledBanner: some View {
        HStack(spacing: Theme.Spacing.sm) {
            Image(systemName: "sparkles")
                .font(.system(size: 16, weight: .semibold))
                .foregroundColor(Theme.foreground)
                .frame(width: 32, height: 32)
                .background(Theme.accent)
                .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.sm))
                .overlay(
                    RoundedRectangle(cornerRadius: Theme.Radius.sm)
                        .stroke(Theme.foreground, lineWidth: Theme.Border.widthThin)
                )
            VStack(alignment: .leading, spacing: 2) {
                Text(locale.t("groups.unsettledDebts"))
                    .font(AppFont.bodyMedium)
                    .foregroundColor(Theme.foreground)
                Text("\(unsettledGroups.count) · \(Fmt.amount(totalUnsettled, currency: groups.first?.currency ?? "PLN"))")
                    .font(AppFont.caption)
                    .foregroundColor(Theme.mutedForeground)
            }
            Spacer()
            Button {
                withAnimation { tipDismissed = true }
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(Theme.mutedForeground)
                    .frame(width: 28, height: 28)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(locale.t("groups.dismissBanner"))
        }
        .padding(Theme.Spacing.sm)
        .nbCard(radius: Theme.Radius.md, shadow: Theme.Shadow.sm)
    }

    private func payloadWithCreator(_ payload: GroupCreate) -> GroupCreate {
        guard let user = session.currentUser else { return payload }
        let existing = payload.members ?? []
        let alreadyIncluded = existing.contains { $0.userId == user.userId || $0.email == user.email }
        if alreadyIncluded { return payload }
        let selfMember = GroupMemberInput(
            displayName: user.email.components(separatedBy: "@").first ?? "You",
            email: user.email,
            color: "#1a1a1a",
            userId: user.userId
        )
        return GroupCreate(
            name: payload.name,
            description: payload.description,
            currency: payload.currency,
            emoji: payload.emoji,
            mode: payload.mode,
            startDate: payload.startDate,
            endDate: payload.endDate,
            members: [selfMember] + existing
        )
    }

    private var header: some View {
        NBScreenHeader(
            eyebrow: locale.t("groups.eyebrow"),
            title: locale.t("groups.subtitle"),
            subtitle: "\(groups.count) \(locale.t("challenges.active").lowercased())"
        )
    }

    @ViewBuilder
    private var content: some View {
        if isLoading && groups.isEmpty {
            Section {
                NBSkeletonList(rows: 4)
                    .padding(.horizontal, Theme.Spacing.md)
            }
            .listRowBackground(Color.clear)
            .listRowSeparator(.hidden)
            .listRowInsets(EdgeInsets())
        } else if let message = errorMessage, groups.isEmpty {
            Section {
                NBErrorCard(message: message) { Task { await store.awaitGroups(force: true) } }
                    .padding(.horizontal, Theme.Spacing.md)
            }
            .listRowBackground(Color.clear)
            .listRowSeparator(.hidden)
            .listRowInsets(EdgeInsets())
        } else if groups.isEmpty {
            Section {
                NBEmptyState(
                    systemImage: "person.3.fill",
                    title: locale.t("groups.emptyTitle"),
                    subtitle: locale.t("groups.emptySubtitle"),
                    action: (label: locale.t("groups.new"), run: { showCreate = true })
                )
                .padding(.horizontal, Theme.Spacing.md)
            }
            .listRowBackground(Color.clear)
            .listRowSeparator(.hidden)
            .listRowInsets(EdgeInsets())
        } else {
            Section {
                ForEach(groups) { g in
                    groupCard(g)
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
                }
            }
        }
    }

    // MARK: - Rich group card (emoji + members + avatars + balance + Open)

    private func groupCard(_ g: Group) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
            // Top row: emoji + name/meta + mode badge + Open button
            HStack(alignment: .top, spacing: Theme.Spacing.sm) {
                Text(g.emoji ?? "👥")
                    .font(.system(size: 26))
                    .frame(width: 44, height: 44)
                    .background(Theme.muted)
                    .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.sm))
                    .overlay(
                        RoundedRectangle(cornerRadius: Theme.Radius.sm)
                            .stroke(Theme.foreground, lineWidth: Theme.Border.widthThin)
                    )
                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 6) {
                        Text(g.name)
                            .font(AppFont.bodyMedium)
                            .foregroundColor(Theme.foreground)
                            .lineLimit(1)
                        if let mode = g.mode, !mode.isEmpty, mode != "default", mode != "ongoing" {
                            NBTag(text: modeLabel(mode))
                        }
                    }
                    let count = g.members?.count ?? 0
                    Text("\(count) \(count == 1 ? locale.t("groups.member") : locale.t("groups.memberCount"))")
                        .font(AppFont.caption)
                        .foregroundColor(Theme.mutedForeground)
                }
                Spacer(minLength: 0)
                Button { router.push(.groupDetail(id: g.id)) } label: {
                    HStack(spacing: 4) {
                        Text(locale.t("groups.open"))
                            .font(AppFont.mono(11))
                            .tracking(1)
                            .textCase(.uppercase)
                        Image(systemName: "arrow.right")
                            .font(.system(size: 10, weight: .bold))
                    }
                    .foregroundColor(Theme.foreground)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
                    .background(Theme.card)
                    .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.sm))
                    .overlay(
                        RoundedRectangle(cornerRadius: Theme.Radius.sm)
                            .stroke(Theme.foreground, lineWidth: Theme.Border.widthThin)
                    )
                }
                .buttonStyle(.plain)
            }

            NBDivider()

            // Bottom row: member avatars + balance
            HStack(alignment: .center, spacing: Theme.Spacing.sm) {
                memberAvatars(g.members ?? [])
                Spacer(minLength: 0)
                balanceLabel(g)
            }
        }
        .padding(Theme.Spacing.sm)
        .nbCard(radius: Theme.Radius.md, shadow: Theme.Shadow.sm)
        .contentShape(Rectangle())
        .onTapGesture { router.push(.groupDetail(id: g.id)) }
    }

    /// Up to 5 overlapping circular avatars with initials in colored
    /// backgrounds, plus a `+N` overflow chip. Mirrors web `MemberAvatars`.
    private func memberAvatars(_ members: [GroupMember]) -> some View {
        let visible = Array(members.prefix(5))
        let overflow = max(0, members.count - 5)
        return HStack(spacing: -8) {
            ForEach(Array(visible.enumerated()), id: \.element.id) { idx, m in
                let palette = Self.memberAvatarColors
                let bg = Color(hex: palette[idx % palette.count]) ?? Theme.muted
                Text(initials(m.label))
                    .font(AppFont.mono(10))
                    .foregroundColor(.white)
                    .frame(width: 28, height: 28)
                    .background(bg)
                    .clipShape(Circle())
                    .overlay(Circle().stroke(Theme.background, lineWidth: 2))
            }
            if overflow > 0 {
                Text("+\(overflow)")
                    .font(AppFont.mono(10))
                    .foregroundColor(Theme.mutedForeground)
                    .frame(width: 28, height: 28)
                    .background(Theme.muted)
                    .clipShape(Circle())
                    .overlay(Circle().stroke(Theme.background, lineWidth: 2))
            }
        }
    }

    @ViewBuilder
    private func balanceLabel(_ g: Group) -> some View {
        let balance = g.totalBalance ?? 0
        if abs(balance) <= 0.01 {
            NBTag(text: locale.t("groups.settled"), background: Theme.muted, foreground: Theme.mutedForeground)
        } else {
            VStack(alignment: .trailing, spacing: 0) {
                Text(locale.t("groups.balance"))
                    .font(AppFont.mono(9))
                    .tracking(1)
                    .textCase(.uppercase)
                    .foregroundColor(Theme.mutedForeground)
                Text("\(balance > 0 ? "+" : "−")\(Fmt.amount(abs(balance), currency: g.currency))")
                    .font(AppFont.monoBold(13))
                    .foregroundColor(balance > 0 ? Theme.success : Theme.destructive)
            }
        }
    }

    private func initials(_ name: String) -> String {
        let parts = name.split(separator: " ")
        let chars = parts.compactMap { $0.first }.prefix(2)
        return String(chars).uppercased()
    }

    private func modeLabel(_ mode: String) -> String {
        switch mode {
        case "trip": return locale.t("groups.modeTrip")
        case "household": return locale.t("groups.modeHousehold")
        default: return mode.capitalized
        }
    }

    // MARK: - Recent Activity (collapsed behind a disclosure)

    private var recentActivityDisclosure: some View {
        DisclosureGroup(isExpanded: Binding(
            get: { showRecentActivity },
            set: { newValue in
                withAnimation(.nbSpring) { showRecentActivity = newValue }
            }
        )) {
            let top = Array(unsettledGroups.prefix(3))
            SwiftUI.Group {
                if top.count >= 2 {
                    HStack(spacing: Theme.Spacing.xs) {
                        ForEach(top) { g in
                            recentActivityCard(g)
                        }
                    }
                } else {
                    VStack(spacing: Theme.Spacing.xs) {
                        ForEach(top) { g in
                            recentActivityCard(g)
                        }
                    }
                }
            }
            .padding(.top, Theme.Spacing.xs)
        } label: {
            HStack(spacing: 6) {
                Image(systemName: "clock")
                    .font(.caption)
                    .foregroundColor(Theme.mutedForeground)
                Text(locale.t("groups.recentActivity"))
                    .font(AppFont.mono(11))
                    .tracking(1)
                    .textCase(.uppercase)
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

    private func recentActivityCard(_ g: Group) -> some View {
        Button { router.push(.groupDetail(id: g.id)) } label: {
            VStack(alignment: .leading, spacing: 6) {
                HStack(spacing: 6) {
                    Text(g.emoji ?? "👥")
                        .font(.system(size: 18))
                    Text(g.name)
                        .font(AppFont.semibold(12))
                        .foregroundColor(Theme.foreground)
                        .lineLimit(1)
                }
                let balance = g.totalBalance ?? 0
                Text("\(balance > 0 ? "+" : "−")\(Fmt.amount(abs(balance), currency: g.currency))")
                    .font(AppFont.monoBold(13))
                    .foregroundColor(balance > 0 ? Theme.success : Theme.destructive)
                    .lineLimit(1)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(Theme.Spacing.xs)
            .nbCard(radius: Theme.Radius.sm, shadow: Theme.Shadow.sm)
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Create sheet

/// Mirror of web `NewGroupSheet` — name + emoji + currency + initial members.
struct GroupCreateSheet: View {
    let onSubmit: (GroupCreate) -> Void
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var locale: AppLocale

    @State private var name = ""
    @State private var description = ""
    @State private var emoji = "👥"
    @State private var currency = "PLN"
    @State private var mode = "ongoing"
    @State private var members: [MemberDraft] = [MemberDraft()]

    struct MemberDraft: Identifiable {
        let id = UUID()
        var name: String = ""
        var email: String = ""
        var color: String = GroupCreateSheet.memberColors[0]
    }

    static let memberColors: [String] = [
        "#6366f1", "#ec4899", "#f59e0b", "#10b981",
        "#3b82f6", "#8b5cf6", "#ef4444", "#14b8a6",
    ]

    static let emojiChoices: [String] = [
        "👥", "✈️", "🏖️", "🏠", "🍜", "🎉", "⛰️", "🚗", "💼", "🎓",
    ]

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: Theme.Spacing.md) {
                    NBTextField(label: locale.t("groups.name"), text: $name, placeholder: "Trip to Berlin")
                    emojiPicker
                    NBTextField(label: locale.t("settings.currency"), text: $currency, placeholder: "PLN", autocapitalization: .characters)
                    VStack(alignment: .leading, spacing: Theme.Spacing.xxs) {
                        Text(locale.t("groups.mode"))
                            .font(AppFont.bodyMedium)
                            .foregroundColor(Theme.foreground)
                        NBSegmented(
                            selection: $mode,
                            options: [
                                (value: "ongoing", label: locale.t("groups.modeOngoing")),
                                (value: "trip", label: locale.t("groups.modeTrip")),
                                (value: "household", label: locale.t("groups.modeHousehold")),
                            ]
                        )
                    }
                    VStack(alignment: .leading, spacing: Theme.Spacing.xxs) {
                        Text(locale.t("groups.descriptionOptional"))
                            .font(AppFont.bodyMedium)
                            .foregroundColor(Theme.foreground)
                        TextEditor(text: $description)
                            .font(AppFont.body)
                            .frame(minHeight: 72)
                            .padding(8)
                            .background(Theme.card)
                            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.md))
                            .overlay(
                                RoundedRectangle(cornerRadius: Theme.Radius.md)
                                    .stroke(Theme.foreground, lineWidth: Theme.Border.widthThin)
                            )
                    }
                    membersSection
                }
                .padding(Theme.Spacing.md)
            }
            .background(Theme.background)
            .navigationTitle(locale.t("groups.new"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button(locale.t("common.cancel")) { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button(locale.t("common.save")) {
                        let cleanedMembers = members
                            .map { m -> GroupMemberInput? in
                                let n = m.name.trimmingCharacters(in: .whitespaces)
                                guard !n.isEmpty else { return nil }
                                let email = m.email.trimmingCharacters(in: .whitespaces)
                                return GroupMemberInput(
                                    displayName: n,
                                    email: email.isEmpty ? nil : email,
                                    color: m.color,
                                    userId: nil
                                )
                            }
                            .compactMap { $0 }
                        onSubmit(GroupCreate(
                            name: name,
                            description: description.isEmpty ? nil : description,
                            currency: currency.uppercased(),
                            emoji: emoji.isEmpty ? nil : emoji,
                            mode: mode,
                            startDate: nil,
                            endDate: nil,
                            members: cleanedMembers.isEmpty ? nil : cleanedMembers
                        ))
                        dismiss()
                    }
                    .disabled(name.isEmpty)
                }
            }
        }
    }

    private var emojiPicker: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.xxs) {
            Text(locale.t("groups.emoji"))
                .font(AppFont.bodyMedium)
                .foregroundColor(Theme.foreground)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    ForEach(Self.emojiChoices, id: \.self) { e in
                        Button { emoji = e } label: {
                            Text(e)
                                .font(.system(size: 22))
                                .frame(width: 40, height: 40)
                                .background(emoji == e ? Theme.foreground : Theme.muted)
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
        }
    }

    private var membersSection: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
            HStack {
                Text(locale.t("groups.initialMembers"))
                    .font(AppFont.bodyMedium)
                    .foregroundColor(Theme.foreground)
                Spacer()
                Button {
                    let next = Self.memberColors[members.count % Self.memberColors.count]
                    members.append(MemberDraft(name: "", email: "", color: next))
                } label: {
                    Label(locale.t("groups.addMember"), systemImage: "plus")
                        .font(AppFont.mono(11))
                        .tracking(1)
                        .textCase(.uppercase)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 6)
                        .background(Theme.muted)
                        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.sm))
                        .overlay(
                            RoundedRectangle(cornerRadius: Theme.Radius.sm)
                                .stroke(Theme.foreground, lineWidth: Theme.Border.widthThin)
                        )
                }
                .buttonStyle(.plain)
            }
            ForEach($members) { $m in
                VStack(spacing: 6) {
                    HStack(spacing: 6) {
                        Circle()
                            .fill(Color(hex: m.color) ?? Theme.muted)
                            .frame(width: 20, height: 20)
                            .overlay(Circle().stroke(Theme.foreground, lineWidth: Theme.Border.widthThin))
                        TextField(locale.t("groups.memberName"), text: $m.name)
                            .font(AppFont.body)
                            .padding(.horizontal, Theme.Spacing.md)
                            .frame(height: 40)
                            .background(Theme.card)
                            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.sm))
                            .overlay(
                                RoundedRectangle(cornerRadius: Theme.Radius.sm)
                                    .stroke(Theme.foreground, lineWidth: Theme.Border.widthThin)
                            )
                        if members.count > 1 {
                            Button {
                                members.removeAll { $0.id == m.id }
                            } label: {
                                Image(systemName: "xmark")
                                    .font(.caption)
                                    .foregroundColor(Theme.mutedForeground)
                                    .frame(width: 32, height: 32)
                                    .background(Theme.muted)
                                    .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.sm))
                                    .overlay(
                                        RoundedRectangle(cornerRadius: Theme.Radius.sm)
                                            .stroke(Theme.foreground, lineWidth: Theme.Border.widthThin)
                                    )
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    TextField(locale.t("groups.memberEmailOptional"), text: $m.email)
                        .font(AppFont.caption)
                        .keyboardType(.emailAddress)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled(true)
                        .padding(.horizontal, Theme.Spacing.md)
                        .frame(height: 36)
                        .background(Theme.card)
                        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.sm))
                        .overlay(
                            RoundedRectangle(cornerRadius: Theme.Radius.sm)
                                .stroke(Theme.foreground, lineWidth: Theme.Border.widthThin)
                        )
                    colorPicker(selection: $m.color)
                }
                .padding(Theme.Spacing.sm)
                .nbCard(radius: Theme.Radius.sm, shadow: Theme.Shadow.sm)
            }
        }
    }

    private func colorPicker(selection: Binding<String>) -> some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach(Self.memberColors, id: \.self) { c in
                    Button { selection.wrappedValue = c } label: {
                        Circle()
                            .fill(Color(hex: c) ?? Theme.muted)
                            .frame(width: 22, height: 22)
                            .overlay(
                                Circle().stroke(
                                    Theme.foreground,
                                    lineWidth: selection.wrappedValue == c ? 2 : Theme.Border.widthThin
                                )
                            )
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }
}

// MARK: - Hex color helper (scoped to Groups feature)

extension Color {
    /// Parses `#RRGGBB` / `#AARRGGBB` hex strings. Returns nil on invalid input.
    init?(hex: String) {
        let cleaned = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var value: UInt64 = 0
        Scanner(string: cleaned).scanHexInt64(&value)
        let length = cleaned.count
        let r, g, b, a: Double
        switch length {
        case 6:
            r = Double((value >> 16) & 0xFF) / 255
            g = Double((value >> 8) & 0xFF) / 255
            b = Double(value & 0xFF) / 255
            a = 1
        case 8:
            a = Double((value >> 24) & 0xFF) / 255
            r = Double((value >> 16) & 0xFF) / 255
            g = Double((value >> 8) & 0xFF) / 255
            b = Double(value & 0xFF) / 255
        default:
            return nil
        }
        self.init(.sRGB, red: r, green: g, blue: b, opacity: a)
    }
}
