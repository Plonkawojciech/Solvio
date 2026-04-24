import SwiftUI
import PhotosUI

/// Receipts are the headline feature: two prominent CTAs (OCR scan + virtual
/// receipt) sit above a clean archive list. Scan runs OCR via Azure Document
/// Intelligence (`/api/v1/ocr-receipt`), then shows a confirm sheet so the
/// user can review/edit extracted items before saving. Virtual receipt pushes
/// a manual-entry form. Archive supports pull-to-refresh and swipe-to-delete.
struct ReceiptsListView: View {
    @EnvironmentObject private var router: AppRouter
    @EnvironmentObject private var toast: ToastCenter
    @EnvironmentObject private var locale: AppLocale
    @StateObject private var vm = ReceiptsListViewModel()

    @State private var showCamera = false
    @State private var showPhotoPicker = false
    @State private var pickedItem: PhotosPickerItem?
    @State private var showCreateVirtual = false
    @State private var showSourcePicker = false
    @State private var pendingDelete: Receipt?
    @State private var ocrDraft: OcrDraft?

    var body: some View {
        List {
            Section {
                VStack(alignment: .leading, spacing: Theme.Spacing.md) {
                    NBScreenHeader(
                        eyebrow: locale.t("receipts.eyebrow"),
                        title: locale.t("receipts.title"),
                        subtitle: vm.receipts.isEmpty ? locale.t("receipts.getStarted") : "\(vm.receipts.count) \(locale.t("receipts.savedSuffix"))"
                    )
                    ctaRow
                }
                .padding(.horizontal, Theme.Spacing.md)
                .padding(.top, Theme.Spacing.md)
                .padding(.bottom, Theme.Spacing.xs)
            }
            .listRowBackground(Color.clear)
            .listRowSeparator(.hidden)
            .listRowInsets(EdgeInsets())

            content

            Section {
                Color.clear.frame(height: Theme.Spacing.xl)
            }
            .listRowBackground(Color.clear)
            .listRowSeparator(.hidden)
            .listRowInsets(EdgeInsets())
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .background(Theme.background)
        .navigationTitle(locale.t("receipts.title"))
        .navigationBarTitleDisplayMode(.inline)
        .refreshable { await vm.load() }
        .task { if vm.receipts.isEmpty { await vm.load() } }
        .confirmationDialog(locale.t("receipts.chooseSource"), isPresented: $showSourcePicker, titleVisibility: .visible) {
            if UIImagePickerController.isSourceTypeAvailable(.camera) {
                Button(locale.t("receipts.takePhoto")) { showCamera = true }
            }
            Button(locale.t("receipts.photoLibrary")) { showPhotoPicker = true }
            Button(locale.t("common.cancel"), role: .cancel) {}
        }
        .sheet(isPresented: $showCamera) {
            CameraPicker { image in handle(image: image) }
        }
        .sheet(isPresented: $showCreateVirtual) {
            NavigationStack {
                VirtualReceiptCreateView { created in
                    Task {
                        await vm.load()
                        toast.success(locale.t("receipts.saved"), description: created.vendor ?? locale.t("receipts.virtualReceipt"))
                        router.push(.receiptDetail(id: created.id))
                    }
                }
            }
            .environmentObject(locale)
        }
        .sheet(item: $ocrDraft) { draft in
            OcrConfirmSheet(draft: draft) { saved in
                Task {
                    await vm.load()
                    toast.success(locale.t("receipts.saved"), description: saved.vendor ?? locale.t("receipts.savedScan"))
                    ocrDraft = nil
                    router.push(.receiptDetail(id: saved.id))
                }
            } onCancel: {
                ocrDraft = nil
            }
            .environmentObject(locale)
        }
        .photosPicker(isPresented: $showPhotoPicker, selection: $pickedItem, matching: .images)
        .onChange(of: pickedItem) { newItem in
            guard let newItem else { return }
            Task {
                if let data = try? await newItem.loadTransferable(type: Data.self),
                   let ui = UIImage(data: data) {
                    handle(image: ui)
                }
                pickedItem = nil
            }
        }
        .overlay {
            if vm.isScanning {
                VStack(spacing: Theme.Spacing.sm) {
                    ProgressView().tint(Theme.foreground)
                    Text(locale.t("receipts.scanning"))
                        .font(AppFont.bodyMedium)
                        .foregroundColor(Theme.foreground)
                }
                .padding(Theme.Spacing.md)
                .nbCard(radius: Theme.Radius.md, shadow: Theme.Shadow.lg)
            }
        }
        .confirmationDialog(
            locale.t("receipts.deleteReceipt"),
            isPresented: Binding(get: { pendingDelete != nil }, set: { if !$0 { pendingDelete = nil } }),
            titleVisibility: .visible
        ) {
            Button(locale.t("common.delete"), role: .destructive) {
                if let r = pendingDelete {
                    Task { await vm.delete(id: r.id, locale: locale, toast: toast) }
                }
                pendingDelete = nil
            }
            Button(locale.t("common.cancel"), role: .cancel) { pendingDelete = nil }
        } message: {
            Text(pendingDelete?.vendor ?? locale.t("receipts.deleteSub"))
        }
    }

    // MARK: - Prominent CTA row

    private var ctaRow: some View {
        ctaTile(
            icon: "square.and.pencil",
            title: locale.t("virtualReceipt.eyebrow").capitalized,
            subtitle: locale.t("receipts.virtualSubtitle"),
            primary: false
        ) { showCreateVirtual = true }
    }

    private func ctaTile(icon: String, title: String, subtitle: String, primary: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
                Image(systemName: icon)
                    .font(.system(size: 28, weight: .bold))
                    .foregroundColor(primary ? Theme.background : Theme.foreground)
                    .frame(width: 48, height: 48)
                    .background(primary ? Theme.foreground : Theme.muted)
                    .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.sm))
                    .overlay(
                        RoundedRectangle(cornerRadius: Theme.Radius.sm)
                            .stroke(Theme.foreground, lineWidth: Theme.Border.widthThin)
                    )
                Text(title)
                    .font(AppFont.cardTitle)
                    .foregroundColor(Theme.foreground)
                Text(subtitle)
                    .font(AppFont.caption)
                    .foregroundColor(Theme.mutedForeground)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(Theme.Spacing.md)
            .frame(minHeight: 140)
            .background(primary ? Theme.muted : Theme.card)
            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.lg))
            .overlay(
                RoundedRectangle(cornerRadius: Theme.Radius.lg)
                    .stroke(Theme.foreground, lineWidth: Theme.Border.width)
            )
            .nbShadow(Theme.Shadow.md)
        }
        .buttonStyle(.plain)
    }

    // MARK: - Content

    @ViewBuilder
    private var content: some View {
        if vm.isLoading && vm.receipts.isEmpty {
            Section {
                NBLoadingCard()
                    .padding(.horizontal, Theme.Spacing.md)
            }
            .listRowBackground(Color.clear)
            .listRowSeparator(.hidden)
            .listRowInsets(EdgeInsets())
        } else if let message = vm.errorMessage {
            Section {
                NBErrorCard(message: message) { Task { await vm.load() } }
                    .padding(.horizontal, Theme.Spacing.md)
            }
            .listRowBackground(Color.clear)
            .listRowSeparator(.hidden)
            .listRowInsets(EdgeInsets())
        } else if vm.receipts.isEmpty {
            Section {
                NBEmptyState(
                    systemImage: "doc.text.viewfinder",
                    title: locale.t("receipts.emptyTitle"),
                    subtitle: locale.t("receipts.getStartedSub")
                )
                .padding(.horizontal, Theme.Spacing.md)
            }
            .listRowBackground(Color.clear)
            .listRowSeparator(.hidden)
            .listRowInsets(EdgeInsets())
        } else {
            Section {
                NBEyebrow(text: locale.t("receipts.archive").uppercased())
                    .padding(.horizontal, Theme.Spacing.md)
                    .padding(.bottom, Theme.Spacing.xxs)
            }
            .listRowBackground(Color.clear)
            .listRowSeparator(.hidden)
            .listRowInsets(EdgeInsets())

            Section {
                ForEach(vm.receipts) { r in
                    receiptRow(r)
                        .listRowBackground(Color.clear)
                        .listRowSeparator(.hidden)
                        .listRowInsets(EdgeInsets(
                            top: Theme.Spacing.xxs,
                            leading: Theme.Spacing.md,
                            bottom: Theme.Spacing.xxs,
                            trailing: Theme.Spacing.md
                        ))
                        .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                            Button(role: .destructive) {
                                pendingDelete = r
                            } label: {
                                Label(locale.t("common.delete"), systemImage: "trash")
                            }
                        }
                }
            }
        }
    }

    private func receiptRow(_ r: Receipt) -> some View {
        Button {
            router.push(.receiptDetail(id: r.id))
        } label: {
            HStack(spacing: Theme.Spacing.sm) {
                thumbnail(for: r)
                VStack(alignment: .leading, spacing: 2) {
                    Text(r.vendor ?? locale.t("receipts.unknownVendor"))
                        .font(AppFont.bodyMedium)
                        .foregroundColor(Theme.foreground)
                        .lineLimit(1)
                    HStack(spacing: 6) {
                        Text(Fmt.date(r.date))
                        Text("·")
                        Text("\(r.displayItemCount) \(locale.t("receipts.itemsSuffix"))")
                    }
                    .font(AppFont.caption)
                    .foregroundColor(Theme.mutedForeground)
                }
                Spacer()
                Text(Fmt.amount(r.total, currency: r.currency ?? "PLN"))
                    .font(AppFont.bodyMedium)
                    .foregroundColor(Theme.foreground)
            }
            .padding(Theme.Spacing.sm)
            .nbCard(radius: Theme.Radius.md, shadow: Theme.Shadow.sm)
        }
        .buttonStyle(.plain)
        .contextMenu {
            Button(role: .destructive) {
                pendingDelete = r
            } label: {
                Label(locale.t("common.delete"), systemImage: "trash")
            }
        }
    }

    @ViewBuilder
    private func thumbnail(for r: Receipt) -> some View {
        if let url = r.imageUrl, let parsed = URL(string: url) {
            AsyncImage(url: parsed) { phase in
                switch phase {
                case .success(let img):
                    img.resizable().scaledToFill()
                default:
                    Image(systemName: "doc.text")
                        .foregroundColor(Theme.foreground)
                }
            }
            .frame(width: 44, height: 44)
            .background(Theme.muted)
            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.sm))
            .overlay(
                RoundedRectangle(cornerRadius: Theme.Radius.sm)
                    .stroke(Theme.foreground, lineWidth: Theme.Border.widthThin)
            )
        } else {
            NBIconBadge(systemImage: "doc.text", size: 44)
        }
    }

    // MARK: - OCR handler

    private func handle(image: UIImage) {
        let resized = ScanFlowViewModel.resizeForUpload(image)
        guard let jpeg = ScanFlowViewModel.compressForUpload(resized) else {
            toast.error(locale.t("receipts.imageConversionFailed"))
            return
        }
        Task {
            await vm.scan(jpeg: jpeg, locale: locale, toast: toast) { draft in
                ocrDraft = draft
            }
        }
    }
}

