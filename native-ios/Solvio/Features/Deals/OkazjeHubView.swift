import SwiftUI
import CoreLocation

/// "Okazje" — shopping intelligence hub. Replaces what used to live as
/// the Products / Stores / Deals tabs inside SavingsHubView and lifts
/// it into a dedicated bottom-nav slot.
///
/// Layout:
///   1. **Header**       — eyebrow OKAZJE + brand line.
///   2. **Trendy**       — top 3 personalised promotions (cards).
///   3. **Lista zakupów AI** — type a shopping list, AI returns the
///       best single store and per-item prices.
///   4. **Launcher**     — 4 large tiles linking to the existing
///       feature views (`PricesView`, `NearbyStoresView`, `AuditView`,
///       `ShoppingAdvisorView`) via `AppRoute.more(...)`.
///
/// Existing feature views are NOT duplicated — they keep their own
/// implementations and the hub just wires deep-links to them. Trending
/// promotions are pulled from `AppDataStore.promotions` (already
/// prefetched on login by Round 5b).
struct OkazjeHubView: View {
    @EnvironmentObject private var router: AppRouter
    @EnvironmentObject private var locale: AppLocale
    @EnvironmentObject private var toast: ToastCenter
    @EnvironmentObject private var store: AppDataStore
    /// SwiftUI environment opener — used to launch leaflet URLs from a
    /// `Button` action (we wrap the entire promo card in a button, and
    /// `Link` doesn't compose inside a parent button).
    @Environment(\.openURL) private var openURL

    @StateObject private var shoppingVM = ShoppingListVM()
    @StateObject private var analyzeVM = ReceiptAnalyzeVM()

    // MARK: - Filter / sort state
    //
    // Local UI state — promotions are filtered in-memory from the
    // store-cached payload. Doesn't trigger a refetch.

    enum OkazjeFilter: Hashable {
        case all
        case personalized
        case endingSoon
        case topDiscount
        case store(String)
    }

    @State private var activeFilter: OkazjeFilter = .all
    @AppStorage("solvio.seenOkazjeOnboarding") private var seenOnboarding: Bool = false

