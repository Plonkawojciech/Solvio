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

struct DemoLoginResponse: Decodable {
    let success: Bool
    let redirect: String?
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
    let isRecurring: Bool?
    /// Populated by dashboard endpoint only; null elsewhere.
    let exchangeRate: MoneyString?
    let createdAt: String?
    /// Only the expenses list endpoint joins category metadata; the
    /// dashboard endpoint returns these as nil and the UI must look
    /// them up from the categories array.
    let categoryName: String?
    let categoryIcon: String?
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
    let nameTranslated: String?
    let quantity: Double?
    let price: MoneyString?
    let unitPrice: MoneyString?
    let totalPrice: MoneyString?
    let categoryId: String?

    enum CodingKeys: String, CodingKey {
        case id
        case name
        case nameTranslated
        case quantity
        case price
        case unitPrice
        case totalPrice
        case categoryId = "category_id"
    }

    /// Preferred price field for display (OCR uses `price`, manual edits may use `totalPrice`).
    var displayPrice: MoneyString? { price ?? totalPrice }
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
    let nameTranslated: String?
    let quantity: Double?
    let price: Double?
    let categoryId: String?

    enum CodingKeys: String, CodingKey {
        case name
        case nameTranslated
        case quantity
        case price
        case categoryId = "category_id"
    }
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
    let promotions: [OcrPromotion]?
    /// Sum of all absolute discounts on the receipt — negative number.
    /// `nil` when no promo lines were detected (cleaner UX than
    /// rendering "saved 0,00 zł").
    let totalSaved: Double?

    enum CodingKeys: String, CodingKey {
        case merchant, total, currency, date, time, exchangeRate, detectedLanguage, items, promotions
        case itemsCount = "items_count"
        case totalSaved = "totalSaved"
    }
}

struct OcrResult: Codable {
    let file: String
    let success: Bool
    let receiptId: String?
    let error: String?
    let message: String?
    let data: OcrReceiptData?

    enum CodingKeys: String, CodingKey {
        case file, success, error, message, data
        case receiptId = "receipt_id"
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

// MARK: - Groups

struct GroupMember: Codable, Identifiable, Hashable {
    let id: String
    let groupId: String?
    let userId: String?
    let displayName: String
    /// Backend normalises members to include `name = displayName`.
    let name: String?
    let email: String?
    let color: String?
    let createdAt: String?

