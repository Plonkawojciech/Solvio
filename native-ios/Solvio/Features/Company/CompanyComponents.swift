import SwiftUI

/// Klocki ekranów Firmy. Zbudowane na `Theme` i `PaperCard`; jedyne, co
/// dokładają, to układ odporny na dużą czcionkę: kwota nigdy się nie ucina,
/// przy rozmiarach dostępności schodzi pod tytuł.

/// Wiersz listy: data, opis, kwota z dopiskiem.
struct CompanyRow: View {
    var lead: String?
    var leadColor: Color = Theme.mutedForeground
    let title: String
    var subtitle: String?
    let value: String
    var valueColor: Color = Theme.foreground
    var note: String?
    var noteColor: Color = Theme.mutedForeground
    /// Poziomy odstęp; wiersze w karcie mają już jej padding.
    var inset: CGFloat = Theme.Spacing.md

    @Environment(\.dynamicTypeSize) private var typeSize
    @ScaledMetric(relativeTo: .body) private var leadWidth: CGFloat = 46

    var body: some View {
        Group {
            if typeSize.isAccessibilitySize {
                VStack(alignment: .leading, spacing: 3) {
                    if let lead { leadText(lead) }
                    labels
                    valueText
                    noteText
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            } else {
                HStack(alignment: .firstTextBaseline, spacing: Theme.Spacing.sm) {
                    if let lead { leadText(lead).frame(width: leadWidth, alignment: .leading) }
                    labels
                    Spacer(minLength: Theme.Spacing.xs)
                    VStack(alignment: .trailing, spacing: 2) {
                        valueText.fixedSize()
                        noteText.multilineTextAlignment(.trailing)
                    }
                    .layoutPriority(1)
                }
            }
        }
        .padding(.horizontal, inset)
        .padding(.vertical, 11)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
    }

    private func leadText(_ text: String) -> some View {
        Text(text)
            .font(AppFont.mono(11))
            .foregroundColor(leadColor)
            .lineLimit(1)
            .minimumScaleFactor(0.8)
    }

    private var labels: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title)
                .font(AppFont.bodyMedium)
                .foregroundColor(Theme.foreground)
                .lineLimit(2)
                .multilineTextAlignment(.leading)
            if let subtitle, !subtitle.isEmpty {
                Text(subtitle)
                    .font(AppFont.caption)
                    .foregroundColor(Theme.mutedForeground)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
            }
        }
    }

    private var valueText: some View {
        Text(value)
            .font(AppFont.amount)
            .foregroundColor(valueColor)
            .lineLimit(1)
    }

    @ViewBuilder
    private var noteText: some View {
        if let note {
            Text(note)
                .font(AppFont.chip)
                .foregroundColor(noteColor)
        }
    }
}

/// Lista wierszy na jednej karcie, z włosami między nimi.
struct RowsCard<Item: Identifiable, Row: View>: View {
    let items: [Item]
    /// Ostatni wiersz wszedł na ekran — pora na następną stronę.
    var onLast: (() -> Void)?
    @ViewBuilder let row: (Item) -> Row

    var body: some View {
        LazyVStack(spacing: 0) {
            ForEach(Array(items.enumerated()), id: \.element.id) { index, item in
                if index > 0 {
                    Divider().overlay(Theme.border).padding(.leading, Theme.Spacing.md)
                }
                row(item).onAppear {
                    if index == items.count - 1 { onLast?() }
                }
            }
        }
        .paperCard(shadow: 0)
    }
}

/// „Etykieta — wartość" w szczegółach. Przy dużej czcionce jedno pod drugim.
struct DetailLine: View {
    let label: String
    let value: String
    var valueColor: Color = Theme.foreground
    var emphasized = false

    @Environment(\.dynamicTypeSize) private var typeSize

    var body: some View {
        Group {
            if typeSize.isAccessibilitySize {
                VStack(alignment: .leading, spacing: 2) { labelText; valueText }
                    .frame(maxWidth: .infinity, alignment: .leading)
            } else {
                HStack(alignment: .firstTextBaseline, spacing: Theme.Spacing.sm) {
                    labelText
                    Spacer(minLength: Theme.Spacing.sm)
                    valueText.multilineTextAlignment(.trailing)
                }
            }
        }
        .padding(.vertical, 9)
        .accessibilityElement(children: .combine)
    }

    private var labelText: some View {
        Text(label)
            .font(emphasized ? AppFont.bodySemibold : AppFont.captionMedium)
            .foregroundColor(emphasized ? Theme.foreground : Theme.mutedForeground)
    }

    private var valueText: some View {
        Text(value)
            .font(emphasized ? AppFont.amount : AppFont.body)
            .foregroundColor(valueColor)
            .textSelection(.enabled)
    }
}

