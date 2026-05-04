package com.programo.solvio.core.store

import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.programo.solvio.core.model.BudgetResponse
import com.programo.solvio.core.model.Category
import com.programo.solvio.core.model.CategoryBudget
import com.programo.solvio.core.model.Challenge
import com.programo.solvio.core.model.DashboardResponse
import com.programo.solvio.core.model.Expense
import com.programo.solvio.core.model.FinancialHealthResponse
import com.programo.solvio.core.model.Group
import com.programo.solvio.core.model.LoyaltyCard
import com.programo.solvio.core.model.PromotionsResponse
import com.programo.solvio.core.model.Receipt
import com.programo.solvio.core.model.SavingsGoal
import com.programo.solvio.core.model.UserSettings
import com.programo.solvio.core.network.ApiError
import com.programo.solvio.core.network.BudgetRepo
import com.programo.solvio.core.network.ChallengesRepo
import com.programo.solvio.core.network.DashboardRepo
import com.programo.solvio.core.network.FinancialHealthRepo
import com.programo.solvio.core.network.GoalsRepo
import com.programo.solvio.core.network.GroupsRepo
import com.programo.solvio.core.network.LoyaltyRepo
import com.programo.solvio.core.network.PromotionsRepo
import com.programo.solvio.core.network.ReceiptsRepo
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.MainScope
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Central in-memory cache for all primary user data — direct port of
 * iOS [AppDataStore]. Same stale-while-revalidate strategy with per-slice
 * generation counters so a force-refresh can't be overwritten by a stale
 * in-flight task.
 */
class AppDataStore {
    private val scope: CoroutineScope = MainScope()

    /** TTL after which a slice is considered stale enough to skip the
     *  background refresh. Mirror of iOS `cacheTTL = 300`. */
    private val cacheTtlMs: Long = 5 * 60 * 1000L

    /** Background refresh fires on every read if older than this — keeps
     *  stale-while-revalidate honest without hammering the API. */
    private val refreshThrottleMs: Long = 30 * 1000L

    // Dashboard (primary slice)
    var dashboard by mutableStateOf<DashboardResponse?>(null); private set
    var dashboardLoadedAt by mutableStateOf<Long?>(null); private set
    var dashboardLoading by mutableStateOf(false); private set
    var dashboardError by mutableStateOf<String?>(null); private set
    private var dashboardJob: Job? = null
    private var dashboardGen = 0L

    var receipts by mutableStateOf<List<Receipt>>(emptyList()); private set
    var receiptsLoadedAt by mutableStateOf<Long?>(null); private set
    var receiptsLoading by mutableStateOf(false); private set
    var receiptsError by mutableStateOf<String?>(null); private set
    private var receiptsJob: Job? = null
    private var receiptsGen = 0L

    var goals by mutableStateOf<List<SavingsGoal>>(emptyList()); private set
    var goalsLoadedAt by mutableStateOf<Long?>(null); private set
    var goalsLoading by mutableStateOf(false); private set
    var goalsError by mutableStateOf<String?>(null); private set
    private var goalsJob: Job? = null
    private var goalsGen = 0L

    var loyalty by mutableStateOf<List<LoyaltyCard>>(emptyList()); private set
    var loyaltyLoadedAt by mutableStateOf<Long?>(null); private set
    var loyaltyLoading by mutableStateOf(false); private set
    var loyaltyError by mutableStateOf<String?>(null); private set
    private var loyaltyJob: Job? = null
    private var loyaltyGen = 0L

    var challenges by mutableStateOf<List<Challenge>>(emptyList()); private set
    var challengesLoadedAt by mutableStateOf<Long?>(null); private set
    var challengesLoading by mutableStateOf(false); private set
    var challengesError by mutableStateOf<String?>(null); private set
    private var challengesJob: Job? = null
    private var challengesGen = 0L

    var groups by mutableStateOf<List<Group>>(emptyList()); private set
    var groupsLoadedAt by mutableStateOf<Long?>(null); private set
    var groupsLoading by mutableStateOf(false); private set
    var groupsError by mutableStateOf<String?>(null); private set
    private var groupsJob: Job? = null
    private var groupsGen = 0L

    var budget by mutableStateOf<BudgetResponse?>(null); private set
    var budgetLoadedAt by mutableStateOf<Long?>(null); private set
    var budgetLoading by mutableStateOf(false); private set
    var budgetError by mutableStateOf<String?>(null); private set
    private var budgetJob: Job? = null
    private var budgetGen = 0L

