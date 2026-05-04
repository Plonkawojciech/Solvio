package com.programo.solvio.core.network

import com.programo.solvio.core.model.AnalysisResponse
import com.programo.solvio.core.model.AuditResult
import com.programo.solvio.core.model.BudgetResponse
import com.programo.solvio.core.model.BudgetUpsert
import com.programo.solvio.core.model.Category
import com.programo.solvio.core.model.CategoryBudget
import com.programo.solvio.core.model.Challenge
import com.programo.solvio.core.model.ChallengeCreate
import com.programo.solvio.core.model.DashboardResponse
import com.programo.solvio.core.model.DemoLoginResponse
import com.programo.solvio.core.model.DepositBody
import com.programo.solvio.core.model.DepositResponse
import com.programo.solvio.core.model.Expense
import com.programo.solvio.core.model.ExpenseCreate
import com.programo.solvio.core.model.ExpenseDelete
import com.programo.solvio.core.model.ExpenseListResponse
import com.programo.solvio.core.model.ExpenseSplit
import com.programo.solvio.core.model.ExpenseUpdate
import com.programo.solvio.core.model.ExpenseWrap
import com.programo.solvio.core.model.FinancialHealthResponse
import com.programo.solvio.core.model.GoalCreate
import com.programo.solvio.core.model.GoalUpdate
import com.programo.solvio.core.model.Group
import com.programo.solvio.core.model.GroupCreate
import com.programo.solvio.core.model.GroupReceiptsResponse
import com.programo.solvio.core.model.GroupUpdate
import com.programo.solvio.core.model.LoyaltyCard
import com.programo.solvio.core.model.LoyaltyCardCreate
import com.programo.solvio.core.model.MerchantRule
import com.programo.solvio.core.model.MonthlyBudget
import com.programo.solvio.core.model.NearbyStoresResponse
import com.programo.solvio.core.model.OcrReceiptResponse
import com.programo.solvio.core.model.PriceCompareBody
import com.programo.solvio.core.model.PriceComparisonResponse
import com.programo.solvio.core.model.ProductSearchResponse
import com.programo.solvio.core.model.PromotionsResponse
import com.programo.solvio.core.model.Receipt
import com.programo.solvio.core.model.ReceiptCreate
import com.programo.solvio.core.model.ReceiptItem
import com.programo.solvio.core.model.ReceiptListResponse
import com.programo.solvio.core.model.ReportGenerateResponse
import com.programo.solvio.core.model.SavingsGoal
import com.programo.solvio.core.model.SettleBody
import com.programo.solvio.core.model.SettlementsResponse
import com.programo.solvio.core.model.ShoppingAdvisorResponse
import com.programo.solvio.core.model.ShoppingOptimizeRequest
import com.programo.solvio.core.model.ShoppingOptimizeResult
import com.programo.solvio.core.model.SplitCreate
import com.programo.solvio.core.model.UserSettings
import kotlinx.serialization.Serializable

object DashboardRepo {
    suspend fun fetch(): DashboardResponse =
        ApiClient.get("/api/data/dashboard", listOf("since" to "all"))
}

object SettingsRepo {
    @Serializable
    data class Bundle(
        val categories: List<Category>,
        val settings: UserSettings? = null,
        val budgets: List<CategoryBudget>,
    )

    @Serializable
    data class SettingsData(
        val currency: String? = null,
        val language: String? = null,
        val productType: String? = null,
        val monthlyBudget: Double? = null,
        val notificationsEnabled: Boolean? = null,
        val timezone: String? = null,
    )

    @Serializable
    data class CategoryData(
        val name: String,
        val icon: String? = null,
        val color: String? = null,
        val isDefault: Boolean? = null,
    )

    @Serializable
    data class BudgetData(
        val categoryId: String,
        val amount: Double,
        val period: String? = null,
    )

    @Serializable private data class SettingsEnvelope(val type: String, val data: SettingsData)
    @Serializable private data class CategoryEnvelope(val type: String, val data: CategoryData)
    @Serializable private data class BudgetEnvelope(val type: String, val data: BudgetData)

    suspend fun fetch(): Bundle = ApiClient.get("/api/data/settings")

    suspend fun updateSettings(data: SettingsData) =
        ApiClient.postVoid("/api/data/settings", SettingsEnvelope("settings", data))

    suspend fun addCategory(data: CategoryData) =
        ApiClient.postVoid("/api/data/settings", CategoryEnvelope("category", data))

    suspend fun upsertBudget(data: BudgetData) =
        ApiClient.postVoid("/api/data/settings", BudgetEnvelope("budget", data))
}

object ExpensesRepo {
    suspend fun list(query: List<Pair<String, String>> = emptyList()): ExpenseListResponse =
        ApiClient.get("/api/data/expenses", query)

    suspend fun create(body: ExpenseCreate): Expense {
        val wrap: ExpenseWrap = ApiClient.post("/api/data/expenses", body)
        return wrap.expense
    }

    suspend fun update(body: ExpenseUpdate) =
        ApiClient.putVoid("/api/data/expenses", body)

