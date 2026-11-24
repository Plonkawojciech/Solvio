import SwiftUI

extension TodoSeverity {
    var color: Color {
        switch self {
        case .urgent: return Theme.destructive
        case .important: return Theme.warning
        case .info: return Theme.mutedForeground
        }
    }

    /// Kształt mówi to samo co kolor.
    var icon: String {
        switch self {
        case .urgent: return "exclamationmark.octagon.fill"
        case .important: return "exclamationmark.triangle.fill"
        case .info: return "info.circle"
        }
    }
}

/// Wyjątek: co, u kogo, dlaczego i co zrobić. Dotknięcie otwiera web.
struct TodoRow: View {
    let item: AccountingTodoItem
    /// W podzielonej liście wagę niesie już nagłówek.
    var showsSeverity = true
    var inset: CGFloat = Theme.Spacing.md

    @EnvironmentObject private var locale: AppLocale
    @EnvironmentObject private var router: AppRouter
    @ScaledMetric(relativeTo: .body) private var iconWidth: CGFloat = 20

    var body: some View {
        if let page = WebPage(path: item.webPath) {
            Button {
                Haptics.selection()
                router.web = page
            } label: {
                content(opens: true)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(spoken)
            .accessibilityHint(locale.t("company.openInSolvio"))
        } else {
            content(opens: false)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(spoken)
        }
    }

    private func content(opens: Bool) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: Theme.Spacing.sm) {
            Image(systemName: item.severity.icon)
                .font(AppFont.semibold(14))
                .foregroundColor(item.severity.color)
                .frame(width: iconWidth, alignment: .leading)
            VStack(alignment: .leading, spacing: 3) {
                Text(item.title)
                    .font(AppFont.bodyMedium)
                    .foregroundColor(Theme.foreground)
                if !context.isEmpty {
                    Text(context)
                        .font(AppFont.captionMedium)
                        .foregroundColor(Theme.foreground)
                }
                if !item.cause.isEmpty {
                    Text(item.cause)
                        .font(AppFont.caption)
                        .foregroundColor(Theme.mutedForeground)
                }
                if !item.action.isEmpty {
                    Text(item.action)
                        .font(AppFont.captionMedium)
                        .foregroundColor(opens ? Theme.primary : Theme.foreground)
                        .padding(.top, 2)
                }
            }
            .multilineTextAlignment(.leading)
            .fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: .infinity, alignment: .leading)
            if opens {
                Image(systemName: "chevron.right")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(Theme.mutedForeground)
            }
        }
        .padding(.horizontal, inset)
        .padding(.vertical, 11)
        .contentShape(Rectangle())
    }

    private var context: String {
        [showsSeverity ? locale.t(item.severity.labelKey) : "", item.entityName]
            .filter { !$0.isEmpty }
            .joined(separator: " · ")
    }

    private var spoken: String {
        [locale.t(item.severity.labelKey), item.title, item.entityName, item.cause, item.action]
            .filter { !$0.isEmpty }
            .joined(separator: ", ")
    }
}

/// „Wymaga uwagi" na Firmie. Bez wyjątków karty nie ma.
struct TodoCard: View {
    @EnvironmentObject private var accounting: AccountingStore
    @EnvironmentObject private var locale: AppLocale

    static let limit = 3

    var body: some View {
        // Grupy, a nie sama lista: najpilniejsze mają być na górze także wtedy,
        // gdy CRM przyśle wagę, której apka nie zna.
        let items = TodoGroup.build(accounting.todo).flatMap(\.items)
        if !items.isEmpty {
            PaperCard(
                title: locale.t("company.todo"),
                label: locale.pluralized("company.todoCount", count: items.count)
            ) {
                VStack(spacing: 0) {
                    ForEach(items.prefix(Self.limit)) { item in
                        if item.id != items.first?.id { Divider().overlay(Theme.border) }
                        TodoRow(item: item, inset: 0)
                    }
                }
                .padding(.vertical, -Theme.Spacing.sm)
            } trailing: {
                CardLink(label: locale.t("company.showAll"), route: .todo)
            }
        }
    }
}

/// Wszystkie wyjątki, podzielone według wagi.
struct TodoView: View {
    @EnvironmentObject private var accounting: AccountingStore
    @EnvironmentObject private var locale: AppLocale

    var body: some View {
        ZStack {
            PaperBackground()
            ScrollView {
                VStack(alignment: .leading, spacing: Theme.Spacing.md) {
                    if accounting.failed || accounting.todoFailed {
                        StaleNotice { Task { await accounting.refresh() } }
                    }
                    ForEach(TodoGroup.build(accounting.todo)) { group in
                        VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
                            SectionLabel(
                                text: "\(locale.t(group.severity.labelKey)) · \(group.items.count)",
                                color: group.severity == .urgent ? Theme.destructive : Theme.mutedForeground
                            )
                            .accessibilityAddTraits(.isHeader)
                            // Nie `RowsCard`: leniwy stos rozmywa tu łamane teksty.
                            VStack(spacing: 0) {
                                ForEach(group.items) { item in
                                    if item.id != group.items.first?.id {
                                        Divider().overlay(Theme.border).padding(.leading, Theme.Spacing.md)
                                    }
                                    TodoRow(item: item, showsSeverity: false)
                                }
                            }
                            .paperCard(shadow: 0)
                        }
                    }
                    if accounting.available == true, accounting.todo.isEmpty, !accounting.failed, !accounting.todoFailed {
                        EmptyStateView(icon: "checkmark.circle", title: locale.t("company.todoEmpty"))
                    }
                }
                .padding(Theme.Spacing.md)
                .padding(.bottom, 96)
            }
            .refreshable { await accounting.refresh() }
        }
        .navigationTitle(locale.t("company.todo"))
        .navigationBarTitleDisplayMode(.inline)
        .task { accounting.ensureLoaded() }
    }
}
