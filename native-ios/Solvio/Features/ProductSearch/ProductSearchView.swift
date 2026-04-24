import SwiftUI

struct ProductSearchView: View {
    @EnvironmentObject private var locale: AppLocale
    @State private var query = ""
    @State private var isLoading = false
    @State private var result: ProductSearchResponse?
    @State private var errorMessage: String?
    @State private var currency = "PLN"
    @FocusState private var isSearchFocused: Bool

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Theme.Spacing.md) {
                header
                searchBar
                if isLoading {
                    NBLoadingCard()
                }
                if let msg = errorMessage, result == nil {
                    NBErrorCard(message: msg) { Task { await search() } }
                }
                if let r = result {
                    if !r.results.isEmpty {
                        summaryBar(r)
                        resultsSection(r.results)
                    } else {
                        emptyCard
                    }
                    if let alts = r.alternatives, !alts.isEmpty {
                        alternativesSection(alts)
                    }
                    if let tip = r.tip, !tip.isEmpty {
                        tipCard(tip)
                    }
                }
                Spacer(minLength: Theme.Spacing.xl)
            }
            .padding(.horizontal, Theme.Spacing.md)
            .padding(.top, Theme.Spacing.md)
        }
        .background(Theme.background)
        .navigationTitle(locale.t("search.navTitle"))
        .navigationBarTitleDisplayMode(.inline)
        .task { await loadCurrency() }
    }

    private func loadCurrency() async {
        guard let bundle = try? await SettingsRepo.fetch(),
              let code = bundle.settings?.currency,
              !code.isEmpty else { return }
        currency = code
    }

    private func search() async {
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        isLoading = true
        errorMessage = nil
        isSearchFocused = false
        do {
            let lang = locale.language == .pl ? "pl" : "en"
            result = try await ProductSearchRepo.search(query: trimmed, lang: lang, currency: currency)
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    // MARK: - Header

    private var header: some View {
        NBScreenHeader(
            eyebrow: locale.t("search.navTitle").uppercased(),
            title: locale.t("search.title"),
            subtitle: locale.t("search.subtitle")
        )
    }

    // MARK: - Search bar

    private var searchBar: some View {
        HStack(spacing: Theme.Spacing.sm) {
            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundColor(Theme.mutedForeground)
                TextField(locale.t("search.placeholder"), text: $query)
                    .font(AppFont.body)
                    .foregroundColor(Theme.foreground)
                    .focused($isSearchFocused)
                    .submitLabel(.search)
                    .onSubmit { Task { await search() } }
                if !query.isEmpty {
                    Button {
                        query = ""
                        result = nil
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .font(.system(size: 16))
                            .foregroundColor(Theme.mutedForeground)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(Theme.Spacing.sm)
            .background(Theme.card)
            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.md))
            .overlay(
                RoundedRectangle(cornerRadius: Theme.Radius.md)
                    .stroke(Theme.foreground, lineWidth: Theme.Border.widthThin)
            )

            Button {
                Task { await search() }
            } label: {
                Image(systemName: "arrow.right")
                    .font(.system(size: 16, weight: .bold))
                    .foregroundColor(Theme.background)
                    .frame(width: 44, height: 44)
                    .background(Theme.foreground)
                    .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.md))
                    .overlay(
                        RoundedRectangle(cornerRadius: Theme.Radius.md)
                            .stroke(Theme.foreground, lineWidth: Theme.Border.widthThin)
                    )
            }
            .buttonStyle(.plain)
            .disabled(query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isLoading)
        }
    }

    // MARK: - Summary

    private func summaryBar(_ r: ProductSearchResponse) -> some View {
        HStack(spacing: Theme.Spacing.md) {
            if let cheapest = r.cheapestPrice {
                statPill(
                    icon: "arrow.down.circle.fill",
                    value: formatPrice(cheapest),
                    label: locale.t("search.cheapest"),
                    color: Theme.success
                )
            }
            if let avg = r.averagePrice {
                statPill(
                    icon: "equal.circle.fill",
                    value: formatPrice(avg),
                    label: locale.t("search.average"),
                    color: Theme.info
                )
            }
        }
    }

    private func statPill(icon: String, value: String, label: String, color: Color) -> some View {
        HStack(spacing: 6) {
            Image(systemName: icon)
                .font(.system(size: 18, weight: .bold))
                .foregroundColor(color)
            VStack(alignment: .leading, spacing: 0) {
                Text(value)
                    .font(AppFont.bold(16))
                    .foregroundColor(Theme.foreground)
                Text(label)
                    .font(AppFont.mono(10))
                    .foregroundColor(Theme.mutedForeground)
                    .textCase(.uppercase)
            }
        }
        .padding(Theme.Spacing.sm)
        .frame(maxWidth: .infinity, alignment: .leading)
        .nbCard(radius: Theme.Radius.sm, shadow: Theme.Shadow.sm)
    }

    // MARK: - Results

    private func resultsSection(_ results: [ProductSearchResult]) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
            sectionTitle(locale.t("search.results"), count: results.count)
            let sorted = results.sorted { ($0.price ?? .infinity) < ($1.price ?? .infinity) }
            ForEach(sorted) { item in
                resultCard(item, isCheapest: item.store == result?.cheapestStore)
            }
            if result?.isEstimated == true {
                HStack(spacing: 4) {
                    Image(systemName: "info.circle")
                        .font(.system(size: 12))
                    Text(locale.t("search.estimated"))
                        .font(AppFont.caption)
                }
                .foregroundColor(Theme.mutedForeground)
            }
        }
    }

    private func resultCard(_ item: ProductSearchResult, isCheapest: Bool) -> some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 6) {
                    Text(item.store)
                        .font(AppFont.bodyMedium)
                        .foregroundColor(Theme.foreground)
                    if isCheapest {
                        Text(locale.t("search.cheapest"))
                            .font(AppFont.mono(9))
                            .foregroundColor(Theme.background)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(Theme.success)
                            .clipShape(RoundedRectangle(cornerRadius: 4))
                    }
                    if item.isPromo == true {
                        Text(locale.t("search.promo"))
                            .font(AppFont.mono(9))
                            .foregroundColor(Theme.background)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(Theme.warning)
                            .clipShape(RoundedRectangle(cornerRadius: 4))
                    }
                }
                Text(item.productName)
                    .font(AppFont.caption)
                    .foregroundColor(Theme.mutedForeground)
                    .lineLimit(2)
                if let pu = item.pricePerUnit, !pu.isEmpty {
                    Text(pu)
                        .font(AppFont.mono(10))
                        .foregroundColor(Theme.mutedForeground)
                }
            }
            Spacer()
            if let price = item.price {
                Text(formatPrice(price))
                    .font(AppFont.bold(18))
                    .foregroundColor(isCheapest ? Theme.success : Theme.foreground)
            }
        }
        .padding(Theme.Spacing.sm)
        .nbCard(radius: Theme.Radius.md, shadow: Theme.Shadow.sm)
    }

    // MARK: - Alternatives

    private func alternativesSection(_ alts: [ProductAlternative]) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
            sectionTitle(locale.t("search.alternatives"), count: alts.count)
            ForEach(alts) { alt in
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(alt.name)
                            .font(AppFont.bodyMedium)
                            .foregroundColor(Theme.foreground)
                        if let why = alt.whyBetter, !why.isEmpty {
                            Text(why)
                                .font(AppFont.caption)
                                .foregroundColor(Theme.mutedForeground)
                        }
                    }
                    Spacer()
                    if let price = alt.avgPrice {
                        Text("~\(formatPrice(price))")
                            .font(AppFont.bold(14))
                            .foregroundColor(Theme.info)
                    }
                }
                .padding(Theme.Spacing.sm)
                .nbCard(radius: Theme.Radius.sm, shadow: Theme.Shadow.sm)
            }
        }
    }

    // MARK: - Tip

    private func tipCard(_ tip: String) -> some View {
        HStack(alignment: .top, spacing: Theme.Spacing.sm) {
            Image(systemName: "lightbulb.fill")
                .font(.system(size: 16, weight: .bold))
                .foregroundColor(Theme.warning)
            VStack(alignment: .leading, spacing: 2) {
                Text(locale.t("search.tip"))
                    .font(AppFont.mono(10))
                    .foregroundColor(Theme.mutedForeground)
                    .textCase(.uppercase)
                Text(tip)
                    .font(AppFont.body)
                    .foregroundColor(Theme.foreground)
            }
        }
        .padding(Theme.Spacing.sm)
        .nbCard(radius: Theme.Radius.md, shadow: Theme.Shadow.sm)
    }

    // MARK: - Empty

    private var emptyCard: some View {
        VStack(spacing: Theme.Spacing.sm) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 32, weight: .bold))
                .foregroundColor(Theme.mutedForeground)
            Text(locale.t("search.noResults"))
                .font(AppFont.bodyMedium)
                .foregroundColor(Theme.foreground)
            Text(locale.t("search.noResultsDesc"))
                .font(AppFont.caption)
                .foregroundColor(Theme.mutedForeground)
        }
        .frame(maxWidth: .infinity)
        .padding(Theme.Spacing.lg)
        .nbCard(radius: Theme.Radius.md, shadow: Theme.Shadow.sm)
    }

    // MARK: - Helpers

    private func sectionTitle(_ title: String, count: Int) -> some View {
        HStack {
            Text(title)
                .font(AppFont.mono(11))
                .foregroundColor(Theme.mutedForeground)
                .textCase(.uppercase)
                .tracking(1)
            Spacer()
            Text("\(count)")
                .font(AppFont.mono(11))
                .foregroundColor(Theme.mutedForeground)
        }
    }

    private func formatPrice(_ value: Double) -> String {
        String(format: "%.2f %@", value, currency)
    }
}
