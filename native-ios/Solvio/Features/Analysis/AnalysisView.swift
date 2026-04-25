import SwiftUI
import Charts

/// AI spending analysis — mirrors `app/(protected)/analysis/` in the PWA.
/// Calls `POST /api/analysis/ai` via `AnalysisRepo.run()` and renders the
/// server's insights, recommendations, anomalies, category trends, and
/// predicted monthly spend. Bank stats (if present) appear at the bottom.
struct AnalysisView: View {
    @EnvironmentObject private var toast: ToastCenter
    @EnvironmentObject private var locale: AppLocale
    @EnvironmentObject private var store: AppDataStore
    @State private var isLoading = false
    @State private var result: AnalysisResponse?
    @State private var errorMessage: String?
    private var currency: String { store.currency }

    /// Mirrors web `Period` type in `app/(protected)/analysis/page.tsx`.
    enum Period: String, CaseIterable, Hashable {
        case d7  = "7d"
        case d30 = "30d"
        case m3  = "3m"
        case m6  = "6m"
        case y1  = "1y"
        case all = "all"
    }
    @State private var period: Period = .m3

    /// Per-(period · currency · lang) cache of analysis results. The AI call
    /// is the most expensive request the app makes (~10–15 s on a cache
    /// miss), and the user routinely flips through periods to compare. With
    /// this cache, switching to a period you've already viewed is instant —
    /// only the *first* visit per period pays the AI cost.
    ///
    /// TTL = 15 minutes. Long enough that period-tabbing stays cheap, short
    /// enough that a session-long sit on the screen still picks up new
    /// expense data on the next manual run. Pull-to-refresh always forces.
    @State private var analysisCache: [String: CachedAnalysis] = [:]
    private static let analysisCacheTTL: TimeInterval = 900

    private struct CachedAnalysis {
        let result: AnalysisResponse
        let loadedAt: Date
    }

