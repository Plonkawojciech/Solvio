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

// MARK: - Groups

enum GroupsRepo {
    /// `/api/groups` GET returns a plain JSON array (not wrapped).
    static func list() async throws -> [Group] {
        try await ApiClient.shared.get("/api/groups")
    }

    /// `/api/groups/[id]` GET returns a flat `{...group, members, splits}` object.
    static func detail(id: String) async throws -> Group {
        try await ApiClient.shared.get("/api/groups/\(id)")
    }

    /// POST returns a flat group row (with `members`) — no wrapper.
    static func create(_ body: GroupCreate) async throws -> Group {
        try await ApiClient.shared.post("/api/groups", body: body)
    }

    /// PUT returns `{ ok: true }`.
    static func update(id: String, body: GroupUpdate) async throws {
        try await ApiClient.shared.putVoid("/api/groups/\(id)", body: body)
    }

    static func delete(id: String) async throws {
        try await ApiClient.shared.deleteVoid("/api/groups/\(id)")
    }

    /// POST returns the created split as a flat row.
    static func createSplit(_ body: SplitCreate) async throws -> ExpenseSplit {
        try await ApiClient.shared.post("/api/groups/splits", body: body)
    }

    /// `/api/groups/splits/[splitId]/settle` uses PATCH with `{ memberId }`.
    static func settle(splitId: String, memberId: String) async throws {
        try await ApiClient.shared.patchVoid(
            "/api/groups/splits/\(splitId)/settle",
            body: SettleBody(memberId: memberId)
        )
    }

    static func settlements(groupId: String) async throws -> SettlementsResponse {
        try await ApiClient.shared.get("/api/groups/\(groupId)/settlements")
    }

    static func receipts(groupId: String) async throws -> GroupReceiptsResponse {
        try await ApiClient.shared.get("/api/groups/\(groupId)/receipts")
    }
}

// MARK: - Goals

enum GoalsRepo {
    private struct GoalsWrap: Decodable { let goals: [SavingsGoal] }
    private struct GoalWrap: Decodable { let goal: SavingsGoal }

    static func list() async throws -> [SavingsGoal] {
        let wrap: GoalsWrap = try await ApiClient.shared.get("/api/personal/goals")
        return wrap.goals
    }

    static func create(_ body: GoalCreate) async throws -> SavingsGoal {
        let wrap: GoalWrap = try await ApiClient.shared.post("/api/personal/goals", body: body)
        return wrap.goal
    }

    static func update(id: String, body: GoalUpdate) async throws -> SavingsGoal {
        let wrap: GoalWrap = try await ApiClient.shared.put("/api/personal/goals/\(id)", body: body)
        return wrap.goal
    }

    static func delete(id: String) async throws {
        try await ApiClient.shared.deleteVoid("/api/personal/goals/\(id)")
    }

    /// Goals deposits are a separate route: `/api/personal/goals/[id]/deposit`.
    static func deposit(goalId: String, amount: Double, note: String? = nil) async throws -> DepositResponse {
        try await ApiClient.shared.post(
            "/api/personal/goals/\(goalId)/deposit",
            body: DepositBody(amount: amount, note: note)
        )
    }
}

// MARK: - Challenges

enum ChallengesRepo {
    private struct ListWrap: Decodable { let challenges: [Challenge] }
    private struct CreateWrap: Decodable { let challenge: Challenge }

    static func list() async throws -> [Challenge] {
        let wrap: ListWrap = try await ApiClient.shared.get("/api/personal/challenges")
        return wrap.challenges
    }

    static func create(_ body: ChallengeCreate) async throws -> Challenge {
        let wrap: CreateWrap = try await ApiClient.shared.post("/api/personal/challenges", body: body)
        return wrap.challenge
    }
}

// MARK: - Loyalty

enum LoyaltyRepo {
    private struct ListWrap: Decodable { let cards: [LoyaltyCard] }
    private struct CreateWrap: Decodable { let card: LoyaltyCard }
    private struct IdBody: Encodable { let id: String }

    static func list() async throws -> [LoyaltyCard] {
        let wrap: ListWrap = try await ApiClient.shared.get("/api/personal/loyalty")
        return wrap.cards
    }

    static func create(_ body: LoyaltyCardCreate) async throws -> LoyaltyCard {
        let wrap: CreateWrap = try await ApiClient.shared.post("/api/personal/loyalty", body: body)
        return wrap.card
    }

    static func delete(id: String) async throws {
        try await ApiClient.shared.deleteVoid("/api/personal/loyalty", body: IdBody(id: id))
    }
}

// MARK: - Prices