    var financialHealth by mutableStateOf<FinancialHealthResponse?>(null); private set
    var financialHealthLoadedAt by mutableStateOf<Long?>(null); private set
    var financialHealthLoading by mutableStateOf(false); private set
    var financialHealthError by mutableStateOf<String?>(null); private set
    private var financialHealthJob: Job? = null
    private var financialHealthGen = 0L

    var promotions by mutableStateOf<PromotionsResponse?>(null); private set
    var promotionsLoadedAt by mutableStateOf<Long?>(null); private set
    var promotionsLoading by mutableStateOf(false); private set
    var promotionsError by mutableStateOf<String?>(null); private set
    private var promotionsJob: Job? = null
    private var promotionsGen = 0L

    val categories: List<Category> get() = dashboard?.categories ?: emptyList()
    val settings: UserSettings? get() = dashboard?.settings
    val budgets: List<CategoryBudget> get() = dashboard?.budgets ?: emptyList()
    val expenses: List<Expense> get() = dashboard?.expenses ?: emptyList()
    val receiptsCountFromDashboard: Int get() = dashboard?.receiptsCount ?: 0
    val currency: String get() = (dashboard?.settings?.currency ?: "PLN").uppercase()
    val language: String get() = (dashboard?.settings?.language ?: "en").lowercase()

    private fun isFresh(loadedAt: Long?, ttl: Long? = null): Boolean {
        val l = loadedAt ?: return false
        return System.currentTimeMillis() - l < (ttl ?: cacheTtlMs)
    }

    private fun shouldRefresh(loadedAt: Long?): Boolean {
        val l = loadedAt ?: return true
        return System.currentTimeMillis() - l > refreshThrottleMs
    }

    // -------- Dashboard --------

    fun ensureDashboard(force: Boolean = false) {
        if (!force && !shouldRefresh(dashboardLoadedAt)) return
        if (!force && dashboardJob != null) return
        dashboardJob?.cancel()
        dashboardGen += 1
        val gen = dashboardGen
        dashboardJob = scope.launch { refreshDashboardImpl(gen) }
    }

    suspend fun awaitDashboard(force: Boolean = false) {
        if (!force && dashboard != null && isFresh(dashboardLoadedAt)) return
        if (!force) {
            dashboardJob?.let { it.join(); return }
        }
        dashboardJob?.cancel()
        dashboardGen += 1
        val gen = dashboardGen
        val job = scope.launch { refreshDashboardImpl(gen) }
        dashboardJob = job
        job.join()
    }

    private suspend fun refreshDashboardImpl(gen: Long) {
        val hadCache = dashboard != null
        if (!hadCache && gen == dashboardGen) dashboardLoading = true
        try {
            for (attempt in 1..3) {
                if (gen != dashboardGen) return
                try {
                    val raw = DashboardRepo.fetch()
                    if (gen != dashboardGen) return
                    dashboard = raw
                    dashboardLoadedAt = System.currentTimeMillis()
                    dashboardError = null
                    return
                } catch (_: ApiError.Cancelled) {
                    return
                } catch (_: CancellationException) {
                    return
                } catch (e: Throwable) {
                    if (e is ApiError && e.isRetryable && attempt < 3) {
                        delay(attempt * 1000L)
                        continue
                    }
                    if (gen != dashboardGen) return
                    if (!hadCache) dashboardError = e.message
                    return
                }
            }
        } finally {
            if (!hadCache && gen == dashboardGen) dashboardLoading = false
            if (gen == dashboardGen) dashboardJob = null
        }
    }

    // -------- Receipts --------

    fun ensureReceipts(force: Boolean = false) {
        if (!force && !shouldRefresh(receiptsLoadedAt)) return
        if (!force && receiptsJob != null) return
        receiptsJob?.cancel()
        receiptsGen += 1
        val gen = receiptsGen
        receiptsJob = scope.launch { refreshReceiptsImpl(gen) }
    }

    suspend fun awaitReceipts(force: Boolean = false) {
        if (!force && receiptsLoadedAt != null && isFresh(receiptsLoadedAt)) return
        if (!force) { receiptsJob?.let { it.join(); return } }
        receiptsJob?.cancel()
        receiptsGen += 1
        val gen = receiptsGen
        val job = scope.launch { refreshReceiptsImpl(gen) }
        receiptsJob = job
        job.join()
    }

