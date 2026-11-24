import SwiftUI

/// „Wystaw fakturę" / „Dodaj koszt". Apka tylko wybiera podmiot i otwiera
/// formularz na webie; sama niczego nie wystawia ani nie zapisuje.
struct NewDocumentButton<Content: View>: View {
    let direction: DocumentDirection
    /// Podmiot z filtra listy; wybrany rozstrzyga bez pytania.
    var entity: String?
    @ViewBuilder let label: () -> Content

    @EnvironmentObject private var accounting: AccountingStore
    @EnvironmentObject private var router: AppRouter
    @EnvironmentObject private var session: SessionStore

    var body: some View {
        Button {
            Haptics.selection()
            switch EntityChoice.resolve(filter: entity, entities: accounting.entities) {
            case .entity(let key):
                LastEntity().set(key, account: session.currentUser?.email)
                router.web = WebPage(path: SolvioWeb.newDocumentPath(key, direction))
            case .ask:
                router.newDocument = direction
            }
        } label: {
            label()
        }
        .disabled(accounting.entities.isEmpty)
    }
}

struct EntityPickerSheet: View {
    let direction: DocumentDirection

    @EnvironmentObject private var accounting: AccountingStore
    @EnvironmentObject private var locale: AppLocale
    @EnvironmentObject private var router: AppRouter
    @EnvironmentObject private var session: SessionStore
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        let last = LastEntity().get(session.currentUser?.email)
        ScrollView {
            VStack(alignment: .leading, spacing: Theme.Spacing.md) {
                VStack(alignment: .leading, spacing: 4) {
                    SectionLabel(text: locale.t("company.pickEntity"))
                    Text(locale.t(direction.newKey))
                        .font(AppFont.sectionTitle)
                        .foregroundColor(Theme.foreground)
                }
                .accessibilityElement(children: .combine)
                .accessibilityAddTraits(.isHeader)
                ForEach(EntityChoice.ordered(accounting.entities, last: last)) { entity in
                    row(entity, isLast: entity.key == last)
                }
            }
            .padding(Theme.Spacing.md)
            .padding(.top, Theme.Spacing.sm)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .background(PaperBackground())
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
    }

    private func row(_ entity: AccountingEntity, isLast: Bool) -> some View {
        Button {
            Haptics.selection()
            LastEntity().set(entity.key, account: session.currentUser?.email)
            router.pendingWeb = WebPage(path: SolvioWeb.newDocumentPath(entity.key, direction))
            dismiss()
        } label: {
            HStack(spacing: Theme.Spacing.sm) {
                VStack(alignment: .leading, spacing: 3) {
                    Text(entity.name)
                        .font(AppFont.bodySemibold)
                        .foregroundColor(Theme.foreground)
                    if !entity.forms.isEmpty {
                        Text(entity.forms)
                            .font(AppFont.caption)
                            .foregroundColor(Theme.mutedForeground)
                    }
                    if isLast {
                        Text(locale.t("company.lastPicked"))
                            .font(AppFont.captionMedium)
                            .foregroundColor(Theme.primary)
                    }
                }
                .multilineTextAlignment(.leading)
                Spacer(minLength: Theme.Spacing.sm)
                Image(systemName: "chevron.right")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(Theme.mutedForeground)
            }
            .padding(Theme.Spacing.md)
            .frame(maxWidth: .infinity, alignment: .leading)
            .paperCard(radius: Theme.Radius.md, shadow: 0)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
    }
}
