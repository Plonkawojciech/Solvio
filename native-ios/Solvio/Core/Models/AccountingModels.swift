import Foundation

/// Księgowość z crm.programo.pl przez most `/api/crm/accounting/*` — TYLKO odczyt.
/// Kontrakt: `docs/API.md`, sekcja „Księgowość (tylko odczyt)".
///
/// `nil` w kwocie znaczy „CRM jej nie podał" i nigdy nie wolno pokazać go jako
/// zera: zmyślone „0,00 zł do zapłaty" jest gorsze niż puste miejsce.

// MARK: - Przegląd

struct AccountingOverview: Decodable, Equatable {
    let period: String?
    let periodLabel: String
    let entities: [AccountingEntity]

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        period = try? c.decode(String.self, forKey: .period)
        periodLabel = CrmDecode.text(c, .periodLabel)
        entities = (try? c.decode([AccountingEntity].self, forKey: .entities)) ?? []
    }

    private enum CodingKeys: String, CodingKey { case period, periodLabel, entities }
}

struct AccountingEntity: Decodable, Identifiable, Hashable {
    let key: String
    let name: String
    let taxFormLabel: String
    let vatLabel: String
    let revenue: Double?
    let zus: Double?
    let incomeTax: Double?
    let incomeTaxLabel: String
    let vat: Double?
    let totalToPay: Double?
    let openObligations: Int
    let overdue: Int
    let warnings: [String]
    let receivables: AccountingTotals
    let payables: AccountingTotals

    var id: String { key }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        key = try c.decode(String.self, forKey: .key)
        name = CrmDecode.text(c, .name)
        taxFormLabel = CrmDecode.text(c, .taxFormLabel)
        vatLabel = CrmDecode.text(c, .vatLabel)
        revenue = CrmDecode.optionalAmount(c, .revenue)
        zus = CrmDecode.optionalAmount(c, .zus)
        incomeTax = CrmDecode.optionalAmount(c, .incomeTax)
        incomeTaxLabel = CrmDecode.text(c, .incomeTaxLabel)
        vat = CrmDecode.optionalAmount(c, .vat)
        totalToPay = CrmDecode.optionalAmount(c, .totalToPay)
        openObligations = (try? c.decode(Int.self, forKey: .openObligations)) ?? 0
        overdue = (try? c.decode(Int.self, forKey: .overdue)) ?? 0
        warnings = (try? c.decode([String].self, forKey: .warnings)) ?? []
        receivables = (try? c.decode(AccountingTotals.self, forKey: .receivables)) ?? .empty
        payables = (try? c.decode(AccountingTotals.self, forKey: .payables)) ?? .empty
    }

    private enum CodingKeys: String, CodingKey {
        case key, name, taxFormLabel, vatLabel, revenue, zus, incomeTax, incomeTaxLabel
        case vat, totalToPay, openObligations, overdue, warnings, receivables, payables
    }
}

struct AccountingTotals: Decodable, Hashable {
    let count: Int
    let gross: Double?

    static let empty = AccountingTotals(count: 0, gross: nil)

    init(count: Int, gross: Double?) {
        self.count = count
        self.gross = gross
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        count = (try? c.decode(Int.self, forKey: .count)) ?? 0
        gross = CrmDecode.optionalAmount(c, .gross)
    }

    private enum CodingKeys: String, CodingKey { case count, gross }

    /// Suma po podmiotach. Wystarczy jeden podmiot z dokumentami bez kwoty,
    /// żeby suma była nieznana: zaniżona należność wygląda jak prawdziwa.
    static func sum(_ parts: [AccountingTotals]) -> AccountingTotals {
        let count = parts.reduce(0) { $0 + $1.count }
        let unknown = parts.contains { $0.count > 0 && $0.gross == nil }
        return AccountingTotals(count: count, gross: unknown ? nil : parts.reduce(0.0) { $0 + ($1.gross ?? 0) })
    }
}

