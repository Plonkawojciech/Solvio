import SwiftUI

/// Lista wpisów Finansów CRM-a.
///
/// Pokazuje to samo, co ekran `/finanse` w CRM-ie: typ, tytuł, kategorię,
/// klienta i status zapłaty. Tapnięcie otwiera edycję, długie przytrzymanie
/// przełącza „zapłacone" — to najczęstsza operacja na tym ekranie i nie
/// powinna wymagać wchodzenia w szczegóły.
struct CrmEntriesList: View {
    /// „INCOME", „EXPENSE" albo `nil` = wszystko. Filtrujemy po stronie apki,
    /// bo wpisy całego miesiąca i tak już mamy — dodatkowe żądanie na każdą
    /// zmianę zakładki byłoby czystą stratą.
    var type: String?

    @EnvironmentObject private var crm: CrmStore
    @EnvironmentObject private var locale: AppLocale

    @Binding var editing: CrmEntry?
    @Binding var creating: Bool

    var body: some View {
        Group {
            if crm.loading && crm.entries.isEmpty {
                VStack(spacing: Theme.Spacing.sm) {
                    ForEach(0..<5, id: \.self) { _ in SkeletonBlock(height: 56) }
                }
                .padding(Theme.Spacing.md)
            } else if let error = crm.error, crm.entries.isEmpty {
                ErrorBanner(message: error) { Task { await crm.reload() } }
                    .padding(Theme.Spacing.md)
            } else if rows.isEmpty {
                EmptyStateView(
                    icon: "building.2",
                    title: locale.t("crm.emptyMonth"),
                    subtitle: locale.t("crm.emptyMonthHint"),
                    actionTitle: locale.t("crm.newEntry"),
                    action: { creating = true }
                )
                .padding(.top, Theme.Spacing.lg)
            } else {
                list
            }
        }
    }

    private var rows: [CrmEntry] {
        guard let type else { return crm.entries }
        return crm.entries.filter { $0.type == type }
    }

    private var list: some View {
        ScrollView {
            totals
            LazyVStack(spacing: 0) {
                ForEach(rows) { entry in
                    Button {
                        Haptics.selection()
                        editing = entry
                    } label: {
                        row(entry)
                    }
                    .contextMenu {
                        Button {
                            Task { await crm.setPaid(entry, paid: !entry.paid) }
                        } label: {
                            Label(
                                entry.paid ? locale.t("crm.markUnpaid") : locale.t("crm.markPaid"),
                                systemImage: entry.paid ? "circle" : "checkmark.circle"
                            )
                        }
                        Button(role: .destructive) {
                            Task { await crm.delete(entry) }
                        } label: {
                            Label(locale.t("common.delete"), systemImage: "trash")
                        }
                    }
                    if entry.id != rows.last?.id {
                        Divider().overlay(Theme.border).padding(.leading, 44)
                    }
                }
            }
            .background(Theme.card)
            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.lg, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: Theme.Radius.lg, style: .continuous)
                    .stroke(Theme.border, lineWidth: 1)
            )
            .padding(.horizontal, Theme.Spacing.md)
            .padding(.bottom, 96)
        }
        .refreshable { await crm.reload() }
    }

    private var totals: some View {
        HStack(spacing: Theme.Spacing.sm) {
            total(locale.t("crm.income"), crm.monthIncome, Theme.success)
            total(locale.t("crm.costs"), crm.monthExpense, Theme.destructive)
            total(locale.t("crm.result"), crm.monthBalance, crm.monthBalance >= 0 ? Theme.foreground : Theme.destructive)
        }
        .padding(.horizontal, Theme.Spacing.md)
        .padding(.bottom, Theme.Spacing.sm)
    }

    private func total(_ label: String, _ value: Double, _ color: Color) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            SectionLabel(text: label)
            Text(Fmt.amount(value, currency: "PLN"))
                .font(AppFont.semibold(14))
                .foregroundColor(color)
                .lineLimit(1)
                .minimumScaleFactor(0.6)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(Theme.Spacing.sm + 2)
        .paperCard(radius: Theme.Radius.md, shadow: 0)
    }

    private func row(_ entry: CrmEntry) -> some View {
        HStack(spacing: Theme.Spacing.sm) {
            // Kropka statusu: pełna = zapłacone, obrys = czeka. Kolor niesie
            // kierunek pieniędzy, wypełnienie — czy sprawa jest zamknięta.
            Circle()
                .strokeBorder(entry.isIncome ? Theme.success : Theme.destructive, lineWidth: 1.5)
                .background(Circle().fill(entry.paid ? (entry.isIncome ? Theme.success : Theme.destructive) : Color.clear))
                .frame(width: 9, height: 9)

            VStack(alignment: .leading, spacing: 2) {
                Text(entry.title)
                    .font(AppFont.bodyMedium)
                    .foregroundColor(Theme.foreground)
                    .lineLimit(1)
                Text(subtitle(entry))
                    .font(AppFont.caption)
                    .foregroundColor(Theme.mutedForeground)
                    .lineLimit(1)
            }
            Spacer(minLength: Theme.Spacing.sm)
            VStack(alignment: .trailing, spacing: 2) {
                Text((entry.isIncome ? "+" : "−") + Fmt.amount(entry.amount, currency: "PLN"))
                    .font(AppFont.amount)
                    .foregroundColor(entry.isIncome ? Theme.success : Theme.foreground)
                if !entry.paid {
                    Text(locale.t("crm.unpaid"))
                        .font(AppFont.chip)
                        .foregroundColor(Theme.warning)
                }
            }
        }
        .padding(.horizontal, Theme.Spacing.md)
        .padding(.vertical, 11)
        .contentShape(Rectangle())
    }

    private func subtitle(_ entry: CrmEntry) -> String {
        [Fmt.dayMonth(entry.date), entry.category.isEmpty ? nil : entry.category,
         entry.client?.name, entry.recurring != nil ? locale.t("crm.recurring") : nil]
            .compactMap { $0 }
            .joined(separator: " · ")
    }
}
