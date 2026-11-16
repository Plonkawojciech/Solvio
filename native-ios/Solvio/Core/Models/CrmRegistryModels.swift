import Foundation

/// Rejestry Finansów CRM-a: zobowiązania cykliczne, klienci i stan konta.
/// Wpisy miesiąca siedzą w `CrmModels.swift` — tu jest wszystko, co je
/// opisuje albo je generuje.
///
/// Kwoty: CRM oddaje `amount` zobowiązania jako liczbę, ale `monthlyFee`
/// i `projectValue` klienta jako string. To nie pomyłka po ich stronie
/// i nie prostujemy tego u siebie — dekodujemy oba warianty.

struct CrmCommitment: Codable, Identifiable, Hashable {
    let id: String
    let title: String
    let type: String
    let amount: Double
    let category: String
    let note: String?
    let clientId: String?
    let clientName: String?
    let active: Bool
    let intervalMonths: Int
    let startDate: String
    let endDate: String?

    var isIncome: Bool { type == "INCOME" }

    /// Ile razy w roku uderza — do podpisu „co miesiąc / co kwartał / rocznie".
    var cadenceKey: String {
        switch intervalMonths {
        case 1:  return "crm.cadenceMonthly"
        case 3:  return "crm.cadenceQuarterly"
        case 12: return "crm.cadenceYearly"
        default: return "crm.cadenceEveryN"
        }
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        title = try c.decode(String.self, forKey: .title)
        type = try c.decode(String.self, forKey: .type)
        amount = CrmDecode.amount(c, .amount)
        category = (try? c.decode(String.self, forKey: .category)) ?? ""
        note = try? c.decode(String.self, forKey: .note)
        clientId = try? c.decode(String.self, forKey: .clientId)
        clientName = try? c.decode(String.self, forKey: .clientName)
        active = (try? c.decode(Bool.self, forKey: .active)) ?? true
        intervalMonths = (try? c.decode(Int.self, forKey: .intervalMonths)) ?? 1
        startDate = (try? c.decode(String.self, forKey: .startDate)) ?? ""
        endDate = try? c.decode(String.self, forKey: .endDate)
    }
}

struct CrmClient: Codable, Identifiable, Hashable {
    let id: String
    let name: String
    let service: String?
    let status: String?
    let monthlyFee: String?
    let projectValue: String?
    let contactName: String?
    let phone: String?
    let email: String?
    let notes: String?

    var monthlyFeeValue: Double { Double(monthlyFee ?? "0") ?? 0 }

    /// Klucz podpisu statusu. CRM zna cztery; cokolwiek innego pokazujemy
    /// surowo, zamiast udawać, że znamy słownik lepiej niż on.
    var statusKey: String? {
        switch status {
        case "ACTIVE":   return "crm.clientActive"
        case "IN_TALKS": return "crm.clientInTalks"
        case "AGREED":   return "crm.clientAgreed"
        case "FINISHED": return "crm.clientFinished"
        default:         return nil
        }
    }
}

struct CrmBalance: Codable, Identifiable, Hashable {
    let id: String
    let at: String
    let amount: Double
    let note: String?
}

// MARK: - Bank (tylko odczyt)

/// Rachunek firmowy z CRM-a. `balance` bywa `nil`, gdy bank nie oddał salda —
/// wtedy nie liczymy go jako zera, tylko pomijamy w sumie.
struct CrmBankAccount: Decodable, Identifiable, Hashable {
    let id: String
    let name: String
    let currency: String
    let balance: Double?
    let balanceAt: String?
    let active: Bool

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        name = (try? c.decode(String.self, forKey: .name)) ?? ""
        currency = (try? c.decode(String.self, forKey: .currency)) ?? "PLN"
        // Brak klucza i `null` znaczą to samo: banku nie znamy salda.
        let noBalance = (try? c.decodeNil(forKey: .balance)) ?? true
        balance = noBalance ? nil : CrmDecode.amount(c, .balance)
        balanceAt = try? c.decode(String.self, forKey: .balanceAt)
        active = (try? c.decode(Bool.self, forKey: .active)) ?? true
    }

    private enum CodingKeys: String, CodingKey {
        case id, name, currency, balance, balanceAt, active
    }
}

