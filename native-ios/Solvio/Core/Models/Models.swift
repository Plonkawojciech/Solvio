import Foundation

// MARK: - Session

/// Response shape of `GET /api/auth/session/me`.
struct SessionMe: Decodable {
    let email: String?
}

struct SessionLoginResponse: Decodable {
    let ok: Bool?
    let userId: String
}

// MARK: - Categories

struct Category: Codable, Identifiable, Hashable {
    let id: String
    let name: String
    let icon: String?
    let color: String?
    let isDefault: Bool?
}

// MARK: - User settings

struct UserSettings: Codable {
    let currency: String?
    let language: String?
    let productType: String?
    let monthlyBudget: String?
    let notificationsEnabled: Bool?
    let timezone: String?
}

// MARK: - Expenses

struct Expense: Codable, Identifiable, Hashable {
    let id: String
    let title: String
    let amount: MoneyString
    let currency: String?
    let date: String
    let vendor: String?
    let categoryId: String?
    let receiptId: String?
    let notes: String?
    let tags: [String]?
    /// Populated by dashboard endpoint only; null elsewhere.
    let exchangeRate: MoneyString?
    let createdAt: String?
    /// Only the expenses list endpoint joins category metadata; the
    /// dashboard endpoint returns these as nil and the UI must look
    /// them up from the categories array.
    let categoryName: String?
    let categoryIcon: String?
    /// Id wiersza w Finansach crm.programo.pl, jeśli wydatek został tam
    /// wypchnięty. Niepuste = edycja u nas dociąga CRM zamiast dublować.
    let crmEntryId: String?
}

struct ExpenseListResponse: Codable {
    let expenses: [Expense]
    let categories: [Category]?
    let settings: UserSettings?
}

struct ExpenseCreate: Encodable {
    let title: String
    let amount: String
    let date: String
    let categoryId: String?
    let vendor: String?
    let notes: String?
    let tags: [String]?
    let currency: String?
    let receiptId: String?
}

struct ExpenseUpdate: Encodable {
    let id: String
    let title: String
    let amount: String
    let date: String
    let categoryId: String?
    let vendor: String?
    let notes: String?
    let tags: [String]?
    /// Optional link to a scanned receipt. Mirrors `ExpenseCreate.receiptId`
    /// so an existing manual expense can be re-linked to (or unlinked from)
    /// a receipt without going through delete + recreate. The backend
    /// `UpdateExpenseSchema` accepts this and persists it.
    let receiptId: String?
}

struct ExpenseDelete: Encodable {
    let ids: [String]
}

struct ExpenseWrap: Decodable {
    let expense: Expense
}

// MARK: - Receipts

/// Item within a receipt. Backend jsonb uses `price` for OCR entries,
/// but the PUT schema also allows `totalPrice` / `unitPrice`.
struct ReceiptItem: Codable, Identifiable, Hashable {
    let id: String?
    let name: String
    /// Nazwa rozwinięta ze skrótu kasowego („PILOSJOG NAT" → „Pilos jogurt
    /// naturalny"). Serwer ją liczy raz, przy odczycie paragonu.
    let nameClean: String?
    let nameTranslated: String?
    let quantity: Double?
    let price: MoneyString?
    let unitPrice: MoneyString?
    let totalPrice: MoneyString?
    let categoryId: String?

    enum CodingKeys: String, CodingKey {
        case id
        case name
        case nameClean
        case nameTranslated
        case quantity
        case price
        case unitPrice
        case totalPrice
        case categoryId = "category_id"
    }

    /// Preferred price field for display (OCR uses `price`, manual edits may use `totalPrice`).
    var displayPrice: MoneyString? { price ?? totalPrice }

    /// Do pokazania człowiekowi: rozwinięta nazwa, tłumaczenie, dopiero potem
    /// surowy skrót z kasy.
    var displayName: String { nameClean ?? nameTranslated ?? name }
}

