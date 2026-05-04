import SwiftUI

/// Report generator — parity with `app/(protected)/reports/page.tsx`.
/// Fetches expenses, groups them by year/month, renders expandable year
/// cards. Each year/month row has its own Generate button that calls
/// `ReportsRepo.generateYearly(year:)` / `.generateMonthly(ym:)`; results
/// (CSV + PDF + DOCX URLs on Vercel Blob) are stored per key and shown as
/// Open links beside the row.
struct ReportsView: View {
    @EnvironmentObject private var toast: ToastCenter
    @EnvironmentObject private var locale: AppLocale

    @State private var isLoading = true
    @State private var errorMessage: String?
    @State private var yearBlocks: [YearBlock] = []
    @State private var expenseCountsByKey: [String: Int] = [:]
    @State private var reportUrls: [String: ReportUrls] = [:]
    @State private var regeneratingKey: String? = nil
    @State private var expandedYears: Set<Int> = []

    struct YearBlock: Identifiable {
        let id: Int
        let year: Int
        let months: [Int]
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Theme.Spacing.md) {
                header
                if isLoading && yearBlocks.isEmpty {
                    // Reports loading is mostly DB aggregation — usually
                    // fast. Skeleton list reads as a more honest preview
                    // of the upcoming year/month rows than a spinner.
                    NBSkeletonList(rows: 4)
                } else if let msg = errorMessage, yearBlocks.isEmpty {
                    // Error card only when there's nothing on screen. If
                    // reports are already loaded a transient refresh fail
                    // shouldn't replace them with an error UI.
                    NBErrorCard(message: msg) { Task { await loadData() } }
                } else if yearBlocks.isEmpty {
                    emptyState
                } else {
                    if regeneratingKey != nil {
                        generatingBanner
                    }
                    yearCardsList
                }
                Spacer(minLength: Theme.Spacing.xl)
            }
            .padding(.horizontal, Theme.Spacing.md)
            .padding(.top, Theme.Spacing.md)
        }
        .background(Theme.background)
        .navigationTitle(locale.t("reports.navTitle"))
        .navigationBarTitleDisplayMode(.inline)
        .task { await loadData() }
        .refreshable { await loadData() }
    }

    // MARK: - Header

    private var header: some View {
        NBScreenHeader(
            eyebrow: locale.t("reports.headerEyebrow"),
            title: locale.t("reports.headerTitle"),
            subtitle: locale.t("reports.headerSubtitle")
        )
    }

    private var emptyState: some View {
        NBEmptyState(
            systemImage: "chart.bar.doc.horizontal",
            title: locale.t("reports.noExpensesTitle"),
            subtitle: locale.t("reports.noExpensesDesc"),
            action: nil
        )
    }

    private var generatingBanner: some View {
        HStack(spacing: Theme.Spacing.sm) {
            ProgressView().tint(Theme.foreground)
            Text(locale.t("reports.generatingBanner"))
                .font(AppFont.bodyMedium)
                .foregroundColor(Theme.foreground)
            Spacer()
        }
        .padding(Theme.Spacing.sm)
        .background(Theme.muted)
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.md))
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Radius.md)
                .stroke(Theme.border, lineWidth: Theme.Border.widthThin)
        )
    }

    // MARK: - Year cards

    private var yearCardsList: some View {
        VStack(spacing: Theme.Spacing.sm) {
            ForEach(yearBlocks) { block in
                yearCard(block)
            }
        }
    }

    private func yearCard(_ block: YearBlock) -> some View {
        let yearKey = "yearly-\(block.year)"
        let yearUrls = reportUrls[yearKey]
        let yearCount = expenseCountsByKey[yearKey] ?? 0
        let isYearGenerating = regeneratingKey == yearKey
        let isExpanded = expandedYears.contains(block.year)

        return VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 4) {
                    HStack(spacing: Theme.Spacing.xs) {
                        Text(String(block.year))
                            .font(AppFont.bold(20))
                            .foregroundColor(Theme.foreground)
                        if yearUrls != nil {
                            NBTag(text: locale.t("reports.ready"), background: Theme.success.opacity(0.15), foreground: Theme.success)
                        }
                    }
                    Text("\(locale.t("reports.yearlySummary")) · \(yearCount) \(locale.t("reports.expensesInPeriod"))")
                        .font(AppFont.caption)
                        .foregroundColor(Theme.mutedForeground)
                }
                Spacer()
                generateIconButton(isLoading: isYearGenerating) {
                    Task { await runYearly(block.year) }
                }
            }

            if let urls = yearUrls {
                downloadLinks(urls)
            }

            Button {
                if isExpanded { expandedYears.remove(block.year) }
                else { expandedYears.insert(block.year) }
            } label: {
                HStack {
                    Text("\(isExpanded ? locale.t("reports.hideMonths") : locale.t("reports.showMonths")) (\(block.months.count))")
                        .font(AppFont.bodyMedium)
                        .foregroundColor(Theme.foreground)
                    Spacer()
                    Image(systemName: isExpanded ? "chevron.up" : "chevron.down")
                        .foregroundColor(Theme.foreground)
                }
                .padding(Theme.Spacing.sm)
                .background(Theme.muted)
                .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.sm))
                .overlay(
                    RoundedRectangle(cornerRadius: Theme.Radius.sm)
                        .stroke(Theme.border, lineWidth: Theme.Border.widthThin)
                )
            }
            .buttonStyle(.plain)

            if isExpanded {
                VStack(spacing: Theme.Spacing.xs) {
                    ForEach(block.months, id: \.self) { m in
                        monthRow(year: block.year, month: m)
                    }
                }
            }
        }
        .padding(Theme.Spacing.md)
        .nbCard(radius: Theme.Radius.md, shadow: Theme.Shadow.sm)
    }

    private func monthRow(year: Int, month: Int) -> some View {
        let ym = String(format: "%04d-%02d", year, month)
        let monthKey = "monthly-\(ym)"
        let files = reportUrls[monthKey]
        let count = expenseCountsByKey[monthKey] ?? 0
        let isMonthGenerating = regeneratingKey == monthKey
        let label = monthYearLabel(year: year, month: month)

        return HStack(spacing: Theme.Spacing.sm) {
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 6) {
                    Text(label)
                        .font(AppFont.bodyMedium)
                        .foregroundColor(Theme.foreground)
                    if files != nil {
                        Image(systemName: "checkmark.circle.fill")
                            .font(.system(size: 12))
                            .foregroundColor(Theme.success)
                    }
                }
                Text("\(count) \(locale.t("reports.expenses"))")
                    .font(AppFont.caption)
                    .foregroundColor(Theme.mutedForeground)
            }
            Spacer()
            if let urls = files {
                miniDownloads(urls)
            }
            generateIconButton(isLoading: isMonthGenerating) {
                Task { await runMonthly(ym: ym) }
            }
        }
        .padding(Theme.Spacing.sm)
        .background(Theme.card)
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.sm))
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Radius.sm)
                .stroke(Theme.border.opacity(0.4), lineWidth: Theme.Border.widthThin)
        )
    }

    private func generateIconButton(isLoading: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            SwiftUI.Group {
                if isLoading {
                    ProgressView().tint(Theme.foreground)
                } else {
                    Image(systemName: "arrow.clockwise")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundColor(Theme.foreground)
                }
            }
            .frame(width: 36, height: 36)
            .background(Theme.muted)
            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.sm))
            .overlay(
                RoundedRectangle(cornerRadius: Theme.Radius.sm)
                    .stroke(Theme.border, lineWidth: Theme.Border.widthThin)
            )
        }
        .buttonStyle(.plain)
        .disabled(isLoading)
    }

    // MARK: - Download links

    private func downloadLinks(_ urls: ReportUrls) -> some View {
        VStack(spacing: Theme.Spacing.xs) {
            downloadRow(format: "PDF", systemImage: "doc.richtext", urlString: urls.pdf)
            downloadRow(format: "CSV", systemImage: "tablecells", urlString: urls.csv)
            downloadRow(format: "DOCX", systemImage: "doc.text", urlString: urls.docx)
        }
    }

    private func downloadRow(format: String, systemImage: String, urlString: String) -> some View {
        HStack(spacing: Theme.Spacing.sm) {
            NBIconBadge(systemImage: systemImage)
            Text(format)
                .font(AppFont.bodyMedium)
                .foregroundColor(Theme.foreground)
            Spacer()
            if let url = URL(string: urlString) {
                Link(destination: url) {
                    Text(locale.t("reports.openButton"))
                        .font(AppFont.mono(11))
                        .tracking(1)
                        .textCase(.uppercase)
                        .foregroundColor(Theme.background)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                        .background(Theme.foreground)
                        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.sm))
                }
            }
        }
        .padding(Theme.Spacing.sm)
        .nbCard(radius: Theme.Radius.sm, shadow: Theme.Shadow.sm)
    }

    private func miniDownloads(_ urls: ReportUrls) -> some View {
        HStack(spacing: 4) {
            miniDownloadLink(label: "P", urlString: urls.pdf)
            miniDownloadLink(label: "C", urlString: urls.csv)
            miniDownloadLink(label: "D", urlString: urls.docx)
        }
    }

    private func miniDownloadLink(label: String, urlString: String) -> some View {
        SwiftUI.Group {
            if let url = URL(string: urlString) {
                Link(destination: url) {
                    Text(label)
                        .font(AppFont.mono(10))
                        .tracking(0.5)
                        .foregroundColor(Theme.background)
                        .frame(width: 24, height: 24)
                        .background(Theme.foreground)
                        .clipShape(RoundedRectangle(cornerRadius: 4))
                }
            } else {
                Text(label)
                    .font(AppFont.mono(10))
                    .foregroundColor(Theme.mutedForeground)
                    .frame(width: 24, height: 24)
                    .background(Theme.muted)
                    .clipShape(RoundedRectangle(cornerRadius: 4))
            }
        }
    }

    // MARK: - Helpers

    private func monthYearLabel(year: Int, month: Int) -> String {
        var comps = DateComponents(); comps.year = year; comps.month = month; comps.day = 1
        guard let date = Calendar.current.date(from: comps) else { return String(format: "%04d-%02d", year, month) }
        let df = DateFormatter()
        df.locale = Locale(identifier: locale.language.rawValue == "pl" ? "pl_PL" : "en_US")
        df.dateFormat = "LLLL yyyy"
        return df.string(from: date).capitalized
    }

    // MARK: - Data

    private func loadData() async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            let resp = try await ExpensesRepo.list()
            var yearToMonths: [Int: Set<Int>] = [:]
            var counts: [String: Int] = [:]
            for e in resp.expenses {
                let isoDay = String(e.date.prefix(10))
                let parts = isoDay.split(separator: "-")
                guard parts.count >= 2, let y = Int(parts[0]), let m = Int(parts[1]) else { continue }
                yearToMonths[y, default: []].insert(m)
                counts["yearly-\(y)", default: 0] += 1
                counts["monthly-\(String(format: "%04d-%02d", y, m))", default: 0] += 1
            }
            let years = yearToMonths.keys.sorted(by: >)
            yearBlocks = years.map { y in
                YearBlock(id: y, year: y, months: Array(yearToMonths[y] ?? []).sorted(by: >))
            }
            expenseCountsByKey = counts
            if let first = years.first { expandedYears = [first] }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func runYearly(_ year: Int) async {
        let key = "yearly-\(year)"
        regeneratingKey = key
        defer { regeneratingKey = nil }
        do {
            let r = try await ReportsRepo.generateYearly(year: String(year))
            reportUrls[key] = r.urls
            toast.success(locale.t("reports.yearlyReady"), description: locale.t("reports.tapOpen"))
        } catch {
            toast.error(locale.t("reports.generateFailed"), description: error.localizedDescription)
        }
    }

    private func runMonthly(ym: String) async {
        let key = "monthly-\(ym)"
        regeneratingKey = key
        defer { regeneratingKey = nil }
        do {
            let r = try await ReportsRepo.generateMonthly(ym: ym)
            reportUrls[key] = r.urls
            toast.success(locale.t("reports.monthlyReady"), description: locale.t("reports.tapOpen"))
        } catch {
            toast.error(locale.t("reports.generateFailed"), description: error.localizedDescription)
        }
    }
}