// MARK: - ViewModel

@MainActor
final class ReceiptsListViewModel: ObservableObject {
    @Published var receipts: [Receipt] = []
    @Published var isLoading = false
    @Published var isScanning = false
    @Published var errorMessage: String?

    func load() async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            receipts = try await ReceiptsRepo.list()
            #if DEBUG
            print("[Receipts] Loaded \(receipts.count) receipts")
            #endif
        } catch {
            #if DEBUG
            print("[Receipts] Load FAILED: \(error)")
            #endif
            errorMessage = error.localizedDescription
        }
    }

    func delete(id: String, locale: AppLocale, toast: ToastCenter) async {
        do {
            try await ReceiptsRepo.delete(id: id)
            toast.success(locale.t("toast.deleted"))
            await load()
        } catch {
            toast.error(locale.t("toast.error"), description: error.localizedDescription)
        }
    }

    /// Uploads the JPEG to `/api/v1/ocr-receipt` (multipart `files` field).
    /// The backend already persists a receipt row and returns its id plus
    /// the extracted data — we surface that as an `OcrDraft` so the user
    /// can review/edit before keeping it (or discard it).
    func scan(jpeg: Data, locale: AppLocale, toast: ToastCenter, completion: @escaping (OcrDraft) -> Void) async {
        isScanning = true
        defer { isScanning = false }
        do {
            let response = try await ReceiptsRepo.scan(imageData: jpeg)
            guard let first = response.firstSuccess,
                  let receiptId = first.receiptId else {
                let msg = response.results.first?.error ?? locale.t("receipts.noReceiptDetected")
                toast.error(locale.t("receipts.scanFailed"), description: msg)
                return
            }
            let draft = OcrDraft(receiptId: receiptId, data: first.data)
            completion(draft)
        } catch {
            toast.error(locale.t("receipts.scanFailed"), description: error.localizedDescription)
        }
    }
}

