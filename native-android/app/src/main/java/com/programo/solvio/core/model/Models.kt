package com.programo.solvio.core.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

// MARK: - Session

@Serializable
data class SessionMe(val email: String? = null)

@Serializable
data class SessionLoginResponse(val ok: Boolean? = null, val userId: String)

@Serializable
data class DemoLoginResponse(val success: Boolean, val redirect: String? = null)

// MARK: - Categories

@Serializable
data class Category(
    val id: String,
    val name: String,
    val icon: String? = null,
    val color: String? = null,
    val isDefault: Boolean? = null,
)

// MARK: - User settings

@Serializable
data class UserSettings(
    val currency: String? = null,
    val language: String? = null,
    val productType: String? = null,
    val monthlyBudget: String? = null,
    val notificationsEnabled: Boolean? = null,
    val timezone: String? = null,
)

// MARK: - Expenses

@Serializable
data class Expense(
    val id: String,
    val title: String,
    val amount: MoneyString,
    val currency: String? = null,
    val date: String,
    val vendor: String? = null,
    val categoryId: String? = null,
    val receiptId: String? = null,
    val notes: String? = null,
    val tags: List<String>? = null,
    val isRecurring: Boolean? = null,
    val exchangeRate: MoneyString? = null,
    val createdAt: String? = null,
    val categoryName: String? = null,
    val categoryIcon: String? = null,
)

@Serializable
data class ExpenseListResponse(
    val expenses: List<Expense>,
    val categories: List<Category>? = null,
    val settings: UserSettings? = null,
)

@Serializable
data class ExpenseCreate(
    val title: String,
    val amount: String,
    val date: String,
    val categoryId: String? = null,
    val vendor: String? = null,
    val notes: String? = null,
    val tags: List<String>? = null,
    val currency: String? = null,
    val receiptId: String? = null,
)

@Serializable
data class ExpenseUpdate(
    val id: String,
    val title: String,
    val amount: String,
    val date: String,
    val categoryId: String? = null,
    val vendor: String? = null,
    val notes: String? = null,
    val tags: List<String>? = null,
)

@Serializable
data class ExpenseDelete(val ids: List<String>)

@Serializable
data class ExpenseWrap(val expense: Expense)

// MARK: - Receipts

@Serializable
data class ReceiptItem(
    val id: String? = null,
    val name: String,
    val nameTranslated: String? = null,
    val quantity: Double? = null,
    val price: MoneyString? = null,
    val unitPrice: MoneyString? = null,
    val totalPrice: MoneyString? = null,
    @SerialName("category_id") val categoryId: String? = null,
) {
    val displayPrice: MoneyString? get() = price ?: totalPrice
}

@Serializable
data class Receipt(
    val id: String,
    val vendor: String? = null,
    val date: String? = null,
    val total: MoneyString? = null,
    val currency: String? = null,
    val imageUrl: String? = null,
    val items: List<ReceiptItem>? = null,
    val itemCount: Int? = null,
    val status: String? = null,
    val groupId: String? = null,
    val paidByMemberId: String? = null,
    val exchangeRate: MoneyString? = null,
    val detectedLanguage: String? = null,
    val createdAt: String? = null,
) {
    val displayItemCount: Int get() = itemCount ?: items?.size ?: 0
}

@Serializable
data class ReceiptListResponse(val receipts: List<Receipt>)

@Serializable
data class ReceiptCreate(
    val vendor: String? = null,
    val date: String? = null,
    val total: Double? = null,
    val currency: String,
    val items: List<ReceiptItem>,
    val notes: String? = null,
)

// MARK: - OCR

@Serializable
data class OcrItem(
    val name: String,
    val nameTranslated: String? = null,
    val quantity: Double? = null,
    val price: Double? = null,
    @SerialName("category_id") val categoryId: String? = null,
)

@Serializable
data class OcrPromotion(val label: String, val amount: Double? = null)

@Serializable
data class OcrReceiptData(
    val merchant: String? = null,
    val total: Double? = null,
    val currency: String? = null,
    val date: String? = null,
    val time: String? = null,
    val exchangeRate: Double? = null,
    val detectedLanguage: String? = null,
    val items: List<OcrItem>? = null,
    @SerialName("items_count") val itemsCount: Int? = null,
    val promotions: List<OcrPromotion>? = null,
    val totalSaved: Double? = null,
)