    private suspend fun refreshReceiptsImpl(gen: Long) {
        val hadCache = receipts.isNotEmpty()
        if (!hadCache && gen == receiptsGen) receiptsLoading = true
        try {
            try {
                val list = ReceiptsRepo.list()
                if (gen != receiptsGen) return
                receipts = list
                receiptsLoadedAt = System.currentTimeMillis()
                receiptsError = null
            } catch (_: ApiError.Cancelled) {
                return
            } catch (_: CancellationException) {
                return
            } catch (e: Throwable) {
                if (gen != receiptsGen) return
                if (!hadCache) receiptsError = e.message
            }
        } finally {
            if (!hadCache && gen == receiptsGen) receiptsLoading = false
            if (gen == receiptsGen) receiptsJob = null
        }
    }

    // -------- Goals --------

    fun ensureGoals(force: Boolean = false) {
        if (!force && !shouldRefresh(goalsLoadedAt)) return
        if (!force && goalsJob != null) return
        goalsJob?.cancel()
        goalsGen += 1
        val gen = goalsGen
        goalsJob = scope.launch { refreshGoalsImpl(gen) }
    }

    private suspend fun refreshGoalsImpl(gen: Long) {
        val hadCache = goals.isNotEmpty()
        if (!hadCache && gen == goalsGen) goalsLoading = true
        try {
            try {
                val list = GoalsRepo.list()
                if (gen != goalsGen) return
                goals = list
                goalsLoadedAt = System.currentTimeMillis()
                goalsError = null
            } catch (_: ApiError.Cancelled) { return }
            catch (_: CancellationException) { return }
            catch (e: Throwable) {
                if (gen != goalsGen) return
                if (!hadCache) goalsError = e.message
            }
        } finally {
            if (!hadCache && gen == goalsGen) goalsLoading = false
            if (gen == goalsGen) goalsJob = null
        }
    }

    fun ensureLoyalty(force: Boolean = false) {
        if (!force && !shouldRefresh(loyaltyLoadedAt)) return
        if (!force && loyaltyJob != null) return
        loyaltyJob?.cancel()
        loyaltyGen += 1
        val gen = loyaltyGen
        loyaltyJob = scope.launch {
            val hadCache = loyalty.isNotEmpty()
            if (!hadCache && gen == loyaltyGen) loyaltyLoading = true
            try {
                val list = LoyaltyRepo.list()
                if (gen != loyaltyGen) return@launch
                loyalty = list
                loyaltyLoadedAt = System.currentTimeMillis()
                loyaltyError = null
            } catch (_: ApiError.Cancelled) {}
            catch (_: CancellationException) {}
            catch (e: Throwable) {
                if (gen == loyaltyGen && !hadCache) loyaltyError = e.message
            } finally {
                if (!hadCache && gen == loyaltyGen) loyaltyLoading = false
                if (gen == loyaltyGen) loyaltyJob = null
            }
        }
    }

    fun ensureChallenges(force: Boolean = false) {
        if (!force && !shouldRefresh(challengesLoadedAt)) return
        if (!force && challengesJob != null) return
        challengesJob?.cancel()
        challengesGen += 1
        val gen = challengesGen
        challengesJob = scope.launch {
            val hadCache = challenges.isNotEmpty()
            if (!hadCache && gen == challengesGen) challengesLoading = true
            try {
                val list = ChallengesRepo.list()
                if (gen != challengesGen) return@launch
                challenges = list
                challengesLoadedAt = System.currentTimeMillis()
                challengesError = null
            } catch (_: ApiError.Cancelled) {}
            catch (_: CancellationException) {}
            catch (e: Throwable) {
                if (gen == challengesGen && !hadCache) challengesError = e.message
            } finally {
                if (!hadCache && gen == challengesGen) challengesLoading = false
                if (gen == challengesGen) challengesJob = null
            }
        }
    }

    fun ensureGroups(force: Boolean = false) {
        if (!force && !shouldRefresh(groupsLoadedAt)) return
        if (!force && groupsJob != null) return
        groupsJob?.cancel()
        groupsGen += 1
        val gen = groupsGen
        groupsJob = scope.launch {
            val hadCache = groups.isNotEmpty()
            if (!hadCache && gen == groupsGen) groupsLoading = true
            try {
                val list = GroupsRepo.list()
                if (gen != groupsGen) return@launch
                groups = list
                groupsLoadedAt = System.currentTimeMillis()
                groupsError = null
            } catch (_: ApiError.Cancelled) {}
            catch (_: CancellationException) {}
            catch (e: Throwable) {
                if (gen == groupsGen && !hadCache) groupsError = e.message
            } finally {
                if (!hadCache && gen == groupsGen) groupsLoading = false
                if (gen == groupsGen) groupsJob = null
            }
        }
    }