// MARK: - OCR draft + confirm sheet

/// Intermediate state between the OCR upload and the user keeping/discarding
/// the result. The backend has already persisted the receipt; confirming
/// just reloads the list, discarding deletes the row.
struct OcrDraft: Identifiable {
    let id = UUID()
    let receiptId: String
    let data: OcrReceiptData?
}

struct OcrConfirmSheet: View {
    let draft: OcrDraft
    let onConfirm: (Receipt) -> Void
    let onSplit: ((Receipt) -> Void)?
    let onCancel: () -> Void

    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var toast: ToastCenter
    @EnvironmentObject private var locale: AppLocale
    @State private var vendor: String
    @State private var dateText: String
    @State private var totalText: String
    @State private var currency: String
    @State private var items: [EditableItem]
    @State private var isSaving = false
    @State private var isSavingAndSplitting = false
    @State private var categories: [Category] = []
    @State private var assignedCategoryId: String?

    init(
        draft: OcrDraft,
        onConfirm: @escaping (Receipt) -> Void,
        onSplit: ((Receipt) -> Void)? = nil,
        onCancel: @escaping () -> Void
    ) {
        self.draft = draft
        self.onConfirm = onConfirm
        self.onSplit = onSplit
        self.onCancel = onCancel

        let d = draft.data
        _vendor = State(initialValue: d?.merchant ?? "")
        _dateText = State(initialValue: d?.date ?? todayYmd())
        _totalText = State(initialValue: d.flatMap { $0.total.map { String($0) } } ?? "")
        _currency = State(initialValue: d?.currency ?? "PLN")
        _items = State(initialValue: (d?.items ?? []).map { EditableItem(from: $0) })
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: Theme.Spacing.md) {
                    NBTextField(label: locale.t("ocrConfirm.vendor"), text: $vendor, placeholder: locale.t("ocrConfirm.vendorPh"))
                    NBTextField(label: locale.t("ocrConfirm.dateLabel"), text: $dateText, placeholder: "2026-04-23", keyboardType: .numbersAndPunctuation, autocapitalization: .never)
                    HStack(spacing: Theme.Spacing.sm) {
                        NBTextField(label: locale.t("ocrConfirm.total"), text: $totalText, placeholder: "0.00", keyboardType: .decimalPad)
                        NBTextField(label: locale.t("ocrConfirm.currency"), text: $currency, placeholder: "PLN", autocapitalization: .characters)
                            .frame(width: 120)
                    }

                    categoryPicker

                    VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
                        HStack {
                            NBEyebrow(text: "\(locale.t("ocrConfirm.itemsEyebrow")) (\(items.count))")
                            Spacer()
                            Button {
                                items.append(EditableItem())
                            } label: {
                                Label(locale.t("ocrConfirm.add"), systemImage: "plus")
                                    .font(AppFont.mono(11))
                                    .foregroundColor(Theme.foreground)
                            }
                        }
                        if items.isEmpty {
                            Text(locale.t("ocrConfirm.noItems"))
                                .font(AppFont.caption)
                                .foregroundColor(Theme.mutedForeground)
                        } else {
                            ForEach($items) { $item in
                                itemEditor($item)
                            }
                        }
                    }