@Serializable
data class OcrResult(
    val file: String,
    val success: Boolean,
    @SerialName("receipt_id") val receiptId: String? = null,
    val error: String? = null,
    val message: String? = null,
    val data: OcrReceiptData? = null,
)

@Serializable
data class OcrReceiptResponse(
    val success: Boolean,
    @SerialName("files_processed") val filesProcessed: Int,
    @SerialName("files_succeeded") val filesSucceeded: Int,
    @SerialName("files_failed") val filesFailed: Int,
    val results: List<OcrResult>,
    @SerialName("receipt_id") val receiptId: String? = null,
) {
    val firstSuccess: OcrResult? get() = results.firstOrNull { it.success && it.receiptId != null }
}

// MARK: - Budgets

@Serializable
data class CategoryBudget(
    val id: String,
    val userId: String? = null,
    val categoryId: String,
    val amount: MoneyString,
    val period: String? = null,
    val createdAt: String? = null,
    val updatedAt: String? = null,
)

// MARK: - Dashboard

@Serializable
data class DashboardResponse(
    val categories: List<Category>,
    val settings: UserSettings? = null,
    val budgets: List<CategoryBudget>,
    val expenses: List<Expense>,
    val prevExpenses: List<Expense>? = null,
    val receiptsCount: Int,
    val monthIncome: Double? = null,
    val savingsTarget: Double? = null,
    val prevTotal: Double? = null,
    val prevByCategory: Map<String, Double>? = null,
)

// MARK: - Groups

@Serializable
data class GroupMember(
    val id: String,
    val groupId: String? = null,
    val userId: String? = null,
    val displayName: String,
    val name: String? = null,
    val email: String? = null,
    val color: String? = null,
    val createdAt: String? = null,
) {
    val label: String get() = name ?: displayName
}

@Serializable
data class Group(
    val id: String,
    val name: String,
    val description: String? = null,
    val emoji: String? = null,
    val currency: String,
    val mode: String? = null,
    val startDate: String? = null,
    val endDate: String? = null,
    val createdBy: String? = null,
    val createdAt: String? = null,
    val members: List<GroupMember>? = null,
    val splits: List<ExpenseSplit>? = null,
    val totalBalance: Double? = null,
)

@Serializable
data class GroupMemberInput(
    val displayName: String,
    val email: String? = null,
    val color: String? = null,
    val userId: String? = null,
)

@Serializable
data class GroupCreate(
    val name: String,
    val description: String? = null,
    val currency: String? = null,
    val emoji: String? = null,
    val mode: String? = null,
    val startDate: String? = null,
    val endDate: String? = null,
    val members: List<GroupMemberInput>? = null,
)

@Serializable
data class GroupUpdate(
    val name: String? = null,
    val description: String? = null,
    val currency: String? = null,
    val emoji: String? = null,
    val mode: String? = null,
    val startDate: String? = null,
    val endDate: String? = null,
)

// MARK: - Splits

@Serializable
data class SplitShare(
    val memberId: String,
    val amount: Double,
    val settled: Boolean? = null,
    val settledAt: String? = null,
)

@Serializable
data class ExpenseSplit(
    val id: String,
    val groupId: String,
    val expenseId: String? = null,
    val paidByMemberId: String,
    val totalAmount: MoneyString,
    val currency: String? = null,
    val description: String? = null,
    val splits: List<SplitShare>,
    val receiptId: String? = null,
    val createdAt: String? = null,
)

@Serializable
data class SplitPortionInput(
    val memberId: String,
    val amount: Double,
    val settled: Boolean? = null,
)

@Serializable
data class SplitCreate(
    val groupId: String,
    val paidByMemberId: String,
    val totalAmount: Double,
    val currency: String? = null,
    val description: String? = null,
    val splits: List<SplitPortionInput>,
    val expenseId: String? = null,
    val receiptId: String? = null,
)

@Serializable
data class SettleBody(val memberId: String)

// MARK: - Settlements

@Serializable
data class SettlementPerPerson(
    val memberId: String,
    val name: String,
    val color: String,
    val totalPaid: Double,
    val totalConsumed: Double,
    val netBalance: Double,
)

