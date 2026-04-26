import SwiftUI
import CoreLocation

/// "Okazje" — shopping intelligence hub. Replaces what used to live as
/// the Products / Stores / Deals tabs inside SavingsHubView and lifts
/// it into a dedicated bottom-nav slot.
///
/// Layout:
///   1. **Header**       — eyebrow OKAZJE + brand line.
///   2. **Trendy**       — top 3 personalised promotions (cards).
///   3. **Lista zakupów AI** — type a shopping list, AI returns the
///       best single store and per-item prices.
///   4. **Launcher**     — 4 large tiles linking to the existing
///       feature views (`PricesView`, `NearbyStoresView`, `AuditView`,
///       `ShoppingAdvisorView`) via `AppRoute.more(...)`.
///
/// Existing feature views are NOT duplicated — they keep their own
/// implementations and the hub just wires deep-links to them. Trending
/// promotions are pulled from `AppDataStore.promotions` (already
/// prefetched on login by Round 5b).
struct OkazjeHubView: View {
    @EnvironmentObject private var router: AppRouter
    @EnvironmentObject private var locale: AppLocale
    @EnvironmentObject private var toast: ToastCenter
    @EnvironmentObject private var store: AppDataStore

    @StateObject private var shoppingVM = ShoppingListVM()

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Theme.Spacing.lg) {
                header
                trendySection
                shoppingListSection
                launcherSection
                Spacer(minLength: Theme.Spacing.xl)
            }
            .padding(.horizontal, Theme.Spacing.md)
            .padding(.top, Theme.Spacing.md)
        }
        .background(Theme.background)
        .navigationTitle(locale.t("deals.navTitle"))
        .navigationBarTitleDisplayMode(.inline)
        .task {
            store.ensurePromotions()
            shoppingVM.bind(locale: locale, store: store)
        }
        .refreshable {
            await store.awaitPromotions(force: true)
        }
    }

    // MARK: - Header

    private var header: some View {
        NBScreenHeader(
            eyebrow: locale.t("deals.eyebrow"),
            title: locale.t("deals.headerTitle"),
            subtitle: locale.t("deals.headerSubtitle")
        )
    }

    // MARK: - Trending promotions

    @ViewBuilder
    private var trendySection: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
            HStack {
                NBSectionHeader(
                    eyebrow: locale.t("deals.trendingEyebrow"),
                    title: locale.t("deals.trendingTitle")
                )
                Spacer()
                if store.promotionsLoading && store.promotions == nil {
                    ProgressView().scaleEffect(0.8)
                }
            }
            if let promos = store.promotions {
                let visible = (promos.personalizedDeals + promos.promotions).prefix(3)
                if visible.isEmpty {
                    NBEmptyState(
                        systemImage: "sparkles",
                        title: locale.t("deals.trendingEmpty"),
                        subtitle: locale.t("deals.trendingEmptySub"),
                        action: nil
                    )
                } else {
                    VStack(spacing: Theme.Spacing.xs) {
                        ForEach(Array(visible)) { offer in
                            trendingCard(offer)
                        }
                    }
                }
            } else if store.promotionsLoading {
                NBSkeletonList(rows: 2)
            } else if let err = store.promotionsError {
                NBErrorCard(message: err) {
                    Task { await store.awaitPromotions(force: true) }
                }
            }
        }
    }

    /// Compact promo card — product / store / discount / validity.
    /// Tapping opens the leaflet URL if the offer carries one. We keep
    /// this lighter than the verbose card on the old Savings deals tab —
    /// users land here for triage, then go deeper when something
    /// catches their eye.
    private func trendingCard(_ offer: PromoOffer) -> some View {
        HStack(alignment: .top, spacing: Theme.Spacing.sm) {
            ZStack {
                RoundedRectangle(cornerRadius: Theme.Radius.sm)
                    .fill(Theme.foreground.opacity(0.08))
                Image(systemName: "tag.fill")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundColor(Theme.foreground)
            }
            .frame(width: 40, height: 40)

            VStack(alignment: .leading, spacing: 4) {
                Text(offer.productName ?? offer.store ?? "—")
                    .font(AppFont.bodyMedium)
                    .foregroundColor(Theme.foreground)
                    .lineLimit(2)
                if let s = offer.store, !s.isEmpty, offer.productName != nil {
                    Text(s)
                        .font(AppFont.caption)
                        .foregroundColor(Theme.mutedForeground)
                }
                HStack(spacing: 6) {
                    if let promo = offer.promoPrice {
                        Text(Fmt.amount(promo, currency: offer.currency ?? "PLN"))
                            .font(AppFont.monoBold(13))
                            .foregroundColor(Theme.foreground)
                    }
                    if let reg = offer.regularPrice, let promo = offer.promoPrice, reg > promo {
                        Text(Fmt.amount(reg, currency: offer.currency ?? "PLN"))
                            .font(AppFont.mono(10))
                            .strikethrough()
                            .foregroundColor(Theme.mutedForeground)
                    }
                    if let discount = offer.discount, !discount.isEmpty {
                        NBTag(
                            text: discount,
                            background: Theme.success.opacity(0.15),
                            foreground: Theme.success
                        )
                    }
                    if let valid = offer.validUntil, !valid.isEmpty {
                        Text(String(format: locale.t("deals.validUntilFmt"), Fmt.date(valid)))
                            .font(AppFont.mono(10))
                            .foregroundColor(Theme.mutedForeground)
                    }
                }
            }

            Spacer(minLength: 0)

            if let leaflet = offer.leafletUrl ?? offer.dealUrl, let url = URL(string: leaflet) {
                Button {
                    UIApplication.shared.open(url)
                } label: {
                    Image(systemName: "arrow.up.right.square")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundColor(Theme.foreground)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(Theme.Spacing.sm)
        .frame(maxWidth: .infinity, alignment: .leading)
        .nbCard(radius: Theme.Radius.md, shadow: Theme.Shadow.sm)
    }

    // MARK: - Shopping list AI

    private var shoppingListSection: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
            NBSectionHeader(
                eyebrow: locale.t("shoppingList.eyebrow"),
                title: locale.t("shoppingList.title")
            )
            Text(locale.t("shoppingList.subtitle"))
                .font(AppFont.caption)
                .foregroundColor(Theme.mutedForeground)
                .fixedSize(horizontal: false, vertical: true)

            // Editable list of items
            VStack(spacing: Theme.Spacing.xs) {
                ForEach($shoppingVM.items) { $item in
                    shoppingRow($item)
                }
                Button {
                    shoppingVM.addRow()
                } label: {
                    HStack(spacing: 4) {
                        Image(systemName: "plus")
                            .font(.system(size: 11, weight: .semibold))
                        Text(locale.t("shoppingList.addRow"))
                            .font(AppFont.mono(11))
                            .tracking(0.5)
                            .textCase(.uppercase)
                    }
                    .foregroundColor(Theme.foreground)
                }
                .buttonStyle(.plain)
                .frame(maxWidth: .infinity, alignment: .leading)
            }

            // Location toggle — when on, we send lat/lng to backend
            // so it can prefer nearby chains. Custom row so the whole
            // thing is tappable (native SwiftUI Toggle's hit area is
            // limited to the switch itself; users hitting the label
            // got nothing). The Toggle still drives `isOn` so iOS
            // accessibility/voice-over keeps working.
            Button {
                shoppingVM.useLocation.toggle()
            } label: {
                HStack(spacing: 8) {
                    Text(locale.t("shoppingList.useLocation"))
                        .font(AppFont.bodyMedium)
                        .foregroundColor(Theme.foreground)
                    Spacer()
                    Toggle("", isOn: $shoppingVM.useLocation)
                        .labelsHidden()
                        .tint(Theme.foreground)
                        .allowsHitTesting(false)
                }
                .contentShape(Rectangle())
                .padding(.vertical, 4)
            }
            .buttonStyle(.plain)

            Button {
                Task { await shoppingVM.optimize() }
            } label: {
                HStack(spacing: 6) {
                    if shoppingVM.isLoading { ProgressView().tint(Theme.background) }
                    Text(shoppingVM.isLoading
                         ? locale.t("shoppingList.analyzing")
                         : locale.t("shoppingList.optimize"))
                }
            }
            .buttonStyle(NBPrimaryButtonStyle())
            .disabled(shoppingVM.isLoading || !shoppingVM.canSubmit)

            // While the AI thinks, show a stage-cycling progress card so
            // the user can tell the request is still alive (a bare button
            // spinner during a 12-15s call feels broken). Stage labels
            // are cosmetic — they cycle on a timer, not tied to backend
            // progress (the route doesn't report it).
            //
            // ETA: 30s. Real Vercel cold-start with web_search_preview
            // can take 50s+, but the bar caps at 95% so we'd rather be
            // visibly almost-done than under-estimate at 14s and have
            // the bar pegged for a minute.
            if shoppingVM.isLoading {
                NBProgressCard(
                    title: locale.t("shoppingList.progressTitle"),
                    stages: [
                        locale.t("shoppingList.stageLeaflets"),
                        locale.t("shoppingList.stagePrices"),
                        locale.t("shoppingList.stageCompare"),
                        locale.t("shoppingList.stageFinalize"),
                    ],
                    estimatedSeconds: 30
                )
            }

            if let err = shoppingVM.error {
                NBErrorCard(message: err) {
                    Task { await shoppingVM.optimize() }
                }
            }

            if let result = shoppingVM.result {
                shoppingResultCard(result)
            }
        }
        .padding(Theme.Spacing.md)
        .frame(maxWidth: .infinity, alignment: .leading)
        .nbCard(radius: Theme.Radius.lg, shadow: Theme.Shadow.lg)
    }

    private func shoppingRow(_ item: Binding<ShoppingItemDraft>) -> some View {
        HStack(spacing: Theme.Spacing.xs) {
            // Submit-on-Return adds a new empty row and (best-effort)
            // moves focus to it. Without this, a user typing "milk →
            // Return" on the last row got nothing — no new row, no
            // submit, and the keyboard stayed open with no "Done"
            // affordance. Enter-to-add-row matches the user's mental
            // model from web shopping lists.
            TextField(locale.t("shoppingList.itemPlaceholder"), text: item.name)
                .font(AppFont.body)
                .submitLabel(.next)
                .onSubmit {
                    let trimmed = item.wrappedValue.name.trimmingCharacters(in: .whitespaces)
                    guard !trimmed.isEmpty else { return }
                    if shoppingVM.items.last?.id == item.wrappedValue.id {
                        shoppingVM.addRow()
                    }
                }
                .padding(.horizontal, Theme.Spacing.sm)
                .frame(height: 38)
                .background(Theme.card)
                .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.sm))
                .overlay(
                    RoundedRectangle(cornerRadius: Theme.Radius.sm)
                        .stroke(Theme.foreground, lineWidth: Theme.Border.widthThin)
                )
            TextField(
                locale.t("shoppingList.qtyPlaceholder"),
                text: item.qtyText
            )
                .keyboardType(.decimalPad)
                .font(AppFont.mono(13))
                .multilineTextAlignment(.center)
                .frame(width: 56, height: 38)
                .background(Theme.card)
                .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.sm))
                .overlay(
                    RoundedRectangle(cornerRadius: Theme.Radius.sm)
                        .stroke(Theme.foreground, lineWidth: Theme.Border.widthThin)
                )
            Button {
                shoppingVM.remove(id: item.wrappedValue.id)
            } label: {
                Image(systemName: "minus.circle")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundColor(Theme.mutedForeground)
            }
            .buttonStyle(.plain)
            .disabled(shoppingVM.items.count <= 1)
        }
    }

    /// Compact result card showing best-store recommendation, total +
    /// savings, and an expandable per-item breakdown. Mirrors the visual
    /// hierarchy of the audit summary card on the old hub.
    private func shoppingResultCard(_ r: ShoppingOptimizeResult) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 2) {
                    NBEyebrow(text: locale.t("shoppingList.bestStoreEyebrow"))
                    Text(r.bestStore)
                        .font(AppFont.cardTitle)
                        .foregroundColor(Theme.foreground)
                    if let address = r.bestStoreAddress, !address.isEmpty {
                        Text(address)
                            .font(AppFont.caption)
                            .foregroundColor(Theme.mutedForeground)
                    }
                }
                Spacer()
                NBIconBadge(systemImage: "checkmark.seal.fill", tint: Theme.success, size: 36)
            }

            HStack(spacing: Theme.Spacing.md) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(locale.t("shoppingList.totalLabel"))
                        .font(AppFont.mono(10))
                        .tracking(1)
                        .foregroundColor(Theme.mutedForeground)
                    Text(Fmt.amount(r.bestTotal, currency: r.currency))
                        .font(AppFont.amount)
                        .foregroundColor(Theme.foreground)
                }
                Spacer()
                if let savings = r.savings, savings > 0 {
                    VStack(alignment: .trailing, spacing: 2) {
                        Text(locale.t("shoppingList.savingsLabel"))
                            .font(AppFont.mono(10))
                            .tracking(1)
                            .foregroundColor(Theme.mutedForeground)
                        Text(Fmt.amount(savings, currency: r.currency))
                            .font(AppFont.bodyMedium)
                            .foregroundColor(Theme.success)
                    }
                }
            }

            if let summary = r.summary, !summary.isEmpty {
                NBDivider()
                Text(summary)
                    .font(AppFont.body)
                    .foregroundColor(Theme.foreground)
                    .fixedSize(horizontal: false, vertical: true)
            }

            if !r.bestStoreItems.isEmpty {
                NBDivider()
                VStack(spacing: 0) {
                    ForEach(Array(r.bestStoreItems.enumerated()), id: \.offset) { idx, line in
                        HStack {
                            Text(line.name)
                                .font(AppFont.body)
                                .foregroundColor(Theme.foreground)
                                .lineLimit(1)
                            if let qty = line.qty, qty > 0 {
                                Text(String(format: "× %g", qty))
                                    .font(AppFont.mono(11))
                                    .foregroundColor(Theme.mutedForeground)
                            }
                            Spacer()
                            Text(Fmt.amount(line.total, currency: r.currency))
                                .font(AppFont.mono(13))
                                .foregroundColor(Theme.foreground)
                        }
                        .padding(.vertical, 6)
                        if idx < r.bestStoreItems.count - 1 {
                            Rectangle()
                                .fill(Theme.foreground.opacity(0.08))
                                .frame(height: 1)
                        }
                    }
                }
            }

            if !r.alternatives.isEmpty {
                NBDivider()
                Text(locale.t("shoppingList.alternativesTitle"))
                    .font(AppFont.bodyMedium)
                    .foregroundColor(Theme.foreground)
                VStack(spacing: 6) {
                    ForEach(Array(r.alternatives.enumerated()), id: \.offset) { _, alt in
                        HStack {
                            Text(alt.store)
                                .font(AppFont.body)
                                .foregroundColor(Theme.foreground)
                            Spacer()
                            Text(Fmt.amount(alt.total, currency: r.currency))
                                .font(AppFont.mono(12))
                                .foregroundColor(Theme.mutedForeground)
                        }
                    }
                }
            }

            if let tip = r.tip, !tip.isEmpty {
                HStack(alignment: .top, spacing: Theme.Spacing.sm) {
                    NBIconBadge(systemImage: "lightbulb.fill", tint: Theme.warning)
                    Text(tip)
                        .font(AppFont.caption)
                        .foregroundColor(Theme.foreground)
                        .fixedSize(horizontal: false, vertical: true)
                    Spacer(minLength: 0)
                }
                .padding(Theme.Spacing.sm)
                .background(Theme.warning.opacity(0.08))
                .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.md))
                .overlay(
                    RoundedRectangle(cornerRadius: Theme.Radius.md)
                        .stroke(Theme.warning, lineWidth: Theme.Border.widthThin)
                )
            }

            // Freshness footer — show the timestamp the prices were
            // fetched at, plus a tag for the cache state. Helps the
            // user trust (or distrust) the numbers without us having
            // to write "live data" copy somewhere.
            freshnessFooter(for: r)
        }
        .padding(Theme.Spacing.md)
        .frame(maxWidth: .infinity, alignment: .leading)
        .nbCard(radius: Theme.Radius.md, shadow: Theme.Shadow.sm)
    }

    @ViewBuilder
    private func freshnessFooter(for r: ShoppingOptimizeResult) -> some View {
        if let iso = r.fetchedAt, let date = iso8601(iso) {
            HStack(spacing: 6) {
                Image(systemName: "clock")
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundColor(Theme.mutedForeground)
                Text(String(format: locale.t("shoppingList.asOfFmt"), Self.formatTime(date)))
                    .font(AppFont.mono(10))
                    .foregroundColor(Theme.mutedForeground)
                if let state = r.cacheState {
                    NBTag(
                        text: cacheStateLabel(state),
                        background: cacheStateColor(state).opacity(0.15),
                        foreground: cacheStateColor(state)
                    )
                }
                Spacer()
            }
            .padding(.top, 4)
        }
    }

    private func iso8601(_ s: String) -> Date? {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f.date(from: s) ?? ISO8601DateFormatter().date(from: s)
    }

    private static func formatTime(_ d: Date) -> String {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd HH:mm"
        return f.string(from: d)
    }

    private func cacheStateLabel(_ state: String) -> String {
        switch state {
        case "fresh": return locale.t("shoppingList.cacheFresh")
        case "stale": return locale.t("shoppingList.cacheStale")
        default:      return locale.t("shoppingList.cacheLive")
        }
    }

    private func cacheStateColor(_ state: String) -> Color {
        switch state {
        case "fresh": return Theme.success
        case "stale": return Theme.warning
        default:      return Theme.foreground
        }
    }

    // MARK: - Launcher tiles

    private var launcherSection: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
            NBSectionHeader(
                eyebrow: locale.t("deals.toolsEyebrow"),
                title: locale.t("deals.toolsTitle")
            )
            VStack(spacing: Theme.Spacing.xs) {
                launcherTile(
                    icon: "magnifyingglass",
                    title: locale.t("nav.productSearch"),
                    subtitle: locale.t("deals.productsSub"),
                    route: .productSearch
                )
                launcherTile(
                    icon: "mappin.and.ellipse",
                    title: locale.t("nav.nearbyStores"),
                    subtitle: locale.t("deals.storesSub"),
                    route: .nearbyStores
                )
                launcherTile(
                    icon: "magnifyingglass.circle.fill",
                    title: locale.t("nav.audit"),
                    subtitle: locale.t("deals.auditSub"),
                    route: .audit
                )
                launcherTile(
                    icon: "tag.fill",
                    title: locale.t("nav.prices"),
                    subtitle: locale.t("deals.pricesSub"),
                    route: .prices
                )
                launcherTile(
                    icon: "cart.badge.questionmark",
                    title: locale.t("nav.shoppingAdvisor"),
                    subtitle: locale.t("deals.advisorSub"),
                    route: .shoppingAdvisor
                )
            }
        }
    }

    private func launcherTile(icon: String, title: String, subtitle: String, route: MoreRoute) -> some View {
        Button {
            router.dealsStack.append(AppRoute.more(route))
        } label: {
            HStack(spacing: Theme.Spacing.sm) {
                ZStack {
                    RoundedRectangle(cornerRadius: Theme.Radius.sm)
                        .fill(Theme.foreground.opacity(0.08))
                    Image(systemName: icon)
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundColor(Theme.foreground)
                }
                .frame(width: 44, height: 44)

                VStack(alignment: .leading, spacing: 2) {
                    Text(title)
                        .font(AppFont.bodyMedium)
                        .foregroundColor(Theme.foreground)
                    Text(subtitle)
                        .font(AppFont.caption)
                        .foregroundColor(Theme.mutedForeground)
                        .lineLimit(2)
                }
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundColor(Theme.mutedForeground)
            }
            .padding(Theme.Spacing.sm)
            .frame(maxWidth: .infinity, alignment: .leading)
            .nbCard(radius: Theme.Radius.md, shadow: Theme.Shadow.sm)
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Shopping list draft model

/// Editable row for the shopping-list builder. Identifiable so SwiftUI's
/// ForEach gets stable identity — re-ordering/removing wouldn't blow
/// away keyboard focus that way.
struct ShoppingItemDraft: Identifiable, Equatable {
    let id = UUID()
    var name: String = ""
    var qtyText: String = "1"
}

// MARK: - Shopping list view-model

/// View-model for the shopping-list AI section. Owns the editable list,
/// drives the optimize() call, and surfaces results / errors. Lives in
/// the same file as the parent view since it's tightly coupled and not
/// reused elsewhere.
@MainActor
final class ShoppingListVM: ObservableObject {
    @Published var items: [ShoppingItemDraft] = [
        ShoppingItemDraft(name: "", qtyText: "1"),
    ]
    @Published var useLocation: Bool = true
    @Published var isLoading: Bool = false
    @Published var error: String?
    @Published var result: ShoppingOptimizeResult?

    private weak var locale: AppLocale?
    private weak var store: AppDataStore?
    private let locationProvider = ShoppingLocationProvider()

    func bind(locale: AppLocale, store: AppDataStore) {
        self.locale = locale
        self.store = store
    }

    var canSubmit: Bool {
        items.contains { !$0.name.trimmingCharacters(in: .whitespaces).isEmpty }
    }

    func addRow() {
        items.append(ShoppingItemDraft(name: "", qtyText: "1"))
    }

    func remove(id: UUID) {
        guard items.count > 1 else { return }
        items.removeAll { $0.id == id }
    }

    func optimize() async {
        guard canSubmit, !isLoading else { return }
        isLoading = true
        error = nil
        defer { isLoading = false }

        let cleanItems: [ShoppingOptimizeRequest.Item] = items.compactMap {
            let name = $0.name.trimmingCharacters(in: .whitespaces)
            guard !name.isEmpty else { return nil }
            let qty = Double($0.qtyText.replacingOccurrences(of: ",", with: ".")) ?? 1
            return ShoppingOptimizeRequest.Item(name: name, quantity: qty)
        }
        guard !cleanItems.isEmpty else { return }

        let lang = locale?.language.rawValue ?? "pl"
        let currency = store?.currency ?? "PLN"

        var lat: Double?
        var lng: Double?
        if useLocation, let location = await locationProvider.fetch() {
            lat = location.coordinate.latitude
            lng = location.coordinate.longitude
        }

        let body = ShoppingOptimizeRequest(
            items: cleanItems,
            lang: lang,
            currency: currency,
            lat: lat,
            lng: lng
        )
        do {
            result = try await ShoppingRepo.optimize(body)
        } catch let apiError as ApiError {
            error = apiError.errorDescription ?? locale?.t("errors.unknown")
        } catch {
            self.error = error.localizedDescription
        }
    }
}

// MARK: - Location helper

/// Small one-shot CLLocationManager wrapper. We only need a single
/// location fix for the shopping optimizer call — no continuous
/// updates, no monitoring, no background. Keeping it local to this
/// feature avoids adding scaffolding to the shared `NearbyStoresView`
/// location code.
///
/// Hard 5s timeout — if the user hasn't responded to the permission
/// prompt or the GPS fix is slow, we fall back to "no location" so
/// the shopping list call never deadlocks. Without this the very
/// first call on a fresh install hung forever.
final class ShoppingLocationProvider: NSObject, CLLocationManagerDelegate {
    private let manager = CLLocationManager()
    private var continuation: CheckedContinuation<CLLocation?, Never>?
    private var timeoutTask: Task<Void, Never>?

    /// Max wait for either a permission decision or a location fix.
    /// 5s is generous for a real device, brutal for a sim with no
    /// stored coordinates — both desirable, since hanging the UI is
    /// strictly worse than skipping the location hint.
    private static let timeoutSeconds: UInt64 = 5

    func fetch() async -> CLLocation? {
        await withCheckedContinuation { (cont: CheckedContinuation<CLLocation?, Never>) in
            self.continuation = cont
            manager.delegate = self

            // Arm a hard timeout regardless of which branch we take —
            // even the "authorized" path occasionally hangs on sim
            // when no coordinate has been set.
            self.timeoutTask = Task { [weak self] in
                try? await Task.sleep(nanoseconds: Self.timeoutSeconds * 1_000_000_000)
                if Task.isCancelled { return }
                await MainActor.run { self?.finish(nil) }
            }

            switch manager.authorizationStatus {
            case .notDetermined:
                manager.requestWhenInUseAuthorization()
            case .authorizedWhenInUse, .authorizedAlways:
                manager.requestLocation()
            default:
                self.finish(nil)
            }
        }
    }

    func locationManagerDidChangeAuthorization(_ m: CLLocationManager) {
        switch m.authorizationStatus {
        case .authorizedWhenInUse, .authorizedAlways:
            m.requestLocation()
        case .denied, .restricted:
            finish(nil)
        default:
            break
        }
    }

    func locationManager(_ m: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        finish(locations.last)
    }

    func locationManager(_ m: CLLocationManager, didFailWithError error: Error) {
        finish(nil)
    }

    private func finish(_ location: CLLocation?) {
        timeoutTask?.cancel()
        timeoutTask = nil
        guard let cont = continuation else { return }
        continuation = nil
        cont.resume(returning: location)
    }
}