    /// Number of trending promos shown collapsed; "Show more" expands to
    /// the full list (max 10 to avoid endless scroll).
    @State private var trendingExpanded: Bool = false
    /// Shopping-list section starts collapsed because it's a heavy
    /// editable form — nobody wants to look at 5 empty rows when they
    /// just opened Deals to glance at promos.
    @State private var shoppingExpanded: Bool = false
    /// Analyze receipt section stays collapsed by default — it's a
    /// power-user feature ("was my last shop a good price?"), not the
    /// landing CTA.
    @State private var analyzeExpanded: Bool = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Theme.Spacing.lg) {
                if !seenOnboarding {
                    onboardingBanner
                }
                heroCard
                if shouldShowFilters {
                    filterBar
                }
                trendySection
                aiToolsSection
                launcherSection
                metadataFooter
                Spacer(minLength: Theme.Spacing.xl)
            }
            .padding(.horizontal, Theme.Spacing.md)
            .padding(.top, Theme.Spacing.md)
        }
        .background(Theme.background)
        .navigationTitle(locale.t("deals.navTitle"))
        .navigationBarTitleDisplayMode(.inline)
        .task {
            store.ensurePromotions()
            store.ensureReceipts()
            shoppingVM.bind(locale: locale, store: store)
            analyzeVM.bind(locale: locale)
        }
        .refreshable {
            Haptics.impact(.light)
            await store.awaitPromotions(force: true)
            await store.awaitReceipts(force: true)
            Haptics.success()
        }
    }

    // MARK: - Filter logic

    /// Combined personalised + general promotions, deduped by `id`.
    private var allPromotions: [PromoOffer] {
        guard let p = store.promotions else { return [] }
        // Personalised first so they take priority when both lists
        // happen to contain the same product (rare but possible when
        // backend-side personalisation matched a product also in the
        // chain leaflet).
        var seen = Set<String>()
        var combined: [PromoOffer] = []
        for offer in p.personalizedDeals + p.promotions {
            if seen.insert(offer.id).inserted {
                combined.append(offer)
            }
        }
        return combined
    }

    /// Distinct store names found in the cached promotions, sorted
    /// alphabetically. Drives the per-store filter chips.
    private var availableStores: [String] {
        let names = allPromotions
            .compactMap { $0.store }
            .filter { !$0.isEmpty }
        return Array(Set(names)).sorted()
    }

    /// Hide the filter bar when there's not enough variety to filter.
    /// Single store + no personalisation = filter bar would just be
    /// a single chip, looks broken.
    private var shouldShowFilters: Bool {
        let promos = allPromotions
        guard promos.count >= 4 else { return false }
        let hasPersonal = promos.contains { $0.matchesPurchases == true }
        let hasMultipleStores = availableStores.count >= 2
        return hasPersonal || hasMultipleStores
    }

    /// Apply the active filter + always sort by personalised → urgency
    /// → discount magnitude.
    private var filteredPromotions: [PromoOffer] {
        let base: [PromoOffer]
        switch activeFilter {
        case .all:
            base = allPromotions
        case .personalized:
            base = allPromotions.filter { $0.matchesPurchases == true }
        case .endingSoon:
            base = allPromotions.filter {
                guard let days = daysUntilExpiry($0) else { return false }
                return days >= 0 && days <= 3
            }
        case .topDiscount:
            base = allPromotions
                .filter { ($0.regularPrice ?? 0) > ($0.promoPrice ?? 0) }
                .sorted { discountPct($0) > discountPct($1) }
        case .store(let s):
            base = allPromotions.filter { ($0.store ?? "").caseInsensitiveCompare(s) == .orderedSame }
        }

        // Default sort within filter: personalised → soonest expiry →
        // biggest discount. `topDiscount` already pre-sorted above.
        if case .topDiscount = activeFilter { return base }
        return base.sorted { lhs, rhs in
            let lP = (lhs.matchesPurchases == true) ? 1 : 0
            let rP = (rhs.matchesPurchases == true) ? 1 : 0
            if lP != rP { return lP > rP }
            let lDays = daysUntilExpiry(lhs) ?? 999
            let rDays = daysUntilExpiry(rhs) ?? 999
            if lDays != rDays { return lDays < rDays }
            return discountPct(lhs) > discountPct(rhs)
        }
    }

    /// Discount as a percentage (0.0–1.0). Falls back to the raw
    /// `discount` string parsed for "−30%" / "30%" / "30 percent".
    private func discountPct(_ o: PromoOffer) -> Double {
        if let reg = o.regularPrice, let promo = o.promoPrice, reg > 0 {
            return max(0, (reg - promo) / reg)
        }
        if let raw = o.discount?.lowercased() {
            let digits = raw.compactMap { $0.isNumber ? $0 : nil }
            if let n = Double(String(digits)), n > 0, n <= 100 {
                return n / 100
            }
        }
        return 0
    }

    /// Days from today (UTC midnight) to `validUntil`. Negative if past.
    private func daysUntilExpiry(_ o: PromoOffer) -> Int? {
        guard let valid = o.validUntil, !valid.isEmpty else { return nil }
        let df = DateFormatter()
        df.calendar = Calendar(identifier: .gregorian)
        df.locale = Locale(identifier: "en_US_POSIX")
        df.timeZone = TimeZone(identifier: "UTC")
        df.dateFormat = "yyyy-MM-dd"
        guard let date = df.date(from: String(valid.prefix(10))) else { return nil }
        let cal = Calendar.current
        let today = cal.startOfDay(for: Date())
        let target = cal.startOfDay(for: date)
        return cal.dateComponents([.day], from: today, to: target).day
    }

    // MARK: - Onboarding banner (first-time visit)
    //
    // Shown only once per device install — explains what Okazje does
    // (AI scrapes Polish chain leaflets every 6 h to surface relevant
    // deals). Without it the page is a wall of unfamiliar widgets.

    private var onboardingBanner: some View {
        HStack(alignment: .top, spacing: Theme.Spacing.sm) {
            Image(systemName: "sparkles")
                .font(.system(size: 18, weight: .semibold))
                .foregroundColor(Theme.foreground)
                .frame(width: 36, height: 36)
                .background(Theme.warning.opacity(0.18))
                .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.sm))
            VStack(alignment: .leading, spacing: 4) {
                Text(locale.t("deals.onboardingTitle"))
                    .font(AppFont.bodyMedium)
                    .foregroundColor(Theme.foreground)
                Text(locale.t("deals.onboardingBody"))
                    .font(AppFont.caption)
                    .foregroundColor(Theme.mutedForeground)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 0)
            Button {
                Haptics.selection()
                withAnimation(.spring(response: 0.35, dampingFraction: 0.85)) {
                    seenOnboarding = true
                }
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundColor(Theme.mutedForeground)
                    .frame(width: 32, height: 32)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(locale.t("common.dismiss"))
        }
        .padding(Theme.Spacing.sm)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.warning.opacity(0.06))
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Radius.md)
                .stroke(Theme.warning.opacity(0.25), lineWidth: Theme.Border.widthThin)
        )
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.md))
        .transition(.move(edge: .top).combined(with: .opacity))
    }

    // MARK: - Hero card
    //
    // Top-of-page summary: total potential savings (the biggest
    // motivator), count of offers, freshness pill (live web search vs
    // cached vs stale), AI-powered badge, manual refresh button.
    // Was a bare row before — promo to a dominant 3-row hero so the
    // page feels purposeful. Apple Wallet-style stat hero pattern.

    @ViewBuilder
    private var heroCard: some View {
        let isLoading = store.promotionsLoading && store.promotions == nil
        let count = allPromotions.count
        let savings = store.promotions?.totalPotentialSavings ?? 0
        let currency = store.currency

        VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
            // Row 1: title + AI badge + refresh
            HStack(alignment: .center, spacing: Theme.Spacing.xs) {
                Text(locale.t("deals.heroEyebrow").uppercased())
                    .font(AppFont.mono(10))
                    .tracking(1.5)
                    .foregroundColor(Theme.mutedForeground)
                aiPoweredBadge
                Spacer(minLength: 0)
                refreshButton(isLoading: isLoading)
            }

            // Row 2: hero numbers — savings amount dominates if present,
            // otherwise count of offers takes over.
            if savings > 0 {
                Text(Fmt.amount(savings, currency: currency))
                    .font(AppFont.black(34))
                    .foregroundColor(Theme.success)
                    .lineLimit(1)
                    .minimumScaleFactor(0.5)
                    .contentTransition(.numericText())
                    .animation(.spring(response: 0.5, dampingFraction: 0.85), value: savings)
                Text(locale.t("deals.heroSavingsLabel"))
                    .font(AppFont.caption)
                    .foregroundColor(Theme.mutedForeground)
            } else if isLoading {
                Text(locale.t("deals.heroLoading"))
                    .font(AppFont.bold(20))
                    .foregroundColor(Theme.foreground)
            } else {
                Text(String(format: locale.tPlural("deals.heroCountBig", count: count), count))
                    .font(AppFont.bold(24))
                    .foregroundColor(Theme.foreground)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
            }

            // Row 3: freshness + count chips
            HStack(spacing: 6) {
                if savings > 0 && count > 0 {
                    NBTag(
                        text: String(format: locale.tPlural("deals.heroOffersFmt", count: count), count),
                        background: Theme.success.opacity(0.12),
                        foreground: Theme.success
                    )
                }
                freshnessPill(isLoading: isLoading)
                Spacer()
            }
        }
        .padding(Theme.Spacing.md)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            LinearGradient(
                colors: [
                    Theme.success.opacity(0.10),
                    Theme.background
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
        )
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Radius.lg)
                .stroke(Theme.border, lineWidth: Theme.Border.widthThin)
        )
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.lg))
        .nbShadow(Theme.Shadow.md)
    }

    private var aiPoweredBadge: some View {
        HStack(spacing: 3) {
            Image(systemName: "sparkles")
                .font(.system(size: 9, weight: .bold))
            Text(locale.t("deals.aiPowered"))
        }
        .font(AppFont.mono(9))
        .tracking(0.8)
        .textCase(.uppercase)
        .foregroundColor(Theme.foreground)
        .padding(.horizontal, 6)
        .padding(.vertical, 3)
        .background(Theme.foreground.opacity(0.08))
        .clipShape(Capsule())
    }

    private func refreshButton(isLoading: Bool) -> some View {
        Button {
            Haptics.impact(.medium)
            Task {
                await store.awaitPromotions(force: true)
                Haptics.success()
            }
        } label: {
            Image(systemName: isLoading ? "hourglass" : "arrow.clockwise")
                .font(.system(size: 14, weight: .semibold))
                .foregroundColor(Theme.foreground)
                .frame(width: 36, height: 36)
                .background(Theme.muted)
                .clipShape(Circle())
                .overlay(Circle().stroke(Theme.border, lineWidth: Theme.Border.widthThin))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(locale.t("deals.refresh"))
        .disabled(isLoading)
    }

    /// Returns "Live • teraz", "12 min temu", "Stale" depending on the
    /// cache state and `fetchedAt` timestamp.
    private func freshnessPill(isLoading: Bool) -> some View {
        let (label, color, icon): (String, Color, String) = {
            if isLoading {
                return (locale.t("deals.freshnessLoading"), Theme.mutedForeground, "arrow.clockwise")
            }
            guard let promos = store.promotions else {
                return (locale.t("deals.freshnessEmpty"), Theme.mutedForeground, "questionmark.circle")
            }
            let cache = (promos.cacheState ?? "").lowercased()
            // Try to compute "X min ago" from fetchedAt for stronger signal.
            let relative: String? = {
                guard let iso = promos.fetchedAt,
                      let date = ISO8601DateFormatter().date(from: iso) else { return nil }
                let mins = Int(Date().timeIntervalSince(date) / 60)
                if mins < 1 { return locale.t("deals.freshnessNow") }
                if mins < 60 { return String(format: locale.t("deals.freshnessMinFmt"), mins) }
                let hrs = mins / 60
                if hrs < 24 { return String(format: locale.t("deals.freshnessHrFmt"), hrs) }
                let days = hrs / 24
                return String(format: locale.tPlural("deals.freshnessDayFmt", count: days), days)
            }()
            switch cache {
            case "fresh", "global":
                return (relative ?? locale.t("deals.freshnessLive"), Theme.success, "checkmark.circle.fill")
            case "stale":
                return (relative ?? locale.t("deals.freshnessStale"), Theme.warning, "exclamationmark.circle.fill")
            default:
                return (relative ?? locale.t("deals.freshnessUnknown"), Theme.mutedForeground, "clock")
            }
        }()
        return HStack(spacing: 4) {
            Image(systemName: icon)
                .font(.system(size: 9, weight: .bold))
            Text(label)
        }
        .font(AppFont.mono(10))
        .tracking(0.5)
        .foregroundColor(color)
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .background(color.opacity(0.12))
        .clipShape(Capsule())
    }

    // MARK: - Filter bar
    //
    // Horizontal chip strip: All / Personalized / Ending soon / Top
    // discount / per-store. Hidden when there's not enough variety.

    @ViewBuilder
    private var filterBar: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                filterChip(label: locale.t("deals.filterAll"), filter: .all, icon: nil)
                if allPromotions.contains(where: { $0.matchesPurchases == true }) {
                    filterChip(label: locale.t("deals.filterPersonalized"), filter: .personalized, icon: "sparkles")
                }
                if allPromotions.contains(where: { (daysUntilExpiry($0) ?? 99) <= 3 }) {
                    filterChip(label: locale.t("deals.filterEndingSoon"), filter: .endingSoon, icon: "clock.fill")
                }
                if allPromotions.contains(where: { discountPct($0) >= 0.2 }) {
                    filterChip(label: locale.t("deals.filterTopDiscount"), filter: .topDiscount, icon: "flame.fill")
                }
                ForEach(availableStores, id: \.self) { store in
                    filterChip(label: store, filter: .store(store), icon: nil)
                }
            }
            .padding(.horizontal, Theme.Spacing.xxs)
        }
    }

    private func filterChip(label: String, filter: OkazjeFilter, icon: String?) -> some View {
        let isActive = activeFilter == filter
        return Button {
            Haptics.selection()
            withAnimation(.spring(response: 0.3, dampingFraction: 0.85)) {
                activeFilter = filter
            }
        } label: {
            HStack(spacing: 4) {
                if let icon {
                    Image(systemName: icon)
                        .font(.system(size: 10, weight: .bold))
                }
                Text(label)
                    .font(AppFont.mono(11))
                    .tracking(0.5)
                    .textCase(.uppercase)
                    .lineLimit(1)
            }
            .foregroundColor(isActive ? Theme.background : Theme.foreground)
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .frame(minHeight: 36)
            .background(isActive ? Theme.foreground : Theme.muted)
            .clipShape(Capsule())
            .overlay(
                Capsule().stroke(Theme.border, lineWidth: Theme.Border.widthThin)
            )
        }
        .buttonStyle(.plain)
    }

    // MARK: - Metadata footer
    //
    // Bottom-of-page metadata: data source, freshness, link to refresh
    // schedule explanation. Sits below the launcher to subtly tell the
    // user "this is AI-collected, refreshed every 6 h, here's where".

    @ViewBuilder
    private var metadataFooter: some View {
        if let promos = store.promotions {
            VStack(alignment: .center, spacing: 4) {
                HStack(spacing: 4) {
                    Image(systemName: "sparkles")
                        .font(.system(size: 9, weight: .bold))
                    Text(promos.dataSource == "live_web_search"
                         ? locale.t("deals.footerLive")
                         : locale.t("deals.footerEstimate"))
                }
                .font(AppFont.mono(10))
                .tracking(0.5)
                .foregroundColor(Theme.mutedForeground)
                Text(locale.t("deals.footerSchedule"))
                    .font(AppFont.mono(9))
                    .tracking(0.5)
                    .foregroundColor(Theme.mutedForeground.opacity(0.6))
            }
            .frame(maxWidth: .infinity, alignment: .center)
            .padding(.top, Theme.Spacing.sm)
        }
    }

    // MARK: - AI tools (combined: shopping list + analyze receipt)
    //
    // Both AI features collapsed by default — heavy LLM endpoints, only
    // power users use them. Disclosure pattern keeps the page short for
    // the casual "let me check what's on sale" path.

    @ViewBuilder
    private var aiToolsSection: some View {
        // Count receipts available for analysis + items on shopping list,
        // surface as badges in the disclosure trigger headers so the
        // user knows there's something to do before they expand.
        let receiptsCount = store.receipts.count
        let shoppingCount = shoppingVM.items.filter {
            !$0.name.trimmingCharacters(in: .whitespaces).isEmpty
        }.count
        VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
            NBSectionHeader(
                eyebrow: locale.t("deals.aiToolsEyebrow"),
                title: locale.t("deals.aiToolsTitle")
            )
            disclosureCard(
                icon: "cart.fill",
                tint: Theme.info,
                title: locale.t("shoppingList.title"),
                subtitle: locale.t("shoppingList.subtitle"),
                badge: shoppingCount > 0
                    ? String(format: locale.t("shoppingList.itemsCountFmt"), shoppingCount)
                    : nil,
                expanded: $shoppingExpanded
            ) {
                shoppingListBody
            }
            disclosureCard(
                icon: "doc.text.magnifyingglass",
                tint: Theme.warning,
                title: locale.t("analyze.title"),
                subtitle: locale.t("analyze.subtitle"),
                badge: receiptsCount > 0
                    ? String(format: locale.tPlural("analyze.receiptsCountFmt", count: receiptsCount), receiptsCount)
                    : nil,
                expanded: $analyzeExpanded
            ) {
                analyzeReceiptBody
            }
        }
    }

    @ViewBuilder
    private func disclosureCard<Content: View>(
        icon: String,
        tint: Color,
        title: String,
        subtitle: String,
        badge: String? = nil,
        expanded: Binding<Bool>,
        @ViewBuilder content: () -> Content
    ) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Button {
                Haptics.selection()
                withAnimation(.spring(response: 0.4, dampingFraction: 0.85)) {
                    expanded.wrappedValue.toggle()
                }
            } label: {
                HStack(spacing: Theme.Spacing.sm) {
                    ZStack {
                        Circle()
                            .fill(tint.opacity(0.15))
                            .frame(width: 36, height: 36)
                        Image(systemName: icon)
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundColor(tint)
                    }
                    VStack(alignment: .leading, spacing: 2) {
                        HStack(spacing: 6) {
                            Text(title)
                                .font(AppFont.bodyMedium)
                                .foregroundColor(Theme.foreground)
                                .lineLimit(1)
                            if let badge {
                                Text(badge)
                                    .font(AppFont.mono(10))
                                    .tracking(0.5)
                                    .textCase(.uppercase)
                                    .foregroundColor(tint)
                                    .padding(.horizontal, 6)
                                    .padding(.vertical, 2)
                                    .background(tint.opacity(0.15))
                                    .clipShape(Capsule())
                            }
                        }
                        Text(subtitle)
                            .font(AppFont.caption)
                            .foregroundColor(Theme.mutedForeground)
                            .lineLimit(2)
                            .multilineTextAlignment(.leading)
                    }
                    Spacer(minLength: 0)
                    Image(systemName: "chevron.down")
                        .font(.system(size: 13, weight: .bold))
                        .foregroundColor(Theme.mutedForeground)
                        .rotationEffect(.degrees(expanded.wrappedValue ? 180 : 0))
                        .frame(width: 24, height: 24)
                }
                .padding(Theme.Spacing.sm)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)

            if expanded.wrappedValue {
                Divider()
                    .padding(.horizontal, Theme.Spacing.sm)
                content()
                    .padding(Theme.Spacing.sm)
                    .transition(.opacity)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .nbCard(radius: Theme.Radius.md, shadow: Theme.Shadow.sm)
    }

    // MARK: - Analyze a receipt body
    //
    // Inner content of the analyze-receipt disclosure card. Header +
    // subtitle moved to the disclosure trigger row; keeping body lean.

    @ViewBuilder
    private var analyzeReceiptBody: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
            let recent = store.receipts.prefix(5)
            if recent.isEmpty {
                NBEmptyState(
                    systemImage: "doc.text",
                    title: locale.t("analyze.emptyTitle"),
                    subtitle: locale.t("analyze.emptySub"),
                    action: nil
                )
            } else {
                VStack(spacing: 6) {
                    ForEach(Array(recent), id: \.id) { receipt in
                        receiptRow(receipt)
                    }
                }
            }

            if analyzeVM.isLoading {
                HStack(spacing: 8) {
                    ProgressView().scaleEffect(0.85)
                    Text(locale.t("analyze.running"))
                        .font(AppFont.caption)
                        .foregroundColor(Theme.mutedForeground)
                }
                .padding(.top, 4)
            }
            if let result = analyzeVM.result {
                receiptAnalyzeCard(result)
            }
            // FIX #12: only render the retry card when we have a receipt
            // to retry against — otherwise the button looks broken.
            if let err = analyzeVM.errorMessage, let id = analyzeVM.lastReceiptId {
                NBErrorCard(message: err) {
                    analyzeVM.run(receiptId: id, lang: locale.language.rawValue)
                }
            }
        }
    }

    private func receiptRow(_ r: Receipt) -> some View {
        Button {
            analyzeVM.run(receiptId: r.id, lang: locale.language.rawValue)
        } label: {
            HStack(spacing: Theme.Spacing.sm) {
                NBIconBadge(systemImage: "doc.text.magnifyingglass", size: 32)
                VStack(alignment: .leading, spacing: 2) {
                    Text(r.vendor ?? locale.t("analyze.unknownVendor"))
                        .font(AppFont.bodyMedium)
                        .foregroundColor(Theme.foreground)
                        .lineLimit(1)
                    HStack(spacing: 6) {
                        if let d = r.date {
                            Text(Fmt.date(d))
                                .font(AppFont.mono(10))
                                .foregroundColor(Theme.mutedForeground)
                        }
                        if let total = r.total?.double {
                            Text("·")
                                .font(AppFont.caption)
                                .foregroundColor(Theme.mutedForeground)
                            Text(Fmt.amount(total, currency: r.currency ?? "PLN"))
                                .font(AppFont.mono(10))
                                .foregroundColor(Theme.mutedForeground)
                        }
                    }
                }
                Spacer(minLength: 0)
                if analyzeVM.isLoading && analyzeVM.lastReceiptId == r.id {
                    ProgressView().scaleEffect(0.7)
                } else {
                    Image(systemName: "arrow.right.circle.fill")
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundColor(Theme.foreground)
                }
            }
            .padding(Theme.Spacing.sm)
            .background(Theme.card)
            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.md))
            .overlay(
                RoundedRectangle(cornerRadius: Theme.Radius.md)
                    .stroke(Theme.border, lineWidth: Theme.Border.widthThin)
            )
        }
        .buttonStyle(.plain)
    }

    @ViewBuilder
    private func receiptAnalyzeCard(_ a: ReceiptAnalyzeResponse) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 2) {
                    NBEyebrow(text: locale.t("analyze.resultEyebrow"))
                    Text(a.vendor ?? locale.t("analyze.unknownVendor"))
                        .font(AppFont.cardTitle)
                        .foregroundColor(Theme.foreground)
                    if let d = a.date { Text(Fmt.date(d)).font(AppFont.caption).foregroundColor(Theme.mutedForeground) }
                    dataSourceBadge(for: a.dataSource)
                }
                Spacer()
                VStack(alignment: .trailing, spacing: 2) {
                    Text(locale.t("analyze.savingsLabel"))
                        .font(AppFont.mono(10))
                        .tracking(1)
                        .foregroundColor(Theme.mutedForeground)
                    Text(Fmt.amount(a.potentialSavings, currency: a.currency))
                        .font(AppFont.amount)
                        .foregroundColor(a.potentialSavings > 0 ? Theme.warning : Theme.success)
                }
            }

            HStack(spacing: Theme.Spacing.md) {
                analyzeStat(
                    label: locale.t("analyze.paid"),
                    value: Fmt.amount(a.paidTotal, currency: a.currency),
                    color: Theme.foreground
                )
                analyzeStat(
                    label: locale.t("analyze.bestPossible"),
                    value: Fmt.amount(a.bestPossibleTotal, currency: a.currency),
                    color: Theme.success
                )
            }

            if let summary = a.summary, !summary.isEmpty {
                Text(summary)
                    .font(AppFont.body)
                    .foregroundColor(Theme.foreground)
                    .fixedSize(horizontal: false, vertical: true)
            }

            if !a.items.isEmpty {
                NBDivider()
                VStack(spacing: 0) {
                    ForEach(Array(a.items.enumerated()), id: \.offset) { idx, item in
                        analyzeItemRow(item, currency: a.currency)
                        if idx < a.items.count - 1 {
                            Rectangle()
                                .fill(Theme.foreground.opacity(0.06))
                                .frame(height: 1)
                        }
                    }
                }
            }

            if let tip = a.tip, !tip.isEmpty {
                HStack(alignment: .top, spacing: Theme.Spacing.sm) {
                    NBIconBadge(systemImage: "lightbulb.fill", tint: Theme.warning)
                    Text(tip)
                        .font(AppFont.caption)
                        .foregroundColor(Theme.foreground)
                        .fixedSize(horizontal: false, vertical: true)
                    Spacer(minLength: 0)
                }
                .padding(Theme.Spacing.sm)
                .background(Theme.warning.opacity(0.08))
                .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.md))
            }

            if let sources = a.sources, !sources.isEmpty {
                NBDivider()
                Text(locale.t("shoppingList.sourcesTitle"))
                    .font(AppFont.mono(10))
                    .tracking(1)
                    .foregroundColor(Theme.mutedForeground)
                VStack(alignment: .leading, spacing: 4) {
                    ForEach(Array(sources.prefix(5).enumerated()), id: \.offset) { _, urlStr in
                        if let url = URL(string: urlStr) {
                            Link(destination: url) {
                                HStack(spacing: 4) {
                                    Image(systemName: "newspaper")
                                        .font(.system(size: 10, weight: .semibold))
                                        .foregroundColor(Theme.foreground)
                                    Text(prettifyHost(urlStr))
                                        .font(AppFont.mono(11))
                                        .foregroundColor(Theme.foreground)
                                        .underline()
                                        .lineLimit(1)
                                }
                            }
                        }
                    }
                }
            }
        }
        .padding(Theme.Spacing.md)
        .frame(maxWidth: .infinity, alignment: .leading)
        .nbCard(radius: Theme.Radius.md, shadow: Theme.Shadow.sm)
    }

    private func analyzeStat(label: String, value: String, color: Color) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label)
                .font(AppFont.mono(10))
                .tracking(1)
                .foregroundColor(Theme.mutedForeground)
            Text(value)
                .font(AppFont.amount)
                .foregroundColor(color)
        }
    }

    private func analyzeItemRow(_ item: ReceiptAnalyzeResponse.AnalyzedItem, currency: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(item.name)
                    .font(AppFont.body)
                    .foregroundColor(Theme.foreground)
                    .lineLimit(1)
                if let qty = item.qty, qty > 0 {
                    Text("× \(Fmt.qty(qty))")
                        .font(AppFont.mono(11))
                        .foregroundColor(Theme.mutedForeground)
                }
                Spacer()
                if let paid = item.paidTotal {
                    Text(Fmt.amount(paid, currency: currency))
                        .font(AppFont.mono(12))
                        .foregroundColor(Theme.foreground)
                }
            }
            HStack(spacing: 6) {
                verdictTag(item.verdict)
                if item.savings > 0, let store = item.bestStore {
                    Text(String(format: locale.t("analyze.cheaperAtFmt"),
                                Fmt.amount(item.savings, currency: currency),
                                store))
                        .font(AppFont.caption)
                        .foregroundColor(Theme.success)
                        .lineLimit(2)
                }
            }
        }
        .padding(.vertical, 6)
    }

    private func verdictTag(_ v: String) -> some View {
        let (label, color): (String, Color) = {
            switch v {
            case "overpaid":   return (locale.t("analyze.overpaid"), Theme.destructive)
            case "fair":       return (locale.t("analyze.fair"), Theme.success)
            case "underpaid":  return (locale.t("analyze.underpaid"), Theme.success)
            default:           return (locale.t("analyze.noData"), Theme.mutedForeground)
            }
        }()
        return NBTag(text: label, background: color.opacity(0.15), foreground: color)
    }

    // MARK: - Header

    private var header: some View {
        NBScreenHeader(
            eyebrow: locale.t("deals.eyebrow"),
            title: locale.t("deals.headerTitle"),
            subtitle: locale.t("deals.headerSubtitle")
        )
    }

    // MARK: - Trending promotions

    @ViewBuilder
    private var trendySection: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
            HStack(alignment: .firstTextBaseline) {
                NBSectionHeader(
                    eyebrow: trendingHeaderEyebrow,
                    title: trendingHeaderTitle
                )
                Spacer()
                if !filteredPromotions.isEmpty {
                    Text(String(format: locale.t("deals.countShownFmt"), filteredPromotions.prefix(trendingExpanded ? 10 : 3).count, filteredPromotions.count))
                        .font(AppFont.mono(10))
                        .tracking(0.5)
                        .foregroundColor(Theme.mutedForeground)
                }
            }

            if let _ = store.promotions {
                let cap = trendingExpanded ? 10 : 3
                let visible = filteredPromotions.prefix(cap)
                if visible.isEmpty {
                    promotionsFilteredEmpty
                } else {
                    VStack(spacing: Theme.Spacing.xs) {
                        ForEach(Array(visible)) { offer in
                            trendingCard(offer)
                        }
                    }
                    if filteredPromotions.count > 3 {
                        showMoreButton
                    }
                }
            } else if store.promotionsLoading {
                richLoadingCard
            } else if let err = store.promotionsError {
                NBErrorCard(message: err) {
                    Haptics.impact(.light)
                    Task { await store.awaitPromotions(force: true) }
                }
            } else {
                // Cold start, no cache, no error — first launch. Show
                // a CTA empty state with explainer.
                promotionsFirstLaunchEmpty
            }
        }
    }

    /// Eyebrow text changes with active filter — gives instant visual
    /// confirmation that filter took effect.
    private var trendingHeaderEyebrow: String {
        switch activeFilter {
        case .all: return locale.t("deals.trendingEyebrow")
        case .personalized: return locale.t("deals.filterPersonalized").uppercased()
        case .endingSoon: return locale.t("deals.filterEndingSoon").uppercased()
        case .topDiscount: return locale.t("deals.filterTopDiscount").uppercased()
        case .store(let s): return s.uppercased()
        }
    }

    /// Title row — same key for all filters; consistency wins.
    private var trendingHeaderTitle: String {
        locale.t("deals.trendingTitle")
    }

    /// Rich loading card replacing the bare 2-row skeleton. Shows the
    /// AI staging copy ("Sprawdzam Lidl…") so a 30+ s cold start
    /// doesn't feel broken.
    private var richLoadingCard: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
            HStack(spacing: Theme.Spacing.sm) {
                ProgressView()
                    .scaleEffect(0.85)
                Text(locale.t("deals.loadingTitle"))
                    .font(AppFont.bodyMedium)
                    .foregroundColor(Theme.foreground)
            }
            Text(locale.t("deals.loadingHint"))
                .font(AppFont.caption)
                .foregroundColor(Theme.mutedForeground)
                .fixedSize(horizontal: false, vertical: true)
            NBSkeletonList(rows: 2)
                .padding(.top, 4)
        }
        .padding(Theme.Spacing.md)
        .frame(maxWidth: .infinity, alignment: .leading)
        .nbCard(radius: Theme.Radius.md, shadow: Theme.Shadow.sm)
    }

    /// First-launch empty state — neither cached nor errored, just
    /// nothing yet. Pushes the user to scan a receipt because that's
    /// the data source backend uses for personalisation.
    private var promotionsFirstLaunchEmpty: some View {
        NBEmptyState(
            systemImage: "tag.slash",
            title: locale.t("deals.emptyFirstTitle"),
            subtitle: locale.t("deals.emptyFirstBody"),
            action: (label: locale.t("deals.emptyFirstCTA"), run: {
                Haptics.impact(.medium)
                Task { await store.awaitPromotions(force: true) }
            })
        )
    }

    /// Filtered-empty state — promos exist, but the active filter
    /// returned nothing. Reset filter as the action.
    private var promotionsFilteredEmpty: some View {
        NBEmptyState(
            systemImage: "line.3.horizontal.decrease.circle",
            title: locale.t("deals.emptyFilteredTitle"),
            subtitle: locale.t("deals.emptyFilteredBody"),
            action: activeFilter == .all ? nil : (label: locale.t("deals.resetFilter"), run: {
                Haptics.selection()
                withAnimation(.spring(response: 0.3, dampingFraction: 0.85)) {
                    activeFilter = .all
                }
            })
        )
    }

    private var showMoreButton: some View {
        Button {
            Haptics.selection()
            withAnimation(.spring(response: 0.4, dampingFraction: 0.85)) {
                trendingExpanded.toggle()
            }
        } label: {
            HStack(spacing: 4) {
                Text(trendingExpanded
                     ? locale.t("deals.showLess")
                     : String(format: locale.t("deals.showMoreFmt"), filteredPromotions.count - 3))
                Image(systemName: trendingExpanded ? "chevron.up" : "chevron.down")
                    .font(.system(size: 11, weight: .bold))
            }
            .font(AppFont.mono(11))
            .tracking(0.5)
            .textCase(.uppercase)
            .foregroundColor(Theme.foreground)
            .frame(maxWidth: .infinity, minHeight: 44)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    /// Promo card — full vertical layout with vendor logo, large promo
    /// price + strikethrough regular, promo-type badge, urgency pill,
    /// optional personalized "for you" tag. Whole card is a button; tap
    /// opens the leaflet URL via system openURL handler.
    @ViewBuilder
    private func trendingCard(_ offer: PromoOffer) -> some View {
        let leafletURL: URL? = (offer.leafletUrl ?? offer.dealUrl).flatMap(URL.init(string:))
        let currency = offer.currency ?? store.currency
        let isPersonalized = offer.matchesPurchases == true

        Button {
            guard let url = leafletURL else { return }
            Haptics.impact(.light)
            openURL(url)
        } label: {
            VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
                // Top row: vendor logo + store name + personalized + chevron
                HStack(alignment: .center, spacing: Theme.Spacing.sm) {
                    VendorLogo(vendor: offer.store, size: 40, fallbackIcon: "tag.fill")
                    VStack(alignment: .leading, spacing: 2) {
                        if let s = offer.store, !s.isEmpty {
                            Text(s)
                                .font(AppFont.mono(10))
                                .tracking(0.8)
                                .textCase(.uppercase)
                                .foregroundColor(Theme.mutedForeground)
                                .lineLimit(1)
                        }
                        if isPersonalized {
                            HStack(spacing: 3) {
                                Image(systemName: "sparkles")
                                    .font(.system(size: 9, weight: .bold))
                                Text(locale.t("deals.personalized"))
                                    .font(AppFont.mono(9))
                                    .tracking(0.5)
                                    .textCase(.uppercase)
                            }
                            .foregroundColor(Theme.info)
                        }
                    }
                    Spacer(minLength: 0)
                    if leafletURL != nil {
                        Image(systemName: "arrow.up.right")
                            .font(.system(size: 12, weight: .bold))
                            .foregroundColor(Theme.mutedForeground)
                            .frame(width: 24, height: 24)
                    }
                }

                // Product name — primary content, bold, up to 2 lines
                Text(offer.productName ?? offer.store ?? "—")
                    .font(AppFont.bold(17))
                    .foregroundColor(Theme.foreground)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
                    .fixedSize(horizontal: false, vertical: true)

                // Optional human-readable promo description (e.g. "kup 3, zapłać za 2")
                if let desc = offer.promoDescription, !desc.isEmpty {
                    Text(desc)
                        .font(AppFont.caption)
                        .foregroundColor(Theme.mutedForeground)
                        .lineLimit(2)
                        .multilineTextAlignment(.leading)
                }

                // Price row — large promo + strikethrough regular + promo-type badge
                HStack(alignment: .lastTextBaseline, spacing: 8) {
                    if let promo = offer.promoPrice {
                        Text(Fmt.amount(promo, currency: currency))
                            .font(AppFont.bold(22))
                            .foregroundColor(Theme.success)
                            .lineLimit(1)
                            .minimumScaleFactor(0.7)
                    }
                    if let reg = offer.regularPrice, let promo = offer.promoPrice, reg > promo {
                        Text(Fmt.amount(reg, currency: currency))
                            .font(AppFont.mono(11))
                            .strikethrough()
                            .foregroundColor(Theme.mutedForeground)
                    }
                    Spacer(minLength: 0)
                    if let badge = promoTypeBadge(for: offer) {
                        NBTag(
                            text: badge,
                            background: Theme.success.opacity(0.15),
                            foreground: Theme.success
                        )
                    } else if let discount = offer.discount, !discount.isEmpty {
                        NBTag(
                            text: discount,
                            background: Theme.success.opacity(0.15),
                            foreground: Theme.success
                        )
                    }
                }

                // Bottom row: urgency pill + valid-until date
                HStack(spacing: 6) {
                    if let urgency = urgencyLabel(for: offer) {
                        HStack(spacing: 4) {
                            Image(systemName: "clock.fill")
                                .font(.system(size: 9, weight: .bold))
                            Text(urgency.text)
                        }
                        .font(AppFont.mono(10))
                        .tracking(0.5)
                        .textCase(.uppercase)
                        .foregroundColor(urgency.color)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 3)
                        .background(urgency.color.opacity(0.12))
                        .clipShape(Capsule())
                    }
                    if let valid = offer.validUntil, !valid.isEmpty {
                        Text(String(format: locale.t("deals.validUntilFmt"), Fmt.date(valid)))
                            .font(AppFont.mono(10))
                            .foregroundColor(Theme.mutedForeground)
                    }
                    Spacer(minLength: 0)
                }
            }
            .padding(Theme.Spacing.md)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(
                isPersonalized
                ? AnyView(LinearGradient(
                    colors: [Theme.info.opacity(0.06), Theme.background],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                ))
                : AnyView(Theme.card)
            )
            .overlay(
                RoundedRectangle(cornerRadius: Theme.Radius.md)
                    .stroke(
                        isPersonalized ? Theme.info.opacity(0.3) : Theme.border,
                        lineWidth: Theme.Border.widthThin
                    )
            )
            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.md))
            .nbShadow(Theme.Shadow.sm)
            .contentShape(RoundedRectangle(cornerRadius: Theme.Radius.md))
        }
        .buttonStyle(.plain)
        .disabled(leafletURL == nil)
    }

    /// Map raw `promoType` enum from backend to a short, human-readable
    /// badge label. Returns nil for "regular" or unknown types so the
    /// card falls back to the discount string instead.
    private func promoTypeBadge(for offer: PromoOffer) -> String? {
        guard let type = offer.promoType?.lowercased() else { return nil }
        switch type {
        case "1+1":               return "1+1"
        case "2za1", "2for1":     return "2 ZA 1"
        case "3za2", "3for2":     return "3 ZA 2"
        case "buy_x_get_y":       return locale.t("deals.promoBuyGet")
        case "app_only":          return locale.t("deals.promoAppOnly")
        case "multipack_price":   return locale.t("deals.promoMultipack")
        case "percent":
            // Use the discount string itself if available — the percent
            // value is the distinguishing info.
            return offer.discount?.isEmpty == false ? offer.discount : nil
        default:                  return nil
        }
    }

    /// Returns urgency label + tint when validUntil is within 3 days,
    /// nil otherwise. Drives the small clock-icon pill on the card.
    private func urgencyLabel(for offer: PromoOffer) -> (text: String, color: Color)? {
        guard let days = daysUntilExpiry(offer) else { return nil }
        if days < 0 { return (locale.t("deals.urgencyExpired"), Theme.destructive) }
        if days == 0 { return (locale.t("deals.urgencyToday"), Theme.destructive) }
        if days == 1 { return (locale.t("deals.urgencyTomorrow"), Theme.warning) }
        if days <= 3 { return (String(format: locale.tPlural("deals.urgencyDaysFmt", count: days), days), Theme.warning) }
        return nil
    }

    // MARK: - Shopping list AI body
    //
    // Inner content of the shopping-list disclosure card. Header +
    // subtitle moved to the disclosure trigger row.

    private var shoppingListBody: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
            // Editable list of items
            VStack(spacing: Theme.Spacing.xs) {
                ForEach($shoppingVM.items) { $item in
                    shoppingRow($item)
                }
                Button {
                    shoppingVM.addRow()
                } label: {
                    HStack(spacing: 4) {
                        Image(systemName: "plus")
                            .font(.system(size: 11, weight: .semibold))
                        Text(locale.t("shoppingList.addRow"))
                            .font(AppFont.mono(11))
                            .tracking(0.5)
                            .textCase(.uppercase)
                    }
                    .foregroundColor(Theme.foreground)
                }
                .buttonStyle(.plain)
                .frame(maxWidth: .infinity, alignment: .leading)
            }

            // Location toggle — when on, we send lat/lng to backend
            // so it can prefer nearby chains. Custom row so the whole
            // thing is tappable (native SwiftUI Toggle's hit area is
            // limited to the switch itself; users hitting the label
            // got nothing). The Toggle still drives `isOn` so iOS
            // accessibility/voice-over keeps working.
            Button {
                shoppingVM.useLocation.toggle()
            } label: {
                HStack(spacing: 8) {
                    Text(locale.t("shoppingList.useLocation"))
                        .font(AppFont.bodyMedium)
                        .foregroundColor(Theme.foreground)
                    Spacer()
                    Toggle("", isOn: $shoppingVM.useLocation)
                        .labelsHidden()
                        .tint(Theme.foreground)
                        .allowsHitTesting(false)
                }
                .contentShape(Rectangle())
                .padding(.vertical, 4)
            }
            .buttonStyle(.plain)

            Button {
                Task { await shoppingVM.optimize() }
            } label: {
                HStack(spacing: 6) {
                    if shoppingVM.isLoading { ProgressView().tint(Theme.background) }
                    Text(shoppingVM.isLoading
                         ? locale.t("shoppingList.analyzing")
                         : locale.t("shoppingList.optimize"))
                }
            }
            .buttonStyle(NBPrimaryButtonStyle())
            .disabled(shoppingVM.isLoading || !shoppingVM.canSubmit)

            // While the AI thinks, show a stage-cycling progress card so
            // the user can tell the request is still alive (a bare button
            // spinner during a 12-15s call feels broken). Stage labels
            // are cosmetic — they cycle on a timer, not tied to backend
            // progress (the route doesn't report it).
            //
            // ETA: 30s. Real Vercel cold-start with web_search_preview
            // can take 50s+, but the bar caps at 95% so we'd rather be
            // visibly almost-done than under-estimate at 14s and have
            // the bar pegged for a minute.
            if shoppingVM.isLoading {
                NBProgressCard(
                    title: locale.t("shoppingList.progressTitle"),
                    stages: [
                        locale.t("shoppingList.stageLeaflets"),
                        locale.t("shoppingList.stagePrices"),
                        locale.t("shoppingList.stageCompare"),
                        locale.t("shoppingList.stageFinalize"),
                    ],
                    estimatedSeconds: 30
                )
            }

            if let err = shoppingVM.error {
                NBErrorCard(message: err) {
                    Task { await shoppingVM.optimize() }
                }
            }

            if let result = shoppingVM.result {
                shoppingResultCard(result)
            }
        }
    }

    private func shoppingRow(_ item: Binding<ShoppingItemDraft>) -> some View {
        HStack(spacing: Theme.Spacing.xs) {
            // Submit-on-Return adds a new empty row and (best-effort)
            // moves focus to it. Without this, a user typing "milk →
            // Return" on the last row got nothing — no new row, no
            // submit, and the keyboard stayed open with no "Done"
            // affordance. Enter-to-add-row matches the user's mental
            // model from web shopping lists.
            TextField(locale.t("shoppingList.itemPlaceholder"), text: item.name)
                .font(AppFont.body)
                .submitLabel(.next)
                .onSubmit {
                    let trimmed = item.wrappedValue.name.trimmingCharacters(in: .whitespaces)
                    guard !trimmed.isEmpty else { return }
                    if shoppingVM.items.last?.id == item.wrappedValue.id {
                        shoppingVM.addRow()
                    }
                }
                .padding(.horizontal, Theme.Spacing.sm)
                .frame(height: 38)
                .background(Theme.card)
                .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.sm))
                .overlay(
                    RoundedRectangle(cornerRadius: Theme.Radius.sm)
                        .stroke(Theme.border, lineWidth: Theme.Border.widthThin)
                )
            TextField(
                locale.t("shoppingList.qtyPlaceholder"),
                text: item.qtyText
            )
                .keyboardType(.decimalPad)
                .font(AppFont.mono(13))
                .multilineTextAlignment(.center)
                .frame(width: 56, height: 38)
                .background(Theme.card)
                .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.sm))
                .overlay(
                    RoundedRectangle(cornerRadius: Theme.Radius.sm)
                        .stroke(Theme.border, lineWidth: Theme.Border.widthThin)
                )
            Button {
                shoppingVM.remove(id: item.wrappedValue.id)
            } label: {
                Image(systemName: "minus.circle")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundColor(Theme.mutedForeground)
            }
            .buttonStyle(.plain)
            .disabled(shoppingVM.items.count <= 1)
        }
    }

    /// Compact result card showing best-store recommendation, total +
    /// savings, and an expandable per-item breakdown. Mirrors the visual
    /// hierarchy of the audit summary card on the old hub.
    private func shoppingResultCard(_ r: ShoppingOptimizeResult) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 2) {
                    NBEyebrow(text: locale.t("shoppingList.bestStoreEyebrow"))
                    Text(r.bestStore)
                        .font(AppFont.cardTitle)
                        .foregroundColor(Theme.foreground)
                    if let address = r.bestStoreAddress, !address.isEmpty {
                        Text(address)
                            .font(AppFont.caption)
                            .foregroundColor(Theme.mutedForeground)
                    }
                    // ŻYWE / ESTYMATA badge — tells the user whether the
                    // backend used live web search (real leaflet data)
                    // or fell back to a model estimate (Azure-only).
                    dataSourceBadge(for: r.dataSource)
                }
                Spacer()
                NBIconBadge(systemImage: "checkmark.seal.fill", tint: Theme.success, size: 36)
            }

            HStack(spacing: Theme.Spacing.md) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(locale.t("shoppingList.totalLabel"))
                        .font(AppFont.mono(10))
                        .tracking(1)
                        .foregroundColor(Theme.mutedForeground)
                    Text(Fmt.amount(r.bestTotal, currency: r.currency))
                        .font(AppFont.amount)
                        .foregroundColor(Theme.foreground)
                }
                Spacer()
                if let savings = r.savings, savings > 0 {
                    VStack(alignment: .trailing, spacing: 2) {
                        Text(locale.t("shoppingList.savingsLabel"))
                            .font(AppFont.mono(10))
                            .tracking(1)
                            .foregroundColor(Theme.mutedForeground)
                        Text(Fmt.amount(savings, currency: r.currency))
                            .font(AppFont.bodyMedium)
                            .foregroundColor(Theme.success)
                    }
                }
            }

            if let summary = r.summary, !summary.isEmpty {
                NBDivider()
                Text(summary)
                    .font(AppFont.body)
                    .foregroundColor(Theme.foreground)
                    .fixedSize(horizontal: false, vertical: true)
            }

            if !r.bestStoreItems.isEmpty {
                NBDivider()
                VStack(spacing: 0) {
                    ForEach(Array(r.bestStoreItems.enumerated()), id: \.offset) { idx, line in
                        VStack(alignment: .leading, spacing: 2) {
                            HStack {
                                Text(line.name)
                                    .font(AppFont.body)
                                    .foregroundColor(Theme.foreground)
                                    .lineLimit(1)
                                if let qty = line.qty, qty > 0 {
                                    Text("× \(Fmt.qty(qty))")
                                        .font(AppFont.mono(11))
                                        .foregroundColor(Theme.mutedForeground)
                                }
                                Spacer()
                                Text(Fmt.amount(line.total, currency: r.currency))
                                    .font(AppFont.mono(13))
                                    .foregroundColor(Theme.foreground)
                            }
                            // Promo chip (1+1, -30%, app_only…) — visible
                            // only when AI flagged the line as non-regular.
                            if let chip = promoChip(for: line.promoType) {
                                HStack(spacing: 4) {
                                    NBTag(
                                        text: chip,
                                        background: Theme.success.opacity(0.18),
                                        foreground: Theme.success
                                    )
                                    if let desc = line.promoDescription, !desc.isEmpty {
                                        Text(desc)
                                            .font(AppFont.caption)
                                            .foregroundColor(Theme.mutedForeground)
                                            .lineLimit(1)
                                    }
                                }
                            }
                        }
                        .padding(.vertical, 6)
                        if idx < r.bestStoreItems.count - 1 {
                            Rectangle()
                                .fill(Theme.foreground.opacity(0.08))
                                .frame(height: 1)
                        }
                    }
                }
            }

            if !r.alternatives.isEmpty {
                NBDivider()
                Text(locale.t("shoppingList.alternativesTitle"))
                    .font(AppFont.bodyMedium)
                    .foregroundColor(Theme.foreground)
                VStack(spacing: 6) {
                    ForEach(Array(r.alternatives.enumerated()), id: \.offset) { _, alt in
                        HStack {
                            Text(alt.store)
                                .font(AppFont.body)
                                .foregroundColor(Theme.foreground)
                            Spacer()
                            Text(Fmt.amount(alt.total, currency: r.currency))
                                .font(AppFont.mono(12))
                                .foregroundColor(Theme.mutedForeground)
                        }
                    }
                }
            }

            // Multi-store strategy — surfaces only when the AI found a
            // 2-3 store split that beats the single-store best by ≥ 5%
            // (or ≥ 3 PLN abs). Hidden otherwise so the UI doesn't
            // push 2-store trips for trivial gains.
            if let strategy = r.multiStoreStrategy {
                multiStoreSection(strategy, currency: r.currency)
            }

            if let tip = r.tip, !tip.isEmpty {
                HStack(alignment: .top, spacing: Theme.Spacing.sm) {
                    NBIconBadge(systemImage: "lightbulb.fill", tint: Theme.warning)
                    Text(tip)
                        .font(AppFont.caption)
                        .foregroundColor(Theme.foreground)
                        .fixedSize(horizontal: false, vertical: true)
                    Spacer(minLength: 0)
                }
                .padding(Theme.Spacing.sm)
                .background(Theme.warning.opacity(0.08))
                .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.md))
                .overlay(
                    RoundedRectangle(cornerRadius: Theme.Radius.md)
                        .stroke(Theme.warning, lineWidth: Theme.Border.widthThin)
                )
            }

            // Sources — links to the leaflet pages the AI cited.
            // Tapping opens Safari. Only visible when the run actually
            // used live web search; "estimate" runs have an empty
            // sources array so this section is hidden.
            if let sources = r.sources, !sources.isEmpty {
                NBDivider()
                Text(locale.t("shoppingList.sourcesTitle"))
                    .font(AppFont.mono(10))
                    .tracking(1)
                    .foregroundColor(Theme.mutedForeground)
                VStack(alignment: .leading, spacing: 4) {
                    ForEach(Array(sources.prefix(5).enumerated()), id: \.offset) { _, urlStr in
                        if let url = URL(string: urlStr) {
                            Link(destination: url) {
                                HStack(spacing: 4) {
                                    Image(systemName: "newspaper")
                                        .font(.system(size: 10, weight: .semibold))
                                        .foregroundColor(Theme.foreground)
                                    Text(prettifyHost(urlStr))
                                        .font(AppFont.mono(11))
                                        .foregroundColor(Theme.foreground)
                                        .underline()
                                        .lineLimit(1)
                                }
                            }
                        }
                    }
                }
            }

            // Freshness footer — show the timestamp the prices were
            // fetched at, plus a tag for the cache state. Helps the
            // user trust (or distrust) the numbers without us having
            // to write "live data" copy somewhere.
            freshnessFooter(for: r)
        }
        .padding(Theme.Spacing.md)
        .frame(maxWidth: .infinity, alignment: .leading)
        .nbCard(radius: Theme.Radius.md, shadow: Theme.Shadow.sm)
    }

    /// Renders the optional multi-store split. Each store is its own
    /// mini-card with subtotal + per-item lines, then a footer showing
    /// the grand total + savings vs single-store best.
    @ViewBuilder
    private func multiStoreSection(_ strategy: MultiStoreStrategy, currency: String) -> some View {
        NBDivider()
        VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
            HStack(spacing: 6) {
                Image(systemName: "arrow.triangle.branch")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundColor(Theme.success)
                Text(locale.t("shoppingList.multiStoreEyebrow").uppercased())
                    .font(AppFont.mono(10))
                    .tracking(1)
                    .foregroundColor(Theme.success)
                Spacer()
                Text("+\(Fmt.amount(strategy.savingsVsSingle, currency: currency))")
                    .font(AppFont.monoBold(12))
                    .foregroundColor(Theme.success)
            }

            if let rationale = strategy.rationale, !rationale.isEmpty {
                Text(rationale)
                    .font(AppFont.body)
                    .foregroundColor(Theme.foreground)
                    .fixedSize(horizontal: false, vertical: true)
            }

            VStack(spacing: Theme.Spacing.xs) {
                ForEach(Array(strategy.stores.enumerated()), id: \.offset) { _, partition in
                    multiStorePartitionCard(partition, currency: currency)
                }
            }

            HStack {
                Text(locale.t("shoppingList.multiStoreGrandTotal"))
                    .font(AppFont.mono(11))
                    .tracking(0.5)
                    .textCase(.uppercase)
                    .foregroundColor(Theme.mutedForeground)
                Spacer()
                Text(Fmt.amount(strategy.grandTotal, currency: currency))
                    .font(AppFont.amount)
                    .foregroundColor(Theme.success)
            }
        }
        .padding(Theme.Spacing.sm)
        .background(Theme.success.opacity(0.06))
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.md))
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Radius.md)
                .stroke(Theme.success.opacity(0.5), lineWidth: Theme.Border.widthThin)
        )
    }

    private func multiStorePartitionCard(
        _ partition: MultiStoreStrategy.StorePartition,
        currency: String
    ) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(partition.store)
                    .font(AppFont.cardTitle)
                    .foregroundColor(Theme.foreground)
                Spacer()
                Text(Fmt.amount(partition.subtotal, currency: currency))
                    .font(AppFont.monoBold(13))
                    .foregroundColor(Theme.foreground)
            }
            if let address = partition.address, !address.isEmpty {
                Text(address)
                    .font(AppFont.caption)
                    .foregroundColor(Theme.mutedForeground)
            }
            VStack(spacing: 0) {
                ForEach(Array(partition.items.enumerated()), id: \.offset) { idx, line in
                    VStack(alignment: .leading, spacing: 2) {
                        HStack {
                            Text(line.name)
                                .font(AppFont.body)
                                .foregroundColor(Theme.foreground)
                                .lineLimit(1)
                            if let qty = line.qty, qty > 0 {
                                Text("× \(Fmt.qty(qty))")
                                    .font(AppFont.mono(11))
                                    .foregroundColor(Theme.mutedForeground)
                            }
                            Spacer()
                            Text(Fmt.amount(line.total, currency: currency))
                                .font(AppFont.mono(12))
                                .foregroundColor(Theme.foreground)
                        }
                        if let chip = promoChip(for: line.promoType) {
                            HStack(spacing: 4) {
                                NBTag(
                                    text: chip,
                                    background: Theme.success.opacity(0.18),
                                    foreground: Theme.success
                                )
                                if let desc = line.promoDescription, !desc.isEmpty {
                                    Text(desc)
                                        .font(AppFont.caption)
                                        .foregroundColor(Theme.mutedForeground)
                                        .lineLimit(1)
                                }
                            }
                        }
                    }
                    .padding(.vertical, 4)
                    if idx < partition.items.count - 1 {
                        Rectangle()
                            .fill(Theme.foreground.opacity(0.06))
                            .frame(height: 1)
                    }
                }
            }
        }
        .padding(Theme.Spacing.sm)
        .background(Theme.card)
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.sm))
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Radius.sm)
                .stroke(Theme.border, lineWidth: Theme.Border.widthThin)
        )
    }

    @ViewBuilder
    private func freshnessFooter(for r: ShoppingOptimizeResult) -> some View {
        if let iso = r.fetchedAt, let date = iso8601(iso) {
            HStack(spacing: 6) {
                Image(systemName: "clock")
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundColor(Theme.mutedForeground)
                Text(String(format: locale.t("shoppingList.asOfFmt"), Self.formatTime(date)))
                    .font(AppFont.mono(10))
                    .foregroundColor(Theme.mutedForeground)
                if let state = r.cacheState {
                    NBTag(
                        text: cacheStateLabel(state),
                        background: cacheStateColor(state).opacity(0.15),
                        foreground: cacheStateColor(state)
                    )
                }
                Spacer()
            }
            .padding(.top, 4)
        }
    }

    private func iso8601(_ s: String) -> Date? {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f.date(from: s) ?? ISO8601DateFormatter().date(from: s)
    }

    private static func formatTime(_ d: Date) -> String {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd HH:mm"
        return f.string(from: d)
    }

    private func cacheStateLabel(_ state: String) -> String {
        switch state {
        case "fresh": return locale.t("shoppingList.cacheFresh")
        case "stale": return locale.t("shoppingList.cacheStale")
        default:      return locale.t("shoppingList.cacheLive")
        }
    }

    private func cacheStateColor(_ state: String) -> Color {
        switch state {
        case "fresh": return Theme.success
        case "stale": return Theme.warning
        default:      return Theme.foreground
        }
    }

    /// Badge: ŻYWE (zielone) gdy backend miał web search, ESTYMATA
    /// (warning) gdy fallback bez web. Pokazujemy nawet gdy
    /// `dataSource` jest nil (starszy backend) — wtedy badge się chowa.
    @ViewBuilder
    private func dataSourceBadge(for value: String?) -> some View {
        switch value {
        case "live_web_search":
            NBTag(
                text: locale.t("shoppingList.badgeLive"),
                background: Theme.success.opacity(0.15),
                foreground: Theme.success
            )
        case "estimate":
            NBTag(
                text: locale.t("shoppingList.badgeEstimate"),
                background: Theme.warning.opacity(0.15),
                foreground: Theme.warning
            )
        default:
            EmptyView()
        }
    }

    /// Convert backend promo-type string to a short user-facing chip
    /// label. Returns nil for "regular" (chip is hidden in that case).
    private func promoChip(for type: String?) -> String? {
        guard let raw = type?.lowercased(), raw != "regular" else { return nil }
        switch raw {
        case "1+1":              return "1+1"
        case "2za1":             return "2 ZA 1"
        case "3za2":             return "3 ZA 2"
        case "percent":          return locale.t("shoppingList.promoPercent")
        case "buy_x_get_y":      return locale.t("shoppingList.promoMultibuy")
        case "app_only":         return locale.t("shoppingList.promoApp")
        case "multipack_price":  return locale.t("shoppingList.promoMultipack")
        default:                 return locale.t("shoppingList.promoGeneric")
        }
    }

    /// Strip a URL down to its host (or first path segment) for use as
    /// a friendly inline link label — full URLs are unreadable in a
    /// narrow card.
    private func prettifyHost(_ urlStr: String) -> String {
        guard let url = URL(string: urlStr), let host = url.host else { return urlStr }
        return host.replacingOccurrences(of: "www.", with: "")
    }

    // MARK: - Launcher tiles
    //
    // 2-column grid (was vertical list) — gives 5 tiles a more dashboard-y
    // feel and saves vertical real estate on a long-scrolling Okazje page.
    // Last tile auto-spans full width when count is odd (5 items → 2+2+1).

    private var launcherSection: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
            NBSectionHeader(
                eyebrow: locale.t("deals.toolsEyebrow"),
                title: locale.t("deals.toolsTitle")
            )
            LazyVGrid(
                columns: [
                    GridItem(.flexible(), spacing: Theme.Spacing.xs),
                    GridItem(.flexible(), spacing: Theme.Spacing.xs),
                ],
                spacing: Theme.Spacing.xs
            ) {
                launcherTile(
                    icon: "magnifyingglass",
                    tint: Theme.info,
                    title: locale.t("nav.productSearch"),
                    subtitle: locale.t("deals.productsSub"),
                    route: .productSearch
                )
                launcherTile(
                    icon: "mappin.and.ellipse",
                    tint: Theme.warning,
                    title: locale.t("nav.nearbyStores"),
                    subtitle: locale.t("deals.storesSub"),
                    route: .nearbyStores
                )
                launcherTile(
                    icon: "magnifyingglass.circle.fill",
                    tint: Theme.foreground,
                    title: locale.t("nav.audit"),
                    subtitle: locale.t("deals.auditSub"),
                    route: .audit
                )
                launcherTile(
                    icon: "tag.fill",
                    tint: Theme.success,
                    title: locale.t("nav.prices"),
                    subtitle: locale.t("deals.pricesSub"),
                    route: .prices
                )
            }
            // Shopping advisor — full-width below the grid because it's
            // the most-used and benefits from the bigger surface.
            launcherWideTile(
                icon: "cart.badge.questionmark",
                tint: Theme.foreground,
                title: locale.t("nav.shoppingAdvisor"),
                subtitle: locale.t("deals.advisorSub"),
                route: .shoppingAdvisor
            )
        }
    }

    /// Square-ish tile for the 2-column grid: stacked icon + title +
    /// subtitle. Bigger tap target than the old vertical-list row.
    private func launcherTile(icon: String, tint: Color, title: String, subtitle: String, route: MoreRoute) -> some View {
        Button {
            Haptics.selection()
            router.dealsStack.append(AppRoute.more(route))
        } label: {
            VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
                ZStack {
                    RoundedRectangle(cornerRadius: Theme.Radius.sm)
                        .fill(tint.opacity(0.15))
                    Image(systemName: icon)
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundColor(tint)
                }
                .frame(width: 36, height: 36)

                Text(title)
                    .font(AppFont.bodyMedium)
                    .foregroundColor(Theme.foreground)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
                    .fixedSize(horizontal: false, vertical: true)
                Text(subtitle)
                    .font(AppFont.caption)
                    .foregroundColor(Theme.mutedForeground)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 0)
            }
            .padding(Theme.Spacing.sm)
            .frame(maxWidth: .infinity, minHeight: 120, alignment: .topLeading)
            .nbCard(radius: Theme.Radius.md, shadow: Theme.Shadow.sm)
        }
        .buttonStyle(.plain)
    }

    /// Full-width companion to `launcherTile` for the headline shopping
    /// advisor entry — same row layout as before but with chevron.
    private func launcherWideTile(icon: String, tint: Color, title: String, subtitle: String, route: MoreRoute) -> some View {
        Button {
            Haptics.selection()
            router.dealsStack.append(AppRoute.more(route))
        } label: {
            HStack(spacing: Theme.Spacing.sm) {
                ZStack {
                    RoundedRectangle(cornerRadius: Theme.Radius.sm)
                        .fill(tint.opacity(0.15))
                    Image(systemName: icon)
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundColor(tint)
                }
                .frame(width: 44, height: 44)
                VStack(alignment: .leading, spacing: 2) {
                    Text(title)
                        .font(AppFont.bodyMedium)
                        .foregroundColor(Theme.foreground)
                    Text(subtitle)
                        .font(AppFont.caption)
                        .foregroundColor(Theme.mutedForeground)
                        .lineLimit(2)
                }
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundColor(Theme.mutedForeground)
            }
            .padding(Theme.Spacing.sm)
            .frame(maxWidth: .infinity, alignment: .leading)
            .nbCard(radius: Theme.Radius.md, shadow: Theme.Shadow.sm)
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Shopping list draft model

/// Editable row for the shopping-list builder. Identifiable so SwiftUI's
/// ForEach gets stable identity — re-ordering/removing wouldn't blow
/// away keyboard focus that way.
struct ShoppingItemDraft: Identifiable, Equatable {
    let id = UUID()
    var name: String = ""
    var qtyText: String = "1"
}

// MARK: - Shopping list view-model

/// View-model for the receipt analyzer card. Holds the in-flight task,
/// the latest result, and any error. Lives next to ShoppingListVM since
/// it's tightly coupled to OkazjeHubView and not reused.
@MainActor
final class ReceiptAnalyzeVM: ObservableObject {
    @Published var isLoading = false
    @Published var result: ReceiptAnalyzeResponse?
    @Published var errorMessage: String?
    @Published private(set) var lastReceiptId: String?

    private weak var locale: AppLocale?
    private var task: Task<Void, Never>?

    func bind(locale: AppLocale) {
        self.locale = locale
    }

    func run(receiptId: String, lang: String) {
        // Cancel any in-flight call so a quick re-tap doesn't pile up.
        task?.cancel()
        lastReceiptId = receiptId
        errorMessage = nil
        // FIX #21: keep stale result on the screen until the new one
        // arrives — wiping it synchronously made the card flicker into
        // an empty state on slow networks. The receiptRow itself shows
        // a per-row spinner via `analyzeVM.isLoading && lastReceiptId == r.id`.
        // result = nil  // intentionally NOT cleared
        isLoading = true
        // VM is `@MainActor`, so the `Task` body and any property writes
        // already hop onto the main actor — no need for `MainActor.run`,
        // and the task is owned by `self.task` so weak self is unnecessary.
        task = Task { [weak self] in
            do {
                let response = try await ReceiptAnalyzeRepo.analyze(receiptId: receiptId, lang: lang)
                guard let self, !Task.isCancelled else { return }
                self.result = response
                self.isLoading = false
            } catch ApiError.cancelled {
                // Superseded by another tap — leave isLoading true so the
                // newer task's spinner stays visible.
            } catch {
                guard let self, !Task.isCancelled else { return }
                self.errorMessage = error.localizedDescription
                self.isLoading = false
            }
        }
    }
}

/// View-model for the shopping-list AI section. Owns the editable list,
/// drives the optimize() call, and surfaces results / errors. Lives in
/// the same file as the parent view since it's tightly coupled and not
/// reused elsewhere.
@MainActor
final class ShoppingListVM: ObservableObject {
    /// Items default to whatever the user submitted last time, falling
    /// back to a single empty row on first launch. Saves a tedious
    /// re-type for users who run the same weekly list.
    @Published var items: [ShoppingItemDraft] = ShoppingListVM.loadPersisted()
    @Published var useLocation: Bool = true
    @Published var isLoading: Bool = false
    @Published var error: String?
    @Published var result: ShoppingOptimizeResult?

    private weak var locale: AppLocale?
    private weak var store: AppDataStore?
    private let locationProvider = ShoppingLocationProvider()

    /// UserDefaults key for the last successful shopping list. Stored as
    /// a JSON-encoded `[PersistedItem]` (id is regenerated on load so we
    /// don't collide with live row identity).
    private static let storageKey = "solvio.shoppingList.last.v1"

    private struct PersistedItem: Codable {
        let name: String
        let qty: String
    }

    static func loadPersisted() -> [ShoppingItemDraft] {
        guard let data = UserDefaults.standard.data(forKey: storageKey),
              let decoded = try? JSONDecoder().decode([PersistedItem].self, from: data),
              !decoded.isEmpty else {
            return [ShoppingItemDraft(name: "", qtyText: "1")]
        }
        return decoded.map { ShoppingItemDraft(name: $0.name, qtyText: $0.qty) }
    }

    private func persistItems() {
        let payload = items
            .filter { !$0.name.trimmingCharacters(in: .whitespaces).isEmpty }
            .map { PersistedItem(name: $0.name, qty: $0.qtyText) }
        if payload.isEmpty {
            UserDefaults.standard.removeObject(forKey: Self.storageKey)
            return
        }
        if let data = try? JSONEncoder().encode(payload) {
            UserDefaults.standard.set(data, forKey: Self.storageKey)
        }
    }

    func bind(locale: AppLocale, store: AppDataStore) {
        self.locale = locale
        self.store = store
    }

    var canSubmit: Bool {
        items.contains { !$0.name.trimmingCharacters(in: .whitespaces).isEmpty }
    }

    func addRow() {
        items.append(ShoppingItemDraft(name: "", qtyText: "1"))
    }

    func remove(id: UUID) {
        guard items.count > 1 else { return }
        items.removeAll { $0.id == id }
    }

    func optimize() async {
        guard canSubmit, !isLoading else { return }
        isLoading = true
        error = nil
        defer { isLoading = false }

        let cleanItems: [ShoppingOptimizeRequest.Item] = items.compactMap {
            let name = $0.name.trimmingCharacters(in: .whitespaces)
            guard !name.isEmpty else { return nil }
            let qty = Double($0.qtyText.replacingOccurrences(of: ",", with: ".")) ?? 1
            return ShoppingOptimizeRequest.Item(name: name, quantity: qty)
        }
        guard !cleanItems.isEmpty else { return }

        let lang = locale?.language.rawValue ?? "pl"
        let currency = store?.currency ?? "PLN"

        var lat: Double?
        var lng: Double?
        if useLocation, let location = await locationProvider.fetch() {
            lat = location.coordinate.latitude
            lng = location.coordinate.longitude
        }

        let body = ShoppingOptimizeRequest(
            items: cleanItems,
            lang: lang,
            currency: currency,
            lat: lat,
            lng: lng
        )
        do {
            result = try await ShoppingRepo.optimize(body)
            // Persist on success only — a failed call probably means
            // the user typed something the AI couldn't parse, no point
            // resurrecting it next session.
            persistItems()
        } catch let apiError as ApiError {
            error = apiError.errorDescription ?? locale?.t("errors.unknown")
        } catch {
            self.error = error.localizedDescription
        }
    }
}

// MARK: - Location helper

/// Small one-shot CLLocationManager wrapper. We only need a single
/// location fix for the shopping optimizer call — no continuous
/// updates, no monitoring, no background. Keeping it local to this
/// feature avoids adding scaffolding to the shared `NearbyStoresView`
/// location code.
///
/// Hard 5s timeout — if the user hasn't responded to the permission
/// prompt or the GPS fix is slow, we fall back to "no location" so
/// the shopping list call never deadlocks. Without this the very
/// first call on a fresh install hung forever.
final class ShoppingLocationProvider: NSObject, CLLocationManagerDelegate {
    private let manager = CLLocationManager()
    private var continuation: CheckedContinuation<CLLocation?, Never>?
    private var timeoutTask: Task<Void, Never>?

    /// Max wait for either a permission decision or a location fix.
    /// 5s is generous for a real device, brutal for a sim with no
    /// stored coordinates — both desirable, since hanging the UI is
    /// strictly worse than skipping the location hint.
    private static let timeoutSeconds: UInt64 = 5

    func fetch() async -> CLLocation? {
        await withCheckedContinuation { (cont: CheckedContinuation<CLLocation?, Never>) in
            self.continuation = cont
            manager.delegate = self

            // Arm a hard timeout regardless of which branch we take —
            // even the "authorized" path occasionally hangs on sim
            // when no coordinate has been set.
            self.timeoutTask = Task { [weak self] in
                try? await Task.sleep(nanoseconds: Self.timeoutSeconds * 1_000_000_000)
                if Task.isCancelled { return }
                guard let self else { return }
                await MainActor.run { self.finish(nil) }
            }

            switch manager.authorizationStatus {
            case .notDetermined:
                manager.requestWhenInUseAuthorization()
            case .authorizedWhenInUse, .authorizedAlways:
                manager.requestLocation()
            default:
                self.finish(nil)
            }
        }
    }

    func locationManagerDidChangeAuthorization(_ m: CLLocationManager) {
        switch m.authorizationStatus {
        case .authorizedWhenInUse, .authorizedAlways:
            m.requestLocation()
        case .denied, .restricted:
            finish(nil)
        default:
            break
        }
    }

    func locationManager(_ m: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        finish(locations.last)
    }

    func locationManager(_ m: CLLocationManager, didFailWithError error: Error) {
        finish(nil)
    }

    private func finish(_ location: CLLocation?) {
        timeoutTask?.cancel()
        timeoutTask = nil
        guard let cont = continuation else { return }
        continuation = nil
        cont.resume(returning: location)
    }
}