enum PricesRepo {
    /// `/api/prices/compare` only reads `lang` + `currency` (+ optional
    /// `force`) from the body; the product list comes from the user's
    /// scanned receipts server-side. `force` bypasses the 24 h backend
    /// cache — used by the refresh button on the Products card. Default
    /// `false` lets cached payloads return in ~50 ms.
    static func compare(lang: String? = nil, currency: String? = nil, force: Bool = false) async throws -> PriceComparisonResponse {
        try await ApiClient.shared.post(
            "/api/prices/compare",
            body: PriceCompareBody(lang: lang, currency: currency, force: force)
        )
    }
}

// MARK: - Audit

enum AuditRepo {
    struct Body: Encodable {
        let lang: String?
        let currency: String?
        let force: Bool?
    }

    /// Returns the full audit result object directly (no wrapper).
    /// `force = true` bypasses the 6 h backend cache.
    static func generate(lang: String? = nil, currency: String? = nil, force: Bool = false) async throws -> AuditResult {
        try await ApiClient.shared.post(
            "/api/audit/generate",
            body: Body(lang: lang, currency: currency, force: force)
        )
    }
}

// MARK: - Analysis

enum AnalysisRepo {
    struct Body: Encodable {
        let lang: String?
        let currency: String?
        let period: String?
    }

    /// `period` is one of `"7d" | "30d" | "3m" | "6m" | "1y" | "all"` — mirrors
    /// the web period selector. Backend currently hardcodes 90 days for its AI
    /// prompt but accepts the key for forward compat; iOS uses it identically
    /// to web (UI state controlling the tab selection).
    static func run(lang: String? = nil, currency: String? = nil, period: String? = nil) async throws -> AnalysisResponse {
        try await ApiClient.shared.post(
            "/api/analysis/ai",
            body: Body(lang: lang, currency: currency, period: period)
        )
    }
}

// MARK: - Reports

enum ReportsRepo {
    /// `/api/reports/generate` accepts **multipart formData** with fields
    /// `type: 'yearly' | 'monthly'` and either `year` (for yearly) or
    /// `ym` (YYYY-MM for monthly).
    static func generateYearly(year: String) async throws -> ReportGenerateResponse {
        try await ApiClient.shared.postForm(
            "/api/reports/generate",
            fields: ["type": "yearly", "year": year]
        )
    }

    static func generateMonthly(ym: String) async throws -> ReportGenerateResponse {
        try await ApiClient.shared.postForm(
            "/api/reports/generate",
            fields: ["type": "monthly", "ym": ym]
        )
    }
}

// MARK: - Monthly budget

enum BudgetRepo {
    /// `month` is `YYYY-MM`. Omit → backend defaults to current month.
    static func fetch(month: String? = nil) async throws -> BudgetResponse {
        var query: [URLQueryItem] = []
        if let month { query.append(URLQueryItem(name: "month", value: month)) }
        return try await ApiClient.shared.get("/api/personal/budget", query: query)
    }

    private struct UpsertWrap: Decodable { let budget: MonthlyBudget }

    static func upsert(_ body: BudgetUpsert) async throws -> MonthlyBudget {
        let wrap: UpsertWrap = try await ApiClient.shared.post("/api/personal/budget", body: body)
        return wrap.budget
    }
}

// MARK: - Financial health score

enum FinancialHealthRepo {
    static func fetch() async throws -> FinancialHealthResponse {
        try await ApiClient.shared.get("/api/personal/financial-health")
    }
}

// MARK: - Promotions / personalized deals

enum PromotionsRepo {
    struct Body: Encodable {
        let lang: String?
        let currency: String?
    }

    static func fetch(lang: String? = nil, currency: String? = nil) async throws -> PromotionsResponse {
        try await ApiClient.shared.post(
            "/api/personal/promotions",
            body: Body(lang: lang, currency: currency)
        )
    }
}

// MARK: - Shopping Advisor

enum ShoppingAdvisorRepo {
    struct Body: Encodable {
        let lang: String?
        let currency: String?
    }

    static func analyze(lang: String? = nil, currency: String? = nil) async throws -> ShoppingAdvisorResponse {
        try await ApiClient.shared.post(
            "/api/personal/shopping-advisor",
            body: Body(lang: lang, currency: currency)
        )
    }
}

// MARK: - Nearby Stores

enum NearbyStoresRepo {
    struct Body: Encodable {
        let lat: Double
        let lng: Double
        let radius: Int?
        let lang: String?
    }

    static func search(lat: Double, lng: Double, radius: Int? = 5000, lang: String? = nil) async throws -> NearbyStoresResponse {
        try await ApiClient.shared.post(
            "/api/personal/nearby-stores",
            body: Body(lat: lat, lng: lng, radius: radius, lang: lang)
        )
    }
}

// MARK: - Product Search

enum ProductSearchRepo {
    struct Body: Encodable {
        let query: String
        let lang: String?
        let currency: String?
    }

    static func search(query: String, lang: String? = nil, currency: String? = nil) async throws -> ProductSearchResponse {
        try await ApiClient.shared.post(
            "/api/personal/product-search",
            body: Body(query: query, lang: lang, currency: currency)
        )
    }
}