@Serializable
data class SettlementDebt(
    val fromId: String,
    val fromName: String,
    val fromColor: String,
    val toId: String,
    val toName: String,
    val toColor: String,
    val amount: Double,
)

@Serializable
data class SettlementPaymentRequest(
    val id: String,
    val fromMemberId: String,
    val fromName: String,
    val fromColor: String? = null,
    val toMemberId: String,
    val toName: String,
    val toColor: String? = null,
    val amount: Double,
    val currency: String? = null,
    val status: String,
    val note: String? = null,
    val shareToken: String? = null,
    val bankAccount: String? = null,
    val settledAt: String? = null,
    val settledBy: String? = null,
    val createdAt: String? = null,
)

@Serializable
data class SettlementStats(
    val totalGroupSpend: Double,
    val receiptsCount: Int,
    val membersCount: Int,
    val allSettled: Boolean,
    val pendingCount: Int,
    val settledCount: Int,
    val totalPendingAmount: Double,
    val totalSettledAmount: Double,
)

@Serializable
data class SettlementGroupMeta(
    val id: String,
    val name: String,
    val emoji: String? = null,
    val currency: String? = null,
    val mode: String? = null,
    val startDate: String? = null,
    val endDate: String? = null,
)

@Serializable
data class SettlementsResponse(
    val group: SettlementGroupMeta,
    val perPersonBreakdown: List<SettlementPerPerson>,
    val debts: List<SettlementDebt>,
    val paymentRequests: List<SettlementPaymentRequest>,
    val stats: SettlementStats,
)

@Serializable
data class GroupReceiptMember(
    val id: String,
    val name: String,
    val email: String? = null,
    val color: String? = null,
)

@Serializable
data class GroupReceiptItemAssignment(
    val id: String,
    val receiptItemId: String,
    val memberId: String,
    val groupId: String? = null,
    val share: String? = null,
)

@Serializable
data class GroupReceiptEntry(
    val id: String,
    val vendor: String? = null,
    val date: String? = null,
    val total: MoneyString? = null,
    val currency: String? = null,
    val imageUrl: String? = null,
    val status: String? = null,
    val paidByMemberId: String? = null,
    val receiptItems: List<ReceiptItem>? = null,
    val assignments: List<GroupReceiptItemAssignment>? = null,
    val paidByMember: GroupReceiptMember? = null,
    val assignedItemCount: Int? = null,
    val totalItemCount: Int? = null,
)

@Serializable
data class GroupReceiptsResponse(
    val receipts: List<GroupReceiptEntry>,
    val members: List<GroupReceiptMember>,
)

// MARK: - Savings

@Serializable
data class SavingsDeposit(
    val id: String,
    val goalId: String? = null,
    val userId: String? = null,
    val amount: MoneyString,
    val note: String? = null,
    val createdAt: String? = null,
)

@Serializable
data class SavingsGoal(
    val id: String,
    val name: String,
    val emoji: String? = null,
    val targetAmount: MoneyString,
    val currentAmount: MoneyString,
    val currency: String,
    val deadline: String? = null,
    val priority: String? = null,
    val color: String? = null,
    val category: String? = null,
    val isCompleted: Boolean? = null,
    val completedAt: String? = null,
    val aiTips: List<String>? = null,
    val createdAt: String? = null,
    val deposits: List<SavingsDeposit>? = null,
)

@Serializable
data class SavingsGoalsResponse(val goals: List<SavingsGoal>)

@Serializable
data class GoalCreate(
    val name: String,
    val emoji: String? = null,
    val targetAmount: Double,
    val deadline: String? = null,
    val priority: String? = null,
    val color: String? = null,
    val category: String? = null,
    val currency: String,
    val lang: String? = null,
)

@Serializable
data class GoalUpdate(
    val name: String? = null,
    val emoji: String? = null,
    val targetAmount: Double? = null,
    val deadline: String? = null,
    val priority: String? = null,
    val color: String? = null,
    val category: String? = null,
)

@Serializable
data class DepositBody(val amount: Double, val note: String? = null)

@Serializable
data class DepositResponse(val success: Boolean, val newAmount: String, val completed: Boolean)