    var label: String { name ?? displayName }
}

struct Group: Codable, Identifiable, Hashable {
    let id: String
    let name: String
    let description: String?
    let emoji: String?
    let currency: String
    let mode: String?
    let startDate: String?
    let endDate: String?
    let createdBy: String?
    let createdAt: String?
    let members: [GroupMember]?
    let splits: [ExpenseSplit]?
    let totalBalance: Double?
}

struct GroupMemberInput: Encodable {
    let displayName: String
    let email: String?
    let color: String?
    let userId: String?
}

struct GroupCreate: Encodable {
    let name: String
    let description: String?
    let currency: String?
    let emoji: String?
    let mode: String?
    let startDate: String?
    let endDate: String?
    let members: [GroupMemberInput]?
}

struct GroupUpdate: Encodable {
    let name: String?
    let description: String?
    let currency: String?
    let emoji: String?
    let mode: String?
    let startDate: String?
    let endDate: String?
}

// MARK: - Expense splits

struct SplitShare: Codable, Hashable {
    let memberId: String
    /// Backend stores + expects JSON number, not string.
    let amount: Double
    let settled: Bool?
    let settledAt: String?
}

struct ExpenseSplit: Codable, Identifiable, Hashable {
    let id: String
    let groupId: String
    let expenseId: String?
    let paidByMemberId: String
    let totalAmount: MoneyString
    let currency: String?
    let description: String?
    let splits: [SplitShare]
    let receiptId: String?
    let createdAt: String?
}

struct SplitPortionInput: Encodable {
    let memberId: String
    let amount: Double
    let settled: Bool?
}

struct SplitCreate: Encodable {
    let groupId: String
    let paidByMemberId: String
    let totalAmount: Double
    let currency: String?
    let description: String?
    let splits: [SplitPortionInput]
    let expenseId: String?
    let receiptId: String?
}

struct SettleBody: Encodable {
    let memberId: String
}

// MARK: - Settlements (computed per group)

struct SettlementPerPerson: Decodable, Identifiable, Hashable {
    var id: String { memberId }
    let memberId: String
    let name: String
    let color: String
    let totalPaid: Double
    let totalConsumed: Double
    let netBalance: Double
}

struct SettlementDebt: Decodable, Identifiable, Hashable {
    var id: String { "\(fromId)->\(toId)-\(amount)" }
    let fromId: String
    let fromName: String
    let fromColor: String
    let toId: String
    let toName: String
    let toColor: String
    let amount: Double
}

struct SettlementPaymentRequest: Decodable, Identifiable, Hashable {
    let id: String
    let fromMemberId: String
    let fromName: String
    let fromColor: String?
    let toMemberId: String
    let toName: String
    let toColor: String?
    let amount: Double
    let currency: String?
    let status: String
    let note: String?
    let shareToken: String?
    let bankAccount: String?
    let settledAt: String?
    let settledBy: String?
    let createdAt: String?
}

struct SettlementStats: Decodable, Hashable {
    let totalGroupSpend: Double
    let receiptsCount: Int
    let membersCount: Int
    let allSettled: Bool
    let pendingCount: Int
    let settledCount: Int
    let totalPendingAmount: Double
    let totalSettledAmount: Double
}

struct SettlementGroupMeta: Decodable, Hashable {
    let id: String
    let name: String
    let emoji: String?
    let currency: String?
    let mode: String?
    let startDate: String?
    let endDate: String?
}

struct SettlementsResponse: Decodable {
    let group: SettlementGroupMeta
    let perPersonBreakdown: [SettlementPerPerson]
    let debts: [SettlementDebt]
    let paymentRequests: [SettlementPaymentRequest]
    let stats: SettlementStats
}

// MARK: - Group receipts view

struct GroupReceiptMember: Decodable, Hashable {
    let id: String
    let name: String
    let email: String?
    let color: String?
}

struct GroupReceiptItemAssignment: Decodable, Hashable {
    let id: String
    let receiptItemId: String
    let memberId: String
    let groupId: String?
    let share: String?
}

struct GroupReceiptEntry: Decodable, Identifiable, Hashable {
    let id: String
    let vendor: String?
    let date: String?
    let total: MoneyString?
    let currency: String?
    let imageUrl: String?
    let status: String?
    let paidByMemberId: String?
    let receiptItems: [ReceiptItem]?
    let assignments: [GroupReceiptItemAssignment]?
    let paidByMember: GroupReceiptMember?
    let assignedItemCount: Int?
    let totalItemCount: Int?
}

struct GroupReceiptsResponse: Decodable {
    let receipts: [GroupReceiptEntry]
    let members: [GroupReceiptMember]
}

// MARK: - Savings goals

struct SavingsDeposit: Codable, Identifiable, Hashable {
    let id: String
    let goalId: String?
    let userId: String?
    let amount: MoneyString
    let note: String?
    let createdAt: String?
}

struct SavingsGoal: Codable, Identifiable, Hashable {
    let id: String
    let name: String
    let emoji: String?
    let targetAmount: MoneyString
    let currentAmount: MoneyString
    let currency: String
    let deadline: String?
    let priority: String?
    let color: String?
    let category: String?
    let isCompleted: Bool?
    let completedAt: String?
    let aiTips: [String]?
    let createdAt: String?
    let deposits: [SavingsDeposit]?
}

struct SavingsGoalsResponse: Decodable {
    let goals: [SavingsGoal]
}

struct GoalCreate: Encodable {
    let name: String
    let emoji: String?
    let targetAmount: Double
    let deadline: String?
    let priority: String?
    let color: String?
    let category: String?
    let currency: String
    let lang: String?
}

struct GoalUpdate: Encodable {
    let name: String?
    let emoji: String?
    let targetAmount: Double?
    let deadline: String?
    let priority: String?
    let color: String?
    let category: String?
}

struct DepositBody: Encodable {
    let amount: Double
    let note: String?
}

struct DepositResponse: Decodable {
    let success: Bool
    let newAmount: String
    let completed: Bool
}

// MARK: - Challenges

struct Challenge: Codable, Identifiable, Hashable {
    let id: String
    let name: String
    let emoji: String?
    let type: String
    let targetCategory: String?
    let targetAmount: MoneyString?
    let startDate: String
    let endDate: String
    let isActive: Bool?
    let isCompleted: Bool?
    let currentProgress: MoneyString?
    let createdAt: String?
}

struct ChallengeCreate: Encodable {
    let name: String
    let emoji: String?
    let type: String
    let targetCategory: String?
    let targetAmount: Double?
    let startDate: String
    let endDate: String
}

// MARK: - Loyalty cards

struct LoyaltyCard: Codable, Identifiable, Hashable {
    let id: String
    let store: String
    let cardNumber: String?
    let memberName: String?
    let isActive: Bool?
    let lastUsed: String?
    let createdAt: String?
}

struct LoyaltyCardCreate: Encodable {
    let store: String
    let cardNumber: String?
    let memberName: String?
}

// MARK: - Reports

struct ReportUrls: Decodable {
    let csv: String
    let pdf: String
    let docx: String
}

struct ReportGenerateResponse: Decodable {
    let success: Bool
    let path: String
    let urls: ReportUrls
}

// MARK: - Audit

struct AuditPeriod: Decodable, Hashable {
    let from: String
    let to: String
}

struct AuditTopStore: Decodable, Hashable, Identifiable {
    var id: String { store }
    let store: String
    let amount: Double
}

struct AuditTopProduct: Decodable, Hashable, Identifiable {
    var id: String { name }
    let name: String
    let totalPaid: Double
    let count: Double
    let avgPrice: Double
    let vendor: String?
    let dates: [String]?
}

struct AuditPriceComparison: Decodable, Hashable, Identifiable {
    var id: String { product }
    let product: String
    let pricePaid: Double?
    let prices: [String: Double]?
    let cheapestStore: String?
    let cheapestPrice: Double?
    let potentialSaving: Double?
    let verdict: String?
}

struct AuditPromotion: Decodable, Hashable {
    let store: String?
    let product: String?
    let price: Double?
    let validUntil: String?
    let description: String?
}

struct AuditResult: Decodable {
    let period: AuditPeriod
    let totalSpent: Double
    let transactionCount: Int
    let currency: String
    let categoryBreakdown: [String: Double]
    let topStores: [AuditTopStore]
    let topProducts: [AuditTopProduct]
    let priceComparisons: [AuditPriceComparison]
    let currentPromotions: [AuditPromotion]?
    let bestStore: String?
    let totalPotentialSaving: Double
    let personalMessage: String?
    let topTip: String?
    let aiSummary: String
    let webSearchUsed: Bool?
}

// MARK: - Analysis

struct AnalysisInsight: Decodable, Identifiable, Hashable {
    var id: String { "\(type)-\(title)" }
    let type: String
    let title: String
    let description: String
    let icon: String?
}

struct AnalysisRecommendation: Decodable, Identifiable, Hashable {
    var id: String { "\(priority)-\(title)" }
    let priority: String
    let title: String
    let description: String
    let potentialSaving: Double?
}

struct AnalysisAnomaly: Decodable, Hashable {
    let date: String?
    let category: String?
    let description: String?
    let amount: Double?
}

struct CategoryTrend: Decodable, Identifiable, Hashable {
    var id: String { category }
    let category: String
    let trend: String
    let changePercent: Double
    let note: String?
}

struct AnalysisBankTopMerchant: Decodable, Hashable {
    let name: String
    /// Backend returns string-formatted decimal.
    let amount: String
}

struct AnalysisBankStats: Decodable, Hashable {
    let totalTransactions: Int
    let totalDebit: Double
    let totalCredit: Double
    let topMerchants: [AnalysisBankTopMerchant]
    let accountCount: Int
}

struct AnalysisResponse: Decodable {
    let summary: String?
    let insights: [AnalysisInsight]?
    let recommendations: [AnalysisRecommendation]?
    let anomalies: [AnalysisAnomaly]?
    let categoryTrends: [CategoryTrend]?
    let predictedMonthlySpend: Double?
    let bankStats: AnalysisBankStats?
}

// MARK: - Prices / Compare

struct PriceEntry: Decodable, Hashable {
    let store: String
    /// AI returns numbers here (not strings).
    let price: Double?
    let promotion: String?
    let validUntil: String?
}

struct PriceComparison: Decodable, Identifiable, Hashable {
    var id: String { productName }
    let productName: String
    let userLastPrice: Double?
    let userLastStore: String?
    let allPrices: [PriceEntry]?
    let bestPrice: Double?
    let bestStore: String?
    let bestDeal: String?
    let savingsAmount: Double?
    let savingsPercent: Double?
    let recommendation: String?
    let buyNow: Bool?
}

struct PriceComparisonResponse: Decodable {
    let comparisons: [PriceComparison]
    let totalPotentialSavings: Double
    let summary: String?
    let bestStoreOverall: String?
    let tip: String?
    let productsAnalyzed: Int?
    let isEstimated: Bool?
    let error: String?
    let message: String?
}

struct PriceCompareBody: Encodable {
    let lang: String?
    let currency: String?
    /// Set to `true` from the refresh button on the Products card to
    /// bypass the 24 h server-side cache. Auto-prefetch from
    /// `loadAll()` always sends `false` so cached payloads return in
    /// ~50 ms.
    let force: Bool?
}

// MARK: - Shopping Advisor

struct AdvisorAlternativeStore: Decodable, Hashable {
    let store: String
    let price: Double?
    let deal: String?
}

struct AdvisorRecommendation: Decodable, Identifiable, Hashable {
    var id: String { productName }
    let productName: String
    let category: String?
    let userAvgPrice: Double?
    let userLastStore: String?
    let bestStore: String?
    let bestPrice: Double?
    let bestDeal: String?
    let alternativeStores: [AdvisorAlternativeStore]?
    let savingsPerUnit: Double?
    let savingsPercent: Double?
    let verdict: String?
    let tip: String?
}

struct AdvisorStorePlan: Decodable, Hashable {
    let store: String
    let products: [String]?
    let estimatedTotal: Double?
    let whyThisStore: String?
}

struct AdvisorWeeklyPlan: Decodable, Hashable {
    let stores: [AdvisorStorePlan]?
    let totalEstimated: Double?
    let totalSavings: Double?
    let savingsPercent: Double?
}

struct AdvisorInsight: Decodable, Identifiable, Hashable {
    var id: String { "\(type)-\(title)" }
    let type: String
    let title: String
    let description: String
    let icon: String?
}

struct ShoppingAdvisorResponse: Decodable {
    let recommendations: [AdvisorRecommendation]?
    let weeklyPlan: AdvisorWeeklyPlan?
    let topInsights: [AdvisorInsight]?
    let summary: String?
    let totalPotentialMonthlySavings: Double?
    let bestOverallStore: String?
    let productsAnalyzed: Int?
    let currency: String?
    let storesKnown: Int?
    let error: String?
}

// MARK: - Nearby Stores

struct NearbyStore: Decodable, Identifiable, Hashable {
    let id: String
    let name: String
    let originalName: String?
    let brand: String?
    let isKnown: Bool
    let lat: Double
    let lng: Double
    let distance: Int
    let address: String?
    let city: String?
    let openingHours: String?
    let phone: String?
    let website: String?
    let category: String?
    let shopType: String?
}

struct NearbyStoresResponse: Decodable {
    let stores: [NearbyStore]
    let total: Int
    let knownStoresCount: Int
    let nearbyBrands: [String]?
    let searchRadius: Int
}

// MARK: - Product Search

struct ProductSearchResult: Decodable, Identifiable, Hashable {
    var id: String { "\(store)-\(productName)" }
    let store: String
    let productName: String
    let price: Double?
    let pricePerUnit: String?
    let isPromo: Bool?
    let promoDetails: String?
    let availability: String?
}

struct ProductAlternative: Decodable, Identifiable, Hashable {
    var id: String { name }
    let name: String
    let avgPrice: Double?
    let whyBetter: String?
}

struct ProductPriceRange: Decodable, Hashable {
    let min: Double
    let max: Double
}

struct ProductSearchResponse: Decodable {
    let query: String
    let product: String?
    let category: String?
    let results: [ProductSearchResult]
    let cheapestStore: String?
    let cheapestPrice: Double?
    let averagePrice: Double?
    let priceRange: ProductPriceRange?
    let alternatives: [ProductAlternative]?
    let tip: String?
    let currency: String?
    let isEstimated: Bool?
}

// MARK: - Merchant rules

struct MerchantRule: Codable, Identifiable, Hashable {
    var id: String { vendor }
    let vendor: String
    let categoryId: String
    let count: Int?
}

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

// MARK: - Financial health

struct FinancialHealthResponse: Decodable {
    let score: Int
    let tips: [String]
}

// MARK: - Promotions / personalized deals

struct PromoOffer: Decodable, Identifiable, Hashable {
    let id: String
    let store: String?
    let productName: String?
    let regularPrice: Double?
    let promoPrice: Double?
    let discount: String?
    let currency: String?
    let validFrom: String?
    let validUntil: String?
    let category: String?
    let matchesPurchases: Bool?
    /// Optional URL to the chain's official weekly leaflet (e.g.
    /// `https://www.lidl.pl/c/gazetka-promocyjna/...`). Backend backfills
    /// this from a static map when the AI didn't return one.
    let leafletUrl: String?
    /// Optional direct deep-link to the specific product/promo page if
    /// the AI was confident enough to provide one. Often null — leaflet
    /// URL is the safer fallback.
    let dealUrl: String?
}

struct WeeklySummary: Decodable, Hashable {
    let id: String?
    let weekStart: String?
    let weekEnd: String?
    let totalSpent: String?
    let totalIncome: String?
    let topCategory: String?
    let summary: String?
    let createdAt: String?
}

struct PromotionsResponse: Decodable {
    let promotions: [PromoOffer]
    let personalizedDeals: [PromoOffer]
    let totalPotentialSavings: Double?
    let weeklySummary: WeeklySummary?
}