// MARK: - Merchant rules

// MARK: - Incomes (multiple income streams)

/// Backed by `/api/personal/incomes`. List, create, update, delete —
/// all keyed by the row's UUID so the UI can patch a row in place.
enum IncomesRepo {
    static func list() async throws -> [Income] {
        let r: IncomesListResponse = try await ApiClient.shared.get("/api/personal/incomes")
        return r.incomes
    }
    static func create(_ body: IncomeCreate) async throws -> Income {
        let r: IncomeWrap = try await ApiClient.shared.post("/api/personal/incomes", body: body)
        return r.income
    }
    static func update(_ body: IncomeUpdate) async throws {
        try await ApiClient.shared.putVoid("/api/personal/incomes", body: body)
    }
    static func delete(id: String) async throws {
        try await ApiClient.shared.deleteVoid("/api/personal/incomes", body: IncomeDeleteBody(id: id))
    }
}

enum MerchantRulesRepo {
    private struct ListWrap: Decodable { let rules: [MerchantRule] }
    private struct DeleteBody: Encodable { let vendor: String }

    static func list() async throws -> [MerchantRule] {
        let wrap: ListWrap = try await ApiClient.shared.get("/api/personal/merchant-rules")
        return wrap.rules
    }

    static func delete(vendor: String) async throws {
        try await ApiClient.shared.deleteVoid("/api/personal/merchant-rules", body: DeleteBody(vendor: vendor))
    }
}

// MARK: - GDPR data export

enum ExportDataRepo {
    /// Downloads the full user data dump as raw JSON bytes.
    /// Returns `(data, suggestedFilename)` from the HTTP response, matching
    /// `/api/personal/export-data` which streams a `solvio-export-*.json` blob.
    static func download() async throws -> (Data, String?) {
        try await ApiClient.shared.download("/api/personal/export-data")
    }
}

// MARK: - Maintenance (seed defaults, recategorize old data)

/// Endpoints that bring an account up to date — used on every cold start
/// and login because iOS clients bypass the web `(protected)/layout.tsx`
/// that does this for browser users.
enum MaintenanceRepo {
    private struct EmptyResp: Decodable {}

    /// POST `/api/v1/seed-categories` — idempotent. If the user already has
    /// categories, the backend no-ops; otherwise it inserts a default set
    /// (PL or EN, defaults to PL).
    static func seedCategories() async throws {
        try await ApiClient.shared.postEmptyVoid("/api/v1/seed-categories")
    }

    struct RecategorizeBody: Encodable {
        let force: Bool
        let lang: String
    }

    struct RecategorizeResult: Decodable {
        let ok: Bool?
        let processed: Int?
        let itemsUpdated: Int?
        let itemsAttempted: Int?
        let expensesUpdated: Int?
    }

    /// POST `/api/v1/recategorize-receipts` — runs AI categorization on
    /// items in existing receipts whose `category_id` is null. Idempotent
    /// at the data level, but rate-limited server-side to 3 runs/hour.
    /// `force=true` re-categorizes even items that already have a category.
    @discardableResult
    static func recategorize(force: Bool = false, lang: String = "pl") async throws -> RecategorizeResult {
        try await ApiClient.shared.post(
            "/api/v1/recategorize-receipts",
            body: RecategorizeBody(force: force, lang: lang)
        )
    }

    struct PendingCount: Decodable {
        let totalReceipts: Int
        let pendingReceipts: Int
        let pendingItems: Int
    }

    /// GET equivalent — quick summary of how much would be processed.
    static func pendingCount() async throws -> PendingCount {
        try await ApiClient.shared.get("/api/v1/recategorize-receipts")
    }
}

// MARK: - Shopping list optimizer

/// `/api/shopping/optimize` — given a shopping list and an optional
/// location, returns the best single store to buy everything from
/// plus a per-item price breakdown. Powered by Azure OpenAI / OpenAI
/// with web search for live store prices.
enum ShoppingRepo {
    static func optimize(_ body: ShoppingOptimizeRequest) async throws -> ShoppingOptimizeResult {
        try await ApiClient.shared.post("/api/shopping/optimize", body: body)
    }
}

// MARK: - Receipt analyzer

/// `/api/personal/receipt-analyze` — given a `receiptId` the user already
/// scanned, returns a per-line audit of the prices vs current chain
/// leaflets. Used by Okazje's "Analyze a receipt" flow.
enum ReceiptAnalyzeRepo {
    static func analyze(receiptId: String, lang: String) async throws -> ReceiptAnalyzeResponse {
        try await ApiClient.shared.post(
            "/api/personal/receipt-analyze",
            body: ReceiptAnalyzeRequest(receiptId: receiptId, lang: lang)
        )
    }
}
