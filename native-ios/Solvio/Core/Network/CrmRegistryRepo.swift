import Foundation

/// Rejestry Finansów CRM-a przez most `/api/crm/*`: zobowiązania cykliczne,
/// klienci i stan konta. Wpisy miesiąca obsługuje `CrmRepo` — tu jest
/// wszystko, co wpisy opisuje albo je generuje.
///
/// Każda z tych rzeczy ma w CRM-ie pełny CRUD, więc apka też go dostaje:
/// zmiana zrobiona tutaj jest widoczna w `crm.programo.pl` od razu, bo nie
/// istnieje żadna kopia po naszej stronie, którą trzeba by synchronizować.
enum CrmRegistryRepo {

    // MARK: - Zobowiązania cykliczne

    private struct CommitmentWrap: Decodable { let commitment: CrmCommitment? }

    static func commitments() async throws -> [CrmCommitment] {
        let res: CrmCommitmentsResponse = try await ApiClient.shared.get("/api/crm/commitments")
        return res.commitments
    }

    @discardableResult
    static func createCommitment(_ body: CrmCommitmentInput) async throws -> CrmCommitment? {
        let wrap: CommitmentWrap = try await ApiClient.shared.post("/api/crm/commitments", body: body)
        return wrap.commitment
    }

    @discardableResult
    static func updateCommitment(id: String, _ body: CrmCommitmentInput) async throws -> CrmCommitment? {
        let wrap: CommitmentWrap = try await ApiClient.shared.patch("/api/crm/commitments/\(id)", body: body)
        return wrap.commitment
    }

    /// Usunięcie serii NIE kasuje wpisów, które już z niej powstały —
    /// CRM ma na `FinanceEntry.recurringId` `onDelete: SetNull`.
    static func deleteCommitment(id: String) async throws {
        try await ApiClient.shared.deleteVoid("/api/crm/commitments/\(id)")
    }

    // MARK: - Klienci

    private struct ClientWrap: Decodable { let client: CrmClient? }

    static func clients() async throws -> [CrmClient] {
        let res: CrmClientsResponse = try await ApiClient.shared.get("/api/crm/clients")
        return res.clients
    }

    @discardableResult
    static func createClient(_ body: CrmClientInput) async throws -> CrmClient? {
        let wrap: ClientWrap = try await ApiClient.shared.post("/api/crm/clients", body: body)
        return wrap.client
    }

    @discardableResult
    static func updateClient(id: String, _ body: CrmClientInput) async throws -> CrmClient? {
        let wrap: ClientWrap = try await ApiClient.shared.patch("/api/crm/clients/\(id)", body: body)
        return wrap.client
    }

    static func deleteClient(id: String) async throws {
        try await ApiClient.shared.deleteVoid("/api/crm/clients/\(id)")
    }

    // MARK: - Stan konta

    static func balances() async throws -> [CrmBalance] {
        let res: CrmBalancesResponse = try await ApiClient.shared.get("/api/crm/balances")
        return res.balances
    }

    @discardableResult
    static func createBalance(_ body: CrmBalanceInput) async throws -> CrmBalance? {
        struct Wrap: Decodable { let balance: CrmBalance? }
        let wrap: Wrap = try await ApiClient.shared.post("/api/crm/balances", body: body)
        return wrap.balance
    }

    static func deleteBalance(id: String) async throws {
        try await ApiClient.shared.deleteVoid("/api/crm/balances/\(id)")
    }
}