    private val currentMonthString: String
        get() = SimpleDateFormat("yyyy-MM", Locale.ROOT).format(Date())

    fun ensureBudget(force: Boolean = false) {
        if (!force && !shouldRefresh(budgetLoadedAt)) return
        if (!force && budgetJob != null) return
        budgetJob?.cancel()
        budgetGen += 1
        val gen = budgetGen
        budgetJob = scope.launch {
            val hadCache = budget != null
            if (!hadCache && gen == budgetGen) budgetLoading = true
            try {
                val res = BudgetRepo.fetch(currentMonthString)
                if (gen != budgetGen) return@launch
                budget = res
                budgetLoadedAt = System.currentTimeMillis()
                budgetError = null
            } catch (_: ApiError.Cancelled) {}
            catch (_: CancellationException) {}
            catch (e: Throwable) {
                if (gen == budgetGen && !hadCache) budgetError = e.message
            } finally {
                if (!hadCache && gen == budgetGen) budgetLoading = false
                if (gen == budgetGen) budgetJob = null
            }
        }
    }

    fun ensureFinancialHealth(force: Boolean = false) {
        if (!force && !shouldRefresh(financialHealthLoadedAt)) return
        if (!force && financialHealthJob != null) return
        financialHealthJob?.cancel()
        financialHealthGen += 1
        val gen = financialHealthGen
        financialHealthJob = scope.launch {
            val hadCache = financialHealth != null
            if (!hadCache && gen == financialHealthGen) financialHealthLoading = true
            try {
                val res = FinancialHealthRepo.fetch()
                if (gen != financialHealthGen) return@launch
                financialHealth = res
                financialHealthLoadedAt = System.currentTimeMillis()
                financialHealthError = null
            } catch (_: ApiError.Cancelled) {}
            catch (_: CancellationException) {}
            catch (e: Throwable) {
                if (gen == financialHealthGen && !hadCache) financialHealthError = e.message
            } finally {
                if (!hadCache && gen == financialHealthGen) financialHealthLoading = false
                if (gen == financialHealthGen) financialHealthJob = null
            }
        }
    }

    fun ensurePromotions(force: Boolean = false) {
        if (!force && !shouldRefresh(promotionsLoadedAt)) return
        if (!force && promotionsJob != null) return
        promotionsJob?.cancel()
        promotionsGen += 1
        val gen = promotionsGen
        promotionsJob = scope.launch {
            val hadCache = promotions != null
            if (!hadCache && gen == promotionsGen) promotionsLoading = true
            try {
                val res = PromotionsRepo.fetch(currency = dashboard?.settings?.currency ?: "PLN")
                if (gen != promotionsGen) return@launch
                promotions = res
                promotionsLoadedAt = System.currentTimeMillis()
                promotionsError = null
            } catch (_: ApiError.Cancelled) {}
            catch (_: CancellationException) {}
            catch (e: Throwable) {
                if (gen == promotionsGen && !hadCache) promotionsError = e.message
            } finally {
                if (!hadCache && gen == promotionsGen) promotionsLoading = false
                if (gen == promotionsGen) promotionsJob = null
            }
        }
    }

    fun refreshAll(force: Boolean = false) {
        ensureDashboard(force)
        ensureReceipts(force)
        ensureGoals(force)
        ensureLoyalty(force)
        ensureChallenges(force)
        ensureGroups(force)
        ensureBudget(force)
        ensureFinancialHealth(force)
        ensurePromotions(force)
    }

    fun didMutateExpenses() {
        invalidateDashboard(); invalidateBudget(); invalidateFinancialHealth()
        ensureDashboard(true); ensureBudget(true); ensureFinancialHealth(true)
    }

    fun didMutateReceipts() {
        invalidateReceipts(); invalidateDashboard(); invalidateBudget(); invalidateFinancialHealth()
        ensureReceipts(true); ensureDashboard(true); ensureBudget(true); ensureFinancialHealth(true)
    }