struct Receipt: Codable, Identifiable, Hashable {
    let id: String
    let vendor: String?
    let date: String?
    /// Optional — virtual receipts may be saved without a total.
    let total: MoneyString?
    let currency: String?
    let imageUrl: String?
    let items: [ReceiptItem]?
    /// List endpoint returns `itemCount` (computed via jsonb_array_length)
    /// instead of the full `items` array. Detail endpoint returns `items`.
    let itemCount: Int?
    let status: String?
    let groupId: String?
    let paidByMemberId: String?
    let exchangeRate: MoneyString?
    let detectedLanguage: String?
    let createdAt: String?

    /// Best-effort item count: prefer the API's `itemCount`, fall back to
    /// the `items` array length. Returns 0 when neither is available.
    var displayItemCount: Int {
        itemCount ?? items?.count ?? 0
    }
}

struct ReceiptListResponse: Decodable {
    let receipts: [Receipt]
}

/// Virtual receipt create body — POST `/api/data/receipts`.
struct ReceiptCreate: Encodable {
    let vendor: String?
    let date: String?
    let total: Double?
    let currency: String
    let items: [ReceiptItem]
    let notes: String?
}

// MARK: - OCR receipt upload

struct OcrItem: Codable, Hashable {
    let name: String
    /// Skrót z kasy rozwinięty przez serwer — patrz `ReceiptItem.nameClean`.
    let nameClean: String?
    let nameTranslated: String?
    let quantity: Double?
    let price: Double?
    let categoryId: String?

    enum CodingKeys: String, CodingKey {
        case name
        case nameClean
        case nameTranslated
        case quantity
        case price
        case categoryId = "category_id"
    }

    var displayName: String { nameClean ?? nameTranslated ?? name }
}

struct OcrPromotion: Codable, Hashable {
    /// Raw line as parsed from the receipt — e.g. "RABAT BLIK -2,00".
    let label: String
    /// Negative number for absolute discounts ("-2,00" → -2.00).
    /// `nil` when the discount is a percentage (we surface the label
    /// instead and trust the user to read it).
    let amount: Double?
}

struct OcrReceiptData: Codable {
    let merchant: String?
    let total: Double?
    let currency: String?
    let date: String?
    let time: String?
    let exchangeRate: Double?
    let detectedLanguage: String?
    let items: [OcrItem]?
    let itemsCount: Int?
    /// Discount/promo lines parsed from the raw OCR text. Used by the
    /// receipt confirmation toast and the receipt detail view to show
    /// "you saved X zł in promotions" right after scanning.
    /// Kategoria wybrana przez backend na podstawie pozycji paragonu.
    let categoryId: String?
    let promotions: [OcrPromotion]?
    /// Sum of all absolute discounts on the receipt — negative number.
    /// `nil` when no promo lines were detected (cleaner UX than
    /// rendering "saved 0,00 zł").
    let totalSaved: Double?

    enum CodingKeys: String, CodingKey {
        case merchant, total, currency, date, time, exchangeRate, detectedLanguage, items, promotions
        case categoryId = "category_id"
        case itemsCount = "items_count"
        case totalSaved = "totalSaved"
    }
}

struct OcrResult: Codable {
    let file: String
    let success: Bool
    let receiptId: String?
    /// Id wydatku utworzonego z tego paragonu. Bez niego ekran potwierdzenia
    /// musiałby zgadywać, który wiersz przed chwilą powstał — a przy dwóch
    /// paragonach z tego samego sklepu tego samego dnia zgadłby źle.
    let expenseId: String?
    let error: String?
    let message: String?
    let data: OcrReceiptData?

    enum CodingKeys: String, CodingKey {
        case file, success, error, message, data
        case receiptId = "receipt_id"
        case expenseId = "expense_id"
    }
}

struct OcrReceiptResponse: Codable {
    let success: Bool
    let filesProcessed: Int
    let filesSucceeded: Int
    let filesFailed: Int
    let results: [OcrResult]
    let receiptId: String?

    enum CodingKeys: String, CodingKey {
        case success, results
        case filesProcessed = "files_processed"
        case filesSucceeded = "files_succeeded"
        case filesFailed = "files_failed"
        case receiptId = "receipt_id"
    }

