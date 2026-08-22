import Foundation

/// Modele zakładki Finanse z crm.programo.pl.
///
/// Solvio ich nie kopiuje do własnej bazy — źródłem prawdy zostaje CRM,
/// a apka jest zdalnym sterowaniem. Stąd osobny plik: to NIE są nasze
/// encje i nie wolno ich mieszać z `Models.swift`.
///
/// Uwaga na typy: CRM oddaje kwoty jako liczby, a nasze wydatki jako stringi
/// (`numeric` z Postgresa). Dlatego `Double`, a nie `MoneyString`.

struct CrmEntry: Codable, Identifiable, Hashable {
    let id: String
    let type: String            // "INCOME" | "EXPENSE"
    let date: String
    let amount: Double
    let title: String
    let category: String
    let paid: Bool
    let note: String
    let client: CrmClientRef?
    let recurring: CrmRecurringRef?

    var isIncome: Bool { type == "INCOME" }

    /// Kwota bywa liczbą albo stringiem — patrz `CrmDecode.amount`.
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        type = try c.decode(String.self, forKey: .type)
        date = try c.decode(String.self, forKey: .date)
        title = try c.decode(String.self, forKey: .title)
        category = (try? c.decode(String.self, forKey: .category)) ?? ""
        paid = (try? c.decode(Bool.self, forKey: .paid)) ?? false
        note = (try? c.decode(String.self, forKey: .note)) ?? ""
        client = try? c.decode(CrmClientRef.self, forKey: .client)
        recurring = try? c.decode(CrmRecurringRef.self, forKey: .recurring)
        amount = CrmDecode.amount(c, .amount)
    }
}

struct CrmClientRef: Codable, Hashable {
    let id: String
    let name: String
}

struct CrmRecurringRef: Codable, Hashable {
    let id: String
    let title: String
}

struct CrmMonthSummary: Codable, Hashable {
    let year: Int
    let month: Int
    let income: Double
    let expense: Double
    let balance: Double
}

struct CrmMrr: Codable, Hashable {
    let total: Double
    let clientCount: Int
}

struct CrmSummary: Codable, Hashable {
    let month: CrmMonthSummary?
    let mrr: CrmMrr?
}

struct CrmEntriesResponse: Decodable {
    let entries: [CrmEntry]
    let summary: CrmSummary?
}

struct CrmContextResponse: Decodable {
    let clients: [CrmClient]
    let commitments: [CrmCommitment]
}

/// Ciało tworzenia i edycji wpisu. Pola opcjonalne, bo `PATCH` w CRM-ie
/// traktuje brak pola jako „nie ruszaj".
struct CrmEntryInput: Encodable {
    var type: String?
    var date: String?
    var amount: String?
    var title: String?
    var category: String?
    var paid: Bool?
    var note: String?
    var clientId: String?
}
