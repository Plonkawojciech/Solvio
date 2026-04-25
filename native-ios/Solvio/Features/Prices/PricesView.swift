import SwiftUI

/// AI price comparison — mirrors `app/(protected)/prices/` in the PWA.
/// Calls `POST /api/prices/compare` via `PricesRepo.compare(lang:currency:)`.
/// Backend reads the user's scanned receipt items server-side (last 60 days)
/// and returns per-product comparisons, best prices, and total savings.
struct PricesView: View {
    @EnvironmentObject private var toast: ToastCenter
    @EnvironmentObject private var locale: AppLocale
    @State private var isLoading = false
    @State private var result: PriceComparisonResponse?
    @State private var errorMessage: String?
    @State private var currency: String = "PLN"
    /// Per-card detail expansion. Default = collapsed (compact summary row).
    /// Tapping a card adds its productName here; tap chevron again to remove.
    @State private var expanded: Set<String> = []
    /// Inner per-product price-list expansion. Lives separately from card
    /// expansion so a user can keep the card open without seeing every store
    /// row (those can still be a long list per product).
    @State private var pricesExpanded: Set<String> = []

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Theme.Spacing.md) {
                header
                runCard
                if isLoading && result == nil {
                    NBProgressCard(
                        title: locale.t("prices.runningTitle"),
                        stages: [
                            locale.t("progress.preparingRequest"),
                            locale.t("progress.scanningWeb"),
                            locale.t("progress.matchingProducts"),
                            locale.t("progress.almostDone"),
                        ],
                        estimatedSeconds: 14
                    )
                }
                if let msg = errorMessage, result == nil {
                    NBErrorCard(message: msg) { Task { await run() } }
                }
                if let r = result {
                    if let topError = r.error, !topError.isEmpty {
                        emptyNotice(r.message ?? topError)
                    } else {
                        summaryCard(r)
                        if !r.comparisons.isEmpty {
                            comparisonsList(r.comparisons, currency: currency)
                        } else if let msg = r.message, !msg.isEmpty {
                            emptyNotice(msg)
                        }
                    }
                }
                Spacer(minLength: Theme.Spacing.xl)
            }
            .padding(.horizontal, Theme.Spacing.md)
            .padding(.top, Theme.Spacing.md)
        }
        .background(Theme.background)
        .navigationTitle(locale.t("prices.navTitle"))
        .navigationBarTitleDisplayMode(.inline)
        .task { await loadCurrency() }
        .refreshable { await run() }
    }

    private func loadCurrency() async {
        guard let bundle = try? await SettingsRepo.fetch(),
              let code = bundle.settings?.currency,
              !code.isEmpty else { return }
        currency = code
    }

    // MARK: - Header + CTA

    private var header: some View {
        NBScreenHeader(
            eyebrow: locale.t("prices.eyebrow"),
            title: locale.t("prices.headerTitle"),
            subtitle: locale.t("prices.headerSubtitle")
        )
    }

    private var runCard: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
            Text(locale.t("prices.description"))
                .font(AppFont.body)
                .foregroundColor(Theme.mutedForeground)
                .fixedSize(horizontal: false, vertical: true)
            VStack(alignment: .leading, spacing: Theme.Spacing.xxs) {
                Text(locale.t("prices.currencyLabel")).font(AppFont.bodyMedium)
                NBSegmented(selection: $currency, options: [
                    (value: "PLN", label: "PLN"),
                    (value: "EUR", label: "EUR"),
                    (value: "USD", label: "USD")
                ])
            }
            Button {
                Task { await run() }
            } label: {
                HStack {
                    if isLoading { ProgressView().tint(Theme.background) }
                    Text(isLoading ? locale.t("prices.checking") : (result == nil ? locale.t("prices.compare") : locale.t("prices.recompare")))
                }
            }
            .buttonStyle(NBPrimaryButtonStyle())
            .disabled(isLoading)
        }
        .padding(Theme.Spacing.md)
        .nbCard(radius: Theme.Radius.md, shadow: Theme.Shadow.sm)
    }

    // MARK: - Summary

    private func summaryCard(_ r: PriceComparisonResponse) -> some View {
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
            Text(Fmt.amount(r.totalPotentialSavings, currency: currency))
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
        }
        .padding(Theme.Spacing.md)
        .frame(maxWidth: .infinity, alignment: .leading)
        .nbCard(radius: Theme.Radius.lg, shadow: Theme.Shadow.lg)
    }

    // MARK: - Comparisons list

    private func comparisonsList(_ items: [PriceComparison], currency: String) -> some View {
        let allExpanded = !items.isEmpty && expanded.count == items.count
        return VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
            HStack(alignment: .center) {
                NBSectionHeader(
                    eyebrow: locale.t("prices.productsSection"),
                    title: String(format: locale.t("prices.comparisonsCountFmt"), items.count)
                )
                Spacer()
                // Bulk toggle — collapse-all is the friendlier default after a
                // long compare run, so we only show it once at least one card
                // is open. Otherwise offer expand-all so power users can dump
                // the whole list at once.
                Button {
                    withAnimation(.easeInOut(duration: 0.18)) {
                        if allExpanded {
                            expanded.removeAll()
                            pricesExpanded.removeAll()
                        } else {
                            expanded = Set(items.map { $0.productName })
                        }
                    }
                } label: {
                    HStack(spacing: 4) {
                        Image(systemName: allExpanded ? "chevron.up.chevron.down" : "chevron.down")
                            .font(.system(size: 10, weight: .semibold))
                        Text(allExpanded ? locale.t("prices.collapseAll") : locale.t("prices.expandAll"))
                            .font(AppFont.mono(11))
                            .tracking(1)
                            .textCase(.uppercase)
                    }
                    .foregroundColor(Theme.foreground)
                }
                .buttonStyle(.plain)
            }
            ForEach(items) { comparison in
                comparisonCard(comparison, currency: currency)
            }
        }
    }

    /// Per-product card. Two visual states:
    ///
    /// - **Collapsed** (default): single compact row — name, savings tag,
    ///   "buy now" pill, chevron. Keeps the long list scrollable.
    /// - **Expanded**: full breakdown — paid vs. best, deal text, AI
    ///   recommendation, optional all-stores price list.
    ///
    /// Tap anywhere on the card to toggle. The whole card is the hit target,
    /// not just the chevron, so it's easy to flip on a small phone screen.
    private func comparisonCard(_ c: PriceComparison, currency: String) -> some View {
        let isCardExpanded = expanded.contains(c.productName)
        let pricesOpen = pricesExpanded.contains(c.productName)
        let allPrices = c.allPrices ?? []
        return VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
            // Always-visible compact header — product, savings hint, chevron.
            cardHeader(c, currency: currency, isExpanded: isCardExpanded)

            if isCardExpanded {
                // Detail body unfolds below the header. We render the same
                // sections the old card always rendered, just gated behind
                // the expand state so the default scroll is short.
                cardDetailBody(c, currency: currency, allPrices: allPrices, pricesOpen: pricesOpen)
                    .transition(.opacity.combined(with: .move(edge: .top)))
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(Theme.Spacing.sm)
        .nbCard(radius: Theme.Radius.md, shadow: Theme.Shadow.sm)
        .contentShape(Rectangle())
        .onTapGesture {
            withAnimation(.easeInOut(duration: 0.18)) {
                if isCardExpanded { expanded.remove(c.productName) }
                else { expanded.insert(c.productName) }
            }
        }
    }

    /// Compact header row — product name on the left, savings/buy-now chips
    /// inline, chevron on the right. This is the only thing visible when
    /// the card is collapsed, so it has to convey "is this worth opening?".
    private func cardHeader(_ c: PriceComparison, currency: String, isExpanded: Bool) -> some View {
        HStack(alignment: .center, spacing: Theme.Spacing.xs) {
            VStack(alignment: .leading, spacing: 2) {
                Text(c.productName)
                    .font(AppFont.bodyMedium)
                    .foregroundColor(Theme.foreground)
                    .lineLimit(2)
                if let savings = c.savingsAmount, savings > 0 {
                    HStack(spacing: 4) {
                        Text(String(format: locale.t("prices.saveFmt"), Fmt.amount(savings, currency: currency)))
                            .font(AppFont.mono(10))
                            .tracking(1)
                            .foregroundColor(Theme.success)
                        if let pct = c.savingsPercent {
                            Text(String(format: "(%.0f%%)", pct))
                                .font(AppFont.mono(10))
                                .foregroundColor(Theme.success)
                        }
                    }
                } else if !isExpanded {
                    // Hint that there's more to see when no savings tag is
                    // pulling attention.
                    Text(locale.t("prices.tapToExpand"))
                        .font(AppFont.caption)
                        .foregroundColor(Theme.mutedForeground)
                }
            }
            Spacer()
            if c.buyNow == true {
                NBTag(
                    text: locale.t("prices.buyNow"),
                    background: Theme.success.opacity(0.15),
                    foreground: Theme.success
                )
            }
            Image(systemName: isExpanded ? "chevron.up" : "chevron.down")
                .font(.system(size: 11, weight: .semibold))
                .foregroundColor(Theme.mutedForeground)
        }
    }

    /// Detail body — only shown when the card is expanded. Pulled out into
    /// its own helper to keep `comparisonCard` readable.
    @ViewBuilder
    private func cardDetailBody(_ c: PriceComparison, currency: String, allPrices: [PriceEntry], pricesOpen: Bool) -> some View {
        NBDivider()
        HStack(alignment: .top, spacing: Theme.Spacing.md) {
            if let price = c.userLastPrice {
                VStack(alignment: .leading, spacing: 2) {
                    Text(locale.t("prices.youPaid"))
                        .font(AppFont.mono(10))
                        .tracking(1)
                        .foregroundColor(Theme.mutedForeground)
                    Text(Fmt.amount(price, currency: currency))
                        .font(AppFont.bodyMedium)
                        .foregroundColor(Theme.foreground)
                    if let store = c.userLastStore, !store.isEmpty {
                        Text(store)
                            .font(AppFont.caption)
                            .foregroundColor(Theme.mutedForeground)
                    }
                }
            }
            if let bestPrice = c.bestPrice, let bestStore = c.bestStore {
                VStack(alignment: .leading, spacing: 2) {
                    Text(locale.t("prices.bestLabel"))
                        .font(AppFont.mono(10))
                        .tracking(1)
                        .foregroundColor(Theme.mutedForeground)
                    Text(Fmt.amount(bestPrice, currency: currency))
                        .font(AppFont.bodyMedium)
                        .foregroundColor(Theme.success)
                    Text(bestStore)
                        .font(AppFont.caption)
                        .foregroundColor(Theme.success)
                }
            }
            Spacer(minLength: 0)
        }

        if let deal = c.bestDeal, !deal.isEmpty {
            Text(deal)
                .font(AppFont.caption)
                .foregroundColor(Theme.mutedForeground)
                .fixedSize(horizontal: false, vertical: true)
        }
        if let recommendation = c.recommendation, !recommendation.isEmpty {
            Text(recommendation)
                .font(AppFont.caption)
                .foregroundColor(Theme.foreground)
                .fixedSize(horizontal: false, vertical: true)
        }

        if !allPrices.isEmpty {
            Button {
                withAnimation(.easeInOut(duration: 0.15)) {
                    if pricesOpen { pricesExpanded.remove(c.productName) }
                    else { pricesExpanded.insert(c.productName) }
                }
            } label: {
                HStack(spacing: 4) {
                    Text(pricesOpen ? locale.t("prices.hideAllPrices") : String(format: locale.t("prices.viewAllPricesFmt"), allPrices.count))
                        .font(AppFont.mono(11))
                        .tracking(1)
                        .textCase(.uppercase)
                    Image(systemName: pricesOpen ? "chevron.up" : "chevron.down")
                        .font(.system(size: 10, weight: .semibold))
                }
                .foregroundColor(Theme.foreground)
            }
            .buttonStyle(.plain)
            // Inner button taps shouldn't bubble up and toggle the card.
            .onTapGesture { /* swallow */ }
            if pricesOpen {
                VStack(spacing: 4) {
                    ForEach(Array(allPrices.enumerated()), id: \.offset) { _, entry in
                        HStack {
                            Text(entry.store)
                                .font(AppFont.caption)
                                .foregroundColor(Theme.foreground)
                            Spacer()
                            if let price = entry.price {
                                Text(Fmt.amount(price, currency: currency))
                                    .font(AppFont.mono(11))
                                    .foregroundColor(Theme.foreground)
                            }
                            if let promo = entry.promotion, !promo.isEmpty {
                                NBTag(
                                    text: promo,
                                    background: Theme.warning.opacity(0.15),
                                    foreground: Theme.warning
                                )
                            }
                        }
                        if let valid = entry.validUntil, !valid.isEmpty {
                            HStack {
                                Spacer()
                                Text(String(format: locale.t("prices.validUntilFmt"), Fmt.date(valid)))
                                    .font(AppFont.mono(10))
                                    .foregroundColor(Theme.mutedForeground)
                            }
                        }
                    }
                }
                .padding(Theme.Spacing.xs)
                .background(Theme.muted)
                .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.sm))
            }
        }
    }

    // MARK: - Empty notice

    private func emptyNotice(_ message: String) -> some View {
        NBEmptyState(
            systemImage: "doc.text.magnifyingglass",
            title: locale.t("prices.emptyTitle"),
            subtitle: message,
            action: nil
        )
    }

    // MARK: - Run

    private func run() async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            result = try await PricesRepo.compare(lang: locale.language.rawValue, currency: currency)
        } catch {
            errorMessage = error.localizedDescription
            toast.error(locale.t("prices.compareFailed"), description: error.localizedDescription)
        }
    }
}
