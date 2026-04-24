import SwiftUI
import Charts

/// Interactive daily-spending bar chart, stacked by category.
///
/// - Range picker (7 / 14 / 30 / 90 days)
/// - Legend with toggle-to-filter (tap a category to hide/show it)
/// - Tap a bar → sheet with that day's breakdown (per-category totals + full
///   expense list)
///
/// Consumes `DashboardDisplay.dailySlices` + `allExpensesConverted`. All
/// aggregation happens up-front in `DashboardDisplay.build`, so toggling
/// range/legend is just a filter over an existing array.
struct DailyStackedChartCard: View {
    let display: DashboardDisplay
    /// Palette resolver from the parent (so chart colours match pie/legend).
    let colorFor: (Int) -> Color

    @EnvironmentObject private var locale: AppLocale
    @EnvironmentObject private var router: AppRouter

    enum Range: Int, CaseIterable, Hashable {
        case d7 = 7
        case d14 = 14
        case d30 = 30

        var label: String {
            switch self {
            case .d7: return "7D"
            case .d14: return "14D"
            case .d30: return "30D"
            }
        }
    }

    @State private var range: Range = .d30
    @State private var hiddenCategoryIds: Set<String> = []
    @State private var selectedDay: Date?

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
            NBSectionHeader(
                eyebrow: locale.t("dashboard.dailyTrendEyebrow"),
                title: locale.t("dashboard.dailyStackedTitle")
            )

            rangeSegmented