    fun didMutateCategoriesOrBudgetsOrSettings() {
        invalidateDashboard(); invalidateBudget(); invalidateFinancialHealth()
        ensureDashboard(true); ensureBudget(true); ensureFinancialHealth(true)
    }

    fun didMutateGoals() { invalidateGoals(); ensureGoals(true) }
    fun didMutateLoyalty() { invalidateLoyalty(); ensureLoyalty(true) }
    fun didMutateChallenges() { invalidateChallenges(); ensureChallenges(true) }
    fun didMutateGroups() { invalidateGroups(); ensureGroups(true) }
    fun didMutateBudget() {
        invalidateBudget(); invalidateFinancialHealth()
        ensureBudget(true); ensureFinancialHealth(true)
    }

    fun insertExpenseOptimistic(expense: Expense) {
        val d = dashboard ?: return
        dashboard = d.copy(expenses = listOf(expense) + d.expenses)
    }

    fun removeExpensesOptimistic(ids: Set<String>) {
        val d = dashboard ?: return
        dashboard = d.copy(expenses = d.expenses.filter { it.id !in ids })
    }

    fun restoreExpensesOptimistic(restored: List<Expense>) {
        if (restored.isEmpty()) return
        val d = dashboard ?: return
        val existing = d.expenses.map { it.id }.toSet()
        val newOnes = restored.filter { it.id !in existing }
        if (newOnes.isEmpty()) return
        val merged = (newOnes + d.expenses).sortedWith(
            compareByDescending<Expense> { it.date.take(10) }.thenByDescending { it.createdAt ?: "" }
        )
        dashboard = d.copy(expenses = merged)
    }

    fun upsertReceiptOptimistic(receipt: Receipt) {
        val list = receipts.toMutableList()
        val idx = list.indexOfFirst { it.id == receipt.id }
        if (idx >= 0) list[idx] = receipt else list.add(0, receipt)
        receipts = list
    }

    fun removeReceiptOptimistic(id: String) {
        receipts = receipts.filter { it.id != id }
    }

    fun restoreReceiptOptimistic(receipt: Receipt, index: Int? = null) {
        if (receipts.any { it.id == receipt.id }) return
        val list = receipts.toMutableList()
        val safe = if (index != null && index in 0..list.size) index else 0
        list.add(safe, receipt)
        receipts = list
    }

    fun invalidateDashboard() { dashboardLoadedAt = null }
    fun invalidateReceipts() { receiptsLoadedAt = null }
    fun invalidateGoals() { goalsLoadedAt = null }
    fun invalidateLoyalty() { loyaltyLoadedAt = null }
    fun invalidateChallenges() { challengesLoadedAt = null }
    fun invalidateGroups() { groupsLoadedAt = null }
    fun invalidateBudget() { budgetLoadedAt = null }
    fun invalidateFinancialHealth() { financialHealthLoadedAt = null }
    fun invalidatePromotions() { promotionsLoadedAt = null }

    fun resetAll() {
        dashboardJob?.cancel(); receiptsJob?.cancel(); goalsJob?.cancel()
        loyaltyJob?.cancel(); challengesJob?.cancel(); groupsJob?.cancel()
        budgetJob?.cancel(); financialHealthJob?.cancel(); promotionsJob?.cancel()
        dashboardGen += 1; receiptsGen += 1; goalsGen += 1
        loyaltyGen += 1; challengesGen += 1; groupsGen += 1
        budgetGen += 1; financialHealthGen += 1; promotionsGen += 1
        dashboard = null; dashboardLoadedAt = null; dashboardLoading = false; dashboardError = null
        receipts = emptyList(); receiptsLoadedAt = null; receiptsLoading = false; receiptsError = null
        goals = emptyList(); goalsLoadedAt = null; goalsLoading = false; goalsError = null
        loyalty = emptyList(); loyaltyLoadedAt = null; loyaltyLoading = false; loyaltyError = null
        challenges = emptyList(); challengesLoadedAt = null; challengesLoading = false; challengesError = null
        groups = emptyList(); groupsLoadedAt = null; groupsLoading = false; groupsError = null
        budget = null; budgetLoadedAt = null; budgetLoading = false; budgetError = null
        financialHealth = null; financialHealthLoadedAt = null; financialHealthLoading = false; financialHealthError = null
        promotions = null; promotionsLoadedAt = null; promotionsLoading = false; promotionsError = null
    }
}

val LocalAppDataStore = compositionLocalOf<AppDataStore> { error("AppDataStore not provided") }