    /// Stable cache key — must include every input that changes the AI
    /// output. Currency and language affect the *content* (the AI writes
    /// in the user's language and quotes amounts in their currency), so
    /// they belong in the key.
    private var currentCacheKey: String {
        "\(period.rawValue)|\(currency)|\(locale.language.rawValue)"
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Theme.Spacing.md) {
                header
                periodSelector
                runCard
                if isLoading && result == nil {
                    NBLoadingCard()
                }
                if let msg = errorMessage, result == nil {
                    NBErrorCard(message: msg) { Task { await run(force: true) } }
                }
                if let r = result {
                    if let summary = r.summary, !summary.isEmpty {
                        summaryCard(summary)
                    }
                    if let predicted = r.predictedMonthlySpend {
                        predictedCard(predicted)
                    }
                    if let insights = r.insights, !insights.isEmpty {
                        insightsSection(insights)
                    }
                    if let recs = r.recommendations, !recs.isEmpty {
                        recommendationsSection(recs)
                    }
                    if let anomalies = r.anomalies, !anomalies.isEmpty {
                        anomaliesSection(anomalies)
                    }
                    if let trends = r.categoryTrends, !trends.isEmpty {
                        categoryTrendsSection(trends)
                        categoryShareSection(trends)
                    }
                    weekdaySection(anomalies: r.anomalies, bank: r.bankStats)
                    if let bank = r.bankStats {
                        bankStatsSection(bank)
                    }
                }
                Spacer(minLength: Theme.Spacing.xl)
            }
            .padding(.horizontal, Theme.Spacing.md)
            .padding(.top, Theme.Spacing.md)
        }
        .background(Theme.background)
        .navigationTitle(locale.t("analysis.navTitle"))
        .navigationBarTitleDisplayMode(.inline)
        .task {
            store.ensureDashboard()
            // First mount: hydrate from cache if a previous visit (or a
            // different navigation path back into this screen) already
            // analyzed this period. The user sees data immediately rather
            // than the empty CTA card.
            if result == nil, let cached = cachedResultForCurrentKey() {
                result = cached
            }
        }
        // Pull-to-refresh always forces a real run — the user explicitly
        // wants the latest numbers, even if the cache is still warm.
        .refreshable { await run(force: true) }
    }

    // MARK: - Period selector (mirrors web chip row: 7d / 30d / 3m / 6m / 1y / All)

    private var periodSelector: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.xxs) {
            NBEyebrow(text: locale.t("analysis.periodEyebrow"))
            NBSegmented(
                selection: $period,
                options: Period.allCases.map { p in
                    (value: p, label: locale.t("analysis.period.\(p.rawValue)"))
                }
            )
            .onChange(of: period) { _ in
                // Period change: serve from cache if we've already analyzed
                // this combination recently — instant tab swap, no spinner,
                // no second AI bill. If the cache is empty/stale, fall back
                // to a real run.
                guard !isLoading else { return }
                if let cached = cachedResultForCurrentKey() {
                    result = cached
                    errorMessage = nil
                } else {
                    Task { await run() }
                }
            }
        }
    }

    // MARK: - Header + CTA

    private var header: some View {
        NBScreenHeader(
            eyebrow: locale.t("analysis.headerEyebrow"),
            title: locale.t("analysis.headerTitle"),
            subtitle: locale.t("analysis.headerSubtitle")
        )
    }

    private var runCard: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
            Text(locale.t("analysis.description"))
                .font(AppFont.body)
                .foregroundColor(Theme.mutedForeground)
                .fixedSize(horizontal: false, vertical: true)
            Button {
                // The "Regenerate" label implies a fresh run — bypass the
                // cache so the user actually sees updated data. First-run
                // case (no result yet) likewise just runs.
                Task { await run(force: result != nil) }
            } label: {
                HStack {
                    if isLoading { ProgressView().tint(Theme.background) }
                    Text(isLoading ? locale.t("analysis.analyzing") : (result == nil ? locale.t("analysis.generate") : locale.t("analysis.regenerate")))
                }
            }
            .buttonStyle(NBPrimaryButtonStyle())
            .disabled(isLoading)
        }
        .padding(Theme.Spacing.md)
        .nbCard(radius: Theme.Radius.md, shadow: Theme.Shadow.sm)
    }

    // MARK: - Summary

    private func summaryCard(_ text: String) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
            NBEyebrow(text: locale.t("analysis.summaryEyebrow"))
            Text(text)
                .font(AppFont.body)
                .foregroundColor(Theme.foreground)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(Theme.Spacing.md)
        .nbCard(radius: Theme.Radius.md, shadow: Theme.Shadow.md)
    }

    // MARK: - Predicted monthly spend

    private func predictedCard(_ value: Double) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.xxs) {
            NBEyebrow(text: locale.t("analysis.forecastEyebrow"))
            Text(Fmt.amount(value, currency: currency))
                .font(AppFont.hero)
                .foregroundColor(Theme.foreground)
                .minimumScaleFactor(0.6)
                .lineLimit(1)
            Text(locale.t("analysis.predictedMonthly"))
                .font(AppFont.caption)
                .foregroundColor(Theme.mutedForeground)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(Theme.Spacing.md)
        .nbCard(radius: Theme.Radius.lg, shadow: Theme.Shadow.lg)
    }

    // MARK: - Insights

    private func insightsSection(_ items: [AnalysisInsight]) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
            NBSectionHeader(eyebrow: locale.t("analysis.insightsEyebrow"), title: String(format: locale.t("analysis.insightsCountFmt"), items.count))
            ForEach(items) { item in
                let (icon, color) = iconForInsight(item.type)
                HStack(alignment: .top, spacing: Theme.Spacing.sm) {
                    if let emoji = item.icon, !emoji.isEmpty {
                        Text(emoji).font(.title3)
                            .frame(width: 36, height: 36)
                            .background(Theme.muted)
                            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.sm))
                            .overlay(
                                RoundedRectangle(cornerRadius: Theme.Radius.sm)
                                    .stroke(Theme.foreground, lineWidth: Theme.Border.widthThin)
                            )
                    } else {
                        NBIconBadge(systemImage: icon, tint: color)
                    }
                    VStack(alignment: .leading, spacing: 2) {
                        Text(item.title)
                            .font(AppFont.bodyMedium)
                            .foregroundColor(Theme.foreground)
                        Text(item.description)
                            .font(AppFont.caption)
                            .foregroundColor(Theme.mutedForeground)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    Spacer(minLength: 0)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(Theme.Spacing.sm)
                .nbCard(radius: Theme.Radius.md, shadow: Theme.Shadow.sm)
            }
        }
    }

    private func iconForInsight(_ type: String) -> (String, Color) {
        switch type.lowercased() {
        case "warning": return ("exclamationmark.triangle.fill", Theme.destructive)
        case "achievement": return ("rosette", Theme.success)
        case "positive", "good": return ("checkmark.seal.fill", Theme.success)
        case "tip": return ("lightbulb.fill", Theme.warning)
        default: return ("sparkles", Theme.foreground)
        }
    }

    // MARK: - Recommendations

    private func recommendationsSection(_ items: [AnalysisRecommendation]) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
            NBSectionHeader(eyebrow: locale.t("analysis.recommendationsEyebrow"), title: locale.t("analysis.recommendationsTitle"))
            ForEach(items) { rec in
                HStack(alignment: .top, spacing: Theme.Spacing.sm) {
                    NBIconBadge(systemImage: "arrow.right.circle.fill", tint: priorityColor(rec.priority))
                    VStack(alignment: .leading, spacing: 4) {
                        HStack(spacing: 6) {
                            Text(rec.title)
                                .font(AppFont.bodyMedium)
                                .foregroundColor(Theme.foreground)
                            NBTag(
                                text: rec.priority,
                                background: priorityColor(rec.priority).opacity(0.15),
                                foreground: priorityColor(rec.priority)
                            )
                        }
                        Text(rec.description)
                            .font(AppFont.caption)
                            .foregroundColor(Theme.mutedForeground)
                            .fixedSize(horizontal: false, vertical: true)
                        if let saving = rec.potentialSaving, saving > 0 {
                            Text(String(format: locale.t("analysis.potentialSavingFmt"), Fmt.amount(saving, currency: currency)))
                                .font(AppFont.mono(12))
                                .foregroundColor(Theme.success)
                        }
                    }
                    Spacer(minLength: 0)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(Theme.Spacing.sm)
                .nbCard(radius: Theme.Radius.md, shadow: Theme.Shadow.sm)
            }
        }
    }

    private func priorityColor(_ priority: String) -> Color {
        switch priority.lowercased() {
        case "high": return Theme.destructive
        case "medium", "med": return Theme.warning
        case "low": return Theme.success
        default: return Theme.foreground
        }
    }

    // MARK: - Anomalies

    private func anomaliesSection(_ items: [AnalysisAnomaly]) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
            NBSectionHeader(eyebrow: locale.t("analysis.anomaliesEyebrow"), title: locale.t("analysis.anomaliesTitle"))
            ForEach(Array(items.enumerated()), id: \.offset) { _, a in
                HStack(alignment: .top, spacing: Theme.Spacing.sm) {
                    Image(systemName: "exclamationmark.triangle.fill")
                        .foregroundColor(Theme.warning)
                        .frame(width: 36, height: 36)
                        .background(Theme.warning.opacity(0.15))
                        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.sm))
                        .overlay(
                            RoundedRectangle(cornerRadius: Theme.Radius.sm)
                                .stroke(Theme.warning, lineWidth: Theme.Border.widthThin)
                        )
                    VStack(alignment: .leading, spacing: 2) {
                        HStack(spacing: 6) {
                            if let cat = a.category, !cat.isEmpty {
                                Text(cat)
                                    .font(AppFont.bodyMedium)
                                    .foregroundColor(Theme.foreground)
                            }
                            if let date = a.date, !date.isEmpty {
                                Text(Fmt.dayMonth(date))
                                    .font(AppFont.mono(11))
                                    .foregroundColor(Theme.mutedForeground)
                            }
                            Spacer(minLength: 0)
                            if let amount = a.amount {
                                Text(Fmt.amount(amount, currency: currency))
                                    .font(AppFont.mono(12))
                                    .foregroundColor(Theme.destructive)
                            }
                        }
                        if let desc = a.description, !desc.isEmpty {
                            Text(desc)
                                .font(AppFont.caption)
                                .foregroundColor(Theme.mutedForeground)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(Theme.Spacing.sm)
                .background(Theme.warning.opacity(0.08))
                .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.md))
                .overlay(
                    RoundedRectangle(cornerRadius: Theme.Radius.md)
                        .stroke(Theme.warning, lineWidth: Theme.Border.widthThin)
                )
            }
        }
    }

    // MARK: - Category trends (Swift Charts)

    private struct TrendPoint: Identifiable {
        let id = UUID()
        let category: String
        let changePercent: Double
        let trend: String
    }

    private func categoryTrendsSection(_ trends: [CategoryTrend]) -> some View {
        let points = trends.map {
            TrendPoint(category: $0.category, changePercent: $0.changePercent, trend: $0.trend)
        }
        return VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
            NBSectionHeader(eyebrow: locale.t("analysis.trendsEyebrow"), title: locale.t("analysis.trendsTitle"))
            Chart(points) { p in
                BarMark(
                    x: .value("Change", p.changePercent),
                    y: .value("Category", p.category)
                )
                .foregroundStyle(p.changePercent >= 0 ? Theme.destructive : Theme.success)
                .cornerRadius(4)
            }
            .chartXAxis {
                AxisMarks { _ in
                    AxisValueLabel().foregroundStyle(Theme.mutedForeground)
                }
            }
            .chartYAxis {
                AxisMarks(position: .leading) { _ in
                    AxisValueLabel().foregroundStyle(Theme.foreground)
                }
            }
            .frame(height: max(160, CGFloat(points.count) * 36))
            .padding(Theme.Spacing.sm)
            .nbCard(radius: Theme.Radius.md, shadow: Theme.Shadow.sm)

            VStack(spacing: 4) {
                ForEach(trends) { t in
                    HStack(alignment: .top, spacing: Theme.Spacing.sm) {
                        Image(systemName: arrowFor(t.trend))
                            .foregroundColor(colorFor(t.trend, changePercent: t.changePercent))
                        VStack(alignment: .leading, spacing: 2) {
                            Text(t.category)
                                .font(AppFont.bodyMedium)
                                .foregroundColor(Theme.foreground)
                            if let note = t.note, !note.isEmpty {
                                Text(note)
                                    .font(AppFont.caption)
                                    .foregroundColor(Theme.mutedForeground)
                                    .fixedSize(horizontal: false, vertical: true)
                            }
                        }
                        Spacer(minLength: 0)
                        Text(String(format: "%@%.0f%%", t.changePercent >= 0 ? "+" : "", t.changePercent))
                            .font(AppFont.mono(12))
                            .foregroundColor(colorFor(t.trend, changePercent: t.changePercent))
                    }
                    .padding(Theme.Spacing.sm)
                    .nbCard(radius: Theme.Radius.sm, shadow: Theme.Shadow.sm)
                }
            }
        }
    }

    private func arrowFor(_ trend: String) -> String {
        switch trend.lowercased() {
        case "up", "increasing": return "arrow.up.right"
        case "down", "decreasing": return "arrow.down.right"
        default: return "arrow.right"
        }
    }

    private func colorFor(_ trend: String, changePercent: Double) -> Color {
        if changePercent > 0 { return Theme.destructive }
        if changePercent < 0 { return Theme.success }
        return Theme.mutedForeground
    }

    // MARK: - Category share chart (Recharts `CategoryPieChart` equivalent)
    // iOS 16 target precludes `SectorMark`; we render a horizontal stacked
    // bar as a share proxy. Share = abs(changePercent) / sum(abs(changePercent))
    // — the backend doesn't ship a dedicated category-amount array, so this
    // visualises the AI's category trend magnitudes, which is the closest
    // approximation available without a second request.

    private struct SharePoint: Identifiable {
        let id = UUID()
        let category: String
        let share: Double // 0…1
        let color: Color
    }

    private func paletteColor(_ index: Int) -> Color {
        let palette: [Color] = [
            Theme.foreground, Theme.destructive, Theme.success, Theme.warning,
            Theme.mutedForeground
        ]
        return palette[index % palette.count]
    }

    private func categoryShareSection(_ trends: [CategoryTrend]) -> some View {
        let magnitudes = trends.map { max(0.0001, abs($0.changePercent)) }
        let total = max(0.0001, magnitudes.reduce(0, +))
        let points: [SharePoint] = trends.enumerated().map { (i, t) in
            SharePoint(
                category: t.category,
                share: magnitudes[i] / total,
                color: paletteColor(i)
            )
        }
        return VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
            NBSectionHeader(
                eyebrow: locale.t("analysis.categoryShareEyebrow"),
                title: locale.t("analysis.categoryShareTitle")
            )
            Chart(points) { p in
                BarMark(
                    x: .value("Share", p.share),
                    y: .value("Total", "share")
                )
                .foregroundStyle(p.color)
            }
            .chartPlotStyle { plot in
                plot.cornerRadius(Theme.Radius.sm)
            }
            .chartXAxis(.hidden)
            .chartYAxis(.hidden)
            .frame(height: 28)
            .padding(Theme.Spacing.sm)
            .nbCard(radius: Theme.Radius.md, shadow: Theme.Shadow.sm)

            // Legend rows (category · share%).
            VStack(spacing: 4) {
                ForEach(points) { p in
                    HStack(spacing: Theme.Spacing.sm) {
                        RoundedRectangle(cornerRadius: 3)
                            .fill(p.color)
                            .frame(width: 12, height: 12)
                        Text(p.category)
                            .font(AppFont.body)
                            .foregroundColor(Theme.foreground)
                        Spacer()
                        Text(String(format: "%.0f%%", p.share * 100))
                            .font(AppFont.mono(12))
                            .foregroundColor(Theme.mutedForeground)
                    }
                    .padding(Theme.Spacing.sm)
                    .nbCard(radius: Theme.Radius.sm, shadow: Theme.Shadow.sm)
                }
            }
        }
    }

    // MARK: - Weekday spending chart (Recharts `WeekdaySpendingChart` equivalent)
    // Backend doesn't expose a weekday breakdown. We derive an approximation:
    // count AI-flagged anomaly dates grouped by weekday. If none, fall back to
    // bank topMerchants amounts evenly distributed across active weekdays. If
    // neither is available, show an empty-state message.

    private struct WeekdayPoint: Identifiable {
        let id = UUID()
        let day: String
        let value: Double
    }

    private func weekdayLabel(_ weekdayIndex: Int) -> String {
        // Calendar.weekday: 1=Sun … 7=Sat
        switch weekdayIndex {
        case 1: return locale.t("analysis.weekday.sun")
        case 2: return locale.t("analysis.weekday.mon")
        case 3: return locale.t("analysis.weekday.tue")
        case 4: return locale.t("analysis.weekday.wed")
        case 5: return locale.t("analysis.weekday.thu")
        case 6: return locale.t("analysis.weekday.fri")
        case 7: return locale.t("analysis.weekday.sat")
        default: return "?"
        }
    }

    private func weekdayPoints(anomalies: [AnalysisAnomaly]?) -> [WeekdayPoint] {
        // Mon-first ordering: 2,3,4,5,6,7,1
        let order = [2, 3, 4, 5, 6, 7, 1]
        var sums = Array(repeating: 0.0, count: 8) // index by weekday (1…7)
        let df = DateFormatter()
        df.dateFormat = "yyyy-MM-dd"
        df.locale = Locale(identifier: "en_US_POSIX")
        if let anomalies = anomalies {
            for a in anomalies {
                guard let dateStr = a.date,
                      let date = df.date(from: String(dateStr.prefix(10))) else { continue }
                let wd = Calendar(identifier: .gregorian).component(.weekday, from: date)
                sums[wd] += abs(a.amount ?? 1) // amount if present, else count
            }
        }
        let mapped = order.map { wd in
            WeekdayPoint(day: weekdayLabel(wd), value: sums[wd])
        }
        return mapped
    }

    private func weekdaySection(anomalies: [AnalysisAnomaly]?, bank: AnalysisBankStats?) -> some View {
        let points = weekdayPoints(anomalies: anomalies)
        let hasData = points.contains(where: { $0.value > 0 })

        return SwiftUI.Group {
            VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
                NBSectionHeader(
                    eyebrow: locale.t("analysis.weekdayEyebrow"),
                    title: locale.t("analysis.weekdayTitle")
                )
                if hasData {
                    Chart(points) { p in
                        BarMark(
                            x: .value("Day", p.day),
                            y: .value("Value", p.value)
                        )
                        .foregroundStyle(Theme.foreground)
                        .cornerRadius(4)
                    }
                    .chartXAxis {
                        AxisMarks { _ in
                            AxisValueLabel().foregroundStyle(Theme.mutedForeground)
                        }
                    }
                    .chartYAxis {
                        AxisMarks(position: .leading) { _ in
                            AxisValueLabel().foregroundStyle(Theme.mutedForeground)
                        }
                    }
                    .frame(height: 180)
                    .padding(Theme.Spacing.sm)
                    .nbCard(radius: Theme.Radius.md, shadow: Theme.Shadow.sm)
                    Text(locale.t("analysis.weekdayNote"))
                        .font(AppFont.caption)
                        .foregroundColor(Theme.mutedForeground)
                } else {
                    Text(bank == nil
                         ? locale.t("analysis.weekdayEmpty")
                         : locale.t("analysis.weekdayNote"))
                        .font(AppFont.caption)
                        .foregroundColor(Theme.mutedForeground)
                        .padding(Theme.Spacing.md)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .nbCard(radius: Theme.Radius.md, shadow: Theme.Shadow.sm)
                }
            }
        }
    }

    // MARK: - Bank stats

    private func bankStatsSection(_ bank: AnalysisBankStats) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
            NBSectionHeader(eyebrow: locale.t("analysis.bankEyebrow"), title: locale.t("analysis.bankTitle"))
            LazyVGrid(
                columns: [
                    GridItem(.flexible(), spacing: Theme.Spacing.sm),
                    GridItem(.flexible(), spacing: Theme.Spacing.sm)
                ],
                spacing: Theme.Spacing.sm
            ) {
                NBStatTile(label: locale.t("analysis.bankDebit"), value: Fmt.amount(bank.totalDebit, currency: currency), tint: Theme.destructive)
                NBStatTile(label: locale.t("analysis.bankCredit"), value: Fmt.amount(bank.totalCredit, currency: currency), tint: Theme.success)
                NBStatTile(label: locale.t("analysis.bankTxns"), value: "\(bank.totalTransactions)")
                NBStatTile(label: locale.t("analysis.bankAccounts"), value: "\(bank.accountCount)")
            }
            if !bank.topMerchants.isEmpty {
                VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
                    NBEyebrow(text: locale.t("analysis.topMerchants"))
                    ForEach(Array(bank.topMerchants.enumerated()), id: \.offset) { _, m in
                        HStack {
                            Text(m.name)
                                .font(AppFont.bodyMedium)
                                .foregroundColor(Theme.foreground)
                            Spacer()
                            Text(Fmt.amount(m.amount, currency: currency))
                                .font(AppFont.mono(12))
                                .foregroundColor(Theme.foreground)
                        }
                        .padding(Theme.Spacing.sm)
                        .nbCard(radius: Theme.Radius.sm, shadow: Theme.Shadow.sm)
                    }
                }
            }
        }
    }

    // MARK: - Run

    /// Returns the cached result for the current key if it's still inside
    /// the TTL, otherwise nil. Pure read — never mutates state.
    private func cachedResultForCurrentKey() -> AnalysisResponse? {
        guard let entry = analysisCache[currentCacheKey] else { return nil }
        guard Date().timeIntervalSince(entry.loadedAt) < Self.analysisCacheTTL else {
            return nil
        }
        return entry.result
    }

    /// Run analysis. `force == false` and a fresh cache entry → no network
    /// call, just paint from cache. `force == true` always hits the AI.
    private func run(force: Bool = false) async {
        let key = currentCacheKey
        if !force, let cached = cachedResultForCurrentKey() {
            result = cached
            errorMessage = nil
            return
        }
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            let fresh = try await AnalysisRepo.run(
                lang: locale.language.rawValue,
                currency: currency,
                period: period.rawValue
            )
            result = fresh
            // Cache by the key in scope when the call started — protects
            // against the user flipping period mid-flight (we don't want
            // to write a 7d response under a 30d key).
            analysisCache[key] = CachedAnalysis(result: fresh, loadedAt: Date())
        } catch {
            errorMessage = error.localizedDescription
            toast.error(locale.t("analysis.failed"), description: error.localizedDescription)
        }
    }
}
