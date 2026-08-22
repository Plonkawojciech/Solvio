import Foundation

/// Thin wrappers over `ApiClient` scoped to a domain. Each view model
/// grabs the repo it needs — keeps call sites free of raw path strings
/// and lets us swap transport later without touching the UI.
///
/// Contracts mirror the Next.js API exactly (see `/app/api/**`). Any
/// deviation here is a bug — update the backend, not the client.

// MARK: - Dashboard

enum DashboardRepo {
    /// Fetches dashboard with `?since=all` so we get ALL user expenses,
    /// not just the last 30 days. Avoids the "all zeros" empty dashboard
    /// for users whose data is older than 30 days.
    static func fetch() async throws -> DashboardResponse {
        try await ApiClient.shared.get(
            "/api/data/dashboard",
            query: [URLQueryItem(name: "since", value: "all")]
        )
    }
}

// MARK: - Settings

/// `/api/data/settings` uses a discriminated union on POST — the
/// frontend sends `{ type: 'settings'|'category'|'budget', data: ... }`
/// and the server mutates the matching table.
enum SettingsRepo {
    struct Bundle: Decodable {
        let categories: [Category]
        let settings: UserSettings?
        let budgets: [CategoryBudget]
    }

    static func fetch() async throws -> Bundle {
        try await ApiClient.shared.get("/api/data/settings")
    }

    struct SettingsData: Encodable {
        let currency: String?
        let language: String?
        let productType: String?
        let monthlyBudget: Double?
        let notificationsEnabled: Bool?
        let timezone: String?
    }

    struct CategoryData: Encodable {
        let name: String
        let icon: String?
        let color: String?
        let isDefault: Bool?
    }

    struct BudgetData: Encodable {
        let categoryId: String
        let amount: Double
        let period: String?
    }

    private struct SettingsEnvelope: Encodable {
        let type: String
        let data: SettingsData
    }

    private struct CategoryEnvelope: Encodable {
        let type: String
        let data: CategoryData
    }

    private struct BudgetEnvelope: Encodable {
        let type: String
        let data: BudgetData
    }

    static func updateSettings(_ data: SettingsData) async throws {
        try await ApiClient.shared.postVoid("/api/data/settings", body: SettingsEnvelope(type: "settings", data: data))
    }

    static func addCategory(_ data: CategoryData) async throws {
        try await ApiClient.shared.postVoid("/api/data/settings", body: CategoryEnvelope(type: "category", data: data))
    }

    static func upsertBudget(_ data: BudgetData) async throws {
        try await ApiClient.shared.postVoid("/api/data/settings", body: BudgetEnvelope(type: "budget", data: data))
    }
}

// MARK: - Expenses

enum ExpensesRepo {
    static func list(query: [URLQueryItem] = []) async throws -> ExpenseListResponse {
        try await ApiClient.shared.get("/api/data/expenses", query: query)
    }

    static func create(_ body: ExpenseCreate) async throws -> Expense {
        let wrap: ExpenseWrap = try await ApiClient.shared.post("/api/data/expenses", body: body)
        return wrap.expense
    }

    static func update(_ body: ExpenseUpdate) async throws {
        try await ApiClient.shared.putVoid("/api/data/expenses", body: body)
    }

    static func delete(ids: [String]) async throws {
        try await ApiClient.shared.deleteVoid("/api/data/expenses", body: ExpenseDelete(ids: ids))
    }
}

// MARK: - Categories

enum CategoriesRepo {
    struct Create: Encodable {
        let name: String
        let icon: String?
    }

    struct Update: Encodable {
        let id: String
        let name: String
        let icon: String?
    }

    private struct IdBody: Encodable { let id: String }

    /// Backend returns the created category as a flat row (no wrapper).
    static func create(_ body: Create) async throws -> Category {
        try await ApiClient.shared.post("/api/data/categories", body: body)
    }