// MARK: - Challenges

@Serializable
data class Challenge(
    val id: String,
    val name: String,
    val emoji: String? = null,
    val type: String,
    val targetCategory: String? = null,
    val targetAmount: MoneyString? = null,
    val startDate: String,
    val endDate: String,
    val isActive: Boolean? = null,
    val isCompleted: Boolean? = null,
    val currentProgress: MoneyString? = null,
    val createdAt: String? = null,
)

@Serializable
data class ChallengeCreate(
    val name: String,
    val emoji: String? = null,
    val type: String,
    val targetCategory: String? = null,
    val targetAmount: Double? = null,
    val startDate: String,
    val endDate: String,
)

// MARK: - Loyalty

@Serializable
data class LoyaltyCard(
    val id: String,
    val store: String,
    val cardNumber: String? = null,
    val memberName: String? = null,
    val isActive: Boolean? = null,
    val lastUsed: String? = null,
    val createdAt: String? = null,
)

@Serializable
data class LoyaltyCardCreate(
    val store: String,
    val cardNumber: String? = null,
    val memberName: String? = null,
)

// MARK: - Reports

@Serializable
data class ReportUrls(val csv: String, val pdf: String, val docx: String)

@Serializable
data class ReportGenerateResponse(val success: Boolean, val path: String, val urls: ReportUrls)

// MARK: - Audit

@Serializable
data class AuditPeriod(val from: String, val to: String)

@Serializable
data class AuditTopStore(val store: String, val amount: Double)

@Serializable
data class AuditTopProduct(
    val name: String,
    val totalPaid: Double,
    val count: Double,
    val avgPrice: Double,
    val vendor: String? = null,
    val dates: List<String>? = null,
)

@Serializable
data class AuditPriceComparison(
    val product: String,
    val pricePaid: Double? = null,
    val prices: Map<String, Double>? = null,
    val cheapestStore: String? = null,
    val cheapestPrice: Double? = null,
    val potentialSaving: Double? = null,
    val verdict: String? = null,
)

@Serializable
data class AuditPromotion(
    val store: String? = null,
    val product: String? = null,
    val price: Double? = null,
    val validUntil: String? = null,
    val description: String? = null,
)

@Serializable
data class AuditResult(
    val period: AuditPeriod,
    val totalSpent: Double,
    val transactionCount: Int,
    val currency: String,
    val categoryBreakdown: Map<String, Double>,
    val topStores: List<AuditTopStore>,
    val topProducts: List<AuditTopProduct>,
    val priceComparisons: List<AuditPriceComparison>,
    val currentPromotions: List<AuditPromotion>? = null,
    val bestStore: String? = null,
    val totalPotentialSaving: Double,
    val personalMessage: String? = null,
    val topTip: String? = null,
    val aiSummary: String,
    val webSearchUsed: Boolean? = null,
)

// MARK: - Analysis

@Serializable
data class AnalysisInsight(
    val type: String,
    val title: String,
    val description: String,
    val icon: String? = null,
)

@Serializable
data class AnalysisRecommendation(
    val priority: String,
    val title: String,
    val description: String,
    val potentialSaving: Double? = null,
)

@Serializable
data class AnalysisAnomaly(
    val date: String? = null,
    val category: String? = null,
    val description: String? = null,
    val amount: Double? = null,
)

@Serializable
data class CategoryTrend(
    val category: String,
    val trend: String,
    val changePercent: Double,
    val note: String? = null,
)

@Serializable
data class AnalysisBankTopMerchant(val name: String, val amount: String)

@Serializable
data class AnalysisBankStats(
    val totalTransactions: Int,
    val totalDebit: Double,
    val totalCredit: Double,
    val topMerchants: List<AnalysisBankTopMerchant>,
    val accountCount: Int,
)

@Serializable
data class AnalysisResponse(
    val summary: String? = null,
    val insights: List<AnalysisInsight>? = null,
    val recommendations: List<AnalysisRecommendation>? = null,
    val anomalies: List<AnalysisAnomaly>? = null,
    val categoryTrends: List<CategoryTrend>? = null,
    val predictedMonthlySpend: Double? = null,
    val bankStats: AnalysisBankStats? = null,
)

// MARK: - Prices

