package com.programo.solvio.core.network

import com.programo.solvio.core.models.*
import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.builtins.serializer
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonObject

/// All repos in one file — translates the iOS `Repositories.swift` layer
/// 1:1. Each repo wraps `ApiClient.get()` invocations against a fixed
/// API path; the same calls work transparently because the cookie jar
/// + Accept-Language headers are identical to iOS HTTPCookieStorage.

private val api get() = ApiClient.get()

// MARK: - Auth

@Serializable
data class SessionPostBody(val email: String)

object AuthRepo {
    suspend fun me(): SessionMe = api.get("/api/auth/session/me", SessionMe.serializer())
    suspend fun signIn(email: String): SessionMe =
        api.post("/api/auth/session", SessionPostBody(email), SessionPostBody.serializer(), SessionMe.serializer())
    suspend fun signOut() {
        api.deleteVoid("/api/auth/session", JsonObject(emptyMap()), JsonObject.serializer())
    }
    suspend fun demo(): SessionMe =
        api.post("/api/auth/demo", JsonObject(emptyMap()), JsonObject.serializer(), SessionMe.serializer())
}

// MARK: - Dashboard

object DashboardRepo {
    suspend fun fetch(): DashboardResponse = api.get("/api/data/dashboard", DashboardResponse.serializer())
}

// MARK: - Expenses

object ExpensesRepo {
    suspend fun list(): ExpensesListResponse = api.get("/api/data/expenses", ExpensesListResponse.serializer())
    suspend fun create(body: ExpenseCreate): JsonElement =
        api.post("/api/data/expenses", body, ExpenseCreate.serializer(), JsonElement.serializer())
    suspend fun update(body: ExpenseUpdate) {
        api.putVoid("/api/data/expenses", body, ExpenseUpdate.serializer())
    }
    suspend fun delete(ids: List<String>) {
        api.deleteVoid("/api/data/expenses", IdsBody(ids), IdsBody.serializer())
    }
}

// MARK: - Receipts

@Serializable
data class ReceiptsListResponse(val receipts: List<Receipt> = emptyList())

@Serializable
data class ReceiptIdBody(val id: String)

@Serializable
data class ReceiptItemsUpdate(val id: String, val items: List<ReceiptItem>)

object ReceiptsRepo {
    suspend fun list(): List<Receipt> =
        api.get("/api/data/receipts", ReceiptsListResponse.serializer()).receipts
    suspend fun detail(id: String): Receipt =
        api.get("/api/data/receipts", Receipt.serializer(), mapOf("id" to id))
    suspend fun create(body: ReceiptCreate): Receipt =
        api.post("/api/data/receipts", body, ReceiptCreate.serializer(), Receipt.serializer())
    suspend fun updateItems(receiptId: String, items: List<ReceiptItem>) {
        api.putVoid("/api/data/receipts", ReceiptItemsUpdate(receiptId, items), ReceiptItemsUpdate.serializer())
    }
    suspend fun delete(id: String) {
        api.deleteVoid("/api/data/receipts", ReceiptIdBody(id), ReceiptIdBody.serializer())
    }
}

// MARK: - Settings (write via discriminated union {type, data})

object SettingsRepo {
    suspend fun fetch(): SettingsResponse = api.get("/api/data/settings", SettingsResponse.serializer())

    @Serializable
    data class Update(val type: String, val data: JsonObject)

    suspend fun updateSettings(currency: String? = null, language: String? = null) {
        val data = buildJsonObject {
            currency?.let { put("currency", it) }
            language?.let { put("language", it) }
        }
        api.post("/api/data/settings", Update("updateSettings", data), Update.serializer(), JsonElement.serializer())
    }

    suspend fun addCategory(c: CategoryCreate) {
        val data = buildJsonObject {
            put("name", c.name)
            c.icon?.let { put("icon", it) }
            c.color?.let { put("color", it) }
            put("isDefault", c.isDefault ?: false)
        }
        api.post("/api/data/settings", Update("addCategory", data), Update.serializer(), JsonElement.serializer())
    }

    suspend fun upsertBudget(b: CategoryBudgetUpsert) {
        val data = buildJsonObject {
            put("categoryId", b.categoryId)
            put("amount", b.amount)
            put("period", b.period)
        }
        api.post("/api/data/settings", Update("upsertBudget", data), Update.serializer(), JsonElement.serializer())
    }
}

// MARK: - Categories CRUD

object CategoriesRepo {
    suspend fun update(c: CategoryUpdate) {
        api.putVoid("/api/data/categories", c, CategoryUpdate.serializer())
    }
    suspend fun delete(id: String) {
        api.deleteVoid("/api/data/categories", ReceiptIdBody(id), ReceiptIdBody.serializer())
    }
}