                    Button {
                        Task { await save() }
                    } label: {
                        Text(isSaving ? locale.t("ocrConfirm.saving") : locale.t("ocrConfirm.save"))
                    }
                    .buttonStyle(NBPrimaryButtonStyle())
                    .disabled(isSaving || isSavingAndSplitting)

                    if onSplit != nil {
                        Button {
                            Task { await saveAndSplit() }
                        } label: {
                            Label(
                                isSavingAndSplitting ? locale.t("ocrConfirm.saving") : locale.t("quickSplit.fromReceipt"),
                                systemImage: "person.2"
                            )
                            .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(NBSecondaryButtonStyle())
                        .disabled(isSaving || isSavingAndSplitting)
                    }
                }
                .padding(Theme.Spacing.md)
            }
            .background(Theme.background)
            .navigationTitle(locale.t("ocrConfirm.title"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(locale.t("ocrConfirm.discard"), role: .destructive) {
                        Task { await discard() }
                    }
                }
            }
        }
        .task(loadCategories)
    }

    private var categoryPicker: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.xxs) {
            Text(locale.t("ocrConfirm.categoryLabel"))
                .font(AppFont.bodyMedium)
                .foregroundColor(Theme.foreground)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    categoryChip(id: nil, label: locale.t("ocrConfirm.categoryNone"), icon: "questionmark.circle")
                    ForEach(categories) { cat in
                        categoryChip(id: cat.id, label: cat.name, icon: cat.icon ?? "folder.fill")
                    }
                }
            }
            Text(locale.t("ocrConfirm.categoryHint"))
                .font(AppFont.caption)
                .foregroundColor(Theme.mutedForeground)
        }
    }

    private func categoryChip(id: String?, label: String, icon: String) -> some View {
        let isSelected = assignedCategoryId == id
        return Button {
            assignedCategoryId = id
        } label: {
            HStack(spacing: 6) {
                categoryIcon(icon: icon)
                Text(label)
                    .font(AppFont.caption)
                    .foregroundColor(isSelected ? Theme.background : Theme.foreground)
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background(isSelected ? Theme.foreground : Theme.card)
            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.sm))
            .overlay(
                RoundedRectangle(cornerRadius: Theme.Radius.sm)
                    .stroke(Theme.foreground, lineWidth: Theme.Border.widthThin)
            )
        }
        .buttonStyle(.plain)
    }

    @ViewBuilder
    private func categoryIcon(icon: String) -> some View {
        if icon.count == 1 || icon.unicodeScalars.first?.properties.isEmoji == true {
            Text(icon)
                .font(.system(size: 13))
        } else {
            Image(systemName: icon)
                .font(.system(size: 12))
        }
    }

    @Sendable private func loadCategories() async {
        if let bundle = try? await SettingsRepo.fetch() {
            self.categories = bundle.categories.sorted { $0.name < $1.name }
        }
    }

    private func itemEditor(_ item: Binding<EditableItem>) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
            HStack(alignment: .top) {
                TextField(locale.t("ocrConfirm.itemName"), text: item.name)
                    .font(AppFont.bodyMedium)
                    .textInputAutocapitalization(.sentences)
                Spacer()
                Button(role: .destructive) {
                    if let idx = items.firstIndex(where: { $0.id == item.wrappedValue.id }) {
                        items.remove(at: idx)
                    }
                } label: {
                    Image(systemName: "trash")
                        .foregroundColor(Theme.destructive)
                }
                .buttonStyle(.plain)
            }
            HStack(spacing: Theme.Spacing.xs) {
                TextField(locale.t("ocrConfirm.qty"), text: item.quantityText)
                    .keyboardType(.decimalPad)
                    .font(AppFont.caption)
                    .frame(width: 70)
                    .padding(.horizontal, 8).padding(.vertical, 6)
                    .background(Theme.card)
                    .overlay(RoundedRectangle(cornerRadius: Theme.Radius.sm).stroke(Theme.foreground, lineWidth: Theme.Border.widthThin))
                Text("×").foregroundColor(Theme.mutedForeground)
                TextField(locale.t("ocrConfirm.price"), text: item.priceText)
                    .keyboardType(.decimalPad)
                    .font(AppFont.caption)
                    .padding(.horizontal, 8).padding(.vertical, 6)
                    .background(Theme.card)
                    .overlay(RoundedRectangle(cornerRadius: Theme.Radius.sm).stroke(Theme.foreground, lineWidth: Theme.Border.widthThin))
            }
            // Per-item category picker
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 4) {
                    itemCategoryChip(item: item, catId: nil, label: "—", icon: "questionmark.circle")
                    ForEach(categories) { cat in
                        itemCategoryChip(item: item, catId: cat.id, label: cat.name, icon: cat.icon ?? "folder.fill")
                    }
                }
            }
        }
        .padding(Theme.Spacing.sm)
        .nbCard(radius: Theme.Radius.sm, shadow: Theme.Shadow.sm)
    }

    private func itemCategoryChip(item: Binding<EditableItem>, catId: String?, label: String, icon: String) -> some View {
        let isSelected = item.wrappedValue.categoryId == catId
        return Button {
            item.wrappedValue.categoryId = catId
        } label: {
            HStack(spacing: 4) {
                categoryIcon(icon: icon)
                Text(label)
                    .font(AppFont.mono(10))
                    .lineLimit(1)
                    .foregroundColor(isSelected ? Theme.background : Theme.mutedForeground)
            }
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(isSelected ? Theme.foreground : Theme.muted)
            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.sm))
        }
        .buttonStyle(.plain)
    }

    /// The backend already saved a row during the OCR upload. To "keep" the
    /// scanned receipt we push the user-edited fields via PUT items + rely on
    /// the list refresh for the header fields we can't update yet. As a
    /// pragmatic shortcut we just refetch the detail and treat that as the
    /// saved state — any vendor/date/total edits in this sheet are purely
    /// local until a future header-edit endpoint lands.
    private func save() async {
        isSaving = true
        defer { isSaving = false }
        do {
            let refreshed = try await persistEdits()
            onConfirm(refreshed)
            dismiss()
        } catch {
            toast.error(locale.t("ocrConfirm.saveFailed"), description: error.localizedDescription)
        }
    }

    private func saveAndSplit() async {
        guard let onSplit else { return }
        isSavingAndSplitting = true
        defer { isSavingAndSplitting = false }
        do {
            let refreshed = try await persistEdits()
            onSplit(refreshed)
            dismiss()
        } catch {
            toast.error(locale.t("ocrConfirm.saveFailed"), description: error.localizedDescription)
        }
    }

    private func persistEdits() async throws -> Receipt {
        let payload = items.compactMap { $0.asReceiptItem(defaultCategoryId: assignedCategoryId) }
        if !payload.isEmpty {
            try await ReceiptsRepo.updateItems(receiptId: draft.receiptId, items: payload)
        }
        return try await ReceiptsRepo.detail(id: draft.receiptId)
    }

    private func discard() async {
        do {
            try await ReceiptsRepo.delete(id: draft.receiptId)
            onCancel()
            dismiss()
        } catch {
            toast.error(locale.t("ocrConfirm.discardFailed"), description: error.localizedDescription)
        }
    }
}

