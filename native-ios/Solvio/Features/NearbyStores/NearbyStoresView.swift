import SwiftUI
import CoreLocation
import MapKit

struct NearbyStoresView: View {
    @EnvironmentObject private var locale: AppLocale
    @StateObject private var locationManager = LocationHelper()
    @State private var stores: [NearbyStore] = []
    @State private var isLoading = false
    @State private var errorMessage: String?
    @State private var radius: Double = 3000
    @State private var showKnownOnly = false
    @State private var nearbyBrands: [String] = []

    private var filtered: [NearbyStore] {
        showKnownOnly ? stores.filter { $0.isKnown } : stores
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Theme.Spacing.md) {
                header
                controls
                if locationManager.authStatus == .denied || locationManager.authStatus == .restricted {
                    locationDeniedCard
                } else if isLoading && stores.isEmpty {
                    NBLoadingCard()
                } else if let msg = errorMessage, stores.isEmpty {
                    NBErrorCard(message: msg) { Task { await search() } }
                } else if stores.isEmpty && !isLoading {
                    emptyCard
                } else {
                    statsBar
                    if !nearbyBrands.isEmpty { brandsRow }
                    storesList
                }
                Spacer(minLength: Theme.Spacing.xl)
            }
            .padding(.horizontal, Theme.Spacing.md)
            .padding(.top, Theme.Spacing.md)
        }
        .background(Theme.background)
        .navigationTitle(locale.t("nearby.navTitle"))
        .navigationBarTitleDisplayMode(.inline)
        .task {
            locationManager.request()
            await waitForLocationAndSearch()
        }
        .refreshable { await search() }
    }

    private func waitForLocationAndSearch() async {
        for _ in 0..<30 {
            if locationManager.lastLocation != nil { break }
            try? await Task.sleep(for: .milliseconds(300))
        }
        await search()
    }

    private func search() async {
        guard let loc = locationManager.lastLocation else {
            errorMessage = locale.t("nearby.locationNeededDesc")
            return
        }
        isLoading = true
        errorMessage = nil
        do {
            let lang = locale.language == .pl ? "pl" : "en"
            let response = try await NearbyStoresRepo.search(
                lat: loc.coordinate.latitude,
                lng: loc.coordinate.longitude,
                radius: Int(radius),
                lang: lang
            )
            stores = response.stores
            nearbyBrands = response.nearbyBrands ?? []
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    // MARK: - Header

    private var header: some View {
        NBScreenHeader(
            eyebrow: locale.t("nearby.navTitle").uppercased(),
            title: locale.t("nearby.title"),
            subtitle: locale.t("nearby.subtitle")
        )
    }

    // MARK: - Controls

    private var controls: some View {
        VStack(spacing: Theme.Spacing.sm) {
            HStack {
                Text(locale.t("nearby.radius"))
                    .font(AppFont.caption)
                    .foregroundColor(Theme.mutedForeground)
                Spacer()
                Text(radius >= 1000 ? String(format: "%.1f %@", radius / 1000, locale.t("nearby.km")) : "\(Int(radius)) \(locale.t("nearby.meters"))")
                    .font(AppFont.bodyMedium)
                    .foregroundColor(Theme.foreground)
            }
            Slider(value: $radius, in: 500...15000, step: 500)
                .tint(Theme.foreground)
                .onChange(of: radius) { _ in
                    Task { await search() }
                }
            HStack {
                filterButton(locale.t("nearby.allStores"), active: !showKnownOnly) { showKnownOnly = false }
                filterButton(locale.t("nearby.knownOnly"), active: showKnownOnly) { showKnownOnly = true }
                Spacer()
            }
        }
        .padding(Theme.Spacing.sm)
        .nbCard(radius: Theme.Radius.md, shadow: Theme.Shadow.sm)
    }

    private func filterButton(_ label: String, active: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(label)
                .font(AppFont.caption)
                .foregroundColor(active ? Theme.background : Theme.foreground)
                .padding(.horizontal, Theme.Spacing.sm)
                .padding(.vertical, 6)
                .background(active ? Theme.foreground : Theme.muted)
                .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.sm))
                .overlay(
                    RoundedRectangle(cornerRadius: Theme.Radius.sm)
                        .stroke(Theme.foreground, lineWidth: Theme.Border.widthThin)
                )
        }
        .buttonStyle(.plain)
    }

    // MARK: - Stats

    private var statsBar: some View {
        HStack(spacing: Theme.Spacing.md) {
            statPill(
                icon: "building.2.fill",
                value: "\(filtered.count)",
                label: locale.t("nearby.stores")
            )
            statPill(
                icon: "star.fill",
                value: "\(stores.filter { $0.isKnown }.count)",
                label: locale.t("nearby.knownBrands")
            )
        }
    }

    private func statPill(icon: String, value: String, label: String) -> some View {
        HStack(spacing: 6) {
            Image(systemName: icon)
                .font(.system(size: 14, weight: .bold))
                .foregroundColor(Theme.foreground)
            VStack(alignment: .leading, spacing: 0) {
                Text(value)
                    .font(AppFont.bold(16))
                    .foregroundColor(Theme.foreground)
                Text(label)
                    .font(AppFont.mono(10))
                    .foregroundColor(Theme.mutedForeground)
                    .textCase(.uppercase)
            }
        }
        .padding(Theme.Spacing.sm)
        .frame(maxWidth: .infinity, alignment: .leading)
        .nbCard(radius: Theme.Radius.sm, shadow: Theme.Shadow.sm)
    }

    // MARK: - Brands row

    private var brandsRow: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: Theme.Spacing.xs) {
                ForEach(nearbyBrands, id: \.self) { brand in
                    Text(brand)
                        .font(AppFont.caption)
                        .foregroundColor(Theme.foreground)
                        .padding(.horizontal, Theme.Spacing.sm)
                        .padding(.vertical, 4)
                        .background(Theme.muted)
                        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.sm))
                        .overlay(
                            RoundedRectangle(cornerRadius: Theme.Radius.sm)
                                .stroke(Theme.foreground, lineWidth: Theme.Border.widthThin)
                        )
                }
            }
        }
    }

    // MARK: - List

    private var storesList: some View {
        VStack(spacing: Theme.Spacing.sm) {
            ForEach(filtered) { store in
                storeCard(store)
            }
        }
    }

    private func storeCard(_ store: NearbyStore) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 6) {
                        Text(store.name)
                            .font(AppFont.bodyMedium)
                            .foregroundColor(Theme.foreground)
                        if store.isKnown {
                            Image(systemName: "checkmark.seal.fill")
                                .font(.system(size: 12))
                                .foregroundColor(Theme.success)
                        }
                    }
                    if let cat = store.category {
                        Text(cat)
                            .font(AppFont.caption)
                            .foregroundColor(Theme.mutedForeground)
                    }
                }
                Spacer()
                VStack(alignment: .trailing, spacing: 2) {
                    Text(distanceText(store.distance))
                        .font(AppFont.bold(14))
                        .foregroundColor(Theme.foreground)
                    Text(locale.t("nearby.distance"))
                        .font(AppFont.mono(9))
                        .foregroundColor(Theme.mutedForeground)
                        .textCase(.uppercase)
                }
            }

            if let address = store.address, !address.isEmpty {
                HStack(spacing: 4) {
                    Image(systemName: "mappin")
                        .font(.system(size: 11))
                        .foregroundColor(Theme.mutedForeground)
                    Text([address, store.city].compactMap { $0 }.joined(separator: ", "))
                        .font(AppFont.caption)
                        .foregroundColor(Theme.mutedForeground)
                }
            }

            if let hours = store.openingHours, !hours.isEmpty {
                HStack(spacing: 4) {
                    Image(systemName: "clock")
                        .font(.system(size: 11))
                        .foregroundColor(Theme.mutedForeground)
                    Text(hours)
                        .font(AppFont.caption)
                        .foregroundColor(Theme.mutedForeground)
                }
            }

            HStack(spacing: Theme.Spacing.sm) {
                Button {
                    openMaps(store)
                } label: {
                    Label(locale.t("nearby.navigate"), systemImage: "arrow.triangle.turn.up.right.diamond.fill")
                        .font(AppFont.caption)
                        .foregroundColor(Theme.background)
                        .padding(.horizontal, Theme.Spacing.sm)
                        .padding(.vertical, 6)
                        .background(Theme.foreground)
                        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.sm))
                }
                .buttonStyle(.plain)

                if let phone = store.phone, !phone.isEmpty {
                    Button {
                        if let url = URL(string: "tel:\(phone.replacingOccurrences(of: " ", with: ""))") {
                            UIApplication.shared.open(url)
                        }
                    } label: {
                        Label(locale.t("nearby.phone"), systemImage: "phone.fill")
                            .font(AppFont.caption)
                            .foregroundColor(Theme.foreground)
                            .padding(.horizontal, Theme.Spacing.sm)
                            .padding(.vertical, 6)
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
        }
        .padding(Theme.Spacing.sm)
        .nbCard(radius: Theme.Radius.md, shadow: Theme.Shadow.sm)
    }

    private func distanceText(_ meters: Int) -> String {
        if meters >= 1000 {
            return String(format: "%.1f %@", Double(meters) / 1000, locale.t("nearby.km"))
        }
        return "\(meters) \(locale.t("nearby.meters"))"
    }

    private func openMaps(_ store: NearbyStore) {
        let coordinate = CLLocationCoordinate2D(latitude: store.lat, longitude: store.lng)
        let placemark = MKPlacemark(coordinate: coordinate)
        let mapItem = MKMapItem(placemark: placemark)
        mapItem.name = store.name
        mapItem.openInMaps(launchOptions: [MKLaunchOptionsDirectionsModeKey: MKLaunchOptionsDirectionsModeWalking])
    }

    // MARK: - Empty / Error states

    private var emptyCard: some View {
        VStack(spacing: Theme.Spacing.sm) {
            Image(systemName: "mappin.slash")
                .font(.system(size: 32, weight: .bold))
                .foregroundColor(Theme.mutedForeground)
            Text(locale.t("nearby.noStores"))
                .font(AppFont.bodyMedium)
                .foregroundColor(Theme.foreground)
            Text(locale.t("nearby.noStoresDesc"))
                .font(AppFont.caption)
                .foregroundColor(Theme.mutedForeground)
        }
        .frame(maxWidth: .infinity)
        .padding(Theme.Spacing.lg)
        .nbCard(radius: Theme.Radius.md, shadow: Theme.Shadow.sm)
    }

    private var locationDeniedCard: some View {
        VStack(spacing: Theme.Spacing.sm) {
            Image(systemName: "location.slash.fill")
                .font(.system(size: 32, weight: .bold))
                .foregroundColor(Theme.warning)
            Text(locale.t("nearby.locationNeeded"))
                .font(AppFont.bodyMedium)
                .foregroundColor(Theme.foreground)
            Text(locale.t("nearby.locationNeededDesc"))
                .font(AppFont.caption)
                .foregroundColor(Theme.mutedForeground)
            Button {
                if let url = URL(string: UIApplication.openSettingsURLString) {
                    UIApplication.shared.open(url)
                }
            } label: {
                Text(locale.t("nearby.openSettings"))
                    .font(AppFont.bodyMedium)
                    .foregroundColor(Theme.background)
                    .padding(.horizontal, Theme.Spacing.md)
                    .padding(.vertical, Theme.Spacing.sm)
                    .background(Theme.foreground)
                    .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.sm))
            }
            .buttonStyle(.plain)
        }
        .frame(maxWidth: .infinity)
        .padding(Theme.Spacing.lg)
        .nbCard(radius: Theme.Radius.md, shadow: Theme.Shadow.sm)
    }
}

// MARK: - Location Helper

@MainActor
final class LocationHelper: NSObject, ObservableObject, CLLocationManagerDelegate {
    private let manager = CLLocationManager()
    @Published var lastLocation: CLLocation?
    @Published var authStatus: CLAuthorizationStatus = .notDetermined

    override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyHundredMeters
        authStatus = manager.authorizationStatus
    }

    func request() {
        if manager.authorizationStatus == .notDetermined {
            manager.requestWhenInUseAuthorization()
        } else {
            manager.requestLocation()
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        Task { @MainActor in
            lastLocation = locations.last
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {}

    nonisolated func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        Task { @MainActor in
            authStatus = manager.authorizationStatus
            if authStatus == .authorizedWhenInUse || authStatus == .authorizedAlways {
                manager.requestLocation()
            }
        }
    }
}