// MARK: - Groups

@Serializable
data class GroupsListResponse(val groups: List<Group> = emptyList())

object GroupsRepo {
    suspend fun list(): List<Group> = api.get("/api/groups", GroupsListResponse.serializer()).groups
    suspend fun detail(id: String): Group = api.get("/api/groups/$id", Group.serializer())
    suspend fun create(body: GroupCreate): Group =
        api.post("/api/groups", body, GroupCreate.serializer(), Group.serializer())
    suspend fun delete(id: String) {
        api.deleteVoid("/api/groups/$id", JsonObject(emptyMap()), JsonObject.serializer())
    }
    suspend fun receipts(groupId: String): GroupReceiptsResponse =
        api.get("/api/groups/$groupId/receipts", GroupReceiptsResponse.serializer())
    suspend fun settlements(groupId: String): SettlementsResponse =
        api.get("/api/groups/$groupId/settlements", SettlementsResponse.serializer())

    suspend fun createSplit(body: SplitCreate): ExpenseSplit =
        api.post("/api/groups/splits", body, SplitCreate.serializer(), ExpenseSplit.serializer())

    suspend fun settleSplit(splitId: String, memberId: String) {
        api.post(
            "/api/groups/splits/$splitId/settle",
            SettleBody(memberId), SettleBody.serializer(), JsonElement.serializer(),
        )
    }
}

// MARK: - Goals

object GoalsRepo {
    suspend fun list(): List<SavingsGoal> = api.get("/api/personal/goals", SavingsGoalsResponse.serializer()).goals
    suspend fun create(body: GoalCreate): SavingsGoal =
        api.post("/api/personal/goals", body, GoalCreate.serializer(), SavingsGoal.serializer())
    suspend fun update(id: String, body: GoalUpdate) {
        api.putVoid("/api/personal/goals/$id", body, GoalUpdate.serializer())
    }
    suspend fun delete(id: String) {
        api.deleteVoid("/api/personal/goals/$id", JsonObject(emptyMap()), JsonObject.serializer())
    }
    suspend fun deposit(goalId: String, amount: Double, note: String? = null): DepositResponse =
        api.post("/api/personal/goals/$goalId/deposit", DepositBody(amount, note), DepositBody.serializer(), DepositResponse.serializer())
}

// MARK: - Challenges

object ChallengesRepo {
    suspend fun list(): List<Challenge> = api.get("/api/personal/challenges", ChallengesResponse.serializer()).challenges
    suspend fun create(body: ChallengeCreate): Challenge =
        api.post("/api/personal/challenges", body, ChallengeCreate.serializer(), Challenge.serializer())
    suspend fun delete(id: String) {
        api.deleteVoid("/api/personal/challenges/$id", JsonObject(emptyMap()), JsonObject.serializer())
    }
    suspend fun complete(id: String) {
        api.post("/api/personal/challenges/$id/complete", JsonObject(emptyMap()), JsonObject.serializer(), JsonElement.serializer())
    }
}

// MARK: - Loyalty

object LoyaltyRepo {
    suspend fun list(): List<LoyaltyCard> = api.get("/api/personal/loyalty", LoyaltyResponse.serializer()).cards
    suspend fun create(body: LoyaltyCardCreate): LoyaltyCard =
        api.post("/api/personal/loyalty", body, LoyaltyCardCreate.serializer(), LoyaltyCard.serializer())
    suspend fun delete(id: String) {
        api.deleteVoid("/api/personal/loyalty/$id", JsonObject(emptyMap()), JsonObject.serializer())
    }
}

// MARK: - Prices

object PricesRepo {
    suspend fun compare(lang: String? = null, currency: String? = null, force: Boolean? = null): PriceComparisonResponse =
        api.post("/api/prices/compare", PriceCompareBody(lang, currency, force), PriceCompareBody.serializer(), PriceComparisonResponse.serializer())
}

// MARK: - Audit

@Serializable
data class AuditGenerateBody(val lang: String? = null)

object AuditRepo {
    suspend fun generate(lang: String? = null): AuditResult =
        api.post("/api/audit/generate", AuditGenerateBody(lang), AuditGenerateBody.serializer(), AuditResult.serializer())
}

// MARK: - Analysis

@Serializable
data class AnalysisRunBody(val lang: String? = null, val period: String? = null)

object AnalysisRepo {
    suspend fun run(lang: String? = null, period: String? = null): AnalysisResponse =
        api.post("/api/analysis/ai", AnalysisRunBody(lang, period), AnalysisRunBody.serializer(), AnalysisResponse.serializer())
}

