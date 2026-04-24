import SwiftUI

struct ShoppingAdvisorView: View {
    @EnvironmentObject private var toast: ToastCenter
    @EnvironmentObject private var locale: AppLocale
    @State private var isLoading = false
    @State private var result: ShoppingAdvisorResponse?
    @State private var errorMessage: String?
    @State private var currency: String = "PLN"

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Theme.Spacing.md) {
                header
                generateCard
                if isLoading && result == nil {
                    NBLoadingCard()
                }
                if let msg = errorMessage, result == nil {
                    NBErrorCard(message: msg) { Task { await run() } }
                }
                if let r = result {
                    if let summary = r.summary, !summary.isEmpty {
                        summaryCard(summary)
                    }
                    heroStats(r)
                    if let recs = r.recommendations, !recs.isEmpty {
                        recommendationsSection(recs)
                    }
                    if let plan = r.weeklyPlan, let stores = plan.stores, !stores.isEmpty {
                        weeklyPlanSection(plan)
                    }
                    if let insights = r.topInsights, !insights.isEmpty {
                        insightsSection(insights)
                    }
                }
                Spacer(minLength: Theme.Spacing.xl)
            }
            .padding(.horizontal, Theme.Spacing.md)
            .padding(.top, Theme.Spacing.md)
        }
        .background(Theme.background)
        .navigationTitle(locale.t("advisor.navTitle"))
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

    // MARK: - Header

    private var header: some View {
        NBScreenHeader(
            eyebrow: locale.t("advisor.eyebrow"),
            title: locale.t("advisor.title"),
            subtitle: locale.t("advisor.subtitle")
        )
    }

    // MARK: - Generate CTA

    private var generateCard: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
            Text(locale.t("advisor.description"))
                .font(AppFont.body)
                .foregroundColor(Theme.mutedForeground)
                .fixedSize(horizontal: false, vertical: true)
            Button {
                Task { await run() }
            } label: {
                HStack(spacing: Theme.Spacing.xs) {
                    if isLoading {
                        ProgressView()
                            .tint(Theme.background)
                            .controlSize(.small)
                    }
                    Text(isLoading ? locale.t("advisor.analyzing") : locale.t("advisor.generate"))
                }
                .frame(maxWidth: .infinity)
            }
            .buttonStyle(NBPrimaryButtonStyle())
            .disabled(isLoading)
        }
        .padding(Theme.Spacing.md)
        .nbCard(radius: Theme.Radius.md, shadow: Theme.Shadow.sm)
    }

    // MARK: - Summary

    private func summaryCard(_ summary: String) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
            NBEyebrow(text: locale.t("advisor.summaryTitle"))
            Text(summary)
                .font(AppFont.body)
                .foregroundColor(Theme.foreground)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(Theme.Spacing.md)
        .nbCard(radius: Theme.Radius.md, shadow: Theme.Shadow.sm)
    }

    // MARK: - Hero Stats

    private func heroStats(_ r: ShoppingAdvisorResponse) -> some View {
        HStack(spacing: Theme.Spacing.sm) {
            statBadge(
                icon: "arrow.down.circle.fill",
                color: Theme.success,
                label: locale.t("advisor.savings"),
                value: Fmt.amount(r.totalPotentialMonthlySavings ?? 0, currency: currency) + locale.t("advisor.perMonth")
            )
            statBadge(
                icon: "building.2.fill",
                color: Theme.accent,
                label: locale.t("advisor.bestStore"),
                value: r.bestOverallStore ?? "—"
            )
        }
    }

    private func statBadge(icon: String, color: Color, label: String, value: String) -> some View {
        VStack(spacing: Theme.Spacing.xs) {
            Image(systemName: icon)
                .font(.system(size: 20))
                .foregroundColor(color)
            Text(label)
                .font(AppFont.mono(10))
                .foregroundColor(Theme.mutedForeground)
            Text(value)
                .font(AppFont.bold(16))
                .foregroundColor(Theme.foreground)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
        }
        .frame(maxWidth: .infinity)
        .padding(Theme.Spacing.md)
        .nbCard(radius: Theme.Radius.md, shadow: Theme.Shadow.sm)
    }

    // MARK: - Recommendations

    private func recommendationsSection(_ recs: [AdvisorRecommendation]) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
            NBEyebrow(text: locale.t("advisor.recommendationsTitle"))
            ForEach(recs) { rec in
                recommendationCard(rec)
            }
        }
    }

    private func recommendationCard(_ rec: AdvisorRecommendation) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
            HStack {
                Text(rec.productName)
                    .font(AppFont.bodyMedium)
                    .foregroundColor(Theme.foreground)
                    .lineLimit(2)
                Spacer()
                verdictBadge(rec.verdict)
            }

            if let cat = rec.category {
                Text(cat)
                    .font(AppFont.mono(10))
                    .foregroundColor(Theme.mutedForeground)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(Theme.muted)
                    .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.sm))
            }

            HStack(spacing: Theme.Spacing.md) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(locale.t("advisor.yourPrice"))
                        .font(AppFont.mono(10))
                        .foregroundColor(Theme.mutedForeground)
                    Text(Fmt.amount(rec.userAvgPrice ?? 0, currency: currency))
                        .font(AppFont.bodyMedium)
                        .foregroundColor(Theme.foreground)
                    if let store = rec.userLastStore {
                        Text(store)
                            .font(AppFont.caption)
                            .foregroundColor(Theme.mutedForeground)
                    }
                }
                Spacer()
                Image(systemName: "arrow.right")
                    .foregroundColor(Theme.mutedForeground)
                Spacer()
                VStack(alignment: .trailing, spacing: 2) {
                    Text(locale.t("advisor.bestPrice"))
                        .font(AppFont.mono(10))
                        .foregroundColor(Theme.mutedForeground)
                    Text(Fmt.amount(rec.bestPrice ?? 0, currency: currency))
                        .font(AppFont.bold(16))
                        .foregroundColor(Theme.success)
                    if let store = rec.bestStore {
                        Text(store)
                            .font(AppFont.caption)
                            .foregroundColor(Theme.success)
                    }
                }
            }

            if let deal = rec.bestDeal, !deal.isEmpty {
                HStack(spacing: 4) {
                    Image(systemName: "tag.fill")
                        .font(.system(size: 10))
                        .foregroundColor(Theme.warning)
                    Text(deal)
                        .font(AppFont.caption)
                        .foregroundColor(Theme.foreground)
                }
                .padding(.horizontal, 8)
                .padding(.vertical, 4)
                .background(Theme.warning.opacity(0.1))
                .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.sm))
            }

            if let tip = rec.tip, !tip.isEmpty {
                Text(tip)
                    .font(AppFont.caption)
                    .foregroundColor(Theme.mutedForeground)
                    .italic()
            }
        }
        .padding(Theme.Spacing.md)
        .nbCard(radius: Theme.Radius.md, shadow: Theme.Shadow.sm)
    }

    private func verdictBadge(_ verdict: String?) -> some View {
        let (text, color) = verdictDisplay(verdict)
        return Text(text)
            .font(AppFont.mono(10))
            .foregroundColor(color)
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(color.opacity(0.15))
            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.sm))
    }

    private func verdictDisplay(_ verdict: String?) -> (String, Color) {
        switch verdict {
        case "great_price": return (locale.t("advisor.verdict.greatPrice"), Theme.success)
        case "good_price": return (locale.t("advisor.verdict.goodPrice"), Theme.accent)
        case "could_save": return (locale.t("advisor.verdict.couldSave"), Theme.warning)
        case "switch_store": return (locale.t("advisor.verdict.switchStore"), Theme.warning)
        case "big_savings": return (locale.t("advisor.verdict.bigSavings"), Theme.destructive)
        default: return (verdict ?? "—", Theme.mutedForeground)
        }
    }

    // MARK: - Weekly Plan

    private func weeklyPlanSection(_ plan: AdvisorWeeklyPlan) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
            NBEyebrow(text: locale.t("advisor.weeklyPlanTitle"))

            if let savings = plan.totalSavings, savings > 0 {
                HStack {
                    Image(systemName: "arrow.down.circle.fill")
                        .foregroundColor(Theme.success)
                    Text(locale.t("advisor.weeklySavings"))
                        .font(AppFont.body)
                        .foregroundColor(Theme.foreground)
                    Spacer()
                    Text(Fmt.amount(savings, currency: currency))
                        .font(AppFont.bold(16))
                        .foregroundColor(Theme.success)
                }
                .padding(Theme.Spacing.sm)
                .nbCard(radius: Theme.Radius.sm, shadow: Theme.Shadow.sm)
            }

            ForEach(plan.stores ?? [], id: \.store) { store in
                storePlanCard(store)
            }
        }
    }

    private func storePlanCard(_ store: AdvisorStorePlan) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
            HStack {
                Image(systemName: "storefront.fill")
                    .foregroundColor(Theme.accent)
                Text(store.store)
                    .font(AppFont.bodyMedium)
                    .foregroundColor(Theme.foreground)
                Spacer()
                if let total = store.estimatedTotal {
                    Text("~\(Fmt.amount(total, currency: currency))")
                        .font(AppFont.mono(12))
                        .foregroundColor(Theme.mutedForeground)
                }
            }

            if let why = store.whyThisStore, !why.isEmpty {
                Text(why)
                    .font(AppFont.caption)
                    .foregroundColor(Theme.mutedForeground)
            }

            if let products = store.products, !products.isEmpty {
                FlowLayout(spacing: 4) {
                    ForEach(products, id: \.self) { product in
                        Text(product)
                            .font(AppFont.mono(10))
                            .padding(.horizontal, 8)
                            .padding(.vertical, 3)
                            .background(Theme.muted)
                            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.sm))
                    }
                }
            }
        }
        .padding(Theme.Spacing.md)
        .nbCard(radius: Theme.Radius.md, shadow: Theme.Shadow.sm)
    }

    // MARK: - Insights

    private func insightsSection(_ insights: [AdvisorInsight]) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
            NBEyebrow(text: locale.t("advisor.insightsTitle"))
            ForEach(insights) { insight in
                insightCard(insight)
            }
        }
    }

    private func insightCard(_ insight: AdvisorInsight) -> some View {
        HStack(alignment: .top, spacing: Theme.Spacing.sm) {
            Text(insight.icon ?? "💡")
                .font(.system(size: 22))
            VStack(alignment: .leading, spacing: 2) {
                Text(insight.title)
                    .font(AppFont.bodyMedium)
                    .foregroundColor(Theme.foreground)
                Text(insight.description)
                    .font(AppFont.caption)
                    .foregroundColor(Theme.mutedForeground)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(Theme.Spacing.md)
        .nbCard(radius: Theme.Radius.md, shadow: Theme.Shadow.sm)
    }

    // MARK: - Run

    private func run() async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            result = try await ShoppingAdvisorRepo.analyze(
                lang: locale.language.rawValue,
                currency: currency
            )
            if let err = result?.error {
                if err == "no_data" {
                    errorMessage = locale.t("advisor.noDataSub")
                } else {
                    errorMessage = err
                }
                result = nil
            }
        } catch {
            errorMessage = error.localizedDescription
            toast.error(locale.t("advisor.failed"))
        }
    }
}

// MARK: - Flow Layout

private struct FlowLayout: Layout {
    var spacing: CGFloat = 4

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = proposal.width ?? .infinity
        var x: CGFloat = 0
        var y: CGFloat = 0
        var rowHeight: CGFloat = 0
        for sub in subviews {
            let size = sub.sizeThatFits(.unspecified)
            if x + size.width > width && x > 0 {
                x = 0
                y += rowHeight + spacing
                rowHeight = 0
            }
            x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
        }
        return CGSize(width: width, height: y + rowHeight)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x: CGFloat = bounds.minX
        var y: CGFloat = bounds.minY
        var rowHeight: CGFloat = 0
        for sub in subviews {
            let size = sub.sizeThatFits(.unspecified)
            if x + size.width > bounds.maxX && x > bounds.minX {
                x = bounds.minX
                y += rowHeight + spacing
                rowHeight = 0
            }
            sub.place(at: CGPoint(x: x, y: y), proposal: .unspecified)
            x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
        }
    }
}