@Serializable
data class PriceEntry(
    val store: String,
    val price: Double? = null,
    val promotion: String? = null,
    val validUntil: String? = null,
)

@Serializable
data class PriceComparison(
    val productName: String,
    val userLastPrice: Double? = null,
    val userLastStore: String? = null,
    val allPrices: List<PriceEntry>? = null,
    val bestPrice: Double? = null,
    val bestStore: String? = null,
    val bestDeal: String? = null,
    val savingsAmount: Double? = null,
    val savingsPercent: Double? = null,
    val recommendation: String? = null,
    val buyNow: Boolean? = null,
)

@Serializable
data class PriceComparisonResponse(
    val comparisons: List<PriceComparison>,
    val totalPotentialSavings: Double,
    val summary: String? = null,
    val bestStoreOverall: String? = null,
    val tip: String? = null,
    val productsAnalyzed: Int? = null,
    val isEstimated: Boolean? = null,
    val error: String? = null,
    val message: String? = null,
)

@Serializable
data class PriceCompareBody(
    val lang: String? = null,
    val currency: String? = null,
    val force: Boolean? = null,
)

// MARK: - Shopping advisor

@Serializable
data class AdvisorAlternativeStore(
    val store: String,
    val price: Double? = null,
    val deal: String? = null,
)

@Serializable
data class AdvisorRecommendation(
    val productName: String,
    val category: String? = null,
    val userAvgPrice: Double? = null,
    val userLastStore: String? = null,
    val bestStore: String? = null,
    val bestPrice: Double? = null,
    val bestDeal: String? = null,
    val alternativeStores: List<AdvisorAlternativeStore>? = null,
    val savingsPerUnit: Double? = null,
    val savingsPercent: Double? = null,
    val verdict: String? = null,
    val tip: String? = null,
)

@Serializable
data class AdvisorStorePlan(
    val store: String,
    val products: List<String>? = null,
    val estimatedTotal: Double? = null,
    val whyThisStore: String? = null,
)

@Serializable
data class AdvisorWeeklyPlan(
    val stores: List<AdvisorStorePlan>? = null,
    val totalEstimated: Double? = null,
    val totalSavings: Double? = null,
    val savingsPercent: Double? = null,
)

@Serializable
data class AdvisorInsight(
    val type: String,
    val title: String,
    val description: String,
    val icon: String? = null,
)

@Serializable
data class ShoppingAdvisorResponse(
    val recommendations: List<AdvisorRecommendation>? = null,
    val weeklyPlan: AdvisorWeeklyPlan? = null,
    val topInsights: List<AdvisorInsight>? = null,
    val summary: String? = null,
    val totalPotentialMonthlySavings: Double? = null,
    val bestOverallStore: String? = null,
    val productsAnalyzed: Int? = null,
    val currency: String? = null,
    val storesKnown: Int? = null,
    val error: String? = null,
)

// MARK: - Nearby Stores

@Serializable
data class NearbyStore(
    val id: String,
    val name: String,
    val originalName: String? = null,
    val brand: String? = null,
    val isKnown: Boolean,
    val lat: Double,
    val lng: Double,
    val distance: Int,
    val address: String? = null,
    val city: String? = null,
    val openingHours: String? = null,
    val phone: String? = null,
    val website: String? = null,
    val category: String? = null,
    val shopType: String? = null,
)

@Serializable
data class NearbyStoresResponse(
    val stores: List<NearbyStore>,
    val total: Int,
    val knownStoresCount: Int,
    val nearbyBrands: List<String>? = null,
    val searchRadius: Int,
)

// MARK: - Product Search

@Serializable
data class ProductSearchResult(
    val store: String,
    val productName: String,
    val price: Double? = null,
    val pricePerUnit: String? = null,
    val isPromo: Boolean? = null,
    val promoDetails: String? = null,
    val availability: String? = null,
)

@Serializable
data class ProductAlternative(
    val name: String,
    val avgPrice: Double? = null,
    val whyBetter: String? = null,
)

@Serializable
data class ProductPriceRange(val min: Double, val max: Double)

