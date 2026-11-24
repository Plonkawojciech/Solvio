import Foundation
@testable import Solvio

enum Fixture {
    static func decode<T: Decodable>(_ json: String) throws -> T {
        try JSONDecoder().decode(T.self, from: Data(json.utf8))
    }

    static func obligation(
        id: String = "o1", kind: String = "VAT", due: String, amount: String = "100", paid: String = "null",
        status: String = "PENDING"
    ) -> AccountingObligation {
        try! decode("""
        {"id":"\(id)","entityKey":"spolka","entityName":"Spółka","kind":"\(kind)","kindLabel":"\(kind) label",
         "period":"2026-10","dueDate":"\(due)","amount":\(amount),"paidAmount":\(paid),"status":"\(status)",
         "note":"do zapłaty 999,99 zł","daysLeft":500,"webPath":null}
        """)
    }

    static func document(id: String, paid: Bool = false, financeEntryId: String? = "fe1") -> AccountingDocument {
        try! decode("""
        {"id":"\(id)","entityKey":"spolka","entityName":"Spółka","direction":"SALE","docType":"VAT",
         "number":"FV/\(id)","partyName":"Klient","partyNip":"","issueDate":"2026-11-01","dueDate":null,
         "paid":\(paid),"paidAt":null,"daysOverdue":0,"net":100,"vat":23,"gross":123,"currency":"PLN",
         "vatPeriod":"2026-11","ksefNumber":"",
         "financeEntryId":\(financeEntryId.map { "\"\($0)\"" } ?? "null"),"webPath":"/ksiegowosc/spolka"}
        """)
    }

    static func todo(_ key: String, _ severity: String = "wazne") -> AccountingTodoItem {
        try! decode("""
        {"key":"\(key)","severity":"\(severity)","area":"faktury","entityKey":"spolka","entityName":"Spółka",
         "title":"T \(key)","cause":"C","action":"A","webPath":"/ksiegowosc/spolka?tab=faktury"}
        """)
    }

    static func overview(entities: Int = 1) -> AccountingOverview {
        let rows = (0..<entities).map { #"{"key":"e\#($0)","name":"E\#($0)","overdue":0}"# }.joined(separator: ",")
        return try! decode(#"{"period":"2026-10","periodLabel":"październik 2026","entities":[\#(rows)]}"#)
    }

    static func date(_ iso: String) -> Date { ISO8601DateFormatter().date(from: iso)! }
}

/// CRM-owy most do testów: odpowiedzi ustawia test, a `gate` pozwala zatrzymać
/// żądanie w locie.
final class FakeAccountingAPI: AccountingAPI, @unchecked Sendable {
    var overviewResult: Result<AccountingOverview, Error> = .success(Fixture.overview())
    var obligationPages: [String: Result<AccountingPage<AccountingObligation>, Error>] = [:]
    /// Pełna lista terminów; bez niej odpowiada `obligationPages`.
    var allObligationPages: [String: Result<AccountingPage<AccountingObligation>, Error>]?
    var todoResult: Result<[AccountingTodoItem], Error> = .success([])
    var overviewCalls = 0
    var documentPages: [String: Result<AccountingPage<AccountingDocument>, Error>] = [:]
    var paidCalls: [(id: String, paid: Bool)] = []
    var gate: (() async -> Void)?

    func overview() async throws -> AccountingOverview {
        overviewCalls += 1
        // Odpowiedź z chwili zapytania, jak na serwerze.
        let result = overviewResult
        await gate?()
        return try result.get()
    }

    func obligations(open: Bool, entity: String?, cursor: String?) async throws -> AccountingPage<AccountingObligation> {
        try ((open ? obligationPages : allObligationPages ?? obligationPages)[cursor ?? ""] ?? .success(AccountingPage(items: [], nextCursor: nil))).get()
    }

    func documents(_ query: DocumentQuery, cursor: String?) async throws -> AccountingPage<AccountingDocument> {
        await gate?()
        return try (documentPages[cursor ?? ""] ?? .success(AccountingPage(items: [], nextCursor: nil))).get()
    }

    func jpk() async throws -> [AccountingJpk] { [] }

    func todo() async throws -> [AccountingTodoItem] { try todoResult.get() }

    func setEntryPaid(id: String, paid: Bool) async throws { paidCalls.append((id, paid)) }
}

/// Bramka: zatrzymuje wołającego, aż test ją otworzy.
actor Gate {
    private var open = false
    private var waiting: [CheckedContinuation<Void, Never>] = []
    private(set) var arrived = 0

    func wait() async {
        arrived += 1
        if open { return }
        await withCheckedContinuation { waiting.append($0) }
    }

    func release() {
        open = true
        waiting.forEach { $0.resume() }
        waiting = []
    }
}