// MARK: - Terminy

enum ObligationStatus: String {
    case pending = "PENDING"
    case unclear = "UNCLEAR"
    case done = "DONE"
    case skipped = "SKIPPED"

    var labelKey: String { "company.status.\(rawValue.lowercased())" }
}

struct AccountingObligation: Decodable, Identifiable, Hashable {
    let id: String
    let entityKey: String
    let entityName: String
    let kind: String
    let kindLabel: String
    let period: String
    let dueDate: String
    let amount: Double?
    let paidAmount: Double?
    let status: ObligationStatus
    let note: String
    let daysLeft: Int?
    let webPath: String?

    var isOpen: Bool { status == .pending || status == .unclear }

    /// Ile zostało do zapłaty. Wpłacona część nie ma prawa liczyć się drugi raz.
    var amountDue: Double? { amount.map { max(0, $0 - (paidAmount ?? 0)) } }

    /// Deklaracja albo plik bez kwoty — coś do zrobienia, a nie do zapłacenia.
    var isTask: Bool { amount == nil && Self.reportingKinds.contains(kind) }

    private static let reportingKinds: Set<String> = [
        "JPK_V7", "JPK_EWP", "JPK_KR", "VAT_UE", "PIT_28", "PIT_36", "SPRAWOZDANIE", "KSEF",
    ]

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        entityKey = CrmDecode.text(c, .entityKey)
        entityName = CrmDecode.text(c, .entityName)
        kind = CrmDecode.text(c, .kind)
        kindLabel = CrmDecode.text(c, .kindLabel)
        period = CrmDecode.text(c, .period)
        dueDate = CrmDecode.text(c, .dueDate)
        amount = CrmDecode.optionalAmount(c, .amount)
        paidAmount = CrmDecode.optionalAmount(c, .paidAmount)
        // Nieznany status to „do wyjaśnienia", nigdy „załatwione".
        status = ObligationStatus(rawValue: CrmDecode.text(c, .status)) ?? .unclear
        note = CrmDecode.text(c, .note)
        daysLeft = try? c.decode(Int.self, forKey: .daysLeft)
        webPath = try? c.decode(String.self, forKey: .webPath)
    }

    private enum CodingKeys: String, CodingKey {
        case id, entityKey, entityName, kind, kindLabel, period, dueDate
        case amount, paidAmount, status, note, daysLeft, webPath
    }
}

// MARK: - Dokumenty

enum DocumentDirection: String, Hashable {
    case sale = "SALE"
    case purchase = "PURCHASE"

    var titleKey: String { self == .sale ? "company.invoices" : "company.costs" }
}

enum DocumentStatusFilter: String, CaseIterable, Identifiable {
    case unpaid, overdue, paid
    var id: String { rawValue }
    var labelKey: String { "company.filter.\(rawValue)" }
}

struct AccountingDocument: Decodable, Identifiable, Hashable {
    let id: String
    let entityKey: String
    let entityName: String
    let direction: DocumentDirection
    let docType: String
    let number: String
    let partyName: String
    let partyNip: String
    let issueDate: String
    let dueDate: String?
    let paid: Bool
    let paidAt: String?
    let daysOverdue: Int
    let net: Double?
    let vat: Double?
    let gross: Double?
    let currency: String
    let vatPeriod: String
    let ksefNumber: String
    let financeEntryId: String?
    let webPath: String?