    static func update(_ body: Update) async throws {
        try await ApiClient.shared.putVoid("/api/data/categories", body: body)
    }

    static func delete(id: String) async throws {
        try await ApiClient.shared.deleteVoid("/api/data/categories", body: IdBody(id: id))
    }
}

// MARK: - Receipts

enum ReceiptsRepo {
    private struct ListResponse: Decodable {
        let receipts: [Receipt]
    }
    private struct IdBody: Encodable { let id: String }

    static func list() async throws -> [Receipt] {
        let r: ListResponse = try await ApiClient.shared.get("/api/data/receipts")
        return r.receipts
    }

    /// GET `?id=` returns a flat Receipt row (no wrapper).
    static func detail(id: String) async throws -> Receipt {
        try await ApiClient.shared.get(
            "/api/data/receipts",
            query: [URLQueryItem(name: "id", value: id)]
        )
    }

    /// Virtual receipt — manual entry. Backend returns the created row flat.
    static func create(_ body: ReceiptCreate) async throws -> Receipt {
        try await ApiClient.shared.post("/api/data/receipts", body: body)
    }

    struct ItemsUpdate: Encodable {
        let id: String
        let items: [ReceiptItem]
    }

    static func updateItems(receiptId: String, items: [ReceiptItem]) async throws {
        try await ApiClient.shared.putVoid(
            "/api/data/receipts",
            body: ItemsUpdate(id: receiptId, items: items)
        )
    }

    static func delete(id: String) async throws {
        try await ApiClient.shared.deleteVoid(
            "/api/data/receipts",
            body: IdBody(id: id)
        )
    }

    /// OCR endpoint expects multipart field name `"files"` (plural).
    /// Optionally you can pass an existing `receiptId` to replace it.
    static func scan(
        imageData: Data,
        filename: String = "receipt.jpg",
        mimeType: String = "image/jpeg",
        receiptId: String? = nil
    ) async throws -> OcrReceiptResponse {
        var extras: [String: String] = [:]
        if let receiptId { extras["receiptId"] = receiptId }
        return try await ApiClient.shared.upload(
            "/api/v1/ocr-receipt",
            fileData: imageData,
            filename: filename,
            mimeType: mimeType,
            fieldName: "files",
            extraFields: extras
        )
    }
}


// MARK: - Konserwacja

enum MaintenanceRepo {
    /// POST `/api/v1/seed-categories` — idempotentne. Konto, które ma już
    /// kategorie, nie dostaje nic; puste dostaje domyślny zestaw.
    static func seedCategories() async throws {
        try await ApiClient.shared.postEmptyVoid("/api/v1/seed-categories")
    }
}

// MARK: - Most do CRM Programo

/// Sekret CRM-a nigdy nie ląduje na telefonie — apka rozmawia wyłącznie
/// z Solvio, a Solvio trzyma zaszyfrowany klucz po swojej stronie.
enum CrmRepo {
    struct Connection: Decodable {
        let connected: Bool
        let baseUrl: String
        let apiKeyHint: String?
        let autoPush: Bool
        let defaultCategory: String
        let lastSyncAt: String?
        let lastError: String?
    }

    struct ConnectBody: Encodable {
        let baseUrl: String
        let apiKey: String
        let autoPush: Bool
        let defaultCategory: String
    }

    struct PushBody: Encodable { let ids: [String] }

    struct PushResult: Decodable {
        let ok: Bool
        let pushed: Int
    }

    static func connection() async throws -> Connection {
        try await ApiClient.shared.get("/api/crm/connection")
    }

    static func connect(_ body: ConnectBody) async throws -> Connection {
        try await ApiClient.shared.put("/api/crm/connection", body: body)
    }

    static func disconnect() async throws {
        try await ApiClient.shared.deleteVoid("/api/crm/connection")
    }

    @discardableResult
    static func push(ids: [String]) async throws -> PushResult {
        try await ApiClient.shared.post("/api/crm/push", body: PushBody(ids: ids))
    }
}