@Serializable
data class ProductSearchResponse(
    val query: String,
    val product: String? = null,
    val category: String? = null,
    val results: List<ProductSearchResult>,
    val cheapestStore: String? = null,
    val cheapestPrice: Double? = null,
    val averagePrice: Double? = null,
    val priceRange: ProductPriceRange? = null,
    val alternatives: List<ProductAlternative>? = null,
    val tip: String? = null,
    val currency: String? = null,
    val isEstimated: Boolean? = null,
)

// MARK: - Merchant rules

@Serializable
data class MerchantRule(
    val vendor: String,
    val categoryId: String,
    val count: Int? = null,
)

// MARK: - Budget + monthly

@Serializable
data class MonthlyBudget(
    val id: String,
    val userId: String? = null,
    val month: String,
    val totalIncome: String? = null,
    val totalBudget: String? = null,
    val savingsTarget: String? = null,
    val createdAt: String? = null,
    val updatedAt: String? = null,
)

@Serializable
data class BudgetCategoryRow(
    val id: String,
    val name: String,
    val icon: String? = null,
    val color: String? = null,
    val budgeted: Double,
    val spent: Double,
)

@Serializable
data class BudgetAlert(
    val type: String,
    val category: String,
    val spent: Double,
    val budgeted: Double,
    val pct: Double,
)

@Serializable
data class BudgetResponse(
    val budget: MonthlyBudget? = null,
    val totalSpent: Double,
    val categoryBreakdown: List<BudgetCategoryRow>,
    val alerts: List<BudgetAlert>,
    val monthProgress: Double,
    val month: String,
)

@Serializable
data class BudgetUpsert(
    val month: String,
    val totalIncome: Double? = null,
    val totalBudget: Double? = null,
    val savingsTarget: Double? = null,
)

@Serializable
data class FinancialHealthResponse(val score: Int, val tips: List<String>)

// MARK: - Promotions

@Serializable
data class PromoOffer(
    val id: String,
    val store: String? = null,
    val productName: String? = null,
    val regularPrice: Double? = null,
    val promoPrice: Double? = null,
    val discount: String? = null,
    val currency: String? = null,
    val validFrom: String? = null,
    val validUntil: String? = null,
    val category: String? = null,
    val matchesPurchases: Boolean? = null,
    val leafletUrl: String? = null,
    val dealUrl: String? = null,
    val promoType: String? = null,
    val promoDescription: String? = null,
    val sourceUrl: String? = null,
)

@Serializable
data class WeeklySummary(
    val id: String? = null,
    val weekStart: String? = null,
    val weekEnd: String? = null,
    val totalSpent: String? = null,
    val totalIncome: String? = null,
    val topCategory: String? = null,
    val summary: String? = null,
    val createdAt: String? = null,
)

@Serializable
data class PromotionsResponse(
    val promotions: List<PromoOffer>,
    val personalizedDeals: List<PromoOffer>,
    val totalPotentialSavings: Double? = null,
    val weeklySummary: WeeklySummary? = null,
    val dataSource: String? = null,
    val sources: List<String>? = null,
    val fetchedAt: String? = null,
    val freshUntil: String? = null,
    val cacheState: String? = null,
)

// MARK: - Shopping list optimizer

@Serializable
data class ShoppingOptimizeRequest(
    val items: List<Item>,
    val lang: String,
    val currency: String,
    val lat: Double? = null,
    val lng: Double? = null,
) {
    @Serializable
    data class Item(val name: String, val quantity: Double)
}

@Serializable
data class ShoppingOptimizeResult(
    val bestStore: String,
    val bestStoreAddress: String? = null,
    val bestTotal: Double,
    val currency: String,
    val savings: Double? = null,
    val summary: String? = null,
    val tip: String? = null,
    val bestStoreItems: List<LineItem>,
    val alternatives: List<Alternative>,
    val fetchedAt: String? = null,
    val freshUntil: String? = null,
    val cacheState: String? = null,
    val dataSource: String? = null,
    val sources: List<String>? = null,
) {
    @Serializable
    data class LineItem(
        val name: String,
        val qty: Double? = null,
        val unitPrice: Double? = null,
        val total: Double,
        val promoType: String? = null,
        val promoDescription: String? = null,
    )

    @Serializable
    data class Alternative(
        val store: String,
        val total: Double,
        val address: String? = null,
    )
}