    var isOverdue: Bool { !paid && daysOverdue > 0 }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        entityKey = CrmDecode.text(c, .entityKey)
        entityName = CrmDecode.text(c, .entityName)
        direction = DocumentDirection(rawValue: CrmDecode.text(c, .direction)) ?? .purchase
        docType = CrmDecode.text(c, .docType)
        number = CrmDecode.text(c, .number)
        partyName = CrmDecode.text(c, .partyName)
        partyNip = CrmDecode.text(c, .partyNip)
        issueDate = CrmDecode.text(c, .issueDate)
        dueDate = try? c.decode(String.self, forKey: .dueDate)
        paid = (try? c.decode(Bool.self, forKey: .paid)) ?? false
        paidAt = try? c.decode(String.self, forKey: .paidAt)
        daysOverdue = (try? c.decode(Int.self, forKey: .daysOverdue)) ?? 0
        net = CrmDecode.optionalAmount(c, .net)
        vat = CrmDecode.optionalAmount(c, .vat)
        gross = CrmDecode.optionalAmount(c, .gross)
        currency = (try? c.decode(String.self, forKey: .currency)) ?? "PLN"
        vatPeriod = CrmDecode.text(c, .vatPeriod)
        ksefNumber = CrmDecode.text(c, .ksefNumber)
        financeEntryId = try? c.decode(String.self, forKey: .financeEntryId)
        webPath = try? c.decode(String.self, forKey: .webPath)
    }

    private enum CodingKeys: String, CodingKey {
        case id, entityKey, entityName, direction, docType, number, partyName, partyNip
        case issueDate, dueDate, paid, paidAt, daysOverdue, net, vat, gross, currency
        case vatPeriod, ksefNumber, financeEntryId, webPath
    }
}

/// Filtr listy dokumentów; jednocześnie klucz jej pamięci podręcznej.
struct DocumentQuery: Hashable {
    var direction: DocumentDirection
    var entity: String?
    var status: DocumentStatusFilter?
    var text: String = ""

    /// Most odrzuca frazy dłuższe niż 100 znaków błędem 400.
    static let maxTextLength = 100

    func queryItems(cursor: String?) -> [URLQueryItem] {
        var items = [URLQueryItem(name: "direction", value: direction.rawValue)]
        if let entity { items.append(URLQueryItem(name: "entity", value: entity)) }
        if let status { items.append(URLQueryItem(name: "status", value: status.rawValue)) }
        let phrase = String(text.trimmingCharacters(in: .whitespacesAndNewlines).prefix(Self.maxTextLength))
        if !phrase.isEmpty { items.append(URLQueryItem(name: "q", value: phrase)) }
        if let cursor { items.append(URLQueryItem(name: "cursor", value: cursor)) }
        return items
    }
}

// MARK: - JPK

struct AccountingJpk: Decodable, Identifiable, Hashable {
    let id: String
    let entityKey: String
    let entityName: String
    let period: String
    let env: String
    let status: String
    let statusLabel: String
    let accepted: Bool
    let hasUpo: Bool
    let createdAt: String?

    var isTest: Bool { env != "PROD" }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        entityKey = CrmDecode.text(c, .entityKey)
        entityName = CrmDecode.text(c, .entityName)
        period = CrmDecode.text(c, .period)
        env = CrmDecode.text(c, .env)
        status = CrmDecode.text(c, .status)
        statusLabel = CrmDecode.text(c, .statusLabel)
        accepted = (try? c.decode(Bool.self, forKey: .accepted)) ?? false
        hasUpo = (try? c.decode(Bool.self, forKey: .hasUpo)) ?? false
        createdAt = try? c.decode(String.self, forKey: .createdAt)
    }

    private enum CodingKeys: String, CodingKey {
        case id, entityKey, entityName, period, env, status, statusLabel, accepted, hasUpo, createdAt
    }
}

// MARK: - Strony

/// Jedna strona listy z kursorem następnej. `nil` = koniec.
struct AccountingPage<Item> {
    let items: [Item]
    let nextCursor: String?
}

struct AccountingObligationsResponse: Decodable {
    let obligations: [AccountingObligation]
    let nextCursor: String?
}

struct AccountingDocumentsResponse: Decodable {
    let documents: [AccountingDocument]
    let nextCursor: String?
}

struct AccountingJpkResponse: Decodable { let submissions: [AccountingJpk] }
