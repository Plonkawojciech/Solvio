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
    @Published private(set) var balances: [CrmBalance] = []
    /// Rachunki i transakcje z banku — tylko odczyt. Puste, gdy CRM nie ma
    /// rachunków; wtedy żaden ekran nie pokazuje niczego bankowego.
    @Published private(set) var bankAccounts: [CrmBankAccount] = []
    @Published private(set) var bankTransactions: [CrmBankTransaction] = []
    @Published private(set) var loading = false
    @Published private(set) var error: String?

    /// Miesiąc, którego dotyczą `entries`. Zmiana miesiąca unieważnia cache.
    @Published private(set) var month: Date = Date()

    private var loadedAt: Date?
    private var task: Task<Void, Never>?
    /// Podbijane przy każdym nowym wczytaniu i przy czyszczeniu. Odpowiedź
    /// starszego żądania jest odrzucana: inaczej dane poprzedniego konta albo
    /// poprzedniego miesiąca wróciłyby po tym, jak zniknęły z ekranu.
    private var generation = 0
    private let ttl: TimeInterval = 120

    var monthIncome: Double { summary?.month?.income ?? 0 }
    var monthExpense: Double { summary?.month?.expense ?? 0 }
    var monthBalance: Double { summary?.month?.balance ?? 0 }

    var activeCommitments: [CrmCommitment] { commitments.filter(\.active) }

    var activeBankAccounts: [CrmBankAccount] { bankAccounts.filter(\.active) }
    var hasBank: Bool { !activeBankAccounts.isEmpty }

    /// Transakcje oglądanego miesiąca. Odfiltrowujemy lokalnie, żeby po
    /// przełączeniu strzałek nigdy nie mignęła lista z poprzedniego miesiąca.
    var monthBankTransactions: [CrmBankTransaction] {
        let bounds = Self.monthBounds(month)
        return bankTransactions
            .filter { $0.bookingDate >= bounds.from && $0.bookingDate <= bounds.to }
            .sorted { $0.bookingDate > $1.bookingDate }
    }

    /// Suma sald po walutach — złotówek z euro nie dodajemy.
    var bankTotals: [(currency: String, amount: Double)] {
        var sums: [String: Double] = [:]
        var order: [String] = []
        for account in activeBankAccounts {
            guard let balance = account.balance else { continue }
            if sums[account.currency] == nil { order.append(account.currency) }
            sums[account.currency, default: 0] += balance
        }
        return order.map { ($0, sums[$0] ?? 0) }
    }

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
        _ = startLoad()
    }

    @discardableResult
    private func startLoad() -> Task<Void, Never> {
        task?.cancel()
        generation += 1
        let mine = generation
        let work = Task { await load(mine) }
        task = work
        return work
    }

    /// Miesiąc w przód / w tył — tak jak strzałki nad tabelą w `/finanse`.
    func shiftMonth(by months: Int) {
        let next = Calendar.current.date(byAdding: .month, value: months, to: month) ?? month
        setMonth(next)
    }

    func setMonth(_ date: Date) {
        month = date
        loadedAt = nil
        // Wpisy i sumy innego miesiąca pod nowym nagłówkiem byłyby nieprawdą.
        entries = []
        summary = nil
        startLoad()
    }

    private func load(_ mine: Int) async {
        guard mine == generation else { return }
        if entries.isEmpty { loading = true }
        defer {
            if mine == generation {
                loading = false
                task = nil
            }
        }

        let bounds = Self.monthBounds(month)
        do {
            let result = try await CrmRepo.entries(from: bounds.from, to: bounds.to)
            guard mine == generation else { return }
            entries = result.entries
            summary = result.summary
            connected = true
            error = nil
            loadedAt = Date()
            Log.info(.crm, "wczytano \(result.entries.count) wpisów za \(bounds.from)")
        } catch ApiError.cancelled {
            return
        } catch {
            guard mine == generation else { return }
            Log.error(.crm, "nie udało się wczytać finansów CRM", error)
            // Wygasła sesja kończy się wylogowaniem, a ono czyści wszystko samo.
            if case ApiError.unauthorized = error { return }
            // 502 z naszej trasy znaczy zarówno „CRM nie odpowiada", jak i
            // „konto nie ma wpiętego CRM-a". Od tego zależy, czy zakładka
            // Firma w ogóle istnieje, więc pytamy wprost o połączenie.
            let state = try? await CrmRepo.connection()
            guard mine == generation else { return }
            if state?.connected == false {
                markDisconnected()
            } else {
                // Bez sieci nie wiemy — i „nie wiemy" nie może znaczyć
                // „odpięty", bo to czyści Firmę i odwołuje przypomnienia.
                connected = state?.connected ?? connected
                self.error = error.localizedDescription
            }
            return
        }

        await refreshContext(mine)
        await refreshBankTransactions(bounds, mine)
    }

    /// Transakcje miesiąca — tylko gdy są rachunki. Awaria zostawia ostatnią
    /// listę: `monthBankTransactions` i tak filtruje ją po oglądanym miesiącu.
    private func refreshBankTransactions(_ bounds: (from: String, to: String), _ mine: Int) async {
        guard mine == generation else { return }
        guard hasBank else {
            bankTransactions = []
            return
        }
        do {
            let rows = try await CrmRegistryRepo.bankTransactions(from: bounds.from, to: bounds.to)
            guard mine == generation else { return }
            bankTransactions = rows
        } catch ApiError.cancelled {
            return
        } catch {
            Log.error(.crm, "nie udało się wczytać transakcji z banku", error)
        }
    }

    /// Klienci, zobowiązania i stan konta. Konteksty są DODATKIEM: padnięta
    /// lista klientów nie ma prawa schować wpisów, które już mamy.
    /// Wywoływane też po każdej zmianie w rejestrach — to jedyne miejsce,
    /// w którym te trzy kolekcje powstają.
    func refreshContext() async { await refreshContext(generation) }

    private func refreshContext(_ mine: Int) async {
        if let context = try? await CrmRepo.context(), mine == generation {
            clients = context.clients
            commitments = context.commitments
        }
        if let rows = try? await CrmRegistryRepo.balances(), mine == generation {
            balances = rows
        }
        // Bank jest dodatkiem do dodatku: brak rachunków albo awaria
        // = apka wygląda dokładnie tak jak przed integracją banku.
        if let rows = try? await CrmRegistryRepo.bankAccounts(), mine == generation {
            bankAccounts = rows
        }
    }

    /// Ostatni odczyt stanu konta — na karcie Firmy pokazujemy tylko ten.
    var latestBalance: CrmBalance? {
        balances.max { $0.at < $1.at }
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

    /// Rozszerzenia w innych plikach nie sięgną `private(set) var error`,
    /// a każde z nich musi umieć zgłosić awarię tym samym kanałem.
    func setError(_ message: String?) { error = message }

    func reload() async {
        loadedAt = nil
        await startLoad().value
    }

    /// Konto nie ma wpiętego CRM-a — wszystko, co firmowe, znika z apki.
    func markDisconnected() {
        reset()
        connected = false
    }

    func reset() {
        task?.cancel()
        task = nil
        generation += 1
        loading = false
        month = Date()
        entries = []
        summary = nil
        clients = []
        commitments = []
        balances = []
        bankAccounts = []
        bankTransactions = []
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