            if display.dailySlices.isEmpty {
                emptyState
            } else {
                chart
                    .frame(height: 200)
                    .padding(.top, Theme.Spacing.xs)

                if !legendEntries.isEmpty {
                    legend
                }

                summaryLine
            }
        }
        .padding(Theme.Spacing.sm)
        .nbCard(radius: Theme.Radius.md, shadow: Theme.Shadow.sm)
        .sheet(item: dayBinding) { day in
            DayBreakdownSheet(
                date: day.date,
                slices: slicesForDay(day.date),
                expenses: expensesForDay(day.date),
                currency: display.currency,
                colorFor: colorFor
            )
            .environmentObject(locale)
            .environmentObject(router)
        }
    }

    // MARK: - Derived data

    private var cutoff: Date {
        let cal = Calendar.current
        return cal.date(byAdding: .day, value: -(range.rawValue - 1), to: cal.startOfDay(for: Date())) ?? Date()
    }

    private var visibleSlices: [DashboardDisplay.DailySlice] {
        display.dailySlices.filter { slice in
            slice.date >= cutoff && !hiddenCategoryIds.contains(slice.categoryId)
        }
    }

    /// Distinct categories that actually have data in `dailySlices`.
    private var legendEntries: [(id: String, name: String, colorIndex: Int)] {
        var seen: [String: (String, Int)] = [:]
        for slice in display.dailySlices where slice.date >= cutoff {
            if seen[slice.categoryId] == nil {
                seen[slice.categoryId] = (slice.categoryName, slice.colorIndex)
            }
        }
        return seen
            .map { (id: $0.key, name: $0.value.0, colorIndex: $0.value.1) }
            .sorted { $0.colorIndex < $1.colorIndex }
    }

    private var totalInRange: Double {
        visibleSlices.reduce(0) { $0 + $1.amount }
    }

    // MARK: - Sub-views

    private var rangeSegmented: some View {
        HStack(spacing: 6) {
            ForEach(Range.allCases, id: \.self) { r in
                Button { range = r } label: {
                    Text(r.label)
                        .font(AppFont.mono(11))
                        .tracking(1)
                        .foregroundColor(range == r ? Theme.background : Theme.foreground)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 6)
                        .background(range == r ? Theme.foreground : Theme.card)
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

    private var chart: some View {
        Chart(visibleSlices) { slice in
            BarMark(
                x: .value("Date", slice.date, unit: .day),
                y: .value("Amount", slice.amount)
            )
            .foregroundStyle(colorFor(slice.colorIndex))
            .cornerRadius(2)
        }
        .chartXAxis {
            AxisMarks(values: .stride(by: .day, count: axisStride)) { value in
                if let date = value.as(Date.self) {
                    AxisValueLabel {
                        Text(Fmt.dayMonthShort(date))
                            .font(AppFont.mono(9))
                            .foregroundColor(Theme.mutedForeground)
                    }
                }
                AxisTick().foregroundStyle(Theme.mutedForeground.opacity(0.4))
            }
        }
        .chartYAxis {
            AxisMarks(position: .leading) { _ in
                AxisValueLabel().foregroundStyle(Theme.mutedForeground)
                AxisGridLine().foregroundStyle(Theme.mutedForeground.opacity(0.15))
            }
        }
        .chartOverlay { proxy in
            GeometryReader { geo in
                Rectangle()
                    .fill(Color.clear)
                    .contentShape(Rectangle())
                    .gesture(
                        SpatialTapGesture()
                            .onEnded { value in
                                handleTap(at: value.location, proxy: proxy, in: geo)
                            }
                    )
            }
        }
    }

    private var legend: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach(legendEntries, id: \.id) { entry in
                    let isHidden = hiddenCategoryIds.contains(entry.id)
                    Button {
                        if isHidden {
                            hiddenCategoryIds.remove(entry.id)
                        } else {
                            hiddenCategoryIds.insert(entry.id)
                        }
                    } label: {
                        HStack(spacing: 6) {
                            RoundedRectangle(cornerRadius: 3)
                                .fill(isHidden ? Theme.muted : colorFor(entry.colorIndex))
                                .frame(width: 10, height: 10)
                                .overlay(
                                    RoundedRectangle(cornerRadius: 3)
                                        .stroke(Theme.foreground.opacity(0.6), lineWidth: Theme.Border.widthThin)
                                )
                            Text(entry.name)
                                .font(AppFont.mono(10))
                                .tracking(0.5)
                                .foregroundColor(isHidden ? Theme.mutedForeground : Theme.foreground)
                                .strikethrough(isHidden)
                        }
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(Theme.card)
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

    private var emptyState: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.xxs) {
            Image(systemName: "chart.bar.xaxis")
                .font(.system(size: 28, weight: .regular))
                .foregroundColor(Theme.mutedForeground)
                .padding(.bottom, 4)
            Text(locale.t("dashboard.dailyStackedEmptyTitle"))
                .font(AppFont.bodyMedium)
                .foregroundColor(Theme.foreground)
            Text(locale.t("dashboard.dailyStackedEmptySub"))
                .font(AppFont.caption)
                .foregroundColor(Theme.mutedForeground)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, minHeight: 140, alignment: .leading)
        .padding(Theme.Spacing.sm)
    }

    private var summaryLine: some View {
        HStack(spacing: 6) {
            Text(String(format: locale.t("dashboard.dailyStackedRangeTotal"), range.rawValue))
                .font(AppFont.caption)
                .foregroundColor(Theme.mutedForeground)
            Spacer()
            Text(Fmt.amount(totalInRange, currency: display.currency))
                .font(AppFont.mono(12))
                .foregroundColor(Theme.foreground)
        }
    }

    // MARK: - Helpers

    private var axisStride: Int {
        switch range {
        case .d7:  return 1
        case .d14: return 2
        case .d30: return 5
        }
    }

    private func handleTap(at location: CGPoint, proxy: ChartProxy, in geo: GeometryProxy) {
        let plotFrame: CGRect
        if #available(iOS 17.0, *), let anchor = proxy.plotFrame {
            plotFrame = geo[anchor]
        } else {
            plotFrame = geo.frame(in: .local)
        }
        let relativeX = location.x - plotFrame.origin.x
        guard relativeX >= 0, relativeX <= plotFrame.width,
              let date: Date = proxy.value(atX: relativeX) else { return }
        let cal = Calendar.current
        selectedDay = cal.startOfDay(for: date)
    }

    private var dayBinding: Binding<DayWrapper?> {
        Binding(
            get: { selectedDay.map { DayWrapper(date: $0) } },
            set: { selectedDay = $0?.date }
        )
    }

    private func slicesForDay(_ date: Date) -> [DashboardDisplay.DailySlice] {
        let cal = Calendar.current
        return display.dailySlices.filter { cal.isDate($0.date, inSameDayAs: date) }
    }

    private func expensesForDay(_ date: Date) -> [DashboardDisplay.ExpenseWithAmount] {
        let cal = Calendar.current
        return display.allExpensesConverted
            .filter { cal.isDate($0.date, inSameDayAs: date) }
            .sorted { $0.amount > $1.amount }
    }
}

private struct DayWrapper: Identifiable {
    let date: Date
    var id: Date { date }
}

// MARK: - Day breakdown sheet

struct DayBreakdownSheet: View {
    let date: Date
    let slices: [DashboardDisplay.DailySlice]
    let expenses: [DashboardDisplay.ExpenseWithAmount]
    let currency: String
    let colorFor: (Int) -> Color

    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var locale: AppLocale
    @EnvironmentObject private var router: AppRouter

    private var total: Double { slices.reduce(0) { $0 + $1.amount } }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: Theme.Spacing.md) {
                    header
                    if slices.isEmpty {
                        emptyState
                    } else {
                        categoriesSection
                        expensesSection
                    }
                }
                .padding(Theme.Spacing.md)
            }
            .background(Theme.background)
            .navigationTitle(Fmt.date(dateString))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button(locale.t("common.close")) { dismiss() }
                }
            }
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
    }

    private var dateString: String {
        let df = DateFormatter()
        df.dateFormat = "yyyy-MM-dd"
        return df.string(from: date)
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 4) {
            NBEyebrow(text: locale.t("dashboard.dayBreakdownEyebrow"))
            Text(Fmt.amount(total, currency: currency))
                .font(AppFont.hero)
                .foregroundColor(Theme.foreground)
            Text(String(format: locale.t("dashboard.dayBreakdownTxns"), expenses.count))
                .font(AppFont.caption)
                .foregroundColor(Theme.mutedForeground)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var emptyState: some View {
        NBEmptyState(
            systemImage: "chart.bar.xaxis",
            title: locale.t("dashboard.dayBreakdownEmptyTitle"),
            subtitle: locale.t("dashboard.dayBreakdownEmptySub")
        )
    }

    private var categoriesSection: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
            NBEyebrow(text: locale.t("dashboard.dayBreakdownCategories"))
            VStack(spacing: 6) {
                ForEach(slices) { slice in
                    HStack(spacing: 8) {
                        RoundedRectangle(cornerRadius: 3)
                            .fill(colorFor(slice.colorIndex))
                            .frame(width: 12, height: 12)
                            .overlay(
                                RoundedRectangle(cornerRadius: 3)
                                    .stroke(Theme.foreground.opacity(0.6), lineWidth: Theme.Border.widthThin)
                            )
                        Text(slice.categoryName)
                            .font(AppFont.bodyMedium)
                            .foregroundColor(Theme.foreground)
                        Spacer()
                        Text(Fmt.amount(slice.amount, currency: currency))
                            .font(AppFont.mono(12))
                            .foregroundColor(Theme.foreground)
                    }
                    .padding(Theme.Spacing.sm)
                    .nbCard(radius: Theme.Radius.sm, shadow: Theme.Shadow.sm)
                }
            }
        }
    }

    private var expensesSection: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
            NBEyebrow(text: locale.t("dashboard.dayBreakdownExpenses"))
            VStack(spacing: 6) {
                ForEach(expenses) { e in
                    Button {
                        dismiss()
                        router.push(.expenseDetail(id: e.expenseId))
                    } label: {
                        HStack(spacing: Theme.Spacing.sm) {
                            NBIconBadge(systemImage: e.iconName, size: 36)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(e.title)
                                    .font(AppFont.bodyMedium)
                                    .foregroundColor(Theme.foreground)
                                    .lineLimit(1)
                                HStack(spacing: 6) {
                                    RoundedRectangle(cornerRadius: 2)
                                        .fill(colorFor(e.colorIndex))
                                        .frame(width: 8, height: 8)
                                    Text(e.categoryName)
                                        .font(AppFont.caption)
                                        .foregroundColor(Theme.mutedForeground)
                                }
                            }
                            Spacer()
                            Text(Fmt.amount(e.amount, currency: currency))
                                .font(AppFont.mono(13))
                                .foregroundColor(Theme.foreground)
                        }
                        .padding(Theme.Spacing.sm)
                        .nbCard(radius: Theme.Radius.sm, shadow: Theme.Shadow.sm)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }
}
