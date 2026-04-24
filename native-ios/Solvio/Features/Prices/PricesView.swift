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
    @State private var expanded: Set<String> = []

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Theme.Spacing.md) {
                header
                runCard
                if isLoading && result == nil {
                    NBLoadingCard()
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
        VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
            NBSectionHeader(eyebrow: locale.t("prices.productsSection"), title: String(format: locale.t("prices.comparisonsCountFmt"), items.count))
            ForEach(items) { comparison in
                comparisonCard(comparison, currency: currency)
            }
        }
    }

    private func comparisonCard(_ c: PriceComparison, currency: String) -> some View {
        let isExpanded = expanded.contains(c.productName)
        let allPrices = c.allPrices ?? []
        return VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
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
                        if isExpanded { expanded.remove(c.productName) } else { expanded.insert(c.productName) }
                    }
                } label: {
                    HStack(spacing: 4) {
                        Text(isExpanded ? locale.t("prices.hideAllPrices") : String(format: locale.t("prices.viewAllPricesFmt"), allPrices.count))
                            .font(AppFont.mono(11))
                            .tracking(1)
                            .textCase(.uppercase)
                        Image(systemName: isExpanded ? "chevron.up" : "chevron.down")
                            .font(.system(size: 10, weight: .semibold))
                    }
                    .foregroundColor(Theme.foreground)
                }
                .buttonStyle(.plain)
                if isExpanded {
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
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(Theme.Spacing.sm)
        .nbCard(radius: Theme.Radius.md, shadow: Theme.Shadow.sm)
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