/// Wiersze szczegółów z włosami; puste wartości odpadają.
struct DetailLines: View {
    struct Entry: Identifiable {
        let label: String
        let value: String
        var color: Color = Theme.foreground
        var emphasized = false
        var id: String { label }
    }

    let entries: [Entry]

    var body: some View {
        let shown = entries.filter { !$0.value.isEmpty }
        VStack(spacing: 0) {
            ForEach(Array(shown.enumerated()), id: \.element.id) { index, entry in
                if index > 0 { Divider().overlay(Theme.border) }
                DetailLine(label: entry.label, value: entry.value, valueColor: entry.color, emphasized: entry.emphasized)
            }
        }
        // Skrajne wiersze niosą własny odstęp, a karta swój.
        .padding(.vertical, -6)
    }
}

/// „Otwórz w Solvio" w apce — tylko dla sprawdzonej ścieżki; inaczej nic.
struct SolvioWebLink: View {
    let path: String?
    var compact = false

    @EnvironmentObject private var locale: AppLocale
    @EnvironmentObject private var router: AppRouter

    var body: some View {
        if let page = WebPage(path: path) {
            if compact {
                Button { router.web = page } label: { Image(systemName: "arrow.up.right.square") }
                    .foregroundColor(Theme.primary)
                    .accessibilityLabel(locale.t("company.openInSolvio"))
            } else {
                Button { router.web = page } label: {
                    HStack(spacing: 6) {
                        Image(systemName: "arrow.up.right.square")
                        Text(locale.t("company.openInSolvio"))
                    }
                }
                .buttonStyle(SecondaryButtonStyle())
            }
        }
    }
}

/// Pasek wyboru podmiotu. Przy jednym podmiocie nie ma czego wybierać.
struct EntityChips: View {
    @Binding var selection: String?

    @EnvironmentObject private var accounting: AccountingStore
    @EnvironmentObject private var locale: AppLocale

    var body: some View {
        if accounting.entities.count > 1 {
            ChipBar {
                PickChip(label: locale.t("company.allEntities"), active: selection == nil) { selection = nil }
                ForEach(accounting.entities) { entity in
                    PickChip(label: entity.name, active: selection == entity.key) {
                        selection = selection == entity.key ? nil : entity.key
                    }
                }
            }
        }
    }
}

struct ChipBar<Content: View>: View {
    @ViewBuilder var content: () -> Content

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) { content() }
                .padding(.horizontal, Theme.Spacing.md)
        }
    }
}

/// Dane są, ale ostatnie odświeżenie się nie udało.
struct StaleNotice: View {
    let retry: () -> Void
    @EnvironmentObject private var locale: AppLocale

    var body: some View {
        ErrorBanner(message: locale.t("company.refreshFailed"), retry: retry)
    }
}

/// Stopka listy: dociąganie strony albo ponowienie.
struct LoadMoreFooter<Item: Identifiable & Equatable>: View where Item.ID: Hashable {
    @ObservedObject var list: PagedList<Item>
    @EnvironmentObject private var locale: AppLocale

    var body: some View {
        if list.loadMoreFailed {
            ErrorBanner(message: locale.t("company.refreshFailed")) { Task { await list.loadMore() } }
        } else if list.hasMore {
            ProgressView()
                .frame(maxWidth: .infinity)
                .padding(Theme.Spacing.md)
        }
    }
}

// MARK: - Podpisy

enum CompanyFormat {
    /// `2026-10` → „październik 2026", `2026-Q3` → „Q3 2026", reszta bez zmian.
    static func period(_ raw: String) -> String {
        let parts = raw.split(separator: "-").map(String.init)
        guard parts.count == 2 else { return raw }
        if parts[1].hasPrefix("Q") { return "\(parts[1]) \(parts[0])" }
        guard let day = ObligationSchedule.day("\(raw)-01") else { return raw }
        return Fmt.monthYear(day)
    }

    static func amount(_ value: Double?, currency: String = "PLN") -> String {
        value.map { Fmt.amount($0, currency: currency) } ?? "—"
    }
}

extension AppLocale {
    /// „Dziś", „za 3 dni", „5 dni po terminie".
    func deadline(_ days: Int?) -> String? {
        guard let days else { return nil }
        if days == 0 { return t("company.today") }
        return days > 0
            ? pluralized("company.inDays", count: days)
            : pluralized("company.overdueDays", count: -days)
    }

    /// Kwota terminu: zadanie bez kwoty, płatność bez kwoty albo kwota.
    func obligationValue(_ item: AccountingObligation) -> String {
        if item.isTask { return t("company.task") }
        let shown = item.isOpen ? item.amountDue : (item.paidAmount ?? item.amount)
        return CompanyFormat.amount(shown)
    }
}
