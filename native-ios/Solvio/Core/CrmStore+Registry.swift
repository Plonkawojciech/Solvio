import Foundation

/// Zapisy w rejestrach CRM-a: zobowiązania cykliczne, klienci, stan konta.
/// Wpisy miesiąca obsługuje `CrmStore` — tu jest wszystko, co je opisuje
/// albo je generuje.
///
/// Wzorzec jest ten sam co przy wpisach: żadnej optymistycznej podmiany.
/// To dane CRM-a i to on rozstrzyga, czy zmiana przeszła — udawanie, że
/// zapis się udał, byłoby kłamstwem na ekranie, który steruje firmą.
@MainActor
extension CrmStore {

    // MARK: - Zobowiązania cykliczne

    func saveCommitment(id: String?, input: CrmCommitmentInput) async throws {
        if let id {
            _ = try await CrmRegistryRepo.updateCommitment(id: id, input)
        } else {
            _ = try await CrmRegistryRepo.createCommitment(input)
        }
        // Nowa seria od razu materializuje wpis w bieżącym miesiącu, więc
        // odświeżamy też listę wpisów, nie tylko rejestr.
        await reload()
    }

    func setCommitmentActive(_ commitment: CrmCommitment, active: Bool) async {
        await run("nie udało się przełączyć zobowiązania") {
            _ = try await CrmRegistryRepo.updateCommitment(
                id: commitment.id, CrmCommitmentInput(active: active)
            )
        }
    }

    func deleteCommitment(_ commitment: CrmCommitment) async {
        await run("nie udało się usunąć zobowiązania") {
            try await CrmRegistryRepo.deleteCommitment(id: commitment.id)
        }
    }

    // MARK: - Klienci

    func saveClient(id: String?, input: CrmClientInput) async throws {
        if let id {
            _ = try await CrmRegistryRepo.updateClient(id: id, input)
        } else {
            _ = try await CrmRegistryRepo.createClient(input)
        }
        await refreshContext()
    }

    func deleteClient(_ client: CrmClient) async {
        await run("nie udało się usunąć klienta") {
            try await CrmRegistryRepo.deleteClient(id: client.id)
        }
    }

    // MARK: - Stan konta

    func saveBalance(at: String, amount: String, note: String?) async throws {
        _ = try await CrmRegistryRepo.createBalance(
            CrmBalanceInput(at: at, amount: amount, note: note)
        )
        await refreshContext()
    }

    func deleteBalance(_ balance: CrmBalance) async {
        await run("nie udało się usunąć odczytu") {
            try await CrmRegistryRepo.deleteBalance(id: balance.id)
        }
    }

    // MARK: - Pomocnicze

    /// Operacje „jednym tapnięciem" (przełącz, usuń) nie mają gdzie pokazać
    /// błędu — wystawiamy go na wspólnym `error`, tak jak przy wpisach.
    private func run(_ what: String, _ work: () async throws -> Void) async {
        do {
            try await work()
            await refreshContext()
        } catch {
            Log.error(.crm, what, error)
            setError(error.localizedDescription)
        }
    }
}
