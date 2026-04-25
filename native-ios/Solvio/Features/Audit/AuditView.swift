import SwiftUI

/// Shopping audit — mirrors `app/(protected)/audit/` in the PWA.
/// Calls `POST /api/audit/generate` via `AuditRepo.generate(lang:currency:)`
/// and renders the AI web-search-powered audit result: KPIs, best store,
/// top stores, top products, price comparisons, and current promotions.
struct AuditView: View {
    @EnvironmentObject private var toast: ToastCenter
    @EnvironmentObject private var locale: AppLocale
    @State private var isLoading = false
    @State private var result: AuditResult?
    @State private var errorMessage: String?
    @State private var currency: String = "PLN"

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Theme.Spacing.md) {
                header
                generateCard
                if isLoading && result == nil {
                    NBProgressCard(
                        title: locale.t("audit.runningTitle"),
                        stages: [
                            locale.t("progress.preparingRequest"),
                            locale.t("progress.scanningWeb"),
                            locale.t("progress.matchingProducts"),
                            locale.t("progress.findingDeals"),
                            locale.t("progress.almostDone"),
                        ],
                        estimatedSeconds: 18
                    )
                }
                if let msg = errorMessage, result == nil {
                    NBErrorCard(message: msg) { Task { await run() } }
                }
                if let r = result {
                    kpiCard(r)
                    if !r.aiSummary.isEmpty {
                        summaryCard(r.aiSummary)
                    }
                    if let message = r.personalMessage, !message.isEmpty {
                        messageCard(message)
                    }
                    if let bestStore = r.bestStore, !bestStore.isEmpty {
                        bestStoreCard(bestStore)
                    }
                    if let tip = r.topTip, !tip.isEmpty {
                        topTipCard(tip)
                    }
                    if !r.topStores.isEmpty {
                        topStoresSection(r.topStores, currency: r.currency)
                    }
                    if !r.topProducts.isEmpty {
                        topProductsSection(r.topProducts, currency: r.currency)
                    }
                    if !r.priceComparisons.isEmpty {
                        priceComparisonsSection(r.priceComparisons, currency: r.currency)
                    }
                    if let promotions = r.currentPromotions, !promotions.isEmpty {
                        promotionsSection(promotions, currency: r.currency)
                    }
                }
                Spacer(minLength: Theme.Spacing.xl)
            }
            .padding(.horizontal, Theme.Spacing.md)
            .padding(.top, Theme.Spacing.md)
        }
        .background(Theme.background)
        .navigationTitle(locale.t("audit.navTitle"))
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
            eyebrow: locale.t("audit.headerEyebrow"),
            title: locale.t("audit.headerTitle"),
            subtitle: locale.t("audit.headerSubtitle")
        )
    }

    private var generateCard: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
            Text(locale.t("audit.description"))
                .font(AppFont.body)
                .foregroundColor(Theme.mutedForeground)
                .fixedSize(horizontal: false, vertical: true)
            VStack(alignment: .leading, spacing: Theme.Spacing.xxs) {
                Text(locale.t("audit.currency")).font(AppFont.bodyMedium)
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
                    Text(isLoading ? locale.t("audit.auditing") : (result == nil ? locale.t("audit.generate") : locale.t("audit.regenerate")))
                }
            }
            .buttonStyle(NBPrimaryButtonStyle())
            .disabled(isLoading)
        }
        .padding(Theme.Spacing.md)
        .nbCard(radius: Theme.Radius.md, shadow: Theme.Shadow.sm)
    }

    // MARK: - KPI card (period + totals)

    private func kpiCard(_ r: AuditResult) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 2) {
                    NBEyebrow(text: locale.t("audit.period"))
                    Text("\(Fmt.date(r.period.from)) – \(Fmt.date(r.period.to))")
                        .font(AppFont.bodyMedium)
                        .foregroundColor(Theme.foreground)
                }
                Spacer()
                NBIconBadge(systemImage: "cart.fill", size: 36)
            }

            Text(Fmt.amount(r.totalSpent, currency: r.currency))
                .font(AppFont.hero)
                .foregroundColor(Theme.foreground)
                .minimumScaleFactor(0.6)
                .lineLimit(1)
            Text(String(format: locale.t("audit.txnsFmt"), r.transactionCount))
                .font(AppFont.caption)
                .foregroundColor(Theme.mutedForeground)

            HStack(spacing: Theme.Spacing.sm) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(locale.t("audit.potentialSavingLabel"))
                        .font(AppFont.mono(10))
                        .tracking(1)
                        .foregroundColor(Theme.mutedForeground)
                    Text(Fmt.amount(r.totalPotentialSaving, currency: r.currency))
                        .font(AppFont.bold(20))
                        .foregroundColor(Theme.success)
                }
                Spacer()
                if r.webSearchUsed == true {
                    NBTag(
                        text: locale.t("audit.webSearchTag"),
                        background: Theme.info.opacity(0.15),
                        foreground: Theme.info
                    )
                }
            }
            .padding(Theme.Spacing.sm)
            .background(Theme.success.opacity(0.08))
            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.md))
            .overlay(
                RoundedRectangle(cornerRadius: Theme.Radius.md)
                    .stroke(Theme.success, lineWidth: Theme.Border.widthThin)
            )
        }
        .padding(Theme.Spacing.md)
        .frame(maxWidth: .infinity, alignment: .leading)
        .nbCard(radius: Theme.Radius.lg, shadow: Theme.Shadow.lg)
    }

    // MARK: - Summary / message / tip

    private func summaryCard(_ text: String) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
            NBEyebrow(text: locale.t("audit.aiSummaryEyebrow"))
            Text(text)
                .font(AppFont.body)
                .foregroundColor(Theme.foreground)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(Theme.Spacing.md)
        .nbCard(radius: Theme.Radius.md, shadow: Theme.Shadow.sm)
    }

    private func messageCard(_ text: String) -> some View {
        HStack(alignment: .top, spacing: Theme.Spacing.sm) {
            NBIconBadge(systemImage: "bubble.left.fill", tint: Theme.info)
            Text(text)
                .font(AppFont.body)
                .foregroundColor(Theme.foreground)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(Theme.Spacing.md)
        .background(Theme.info.opacity(0.08))
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.md))
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Radius.md)
                .stroke(Theme.info, lineWidth: Theme.Border.widthThin)
        )
    }

    private func bestStoreCard(_ name: String) -> some View {
        HStack(spacing: Theme.Spacing.sm) {
            NBIconBadge(systemImage: "star.fill", tint: Theme.success)
            VStack(alignment: .leading, spacing: 2) {
                Text(locale.t("audit.bestStoreOverall"))
                    .font(AppFont.caption)
                    .foregroundColor(Theme.mutedForeground)
                Text(name)
                    .font(AppFont.bodyMedium)
                    .foregroundColor(Theme.foreground)
            }
            Spacer()
        }
        .padding(Theme.Spacing.md)
        .frame(maxWidth: .infinity, alignment: .leading)
        .nbCard(radius: Theme.Radius.md, shadow: Theme.Shadow.sm)
    }

    private func topTipCard(_ text: String) -> some View {
        HStack(alignment: .top, spacing: Theme.Spacing.sm) {
            NBIconBadge(systemImage: "lightbulb.fill", tint: Theme.warning)
            Text(text)
                .font(AppFont.body)
                .foregroundColor(Theme.foreground)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 0)
        }
        .padding(Theme.Spacing.md)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.warning.opacity(0.08))
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.md))
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Radius.md)
                .stroke(Theme.warning, lineWidth: Theme.Border.widthThin)
        )
    }

    // MARK: - Top stores

    private func topStoresSection(_ stores: [AuditTopStore], currency: String) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
            NBSectionHeader(eyebrow: locale.t("audit.storesEyebrow"), title: locale.t("audit.topSpendTitle"))
            ForEach(Array(stores.enumerated()), id: \.element.id) { idx, s in
                HStack(spacing: Theme.Spacing.sm) {
                    Text("#\(idx + 1)")
                        .font(AppFont.mono(12))
                        .foregroundColor(Theme.mutedForeground)
                        .frame(width: 28, alignment: .leading)
                    Text(s.store)
                        .font(AppFont.bodyMedium)
                        .foregroundColor(Theme.foreground)
                    Spacer()
                    Text(Fmt.amount(s.amount, currency: currency))
                        .font(AppFont.mono(13))
                        .foregroundColor(Theme.foreground)
                }
                .padding(Theme.Spacing.sm)
                .nbCard(radius: Theme.Radius.sm, shadow: Theme.Shadow.sm)
            }
        }
    }

    // MARK: - Top products

    private func topProductsSection(_ products: [AuditTopProduct], currency: String) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
            NBSectionHeader(eyebrow: locale.t("audit.productsEyebrow"), title: locale.t("audit.topPurchasedTitle"))
            ForEach(products) { p in
                VStack(alignment: .leading, spacing: 4) {
                    HStack {
                        Text(p.name)
                            .font(AppFont.bodyMedium)
                            .foregroundColor(Theme.foreground)
                            .lineLimit(2)
                        Spacer()
                        Text(Fmt.amount(p.totalPaid, currency: currency))
                            .font(AppFont.mono(12))
                            .foregroundColor(Theme.foreground)
                    }
                    HStack(spacing: 6) {
                        NBTag(text: String(format: locale.t("audit.timesBoughtFmt"), p.count))
                        NBTag(text: String(format: locale.t("audit.avgFmt"), Fmt.amount(p.avgPrice, currency: currency)))
                        if let vendor = p.vendor, !vendor.isEmpty {
                            NBTag(text: vendor)
                        }
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(Theme.Spacing.sm)
                .nbCard(radius: Theme.Radius.sm, shadow: Theme.Shadow.sm)
            }
        }
    }

    // MARK: - Price comparisons

    private func priceComparisonsSection(_ items: [AuditPriceComparison], currency: String) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
            NBSectionHeader(eyebrow: locale.t("audit.pricesEyebrow"), title: locale.t("audit.whereCheaper"))
            ForEach(items) { pc in
                VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
                    HStack {
                        Text(pc.product)
                            .font(AppFont.bodyMedium)
                            .foregroundColor(Theme.foreground)
                        Spacer()
                        if let saving = pc.potentialSaving, saving > 0 {
                            NBTag(
                                text: String(format: locale.t("audit.saveFmt"), Fmt.amount(saving, currency: currency)),
                                background: Theme.success.opacity(0.15),
                                foreground: Theme.success
                            )
                        }
                    }
                    HStack(spacing: Theme.Spacing.md) {
                        if let paid = pc.pricePaid {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(locale.t("audit.youPaidLabel")).font(AppFont.mono(10)).foregroundColor(Theme.mutedForeground)
                                Text(Fmt.amount(paid, currency: currency))
                                    .font(AppFont.bodyMedium)
                                    .foregroundColor(Theme.foreground)
                            }
                        }
                        if let cheapestStore = pc.cheapestStore, let cheapestPrice = pc.cheapestPrice {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(locale.t("audit.cheapestLabel")).font(AppFont.mono(10)).foregroundColor(Theme.mutedForeground)
                                Text("\(Fmt.amount(cheapestPrice, currency: currency)) · \(cheapestStore)")
                                    .font(AppFont.bodyMedium)
                                    .foregroundColor(Theme.success)
                            }
                        }
                        Spacer(minLength: 0)
                    }
                    if let prices = pc.prices, !prices.isEmpty {
                        VStack(spacing: 4) {
                            ForEach(Array(prices.sorted(by: { $0.value < $1.value })), id: \.key) { store, price in
                                HStack {
                                    Text(store)
                                        .font(AppFont.caption)
                                        .foregroundColor(Theme.mutedForeground)
                                    Spacer()
                                    Text(Fmt.amount(price, currency: currency))
                                        .font(AppFont.mono(11))
                                        .foregroundColor(Theme.foreground)
                                }
                            }
                        }
                        .padding(Theme.Spacing.xs)
                        .background(Theme.muted)
                        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.sm))
                    }
                    if let verdict = pc.verdict, !verdict.isEmpty {
                        Text(verdict)
                            .font(AppFont.caption)
                            .foregroundColor(Theme.mutedForeground)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(Theme.Spacing.sm)
                .nbCard(radius: Theme.Radius.md, shadow: Theme.Shadow.sm)
            }
        }
    }

    // MARK: - Promotions

    private func promotionsSection(_ items: [AuditPromotion], currency: String) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
            NBSectionHeader(eyebrow: locale.t("audit.promotionsEyebrow"), title: locale.t("audit.activeDeals"))
            ForEach(Array(items.enumerated()), id: \.offset) { _, promo in
                VStack(alignment: .leading, spacing: 4) {
                    HStack {
                        if let store = promo.store, !store.isEmpty {
                            Text(store)
                                .font(AppFont.bodyMedium)
                                .foregroundColor(Theme.foreground)
                        }
                        Spacer()
                        if let price = promo.price {
                            Text(Fmt.amount(price, currency: currency))
                                .font(AppFont.mono(12))
                                .foregroundColor(Theme.success)
                        }
                    }
                    if let product = promo.product, !product.isEmpty {
                        Text(product)
                            .font(AppFont.caption)
                            .foregroundColor(Theme.mutedForeground)
                    }
                    if let desc = promo.description, !desc.isEmpty {
                        Text(desc)
                            .font(AppFont.caption)
                            .foregroundColor(Theme.mutedForeground)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    if let valid = promo.validUntil, !valid.isEmpty {
                        Text(String(format: locale.t("audit.validUntilFmt"), Fmt.date(valid)))
                            .font(AppFont.mono(11))
                            .foregroundColor(Theme.mutedForeground)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(Theme.Spacing.sm)
                .nbCard(radius: Theme.Radius.sm, shadow: Theme.Shadow.sm)
            }
        }
    }

    // MARK: - Run

    private func run() async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            result = try await AuditRepo.generate(lang: locale.language.rawValue, currency: currency)
        } catch {
            errorMessage = error.localizedDescription
            toast.error(locale.t("audit.failed"), description: error.localizedDescription)
        }
    }
}
