import SwiftUI

/// Receipt detail — hero with vendor/date/total, receipt image,
/// line-item list, e-receipt section with copy/open/share,
/// QR code linking to the public `/receipt/[id]` page,
/// and a delete action. Categories are looked up from the user's
/// category bundle so we can render the name instead of the raw UUID.
struct ReceiptDetailView: View {
    let receiptId: String

    @EnvironmentObject private var router: AppRouter
    @EnvironmentObject private var toast: ToastCenter
    @EnvironmentObject private var locale: AppLocale
    @EnvironmentObject private var store: AppDataStore
    @StateObject private var vm = ReceiptDetailViewModel()
    @State private var confirmingDelete = false
    @State private var showShareSheet = false

    private func categoryName(for id: String) -> String? {
        store.categories.first(where: { $0.id == id })?.name
    }

    private var publicUrl: String {
        AppConfig.apiBaseURL
            .appendingPathComponent("receipt")
            .appendingPathComponent(receiptId)
            .absoluteString
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Theme.Spacing.md) {
                if vm.isLoading && vm.receipt == nil {
                    NBLoadingCard()
                } else if let message = vm.errorMessage, vm.receipt == nil {
                    NBErrorCard(message: message) { Task { await vm.load(id: receiptId) } }
                } else if let r = vm.receipt {
                    hero(r)
                    eReceiptCard
                    imageCard(r)
                    itemsList(r)
                    qrCard
                    deleteButton
                }
                Spacer(minLength: Theme.Spacing.xl)
            }
            .padding(.horizontal, Theme.Spacing.md)
            .padding(.top, Theme.Spacing.md)
        }
        .background(Theme.background)
        .navigationTitle(locale.t("receiptDetail.title"))
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                if vm.receipt != nil {
                    Button {
                        showShareSheet = true
                    } label: {
                        Image(systemName: "square.and.arrow.up")
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundColor(Theme.foreground)
                    }
                }
            }
        }
        .task { await vm.load(id: receiptId) }
        .refreshable { await vm.load(id: receiptId) }
        .confirmationDialog(locale.t("receiptDetail.deleteTitle"), isPresented: $confirmingDelete, titleVisibility: .visible) {
            Button(locale.t("common.delete"), role: .destructive) {
                Task { await vm.delete(store: store, locale: locale, toast: toast) { router.popToRoot() } }
            }
            Button(locale.t("common.cancel"), role: .cancel) {}
        } message: {
            Text(locale.t("receiptDetail.deleteMsg"))
        }
        .sheet(isPresented: $showShareSheet) {
            ShareSheet(items: [URL(string: publicUrl) ?? publicUrl])
        }
    }

    // MARK: - Hero

    private func hero(_ r: Receipt) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
            NBEyebrow(text: r.vendor ?? locale.t("receiptDetail.receiptFallback"))
            Text(Fmt.amount(r.total, currency: r.currency ?? "PLN"))
                .font(AppFont.black(34))
                .foregroundColor(Theme.foreground)
            HStack(spacing: 8) {
                Text(Fmt.date(r.date))
                    .font(AppFont.caption)
                    .foregroundColor(Theme.mutedForeground)
                if let status = r.status, !status.isEmpty {
                    NBTag(text: status)
                }
                if r.displayItemCount > 0 {
                    Text("· \(String(format: locale.t("receiptDetail.itemsCount"), r.displayItemCount))")
                        .font(AppFont.caption)
                        .foregroundColor(Theme.mutedForeground)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(Theme.Spacing.md)
        .nbCard(radius: Theme.Radius.lg, shadow: Theme.Shadow.lg)
    }

    // MARK: - E-receipt card (copy / open / share)

    private var eReceiptCard: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
            NBSectionHeader(
                eyebrow: locale.t("receiptDetail.eReceiptEyebrow"),
                title: locale.t("receiptDetail.eReceiptTitle")
            )
            Text(locale.t("receiptDetail.eReceiptHint"))
                .font(AppFont.caption)
                .foregroundColor(Theme.mutedForeground)

            // URL display
            HStack(spacing: 6) {
                Image(systemName: "link")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(Theme.mutedForeground)
                Text(publicUrl)
                    .font(AppFont.mono(11))
                    .foregroundColor(Theme.foreground)
                    .lineLimit(1)
                    .truncationMode(.middle)
            }
            .padding(Theme.Spacing.sm)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Theme.muted)
            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.sm))
            .overlay(
                RoundedRectangle(cornerRadius: Theme.Radius.sm)
                    .stroke(Theme.foreground, lineWidth: Theme.Border.widthThin)
            )

            // Action buttons
            HStack(spacing: Theme.Spacing.sm) {
                // Copy link
                Button {
                    UIPasteboard.general.string = publicUrl
                    toast.success(locale.t("receiptDetail.linkCopied"))
                } label: {
                    Label(locale.t("receiptDetail.copyLink"), systemImage: "doc.on.doc")
                        .font(AppFont.caption)
                        .foregroundColor(Theme.background)
                        .padding(.horizontal, Theme.Spacing.sm)
                        .padding(.vertical, 8)
                        .frame(maxWidth: .infinity)
                        .background(Theme.foreground)
                        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.sm))
                }
                .buttonStyle(.plain)

                // Open in browser
                Button {
                    if let url = URL(string: publicUrl) {
                        UIApplication.shared.open(url)
                    }
                } label: {
                    Label(locale.t("receiptDetail.openInBrowser"), systemImage: "safari")
                        .font(AppFont.caption)
                        .foregroundColor(Theme.foreground)
                        .padding(.horizontal, Theme.Spacing.sm)
                        .padding(.vertical, 8)
                        .frame(maxWidth: .infinity)
                        .background(Theme.muted)
                        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.sm))
                        .overlay(
                            RoundedRectangle(cornerRadius: Theme.Radius.sm)
                                .stroke(Theme.foreground, lineWidth: Theme.Border.widthThin)
                        )
                }
                .buttonStyle(.plain)

                // Share
                Button {
                    showShareSheet = true
                } label: {
                    Label(locale.t("common.share"), systemImage: "square.and.arrow.up")
                        .font(AppFont.caption)
                        .foregroundColor(Theme.foreground)
                        .padding(.horizontal, Theme.Spacing.sm)
                        .padding(.vertical, 8)
                        .frame(maxWidth: .infinity)
                        .background(Theme.muted)
                        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.sm))
                        .overlay(
                            RoundedRectangle(cornerRadius: Theme.Radius.sm)
                                .stroke(Theme.foreground, lineWidth: Theme.Border.widthThin)
                        )
                }
                .buttonStyle(.plain)
            }
        }
        .padding(Theme.Spacing.md)
        .frame(maxWidth: .infinity, alignment: .leading)
        .nbCard(radius: Theme.Radius.md, shadow: Theme.Shadow.sm)
    }

    // MARK: - Image

    @ViewBuilder
    private func imageCard(_ r: Receipt) -> some View {
        if let url = r.imageUrl, let parsed = URL(string: url) {
            AsyncImage(url: parsed) { phase in
                switch phase {
                case .empty:
                    Rectangle().fill(Theme.muted).frame(height: 220)
                case .success(let img):
                    img.resizable().scaledToFit().frame(maxWidth: .infinity)
                case .failure:
                    VStack(spacing: 4) {
                        Image(systemName: "photo").foregroundColor(Theme.mutedForeground)
                        Text(locale.t("receiptDetail.imageUnavailable")).font(AppFont.caption).foregroundColor(Theme.mutedForeground)
                    }
                    .frame(maxWidth: .infinity, minHeight: 160)
                    .background(Theme.muted)
                @unknown default: EmptyView()
                }
            }
            .background(Theme.muted)
            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.md))
            .overlay(
                RoundedRectangle(cornerRadius: Theme.Radius.md)
                    .stroke(Theme.foreground, lineWidth: Theme.Border.widthThin)
            )
        }
    }

    // MARK: - Items

    private func itemsList(_ r: Receipt) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
            NBSectionHeader(eyebrow: locale.t("receiptDetail.itemsEyebrow"), title: locale.t("receiptDetail.lineItems"))
            let items = r.items ?? []
            if items.isEmpty {
                Text(locale.t("receiptDetail.noLineItems"))
                    .font(AppFont.caption)
                    .foregroundColor(Theme.mutedForeground)
                    .padding(Theme.Spacing.md)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .nbCard(radius: Theme.Radius.md, shadow: Theme.Shadow.sm)
            } else {
                VStack(spacing: Theme.Spacing.xs) {
                    ForEach(Array(items.enumerated()), id: \.offset) { _, item in
                        itemRow(item, currency: r.currency ?? "PLN")
                    }
                }
            }
        }
    }

    private func itemRow(_ item: ReceiptItem, currency: String) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(item.nameTranslated ?? item.name)
                    .font(AppFont.bodyMedium)
                    .foregroundColor(Theme.foreground)
                Spacer()
                if let price = item.displayPrice {
                    Text(Fmt.amount(price, currency: currency))
                        .font(AppFont.bodyMedium)
                        .foregroundColor(Theme.foreground)
                }
            }
            HStack(spacing: 6) {
                if let qty = item.quantity {
                    NBTag(text: String(format: "×%.2f", qty))
                }
                if let unit = item.unitPrice {
                    NBTag(text: Fmt.amount(unit, currency: currency))
                }
                if let categoryId = item.categoryId, let name = categoryName(for: categoryId) {
                    NBTag(text: name)
                } else if let categoryId = item.categoryId {
                    NBTag(text: String(categoryId.prefix(6)))
                }
            }
        }
        .padding(Theme.Spacing.sm)
        .frame(maxWidth: .infinity, alignment: .leading)
        .nbCard(radius: Theme.Radius.sm, shadow: Theme.Shadow.sm)
    }

    // MARK: - QR

    private var qrCard: some View {
        let qrImage = BarcodeImage.make(from: publicUrl, type: "qr")
        return VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
            NBSectionHeader(eyebrow: locale.t("receiptDetail.shareEyebrow"), title: locale.t("receiptDetail.publicLink"))
            HStack(alignment: .top, spacing: Theme.Spacing.md) {
                if let qr = qrImage {
                    Image(uiImage: qr)
                        .interpolation(.none)
                        .resizable()
                        .frame(width: 120, height: 120)
                        .background(Theme.card)
                        .overlay(
                            RoundedRectangle(cornerRadius: Theme.Radius.sm)
                                .stroke(Theme.foreground, lineWidth: Theme.Border.widthThin)
                        )
                }
                VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
                    Text(locale.t("receiptDetail.scanHint"))
                        .font(AppFont.caption)
                        .foregroundColor(Theme.mutedForeground)
                    Text(publicUrl)
                        .font(AppFont.mono(10))
                        .foregroundColor(Theme.foreground)
                        .lineLimit(3)
                        .textSelection(.enabled)
                }
                Spacer(minLength: 0)
            }
        }
        .padding(Theme.Spacing.md)
        .frame(maxWidth: .infinity, alignment: .leading)
        .nbCard(radius: Theme.Radius.md, shadow: Theme.Shadow.sm)
    }

    // MARK: - Delete

    private var deleteButton: some View {
        Button {
            confirmingDelete = true
        } label: {
            Text(locale.t("receiptDetail.deleteButton"))
        }
        .buttonStyle(NBDestructiveButtonStyle())
    }
}