    suspend fun delete(ids: List<String>) =
        ApiClient.deleteVoid("/api/data/expenses", ExpenseDelete(ids))
}

object CategoriesRepo {
    @Serializable
    data class Create(val name: String, val icon: String? = null)

    @Serializable
    data class Update(val id: String, val name: String, val icon: String? = null)

    @Serializable private data class IdBody(val id: String)

    suspend fun create(body: Create): Category =
        ApiClient.post("/api/data/categories", body)

    suspend fun update(body: Update) =
        ApiClient.putVoid("/api/data/categories", body)

    suspend fun delete(id: String) =
        ApiClient.deleteVoid("/api/data/categories", IdBody(id))
}

object ReceiptsRepo {
    @Serializable private data class IdBody(val id: String)

    suspend fun list(): List<Receipt> {
        val r: ReceiptListResponse = ApiClient.get("/api/data/receipts")
        return r.receipts
    }

    suspend fun detail(id: String): Receipt =
        ApiClient.get("/api/data/receipts", listOf("id" to id))

    suspend fun create(body: ReceiptCreate): Receipt =
        ApiClient.post("/api/data/receipts", body)

    @Serializable
    data class ItemsUpdate(val id: String, val items: List<ReceiptItem>)

    suspend fun updateItems(receiptId: String, items: List<ReceiptItem>) =
        ApiClient.putVoid("/api/data/receipts", ItemsUpdate(receiptId, items))

    suspend fun delete(id: String) =
        ApiClient.deleteVoid("/api/data/receipts", IdBody(id))

    suspend fun scan(
        imageBytes: ByteArray,
        filename: String = "receipt.jpg",
        mimeType: String = "image/jpeg",
        receiptId: String? = null,
    ): OcrReceiptResponse {
        val extras = receiptId?.let { mapOf("receiptId" to it) } ?: emptyMap()
        return ApiClient.upload(
            path = "/api/v1/ocr-receipt",
            fileBytes = imageBytes,
            filename = filename,
            mimeType = mimeType,
            fieldName = "files",
            extraFields = extras,
        )
    }
}

object GroupsRepo {
    suspend fun list(): List<Group> = ApiClient.get("/api/groups")
    suspend fun detail(id: String): Group = ApiClient.get("/api/groups/$id")
    suspend fun create(body: GroupCreate): Group = ApiClient.post("/api/groups", body)
    suspend fun update(id: String, body: GroupUpdate) = ApiClient.putVoid("/api/groups/$id", body)
    suspend fun delete(id: String) = ApiClient.deleteVoid("/api/groups/$id")
    suspend fun createSplit(body: SplitCreate): ExpenseSplit =
        ApiClient.post("/api/groups/splits", body)
    suspend fun settle(splitId: String, memberId: String) =
        ApiClient.patchVoid("/api/groups/splits/$splitId/settle", SettleBody(memberId))
    suspend fun settlements(groupId: String): SettlementsResponse =
        ApiClient.get("/api/groups/$groupId/settlements")
    suspend fun receipts(groupId: String): GroupReceiptsResponse =
        ApiClient.get("/api/groups/$groupId/receipts")
}

object GoalsRepo {
    @Serializable private data class GoalsWrap(val goals: List<SavingsGoal>)
    @Serializable private data class GoalWrap(val goal: SavingsGoal)

    suspend fun list(): List<SavingsGoal> {
        val w: GoalsWrap = ApiClient.get("/api/personal/goals")
        return w.goals
    }
    suspend fun create(body: GoalCreate): SavingsGoal {
        val w: GoalWrap = ApiClient.post("/api/personal/goals", body)
        return w.goal
    }
    suspend fun update(id: String, body: GoalUpdate): SavingsGoal {
        val w: GoalWrap = ApiClient.put("/api/personal/goals/$id", body)
        return w.goal
    }
    suspend fun delete(id: String) = ApiClient.deleteVoid("/api/personal/goals/$id")
    suspend fun deposit(goalId: String, amount: Double, note: String? = null): DepositResponse =
        ApiClient.post("/api/personal/goals/$goalId/deposit", DepositBody(amount, note))
}

object ChallengesRepo {
    @Serializable private data class ListWrap(val challenges: List<Challenge>)
    @Serializable private data class CreateWrap(val challenge: Challenge)

    suspend fun list(): List<Challenge> {
        val w: ListWrap = ApiClient.get("/api/personal/challenges")
        return w.challenges
    }
    suspend fun create(body: ChallengeCreate): Challenge {
        val w: CreateWrap = ApiClient.post("/api/personal/challenges", body)
        return w.challenge
    }
}

object LoyaltyRepo {
    @Serializable private data class ListWrap(val cards: List<LoyaltyCard>)
    @Serializable private data class CreateWrap(val card: LoyaltyCard)
    @Serializable private data class IdBody(val id: String)

