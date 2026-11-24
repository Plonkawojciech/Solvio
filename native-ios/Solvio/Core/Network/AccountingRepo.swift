import Foundation

/// Odczyty księgowości przez most `/api/crm/accounting/*`. Protokół jest po to,
/// żeby testy sprawdzały `AccountingStore` bez sieci.
protocol AccountingAPI: Sendable {
    func overview() async throws -> AccountingOverview
    func obligations(open: Bool, entity: String?, cursor: String?) async throws -> AccountingPage<AccountingObligation>
    func documents(_ query: DocumentQuery, cursor: String?) async throws -> AccountingPage<AccountingDocument>
    func jpk() async throws -> [AccountingJpk]
    func todo() async throws -> [AccountingTodoItem]
    func setEntryPaid(id: String, paid: Bool) async throws
}

struct AccountingRepo: AccountingAPI {
    private let base = "/api/crm/accounting"

    func overview() async throws -> AccountingOverview {
        try await ApiClient.shared.get("\(base)/overview")
    }

    func obligations(open: Bool, entity: String?, cursor: String?) async throws -> AccountingPage<AccountingObligation> {
        var query = [
            URLQueryItem(name: "status", value: open ? "open" : "all"),
            URLQueryItem(name: "limit", value: open ? "100" : "50"),
        ]
        if let entity { query.append(URLQueryItem(name: "entity", value: entity)) }
        if let cursor { query.append(URLQueryItem(name: "cursor", value: cursor)) }
        let res: AccountingObligationsResponse = try await ApiClient.shared.get("\(base)/obligations", query: query)
        return AccountingPage(items: res.obligations, nextCursor: res.nextCursor)
    }

    func documents(_ query: DocumentQuery, cursor: String?) async throws -> AccountingPage<AccountingDocument> {
        let res: AccountingDocumentsResponse = try await ApiClient.shared.get(
            "\(base)/documents", query: query.queryItems(cursor: cursor)
        )
        return AccountingPage(items: res.documents, nextCursor: res.nextCursor)
    }

    func jpk() async throws -> [AccountingJpk] {
        let res: AccountingJpkResponse = try await ApiClient.shared.get("\(base)/jpk")
        return res.submissions
    }

    func todo() async throws -> [AccountingTodoItem] {
        let res: AccountingTodoResponse = try await ApiClient.shared.get("\(base)/todo")
        return res.items
    }

    /// Zapłata idzie wyłącznie istniejącym mostem wpisu w Finansach.
    func setEntryPaid(id: String, paid: Bool) async throws {
        _ = try await CrmRepo.updateEntry(id: id, CrmEntryInput(paid: paid))
    }
}