struct EditableItem: Identifiable {
    let id = UUID()
    var name: String = ""
    var quantityText: String = ""
    var priceText: String = ""
    var categoryId: String?

    init() {}

    init(from ocr: OcrItem) {
        self.name = ocr.name
        self.categoryId = ocr.categoryId
        if let q = ocr.quantity { self.quantityText = String(q) }
        if let p = ocr.price { self.priceText = String(p) }
    }

    func asReceiptItem(defaultCategoryId: String? = nil) -> ReceiptItem? {
        let trimmed = name.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty else { return nil }
        let qty = Double(quantityText.replacingOccurrences(of: ",", with: "."))
        let price = Double(priceText.replacingOccurrences(of: ",", with: "."))
        let resolvedCategory = categoryId ?? defaultCategoryId
        return ReceiptItem(
            id: nil,
            name: trimmed,
            nameTranslated: nil,
            quantity: qty,
            price: price.map { MoneyString($0) },
            unitPrice: price.map { MoneyString($0) },
            totalPrice: price.map { MoneyString($0 * (qty ?? 1)) },
            categoryId: resolvedCategory
        )
    }
}

private func todayYmd() -> String {
    let df = DateFormatter()
    df.dateFormat = "yyyy-MM-dd"
    return df.string(from: Date())
}

// MARK: - Camera bridge (UIImagePickerController)

struct CameraPicker: UIViewControllerRepresentable {
    let onImage: (UIImage) -> Void

    func makeUIViewController(context: Context) -> UIImagePickerController {
        let picker = UIImagePickerController()
        picker.sourceType = UIImagePickerController.isSourceTypeAvailable(.camera) ? .camera : .photoLibrary
        picker.allowsEditing = false
        picker.delegate = context.coordinator
        return picker
    }

    func updateUIViewController(_ uiViewController: UIImagePickerController, context: Context) {}

    func makeCoordinator() -> Coordinator { Coordinator(onImage: onImage) }

    final class Coordinator: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
        let onImage: (UIImage) -> Void
        init(onImage: @escaping (UIImage) -> Void) { self.onImage = onImage }
        func imagePickerController(_ picker: UIImagePickerController, didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
            if let image = info[.originalImage] as? UIImage {
                onImage(image)
            }
            picker.dismiss(animated: true)
        }
        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
            picker.dismiss(animated: true)
        }
    }
}