// MARK: - Share sheet (UIActivityViewController bridge)

struct ShareSheet: UIViewControllerRepresentable {
    let items: [Any]
    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: items, applicationActivities: nil)
    }
    func updateUIViewController(_ controller: UIActivityViewController, context: Context) {}
}

// MARK: - ViewModel
//
// We keep a tiny VM here because the detail endpoint is the only place
// that returns the full `items` array (the list endpoint omits it for
// payload reasons). Categories now come from `AppDataStore` instead of
// a duplicate `/api/data/settings` round-trip.

@MainActor
final class ReceiptDetailViewModel: ObservableObject {
    @Published var receipt: Receipt?
    @Published var isLoading = false
    @Published var errorMessage: String?

    func load(id: String) async {
        isLoading = true
        if receipt == nil { errorMessage = nil }
        defer { isLoading = false }
        do {
            receipt = try await ReceiptsRepo.detail(id: id)
            errorMessage = nil
        } catch {
            #if DEBUG
            print("[ReceiptDetail] load failed: \(error)")
            #endif
            if receipt == nil {
                errorMessage = error.localizedDescription
            }
        }
    }

    func delete(
        store: AppDataStore,
        locale: AppLocale,
        toast: ToastCenter,
        onDone: @escaping () -> Void
    ) async {
        guard let r = receipt else { return }
        do {
            try await ReceiptsRepo.delete(id: r.id)
            store.didMutateReceipts()
            toast.success(locale.t("receiptDetail.deletedToast"))
            onDone()
        } catch {
            toast.error(locale.t("receiptDetail.deleteFailed"), description: error.localizedDescription)
        }
    }
}