    suspend fun list(): List<LoyaltyCard> {
        val w: ListWrap = ApiClient.get("/api/personal/loyalty")
        return w.cards
    }
    suspend fun create(body: LoyaltyCardCreate): LoyaltyCard {
        val w: CreateWrap = ApiClient.post("/api/personal/loyalty", body)
        return w.card
    }
    suspend fun delete(id: String) =
        ApiClient.deleteVoid("/api/personal/loyalty", IdBody(id))
}

object PricesRepo {
    suspend fun compare(
        lang: String? = null,
        currency: String? = null,
        force: Boolean = false,
    ): PriceComparisonResponse =
        ApiClient.post("/api/prices/compare", PriceCompareBody(lang, currency, force))
}

object AuditRepo {
    @Serializable private data class Body(
        val lang: String? = null,
        val currency: String? = null,
        val force: Boolean? = null,
    )
    suspend fun generate(
        lang: String? = null,
        currency: String? = null,
        force: Boolean = false,
    ): AuditResult = ApiClient.post("/api/audit/generate", Body(lang, currency, force))
}

object AnalysisRepo {
    @Serializable private data class Body(
        val lang: String? = null,
        val currency: String? = null,
        val period: String? = null,
    )
    suspend fun run(
        lang: String? = null,
        currency: String? = null,
        period: String? = null,
    ): AnalysisResponse = ApiClient.post("/api/analysis/ai", Body(lang, currency, period))
}

object ReportsRepo {
    suspend fun generateYearly(year: String): ReportGenerateResponse =
        ApiClient.postForm("/api/reports/generate", mapOf("type" to "yearly", "year" to year))
    suspend fun generateMonthly(ym: String): ReportGenerateResponse =
        ApiClient.postForm("/api/reports/generate", mapOf("type" to "monthly", "ym" to ym))
}

object BudgetRepo {
    @Serializable private data class UpsertWrap(val budget: MonthlyBudget)

    suspend fun fetch(month: String? = null): BudgetResponse {
        val q = if (month != null) listOf("month" to month) else emptyList()
        return ApiClient.get("/api/personal/budget", q)
    }

    suspend fun upsert(body: BudgetUpsert): MonthlyBudget {
        val w: UpsertWrap = ApiClient.post("/api/personal/budget", body)
        return w.budget
    }
}

object FinancialHealthRepo {
    suspend fun fetch(): FinancialHealthResponse =
        ApiClient.get("/api/personal/financial-health")
}

object PromotionsRepo {
    @Serializable private data class Body(val lang: String? = null, val currency: String? = null)
    suspend fun fetch(lang: String? = null, currency: String? = null): PromotionsResponse =
        ApiClient.post("/api/personal/promotions", Body(lang, currency))
}

object ShoppingAdvisorRepo {
    @Serializable private data class Body(val lang: String? = null, val currency: String? = null)
    suspend fun analyze(lang: String? = null, currency: String? = null): ShoppingAdvisorResponse =
        ApiClient.post("/api/personal/shopping-advisor", Body(lang, currency))
}

object NearbyStoresRepo {
    @Serializable private data class Body(
        val lat: Double,
        val lng: Double,
        val radius: Int? = null,
        val lang: String? = null,
    )
    suspend fun search(
        lat: Double,
        lng: Double,
        radius: Int? = 5000,
        lang: String? = null,
    ): NearbyStoresResponse =
        ApiClient.post("/api/personal/nearby-stores", Body(lat, lng, radius, lang))
}

object ProductSearchRepo {
    @Serializable private data class Body(
        val query: String,
        val lang: String? = null,
        val currency: String? = null,
    )
    suspend fun search(
        query: String,
        lang: String? = null,
        currency: String? = null,
    ): ProductSearchResponse =
        ApiClient.post("/api/personal/product-search", Body(query, lang, currency))
}

object MerchantRulesRepo {
    @Serializable private data class ListWrap(val rules: List<MerchantRule>)
    @Serializable private data class DeleteBody(val vendor: String)
    suspend fun list(): List<MerchantRule> {
        val w: ListWrap = ApiClient.get("/api/personal/merchant-rules")
        return w.rules
    }
    suspend fun delete(vendor: String) =
        ApiClient.deleteVoid("/api/personal/merchant-rules", DeleteBody(vendor))
}

object MaintenanceRepo {
    @Serializable
    data class RecategorizeBody(val force: Boolean, val lang: String)

    @Serializable
    data class RecategorizeResult(
        val ok: Boolean? = null,
        val processed: Int? = null,
        val itemsUpdated: Int? = null,
        val itemsAttempted: Int? = null,
        val expensesUpdated: Int? = null,
    )

    suspend fun seedCategories() =
        ApiClient.postEmptyVoid("/api/v1/seed-categories")

    suspend fun recategorize(force: Boolean = false, lang: String = "pl"): RecategorizeResult =
        ApiClient.post("/api/v1/recategorize-receipts", RecategorizeBody(force, lang))
}

object ShoppingRepo {
    suspend fun optimize(body: ShoppingOptimizeRequest): ShoppingOptimizeResult =
        ApiClient.post("/api/shopping/optimize", body)
}