// MARK: - Reports

@Serializable
data class ReportYearlyBody(val year: Int, val format: String? = null)

@Serializable
data class ReportMonthlyBody(val yearMonth: String, val format: String? = null)

object ReportsRepo {
    suspend fun runYearly(year: Int): ReportGenerateResponse =
        api.post("/api/reports/generate", ReportYearlyBody(year), ReportYearlyBody.serializer(), ReportGenerateResponse.serializer())
    suspend fun runMonthly(yearMonth: String): ReportGenerateResponse =
        api.post("/api/reports/generate", ReportMonthlyBody(yearMonth), ReportMonthlyBody.serializer(), ReportGenerateResponse.serializer())
}

// MARK: - Budget

object BudgetRepo {
    suspend fun fetch(): BudgetResponse = api.get("/api/personal/budget", BudgetResponse.serializer())
    suspend fun upsert(body: BudgetUpsert) {
        api.post("/api/personal/budget", body, BudgetUpsert.serializer(), JsonElement.serializer())
    }
}

// MARK: - Financial health

object FinancialHealthRepo {
    suspend fun fetch(): FinancialHealthResponse =
        api.get("/api/personal/financial-health", FinancialHealthResponse.serializer())
}

// MARK: - Promotions

object PromotionsRepo {
    suspend fun fetch(force: Boolean? = null): PromotionsResponse {
        val q = if (force == true) mapOf("force" to "true") else emptyMap()
        return api.get("/api/personal/promotions", PromotionsResponse.serializer(), q)
    }
}

// MARK: - Shopping list optimizer

object ShoppingRepo {
    suspend fun optimize(req: ShoppingOptimizeRequest): ShoppingOptimizeResult =
        api.post("/api/shopping/optimize", req, ShoppingOptimizeRequest.serializer(), ShoppingOptimizeResult.serializer())
}

// MARK: - Receipt analyzer

object ReceiptAnalyzeRepo {
    suspend fun analyze(receiptId: String, lang: String): ReceiptAnalyzeResponse =
        api.post("/api/personal/receipt-analyze", ReceiptAnalyzeRequest(receiptId, lang), ReceiptAnalyzeRequest.serializer(), ReceiptAnalyzeResponse.serializer())
}

// MARK: - Shopping advisor

@Serializable
data class AdvisorRunBody(val lang: String? = null, val currency: String? = null)

object ShoppingAdvisorRepo {
    suspend fun fetch(lang: String? = null, currency: String? = null): ShoppingAdvisorResponse =
        api.post("/api/personal/shopping-advisor", AdvisorRunBody(lang, currency), AdvisorRunBody.serializer(), ShoppingAdvisorResponse.serializer())
}

// MARK: - Nearby stores

object NearbyStoresRepo {
    suspend fun fetch(lat: Double, lng: Double, radius: Int = 1500): NearbyStoresResponse =
        api.get(
            "/api/personal/nearby-stores",
            NearbyStoresResponse.serializer(),
            mapOf("lat" to lat.toString(), "lng" to lng.toString(), "radius" to radius.toString()),
        )
}

// MARK: - Product search

@Serializable
data class ProductSearchBody(val query: String, val lang: String? = null, val currency: String? = null)

object ProductSearchRepo {
    suspend fun search(query: String, lang: String? = null, currency: String? = null): ProductSearchResponse =
        api.post("/api/personal/product-search", ProductSearchBody(query, lang, currency), ProductSearchBody.serializer(), ProductSearchResponse.serializer())
}

// MARK: - Merchant rules

object MerchantRulesRepo {
    suspend fun list(): List<MerchantRule> =
        api.get("/api/personal/merchant-rules", MerchantRulesResponse.serializer()).rules

    @Serializable
    data class DeleteBody(val vendor: String)

    suspend fun delete(vendor: String) {
        api.deleteVoid("/api/personal/merchant-rules", DeleteBody(vendor), DeleteBody.serializer())
    }
}

// MARK: - Maintenance

@Serializable
data class RecategorizeBody(val force: Boolean = false, val lang: String? = null)

@Serializable
data class RecategorizeResponse(val itemsUpdated: Int? = null, val expensesUpdated: Int? = null)

object MaintenanceRepo {
    suspend fun seedCategories() {
        api.post("/api/v1/seed-categories", JsonObject(emptyMap()), JsonObject.serializer(), JsonElement.serializer())
    }
    suspend fun recategorize(force: Boolean = false, lang: String? = null): RecategorizeResponse =
        api.post("/api/v1/recategorize-receipts", RecategorizeBody(force, lang), RecategorizeBody.serializer(), RecategorizeResponse.serializer())
}
