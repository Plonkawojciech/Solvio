import SwiftUI

/// CRUD manager for expense categories. Edit renames + icon change;
/// delete is blocked for default categories server-side (we still show
/// the button — backend returns 400 which surfaces via toast).
struct CategoriesManagerView: View {
    @EnvironmentObject private var toast: ToastCenter
    @EnvironmentObject private var locale: AppLocale
    @StateObject private var vm = CategoriesManagerViewModel()
    @State private var showCreate = false
    @State private var editingCategory: Category?

    var body: some View {
        ZStack(alignment: .bottomTrailing) {
            ScrollView {
                VStack(alignment: .leading, spacing: Theme.Spacing.md) {
                    NBScreenHeader(eyebrow: locale.t("categories.headerEyebrow"), title: locale.t("categories.headerTitle"), subtitle: String(format: locale.t("categories.totalFmt"), vm.categories.count))
                    if vm.isLoading && vm.categories.isEmpty {
                        NBLoadingCard()
                    } else if let message = vm.errorMessage {
                        NBErrorCard(message: message) { Task { await vm.load() } }
                    } else if vm.categories.isEmpty {
                        NBEmptyState(
                            systemImage: "folder.fill",
                            title: locale.t("categories.emptyTitle"),
                            subtitle: locale.t("categories.emptySubtitle"),
                            action: (label: locale.t("categories.new"), run: { showCreate = true })
                        )
                    } else {
                        LazyVStack(spacing: Theme.Spacing.xs) {
                            ForEach(vm.categories) { c in
                                Button { editingCategory = c } label: {
                                    row(c)
                                }
                                .buttonStyle(.plain)
                                .contextMenu {
                                    Button(locale.t("common.delete"), role: .destructive) {
                                        Task {
                                            do {
                                                try await CategoriesRepo.delete(id: c.id)
                                                toast.success(locale.t("categories.deleted"))
                                                await vm.load()
                                            } catch {
                                                toast.error(locale.t("categories.deleteFailed"), description: error.localizedDescription)
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                    Spacer(minLength: 96)
                }
                .padding(.horizontal, Theme.Spacing.md)
                .padding(.top, Theme.Spacing.md)
            }
            .background(Theme.background)
            .refreshable { await vm.load() }
            .task { if vm.categories.isEmpty { await vm.load() } }

            Button { showCreate = true } label: {
                Image(systemName: "plus")
                    .font(.system(size: 22, weight: .bold))
                    .foregroundColor(Theme.background)
                    .frame(width: 56, height: 56)
                    .background(Theme.foreground)
                    .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.md))
                    .overlay(RoundedRectangle(cornerRadius: Theme.Radius.md).stroke(Theme.foreground, lineWidth: Theme.Border.width))
                    .nbShadow(Theme.Shadow.md)
            }
            .buttonStyle(.plain)
            .padding(.trailing, Theme.Spacing.md)
            .padding(.bottom, Theme.Spacing.md)
        }
        .sheet(isPresented: $showCreate) {
            CategoryEditSheet(category: nil) { name, icon in
                Task {
                    do {
                        _ = try await CategoriesRepo.create(.init(name: name, icon: icon))
                        toast.success(locale.t("categories.created"))
                        await vm.load()
                    } catch {
                        toast.error(locale.t("categories.createFailed"), description: error.localizedDescription)
                    }
                }
            }
            .environmentObject(locale)
        }
        .sheet(item: $editingCategory) { cat in
            CategoryEditSheet(category: cat) { name, icon in
                Task {
                    do {
                        try await CategoriesRepo.update(.init(id: cat.id, name: name, icon: icon))
                        toast.success(locale.t("categories.updated"))
                        await vm.load()
                    } catch {
                        toast.error(locale.t("categories.updateFailed"), description: error.localizedDescription)
                    }
                }
            }
            .environmentObject(locale)
        }
    }

    private func row(_ c: Category) -> some View {
        HStack(spacing: Theme.Spacing.sm) {
            NBIconBadge(systemImage: c.icon ?? "folder.fill")
            VStack(alignment: .leading, spacing: 2) {
                Text(c.name)
                    .font(AppFont.bodyMedium)
                    .foregroundColor(Theme.foreground)
                if c.isDefault == true {
                    Text(locale.t("categories.default"))
                        .font(AppFont.caption)
                        .foregroundColor(Theme.mutedForeground)
                }
            }
            Spacer()
            Image(systemName: "pencil").foregroundColor(Theme.mutedForeground)
        }
        .padding(Theme.Spacing.sm)
        .nbCard(radius: Theme.Radius.md, shadow: Theme.Shadow.sm)
    }
}

@MainActor
final class CategoriesManagerViewModel: ObservableObject {
    @Published var categories: [Category] = []
    @Published var isLoading = false
    @Published var errorMessage: String?

    func load() async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            let bundle = try await SettingsRepo.fetch()
            categories = bundle.categories
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

struct CategoryEditSheet: View {
    let category: Category?
    let onSave: (String, String?) -> Void
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var locale: AppLocale

    @State private var name: String = ""
    @State private var icon: String = ""

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: Theme.Spacing.md) {
                    NBTextField(label: locale.t("categories.name"), text: $name, placeholder: locale.t("categories.namePlaceholder"))
                    NBTextField(label: locale.t("categories.iconLabel"), text: $icon, placeholder: locale.t("categories.iconPlaceholder"), autocapitalization: .never)
                    if !icon.isEmpty {
                        HStack {
                            Text(locale.t("categories.preview"))
                                .font(AppFont.caption)
                                .foregroundColor(Theme.mutedForeground)
                            Spacer()
                            NBIconBadge(systemImage: icon)
                        }
                        .padding(.top, 8)
                    }
                }
                .padding(Theme.Spacing.md)
            }
            .background(Theme.background)
            .navigationTitle(category == nil ? locale.t("categories.new") : locale.t("categories.editTitle"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button(locale.t("common.cancel")) { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button(locale.t("common.save")) {
                        onSave(name, icon.isEmpty ? nil : icon)
                        dismiss()
                    }
                    .disabled(name.isEmpty)
                }
            }
        }
        .onAppear {
            if let c = category {
                name = c.name
                icon = c.icon ?? ""
            }
        }
    }
}
