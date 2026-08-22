import Foundation
import SwiftUI

/// Pamięć podręczna danych z crm.programo.pl — ta sama strategia
/// stale-while-revalidate co `AppDataStore`, ale osobno, bo to NIE są
/// nasze dane: źródłem prawdy zostaje CRM, a my jesteśmy pilotem.
///
/// Slajs jest jeden (finanse miesiąca + konteksty), więc nie ma tu
/// maszynerii generacji z `AppDataStore` — wystarczy anulowanie zadania
/// w locie i sprawdzenie, czy jesteśmy nadal aktualnym żądaniem.
@MainActor
final class CrmStore: ObservableObject {
    /// Czy konto ma w ogóle wpięty CRM. `nil` = jeszcze nie wiemy.
    @Published private(set) var connected: Bool?
    @Published private(set) var entries: [CrmEntry] = []
    @Published private(set) var summary: CrmSummary?
    @Published private(set) var clients: [CrmClient] = []
    @Published private(set) var commitments: [CrmCommitment] = []
    @Published private(set) var loading = false
    @Published private(set) var error: String?

    /// Miesiąc, którego dotyczą `entries`. Zmiana miesiąca unieważnia cache.
    @Published private(set) var month: Date = Date()

    private var loadedAt: Date?
    private var task: Task<Void, Never>?
    private let ttl: TimeInterval = 120

    var monthIncome: Double { summary?.month?.income ?? 0 }
    var monthExpense: Double { summary?.month?.expense ?? 0 }
    var monthBalance: Double { summary?.month?.balance ?? 0 }

    var activeCommitments: [CrmCommitment] { commitments.filter(\.active) }

    func client(named id: String?) -> CrmClient? {
        guard let id else { return nil }
        return clients.first { $0.id == id }
    }

    /// Kategorie, których CRM realnie używa w tym miesiącu, plus te z serii
    /// cyklicznych. CRM trzyma kategorię jako wolny tekst, więc podpowiedzi
    /// muszą wziąć się z danych — nie ma tam słownika do pobrania.
    var knownCategories: [String] {
        let fromEntries = entries.map(\.category)
        let fromCommitments = commitments.map(\.category)
        return Array(Set(fromEntries + fromCommitments))
            .filter { !$0.trimmingCharacters(in: .whitespaces).isEmpty }
            .sorted()
    }

    func ensureLoaded(force: Bool = false) {
        if !force, let loadedAt, Date().timeIntervalSince(loadedAt) < ttl { return }
        if !force, task != nil { return }
        task?.cancel()
        task = Task { [weak self] in await self?.load() }
    }

    func setMonth(_ date: Date) {
        month = date
        loadedAt = nil
        ensureLoaded(force: true)
    }

    private func load() async {
        defer { task = nil }
        let hadData = !entries.isEmpty
        if !hadData { loading = true }
        defer { if !hadData { loading = false } }

        let bounds = Self.monthBounds(month)
        do {
            let result = try await CrmRepo.entries(from: bounds.from, to: bounds.to)
            entries = result.entries
            summary = result.summary
            connected = true
            error = nil
            loadedAt = Date()
            Log.info(.crm, "wczytano \(result.entries.count) wpisów za \(bounds.from)")
        } catch ApiError.cancelled {
            return
        } catch {
            // 502 z naszej trasy znaczy „CRM nie odpowiada", a nie „brak
            // połączenia". Rozróżnienie ma znaczenie: pierwsze warto ponowić,
            // drugie wymaga wklejenia klucza w ustawieniach.
            if case ApiError.unauthorized = error {
                connected = false
            } else {
                connected = connected ?? false
                self.error = error.localizedDescription
            }
            Log.error(.crm, "nie udało się wczytać finansów CRM", error)
            return
        }

        // Konteksty są dodatkiem: brak klientów nie ma prawa schować wpisów.
        if let context = try? await CrmRepo.context() {
            clients = context.clients
            commitments = context.commitments
        }
    }

    // MARK: - Zapisy

    /// Wszystkie mutacje idą przez serwer i dopiero potem odświeżają cache.
    /// Optymistyczna podmiana byłaby tu kłamstwem: to dane CRM-a i to on
    /// rozstrzyga, czy zmiana przeszła.
    func setPaid(_ entry: CrmEntry, paid: Bool) async {
        do {
            _ = try await CrmRepo.updateEntry(id: entry.id, CrmEntryInput(paid: paid))
            await reload()
        } catch {
            Log.error(.crm, "nie udało się zmienić statusu zapłaty", error)
            self.error = error.localizedDescription
        }
    }

    func save(id: String?, input: CrmEntryInput) async throws {
        if let id {
            _ = try await CrmRepo.updateEntry(id: id, input)
        } else {
            _ = try await CrmRepo.createEntry(input)
        }
        await reload()
    }

    func delete(_ entry: CrmEntry) async {
        do {
            try await CrmRepo.deleteEntry(id: entry.id)
            await reload()
        } catch {
            Log.error(.crm, "nie udało się usunąć wpisu", error)
            self.error = error.localizedDescription
        }
    }

    func reload() async {
        loadedAt = nil
        task?.cancel()
        await load()
    }

    func reset() {
        task?.cancel()
        entries = []
        summary = nil
        clients = []
        commitments = []
        connected = nil
        loadedAt = nil
        error = nil
    }

    // MARK: - Pomocnicze

    static func monthBounds(_ date: Date) -> (from: String, to: String) {
        let cal = Calendar.current
        let comps = cal.dateComponents([.year, .month], from: date)
        let start = cal.date(from: comps) ?? date
        let range = cal.range(of: .day, in: .month, for: start)?.count ?? 30
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        let end = cal.date(byAdding: .day, value: range - 1, to: start) ?? date
        return (f.string(from: start), f.string(from: end))
    }
}