    var firstSuccess: OcrResult? {
        results.first(where: { $0.success && $0.receiptId != nil })
    }
}

// MARK: - Budgets

struct CategoryBudget: Codable, Identifiable, Hashable {
    let id: String
    let userId: String?
    let categoryId: String
    let amount: MoneyString
    let period: String?
    let createdAt: String?
    let updatedAt: String?

    static func == (lhs: CategoryBudget, rhs: CategoryBudget) -> Bool {
        lhs.id == rhs.id
    }
}

// MARK: - Dashboard (raw backend shape)

struct DashboardResponse: Decodable {
    let categories: [Category]
    let settings: UserSettings?
    let budgets: [CategoryBudget]
    let expenses: [Expense]
    let prevExpenses: [Expense]?
    let receiptsCount: Int
    let monthIncome: Double?
    let savingsTarget: Double?
    let prevTotal: Double?
    let prevByCategory: [String: Double]?
}

// MARK: - Merchant rules

struct MerchantRule: Codable, Identifiable, Hashable {
    var id: String { vendor }
    let vendor: String
    let categoryId: String
    let count: Int?
}

// MARK: - Incomes (multiple income streams per user)

/// One income source — `name` is user-supplied ("Pensja", "Freelance"…),
/// `amount` is in user's currency, `period` ∈ {monthly, weekly, yearly,
/// oneoff}. The savings hub normalises rows into a per-month aggregate.
struct Income: Codable, Identifiable, Hashable {
    let id: String
    let userId: String?
    let name: String
    let amount: MoneyString
    let period: String
    let emoji: String?
    let isActive: Bool?
    let createdAt: String?
    let updatedAt: String?

    /// Returns this income normalized to a monthly figure based on `period`.
    /// Mirrors the backend math used in dashboards / health-score
    /// calculations so the iOS hero stat matches the AI's view of income.
    var monthlyAmount: Double {
        let raw = amount.double
        switch period {
        case "weekly":  return raw * 52.0 / 12.0
        case "yearly":  return raw / 12.0
        case "oneoff":  return 0  // one-off → not part of recurring income
        default:        return raw    // "monthly"
        }
    }
}

struct IncomeCreate: Encodable {
    let name: String
    let amount: Double
    let period: String?
    let emoji: String?
}

struct IncomeUpdate: Encodable {
    let id: String
    let name: String?
    let amount: Double?
    let period: String?
    let emoji: String?
    let isActive: Bool?
}

struct IncomeDeleteBody: Encodable { let id: String }
struct IncomesListResponse: Decodable { let incomes: [Income] }
struct IncomeWrap: Decodable { let income: Income }

// MARK: - Monthly budget + category breakdown

/// Row from the `monthly_budgets` table. Strings because Drizzle
/// maps `decimal(12,2)` to text and the backend returns them raw.
struct MonthlyBudget: Decodable, Hashable {
    let id: String
    let userId: String?
    let month: String
    let totalIncome: String?
    let totalBudget: String?
    let savingsTarget: String?
    let createdAt: String?
    let updatedAt: String?
}

struct BudgetCategoryRow: Decodable, Identifiable, Hashable {
    let id: String
    let name: String
    let icon: String?
    let color: String?
    let budgeted: Double
    let spent: Double
}

struct BudgetAlert: Decodable, Identifiable, Hashable {
    var id: String { "\(type)-\(category)-\(pct)" }
    /// `critical` (≥100%) or `warning` (≥80%).
    let type: String
    /// `__total__` for aggregate, otherwise category name.
    let category: String
    let spent: Double
    let budgeted: Double
    let pct: Double
}

struct BudgetResponse: Decodable {
    let budget: MonthlyBudget?
    let totalSpent: Double
    let categoryBreakdown: [BudgetCategoryRow]
    let alerts: [BudgetAlert]
    let monthProgress: Double
    let month: String
}

struct BudgetUpsert: Encodable {
    let month: String
    let totalIncome: Double?
    let totalBudget: Double?
    let savingsTarget: Double?
}