/// Transakcja z rachunku. Kwota ze znakiem: ujemna = pieniądze wyszły.
/// Dopasowanie do wpisu zatwierdza człowiek w CRM-ie — apka tylko pokazuje stan.
struct CrmBankTransaction: Decodable, Identifiable, Hashable {
    let id: String
    let accountId: String
    let bookingDate: String
    let amount: Double
    let currency: String
    let status: String              // "BOOK" | "PDNG"
    let counterpartyName: String?
    let description: String?
    let matchStatus: String         // "NONE" | "SUGGESTED" | "CONFIRMED" | "IGNORED"

    var isIncoming: Bool { amount >= 0 }
    var isPending: Bool { status == "PDNG" }

    /// Podpis stanu rozliczenia. Oczekująca transakcja nie ma jeszcze czego
    /// rozliczać, więc jej status wygrywa z dopasowaniem.
    var statusKey: String? {
        if isPending { return "crm.bankPending" }
        switch matchStatus {
        case "CONFIRMED": return "crm.bankSettled"
        case "SUGGESTED": return "crm.bankToSettle"
        default:          return nil
        }
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        accountId = (try? c.decode(String.self, forKey: .accountId)) ?? ""
        bookingDate = (try? c.decode(String.self, forKey: .bookingDate)) ?? ""
        amount = CrmDecode.amount(c, .amount)
        currency = (try? c.decode(String.self, forKey: .currency)) ?? "PLN"
        status = (try? c.decode(String.self, forKey: .status)) ?? "BOOK"
        counterpartyName = try? c.decode(String.self, forKey: .counterpartyName)
        description = try? c.decode(String.self, forKey: .description)
        matchStatus = (try? c.decode(String.self, forKey: .matchStatus)) ?? "NONE"
    }

    private enum CodingKeys: String, CodingKey {
        case id, accountId, bookingDate, amount, currency, status
        case counterpartyName, description, matchStatus
    }
}

// MARK: - Ciała zapisu

/// Pola opcjonalne, bo `PATCH` w CRM-ie traktuje brak pola jako „nie ruszaj".
struct CrmCommitmentInput: Encodable {
    var title: String?
    var type: String?
    var amount: String?
    var category: String?
    var note: String?
    var clientId: String?
    var startDate: String?
    var endDate: String?
    var active: Bool?
    var intervalMonths: Int?
}

struct CrmClientInput: Encodable {
    var name: String?
    var service: String?
    var status: String?
    var monthlyFee: String?
    var projectValue: String?
    var contactName: String?
    var phone: String?
    var email: String?
    var notes: String?
}

struct CrmBalanceInput: Encodable {
    var at: String
    var amount: String
    var note: String?
}

// MARK: - Odpowiedzi

struct CrmCommitmentsResponse: Decodable { let commitments: [CrmCommitment] }
struct CrmClientsResponse: Decodable { let clients: [CrmClient] }
struct CrmBalancesResponse: Decodable { let balances: [CrmBalance] }
struct CrmBankAccountsResponse: Decodable { let accounts: [CrmBankAccount] }
struct CrmBankTransactionsResponse: Decodable { let transactions: [CrmBankTransaction] }

/// Wspólne dekodowanie kwoty: CRM potrafi oddać ją jako liczbę albo string,
/// zależnie od trasy. Wywracanie całego ekranu na jednym polu byłoby
/// nieproporcjonalne do problemu.
enum CrmDecode {
    static func amount<K: CodingKey>(_ c: KeyedDecodingContainer<K>, _ key: K) -> Double {
        if let n = try? c.decode(Double.self, forKey: key) { return n }
        if let s = try? c.decode(String.self, forKey: key), let n = Double(s) { return n }
        return 0
    }
}
