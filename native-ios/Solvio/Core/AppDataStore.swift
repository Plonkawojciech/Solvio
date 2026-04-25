import Foundation
import SwiftUI

/// Central in-memory cache for all primary user data.
///
/// **Why this exists:** Without it, every view (Dashboard, Expenses, Goals,
/// Receipts, Settings, …) hits the network on appear. That meant the user
/// saw a spinner literally everywhere, on every tab swap, even though the
/// data was already fresh from 2 seconds ago.
///
/// **Strategy: stale-while-revalidate.** When a view asks for data:
///   1. If we have any cached value, hand it back instantly — no spinner.
///   2. If the cache is stale (older than `cacheTTL`) or `force == true`,
///      fire a background refresh that updates `@Published` once it lands.
///   3. Mutations (create / update / delete) invalidate the relevant slice
///      and immediately refresh in the background.
///
/// **Race-free force refresh.** Each slice owns a `xxxGen` generation
/// counter. `ensureXxx(force: true)` / `awaitXxx(force: true)` cancel any
/// in-flight task, bump the gen, and start a fresh fetch — and the running
/// impl drops its result if the gen changed under it. Without this, a
/// background refresh kicked off BEFORE an optimistic delete could land
/// AFTER and resurrect the just-deleted row.
///
/// **One source of truth.** `dashboard` carries categories + settings +
/// budgets + expenses + receiptsCount, so we re-expose them as computed
/// properties. Views that previously fetched `/api/data/settings` or
/// `/api/data/expenses` separately can now read straight from the store.
///
/// Singleton-on-MainActor so SwiftUI views can subscribe via
/// `@EnvironmentObject` without thread-hopping. All network work hops
/// off the actor automatically thanks to `async`.
@MainActor
final class AppDataStore: ObservableObject {

    // MARK: Cache TTL

    /// 5 minutes. Long enough that tab-switching feels instant, short
    /// enough that the user never sees stale numbers for long.
    private let cacheTTL: TimeInterval = 300
    /// Background refresh is fired *every* read if older than this — keeps
    /// "stale-while-revalidate" honest without hammering the API.
    private let refreshThrottle: TimeInterval = 30

    // MARK: Dashboard (primary slice)

    @Published private(set) var dashboard: DashboardResponse?
    @Published private(set) var dashboardLoadedAt: Date?
    @Published private(set) var dashboardLoading = false
    @Published private(set) var dashboardError: String?
    private var dashboardTask: Task<Void, Never>?
    private var dashboardGen: UInt64 = 0

    // MARK: Receipts

    @Published private(set) var receipts: [Receipt] = []
    @Published private(set) var receiptsLoadedAt: Date?
    @Published private(set) var receiptsLoading = false
    @Published private(set) var receiptsError: String?
    private var receiptsTask: Task<Void, Never>?
    private var receiptsGen: UInt64 = 0

    // MARK: Goals

    @Published private(set) var goals: [SavingsGoal] = []
    @Published private(set) var goalsLoadedAt: Date?
    @Published private(set) var goalsLoading = false
    @Published private(set) var goalsError: String?
    private var goalsTask: Task<Void, Never>?
    private var goalsGen: UInt64 = 0

    // MARK: Loyalty cards

    @Published private(set) var loyalty: [LoyaltyCard] = []
    @Published private(set) var loyaltyLoadedAt: Date?
    @Published private(set) var loyaltyLoading = false
    @Published private(set) var loyaltyError: String?
    private var loyaltyTask: Task<Void, Never>?
    private var loyaltyGen: UInt64 = 0

    // MARK: Challenges

    @Published private(set) var challenges: [Challenge] = []
    @Published private(set) var challengesLoadedAt: Date?
    @Published private(set) var challengesLoading = false
    @Published private(set) var challengesError: String?
    private var challengesTask: Task<Void, Never>?
    private var challengesGen: UInt64 = 0

    // MARK: Groups

    @Published private(set) var groups: [Group] = []
    @Published private(set) var groupsLoadedAt: Date?
    @Published private(set) var groupsLoading = false
    @Published private(set) var groupsError: String?
    private var groupsTask: Task<Void, Never>?
    private var groupsGen: UInt64 = 0

    // MARK: Budget (current-month monthly budget + per-category breakdown)

    @Published private(set) var budget: BudgetResponse?
    @Published private(set) var budgetLoadedAt: Date?
    @Published private(set) var budgetLoading = false
    @Published private(set) var budgetError: String?
    private var budgetTask: Task<Void, Never>?
    private var budgetGen: UInt64 = 0

    // MARK: Financial Health (score 0-100 + tip strings)

    @Published private(set) var financialHealth: FinancialHealthResponse?
    @Published private(set) var financialHealthLoadedAt: Date?
    @Published private(set) var financialHealthLoading = false
    @Published private(set) var financialHealthError: String?
    private var financialHealthTask: Task<Void, Never>?
    private var financialHealthGen: UInt64 = 0

    // MARK: Promotions (personalized deals — backend caches 24h)

    @Published private(set) var promotions: PromotionsResponse?
    @Published private(set) var promotionsLoadedAt: Date?
    @Published private(set) var promotionsLoading = false
    @Published private(set) var promotionsError: String?
    private var promotionsTask: Task<Void, Never>?
    private var promotionsGen: UInt64 = 0

    // MARK: - Convenience accessors derived from the dashboard payload

    var categories: [Category] { dashboard?.categories ?? [] }
    var settings: UserSettings? { dashboard?.settings }
    var budgets: [CategoryBudget] { dashboard?.budgets ?? [] }
    var expenses: [Expense] { dashboard?.expenses ?? [] }
    var receiptsCountFromDashboard: Int { dashboard?.receiptsCount ?? 0 }
    var currency: String { (dashboard?.settings?.currency ?? "PLN").uppercased() }
    var language: String { (dashboard?.settings?.language ?? "en").lowercased() }

    // MARK: - Init

    init() {}

    // MARK: - Cache helpers

    /// Treat a slice as fresh enough to skip the background refresh.
    private func isFresh(_ loadedAt: Date?, ttl: TimeInterval? = nil) -> Bool {
        guard let loadedAt else { return false }
        return Date().timeIntervalSince(loadedAt) < (ttl ?? cacheTTL)
    }

    /// Should we kick off a background refresh? Yes if older than throttle.
    private func shouldRefresh(_ loadedAt: Date?) -> Bool {
        guard let loadedAt else { return true }
        return Date().timeIntervalSince(loadedAt) > refreshThrottle
    }

    // MARK: - Dashboard

    /// Show whatever we have, kick off a background refresh if stale.
    /// The view stays subscribed via `@Published`, so when the network
    /// call finishes the UI updates without any explicit await.
    func ensureDashboard(force: Bool = false) {
        if !force && !shouldRefresh(dashboardLoadedAt) { return }
        if !force && dashboardTask != nil { return } // background refresh already in-flight
        // force=true may cancel an in-flight task — its result is stale
        // relative to whatever mutation just triggered the force. The gen
        // bump means the cancelled impl will discard its response if it
        // races to completion before cancel takes effect.
        dashboardTask?.cancel()
        dashboardGen &+= 1
        let myGen = dashboardGen
        dashboardTask = Task { [weak self] in
            await self?.refreshDashboardImpl(gen: myGen)
        }
    }

    /// Block the caller until the dashboard has been fetched at least once.
    /// Use this on initial app launch when we genuinely have nothing to show.
    func awaitDashboard(force: Bool = false) async {
        if !force, dashboard != nil, isFresh(dashboardLoadedAt, ttl: cacheTTL) { return }
        if !force, let existing = dashboardTask { await existing.value; return }
        dashboardTask?.cancel()
        dashboardGen &+= 1
        let myGen = dashboardGen
        let task: Task<Void, Never> = Task { [weak self] in
            await self?.refreshDashboardImpl(gen: myGen)
        }
        dashboardTask = task
        await task.value
    }

    private func refreshDashboardImpl(gen: UInt64) async {
        defer {
            // Only null out the task pointer if I'm still the current
            // generation. A newer task may have already replaced me.
            if gen == dashboardGen { dashboardTask = nil }
        }
        let hadCache = (dashboard != nil)
        if !hadCache, gen == dashboardGen { dashboardLoading = true }
        defer {
            if !hadCache, gen == dashboardGen { dashboardLoading = false }
        }

        // Up to 3 attempts on transient errors (Neon cold start, timeouts).
        let maxAttempts = 3
        for attempt in 1...maxAttempts {
            // Bail out if a newer task has been started — our result would
            // overwrite their fresher data.
            if gen != dashboardGen { return }
            do {
                let raw = try await DashboardRepo.fetch()
                guard gen == dashboardGen else { return }
                dashboard = raw
                dashboardLoadedAt = Date()
                dashboardError = nil
                #if DEBUG
                print("[AppDataStore] dashboard refreshed (gen=\(gen)): expenses=\(raw.expenses.count) categories=\(raw.categories.count) receipts=\(raw.receiptsCount)")
                #endif
                return
            } catch ApiError.cancelled {
                // Cancelled by a force-refresh. Don't surface, don't retry.
                return
            } catch {
                if let api = error as? ApiError, api.isRetryable, attempt < maxAttempts {
                    try? await Task.sleep(nanoseconds: UInt64(attempt) * 1_000_000_000)
                    continue
                }
                guard gen == dashboardGen else { return }
                // Surface error ONLY if we have nothing cached. If the user
                // already sees data, a transient failure shouldn't replace
                // their screen with an error card.
                if !hadCache {
                    dashboardError = error.localizedDescription
                }
                #if DEBUG
                print("[AppDataStore] dashboard refresh failed (attempt \(attempt), hadCache=\(hadCache)): \(error)")
                #endif
                return
            }
        }
    }

    // MARK: - Receipts

    func ensureReceipts(force: Bool = false) {
        if !force && !shouldRefresh(receiptsLoadedAt) { return }
        if !force && receiptsTask != nil { return }
        receiptsTask?.cancel()
        receiptsGen &+= 1
        let myGen = receiptsGen
        receiptsTask = Task { [weak self] in
            await self?.refreshReceiptsImpl(gen: myGen)
        }
    }

    func awaitReceipts(force: Bool = false) async {
        if !force, receiptsLoadedAt != nil, isFresh(receiptsLoadedAt, ttl: cacheTTL) { return }
        if !force, let existing = receiptsTask { await existing.value; return }
        receiptsTask?.cancel()
        receiptsGen &+= 1
        let myGen = receiptsGen
        let task: Task<Void, Never> = Task { [weak self] in
            await self?.refreshReceiptsImpl(gen: myGen)
        }
        receiptsTask = task
        await task.value
    }

    private func refreshReceiptsImpl(gen: UInt64) async {
        defer {
            if gen == receiptsGen { receiptsTask = nil }
        }
        let hadCache = !receipts.isEmpty
        if !hadCache, gen == receiptsGen { receiptsLoading = true }
        defer {
            if !hadCache, gen == receiptsGen { receiptsLoading = false }
        }
        do {
            let list = try await ReceiptsRepo.list()
            guard gen == receiptsGen else { return }
            receipts = list
            receiptsLoadedAt = Date()
            receiptsError = nil
        } catch ApiError.cancelled {
            return
        } catch {
            guard gen == receiptsGen else { return }
            if !hadCache { receiptsError = error.localizedDescription }
            #if DEBUG
            print("[AppDataStore] receipts refresh failed (hadCache=\(hadCache)): \(error)")
            #endif
        }
    }

    // MARK: - Goals

    func ensureGoals(force: Bool = false) {
        if !force && !shouldRefresh(goalsLoadedAt) { return }
        if !force && goalsTask != nil { return }
        goalsTask?.cancel()
        goalsGen &+= 1
        let myGen = goalsGen
        goalsTask = Task { [weak self] in
            await self?.refreshGoalsImpl(gen: myGen)
        }
    }

    func awaitGoals(force: Bool = false) async {
        if !force, goalsLoadedAt != nil, isFresh(goalsLoadedAt, ttl: cacheTTL) { return }
        if !force, let existing = goalsTask { await existing.value; return }
        goalsTask?.cancel()
        goalsGen &+= 1
        let myGen = goalsGen
        let task: Task<Void, Never> = Task { [weak self] in
            await self?.refreshGoalsImpl(gen: myGen)
        }
        goalsTask = task
        await task.value
    }

    private func refreshGoalsImpl(gen: UInt64) async {
        defer {
            if gen == goalsGen { goalsTask = nil }
        }
        let hadCache = !goals.isEmpty
        if !hadCache, gen == goalsGen { goalsLoading = true }
        defer {
            if !hadCache, gen == goalsGen { goalsLoading = false }
        }
        do {
            let list = try await GoalsRepo.list()
            guard gen == goalsGen else { return }
            goals = list
            goalsLoadedAt = Date()
            goalsError = nil
        } catch ApiError.cancelled {
            return
        } catch {
            guard gen == goalsGen else { return }
            if !hadCache { goalsError = error.localizedDescription }
            #if DEBUG
            print("[AppDataStore] goals refresh failed (hadCache=\(hadCache)): \(error)")
            #endif
        }
    }

    // MARK: - Loyalty

    func ensureLoyalty(force: Bool = false) {
        if !force && !shouldRefresh(loyaltyLoadedAt) { return }
        if !force && loyaltyTask != nil { return }
        loyaltyTask?.cancel()
        loyaltyGen &+= 1
        let myGen = loyaltyGen
        loyaltyTask = Task { [weak self] in
            await self?.refreshLoyaltyImpl(gen: myGen)
        }
    }

    func awaitLoyalty(force: Bool = false) async {
        if !force, loyaltyLoadedAt != nil, isFresh(loyaltyLoadedAt, ttl: cacheTTL) { return }
        if !force, let existing = loyaltyTask { await existing.value; return }
        loyaltyTask?.cancel()
        loyaltyGen &+= 1
        let myGen = loyaltyGen
        let task: Task<Void, Never> = Task { [weak self] in
            await self?.refreshLoyaltyImpl(gen: myGen)
        }
        loyaltyTask = task
        await task.value
    }

    private func refreshLoyaltyImpl(gen: UInt64) async {
        defer {
            if gen == loyaltyGen { loyaltyTask = nil }
        }
        let hadCache = !loyalty.isEmpty
        if !hadCache, gen == loyaltyGen { loyaltyLoading = true }
        defer {
            if !hadCache, gen == loyaltyGen { loyaltyLoading = false }
        }
        do {
            let list = try await LoyaltyRepo.list()
            guard gen == loyaltyGen else { return }
            loyalty = list
            loyaltyLoadedAt = Date()
            loyaltyError = nil
        } catch ApiError.cancelled {
            return
        } catch {
            guard gen == loyaltyGen else { return }
            if !hadCache { loyaltyError = error.localizedDescription }
            #if DEBUG
            print("[AppDataStore] loyalty refresh failed (hadCache=\(hadCache)): \(error)")
            #endif
        }
    }

    // MARK: - Challenges

    func ensureChallenges(force: Bool = false) {
        if !force && !shouldRefresh(challengesLoadedAt) { return }
        if !force && challengesTask != nil { return }
        challengesTask?.cancel()
        challengesGen &+= 1
        let myGen = challengesGen
        challengesTask = Task { [weak self] in
            await self?.refreshChallengesImpl(gen: myGen)
        }
    }

    func awaitChallenges(force: Bool = false) async {
        if !force, challengesLoadedAt != nil, isFresh(challengesLoadedAt, ttl: cacheTTL) { return }
        if !force, let existing = challengesTask { await existing.value; return }
        challengesTask?.cancel()
        challengesGen &+= 1
        let myGen = challengesGen
        let task: Task<Void, Never> = Task { [weak self] in
            await self?.refreshChallengesImpl(gen: myGen)
        }
        challengesTask = task
        await task.value
    }

    private func refreshChallengesImpl(gen: UInt64) async {
        defer {
            if gen == challengesGen { challengesTask = nil }
        }
        let hadCache = !challenges.isEmpty
        if !hadCache, gen == challengesGen { challengesLoading = true }
        defer {
            if !hadCache, gen == challengesGen { challengesLoading = false }
        }
        do {
            let list = try await ChallengesRepo.list()
            guard gen == challengesGen else { return }
            challenges = list
            challengesLoadedAt = Date()
            challengesError = nil
        } catch ApiError.cancelled {
            return
        } catch {
            guard gen == challengesGen else { return }
            if !hadCache { challengesError = error.localizedDescription }
            #if DEBUG
            print("[AppDataStore] challenges refresh failed (hadCache=\(hadCache)): \(error)")
            #endif
        }
    }

    // MARK: - Groups

    func ensureGroups(force: Bool = false) {
        if !force && !shouldRefresh(groupsLoadedAt) { return }
        if !force && groupsTask != nil { return }
        groupsTask?.cancel()
        groupsGen &+= 1
        let myGen = groupsGen
        groupsTask = Task { [weak self] in
            await self?.refreshGroupsImpl(gen: myGen)
        }
    }

    func awaitGroups(force: Bool = false) async {
        if !force, groupsLoadedAt != nil, isFresh(groupsLoadedAt, ttl: cacheTTL) { return }
        if !force, let existing = groupsTask { await existing.value; return }
        groupsTask?.cancel()
        groupsGen &+= 1
        let myGen = groupsGen
        let task: Task<Void, Never> = Task { [weak self] in
            await self?.refreshGroupsImpl(gen: myGen)
        }
        groupsTask = task
        await task.value
    }

    private func refreshGroupsImpl(gen: UInt64) async {
        defer {
            if gen == groupsGen { groupsTask = nil }
        }
        let hadCache = !groups.isEmpty
        if !hadCache, gen == groupsGen { groupsLoading = true }
        defer {
            if !hadCache, gen == groupsGen { groupsLoading = false }
        }
        do {
            let list = try await GroupsRepo.list()
            guard gen == groupsGen else { return }
            groups = list
            groupsLoadedAt = Date()
            groupsError = nil
        } catch ApiError.cancelled {
            return
        } catch {
            guard gen == groupsGen else { return }
            if !hadCache { groupsError = error.localizedDescription }
            #if DEBUG
            print("[AppDataStore] groups refresh failed (hadCache=\(hadCache)): \(error)")
            #endif
        }
    }

    // MARK: - Budget

    /// Current month in `YYYY-MM` format. Budget is per-month so the cache
    /// key is implicitly the user+month combination.
    private var currentMonthString: String {
        let df = DateFormatter()
        df.dateFormat = "yyyy-MM"
        return df.string(from: Date())
    }

    func ensureBudget(force: Bool = false) {
        if !force && !shouldRefresh(budgetLoadedAt) { return }
        if !force && budgetTask != nil { return }
        budgetTask?.cancel()
        budgetGen &+= 1
        let myGen = budgetGen
        budgetTask = Task { [weak self] in
            await self?.refreshBudgetImpl(gen: myGen)
        }
    }

    func awaitBudget(force: Bool = false) async {
        if !force, budget != nil, isFresh(budgetLoadedAt, ttl: cacheTTL) { return }
        if !force, let existing = budgetTask { await existing.value; return }
        budgetTask?.cancel()
        budgetGen &+= 1
        let myGen = budgetGen
        let task: Task<Void, Never> = Task { [weak self] in
            await self?.refreshBudgetImpl(gen: myGen)
        }
        budgetTask = task
        await task.value
    }

    private func refreshBudgetImpl(gen: UInt64) async {
        defer {
            if gen == budgetGen { budgetTask = nil }
        }
        let hadCache = (budget != nil)
        if !hadCache, gen == budgetGen { budgetLoading = true }
        defer {
            if !hadCache, gen == budgetGen { budgetLoading = false }
        }
        do {
            let res = try await BudgetRepo.fetch(month: currentMonthString)
            guard gen == budgetGen else { return }
            budget = res
            budgetLoadedAt = Date()
            budgetError = nil
        } catch ApiError.cancelled {
            return
        } catch {
            guard gen == budgetGen else { return }
            if !hadCache { budgetError = error.localizedDescription }
            #if DEBUG
            print("[AppDataStore] budget refresh failed (hadCache=\(hadCache)): \(error)")
            #endif
        }
    }

    // MARK: - Financial Health

    func ensureFinancialHealth(force: Bool = false) {
        if !force && !shouldRefresh(financialHealthLoadedAt) { return }
        if !force && financialHealthTask != nil { return }
        financialHealthTask?.cancel()
        financialHealthGen &+= 1
        let myGen = financialHealthGen
        financialHealthTask = Task { [weak self] in
            await self?.refreshFinancialHealthImpl(gen: myGen)
        }
    }

    func awaitFinancialHealth(force: Bool = false) async {
        if !force, financialHealth != nil, isFresh(financialHealthLoadedAt, ttl: cacheTTL) { return }
        if !force, let existing = financialHealthTask { await existing.value; return }
        financialHealthTask?.cancel()
        financialHealthGen &+= 1
        let myGen = financialHealthGen
        let task: Task<Void, Never> = Task { [weak self] in
            await self?.refreshFinancialHealthImpl(gen: myGen)
        }
        financialHealthTask = task
        await task.value
    }

    private func refreshFinancialHealthImpl(gen: UInt64) async {
        defer {
            if gen == financialHealthGen { financialHealthTask = nil }
        }
        let hadCache = (financialHealth != nil)
        if !hadCache, gen == financialHealthGen { financialHealthLoading = true }
        defer {
            if !hadCache, gen == financialHealthGen { financialHealthLoading = false }
        }
        do {
            let res = try await FinancialHealthRepo.fetch()
            guard gen == financialHealthGen else { return }
            financialHealth = res
            financialHealthLoadedAt = Date()
            financialHealthError = nil
        } catch ApiError.cancelled {
            return
        } catch {
            guard gen == financialHealthGen else { return }
            if !hadCache { financialHealthError = error.localizedDescription }
            #if DEBUG
            print("[AppDataStore] financialHealth refresh failed (hadCache=\(hadCache)): \(error)")
            #endif
        }
    }

    // MARK: - Promotions
    //
    // The backend already caches results 24h per user, so the client TTL
    // can stay at the standard 5 min — but this slice is the one most
    // sensitive to "spinner on first open" because the AI call takes
    // ~15s on a cache miss. Prefetching at login means the user never
    // sees that spinner: by the time they tap Savings → Deals tab, the
    // result is already in memory.

    func ensurePromotions(force: Bool = false) {
        if !force && !shouldRefresh(promotionsLoadedAt) { return }
        if !force && promotionsTask != nil { return }
        promotionsTask?.cancel()
        promotionsGen &+= 1
        let myGen = promotionsGen
        promotionsTask = Task { [weak self] in
            await self?.refreshPromotionsImpl(gen: myGen)
        }
    }

    func awaitPromotions(force: Bool = false) async {
        if !force, promotions != nil, isFresh(promotionsLoadedAt, ttl: cacheTTL) { return }
        if !force, let existing = promotionsTask { await existing.value; return }
        promotionsTask?.cancel()
        promotionsGen &+= 1
        let myGen = promotionsGen
        let task: Task<Void, Never> = Task { [weak self] in
            await self?.refreshPromotionsImpl(gen: myGen)
        }
        promotionsTask = task
        await task.value
    }

    private func refreshPromotionsImpl(gen: UInt64) async {
        defer {
            if gen == promotionsGen { promotionsTask = nil }
        }
        let hadCache = (promotions != nil)
        if !hadCache, gen == promotionsGen { promotionsLoading = true }
        defer {
            if !hadCache, gen == promotionsGen { promotionsLoading = false }
        }
        do {
            // Use the dashboard's currency if we have it; otherwise PLN. Same
            // language fallback as the rest of the store.
            let res = try await PromotionsRepo.fetch(
                lang: nil,
                currency: dashboard?.settings?.currency ?? "PLN"
            )
            guard gen == promotionsGen else { return }
            promotions = res
            promotionsLoadedAt = Date()
            promotionsError = nil
        } catch ApiError.cancelled {
            return
        } catch {
            guard gen == promotionsGen else { return }
            if !hadCache { promotionsError = error.localizedDescription }
            #if DEBUG
            print("[AppDataStore] promotions refresh failed (hadCache=\(hadCache)): \(error)")
            #endif
        }
    }

    // MARK: - Bulk refresh

    /// Fire all primary slice refreshes in parallel. Each one is
    /// fire-and-forget — if cached, no spinner shows; if it fails, no
    /// error replaces the existing data. Use this on login and on
    /// app-foreground.
    ///
    /// 9 slices total: 6 core (dashboard/receipts/goals/loyalty/challenges/
    /// groups) + 3 derived (budget/financialHealth/promotions). The 3 derived
    /// ones power the Savings tab and used to be per-tab fetches with their
    /// own spinners — moving them into the prefetch eliminates the
    /// "tab spins on first open" problem.
    func refreshAll(force: Bool = false) {
        ensureDashboard(force: force)
        ensureReceipts(force: force)
        ensureGoals(force: force)
        ensureLoyalty(force: force)
        ensureChallenges(force: force)
        ensureGroups(force: force)
        ensureBudget(force: force)
        ensureFinancialHealth(force: force)
        ensurePromotions(force: force)
    }

    // MARK: - Mutation hooks (call from view-models after writes)

    /// After creating / updating / deleting an expense, dashboard +
    /// budget + financial-health all become stale (every category-grouped
    /// view depends on the expense list). UI shows the optimistic value
    /// while the refreshes land.
    func didMutateExpenses() {
        invalidateDashboard()
        invalidateBudget()
        invalidateFinancialHealth()
        ensureDashboard(force: true)
        ensureBudget(force: true)
        ensureFinancialHealth(force: true)
    }

    func didMutateReceipts() {
        // Receipts spawn expenses on the backend, so receipt mutations
        // ripple all the way through to budget + health-score just like
        // expense mutations.
        invalidateReceipts()
        invalidateDashboard()
        invalidateBudget()
        invalidateFinancialHealth()
        ensureReceipts(force: true)
        ensureDashboard(force: true)
        ensureBudget(force: true)
        ensureFinancialHealth(force: true)
    }

    func didMutateCategoriesOrBudgetsOrSettings() {
        // Categories/budgets/settings live on the dashboard payload, but
        // changing budgets directly affects the budget endpoint and the
        // health score derived from it — refresh both alongside.
        invalidateDashboard()
        invalidateBudget()
        invalidateFinancialHealth()
        ensureDashboard(force: true)
        ensureBudget(force: true)
        ensureFinancialHealth(force: true)
    }

    func didMutateGoals() {
        invalidateGoals()
        ensureGoals(force: true)
    }

    func didMutateLoyalty() {
        invalidateLoyalty()
        ensureLoyalty(force: true)
    }

    func didMutateChallenges() {
        invalidateChallenges()
        ensureChallenges(force: true)
    }

    func didMutateGroups() {
        invalidateGroups()
        ensureGroups(force: true)
    }

    // MARK: - Optimistic helpers

    /// Insert a freshly-created expense locally so the UI updates the
    /// instant the API call returns, before the dashboard refresh lands.
    func insertExpenseOptimistic(_ expense: Expense) {
        guard let d = dashboard else { return }
        dashboard = DashboardResponse(
            categories: d.categories,
            settings: d.settings,
            budgets: d.budgets,
            expenses: [expense] + d.expenses,
            prevExpenses: d.prevExpenses,
            receiptsCount: d.receiptsCount,
            monthIncome: d.monthIncome,
            savingsTarget: d.savingsTarget,
            prevTotal: d.prevTotal,
            prevByCategory: d.prevByCategory
        )
    }

    /// Drop expenses locally before the round-trip lands.
    func removeExpensesOptimistic(ids: Set<String>) {
        guard let d = dashboard else { return }
        dashboard = DashboardResponse(
            categories: d.categories,
            settings: d.settings,
            budgets: d.budgets,
            expenses: d.expenses.filter { !ids.contains($0.id) },
            prevExpenses: d.prevExpenses,
            receiptsCount: d.receiptsCount,
            monthIncome: d.monthIncome,
            savingsTarget: d.savingsTarget,
            prevTotal: d.prevTotal,
            prevByCategory: d.prevByCategory
        )
    }

    /// Re-insert previously-removed expenses (for undo flows). Dedups by id
    /// in case the dashboard already pulled them back, and preserves the
    /// existing sort by date+createdAt.
    func restoreExpensesOptimistic(_ restored: [Expense]) {
        guard let d = dashboard, !restored.isEmpty else { return }
        let existingIds = Set(d.expenses.map { $0.id })
        let newOnes = restored.filter { !existingIds.contains($0.id) }
        guard !newOnes.isEmpty else { return }
        let merged = (newOnes + d.expenses).sorted { lhs, rhs in
            let ld = String(lhs.date.prefix(10))
            let rd = String(rhs.date.prefix(10))
            if ld != rd { return ld > rd }
            return (lhs.createdAt ?? "") > (rhs.createdAt ?? "")
        }
        dashboard = DashboardResponse(
            categories: d.categories,
            settings: d.settings,
            budgets: d.budgets,
            expenses: merged,
            prevExpenses: d.prevExpenses,
            receiptsCount: d.receiptsCount,
            monthIncome: d.monthIncome,
            savingsTarget: d.savingsTarget,
            prevTotal: d.prevTotal,
            prevByCategory: d.prevByCategory
        )
    }

    func upsertReceiptOptimistic(_ receipt: Receipt) {
        if let idx = receipts.firstIndex(where: { $0.id == receipt.id }) {
            receipts[idx] = receipt
        } else {
            receipts.insert(receipt, at: 0)
        }
    }

    /// Drop a receipt locally so the receipts list updates instantly when
    /// the user deletes from detail. Mirrors `removeExpensesOptimistic`.
    func removeReceiptOptimistic(id: String) {
        receipts.removeAll { $0.id == id }
    }

    /// Re-insert a removed receipt at the original position (or at the top
    /// if no position is provided). Used by undo flows after a swipe-delete.
    func restoreReceiptOptimistic(_ receipt: Receipt, at index: Int? = nil) {
        guard !receipts.contains(where: { $0.id == receipt.id }) else { return }
        if let idx = index, idx >= 0, idx <= receipts.count {
            receipts.insert(receipt, at: idx)
        } else {
            receipts.insert(receipt, at: 0)
        }
    }

    // MARK: - Invalidation

    func invalidateDashboard() { dashboardLoadedAt = nil }
    func invalidateReceipts() { receiptsLoadedAt = nil }
    func invalidateGoals() { goalsLoadedAt = nil }
    func invalidateLoyalty() { loyaltyLoadedAt = nil }
    func invalidateChallenges() { challengesLoadedAt = nil }
    func invalidateGroups() { groupsLoadedAt = nil }
    func invalidateBudget() { budgetLoadedAt = nil }
    func invalidateFinancialHealth() { financialHealthLoadedAt = nil }
    func invalidatePromotions() { promotionsLoadedAt = nil }

    /// After a budget upsert. Refresh budget + financial-health (the score
    /// depends on budget settings) immediately.
    func didMutateBudget() {
        invalidateBudget()
        invalidateFinancialHealth()
        ensureBudget(force: true)
        ensureFinancialHealth(force: true)
    }

    /// Wipe everything (used on sign-out).
    func resetAll() {
        dashboardTask?.cancel()
        receiptsTask?.cancel()
        goalsTask?.cancel()
        loyaltyTask?.cancel()
        challengesTask?.cancel()
        groupsTask?.cancel()
        budgetTask?.cancel()
        financialHealthTask?.cancel()
        promotionsTask?.cancel()
        // Bump every gen so any in-flight responses are dropped.
        dashboardGen &+= 1
        receiptsGen &+= 1
        goalsGen &+= 1
        loyaltyGen &+= 1
        challengesGen &+= 1
        groupsGen &+= 1
        budgetGen &+= 1
        financialHealthGen &+= 1
        promotionsGen &+= 1
        dashboard = nil; dashboardLoadedAt = nil; dashboardLoading = false; dashboardError = nil
        receipts = []; receiptsLoadedAt = nil; receiptsLoading = false; receiptsError = nil
        goals = []; goalsLoadedAt = nil; goalsLoading = false; goalsError = nil
        loyalty = []; loyaltyLoadedAt = nil; loyaltyLoading = false; loyaltyError = nil
        challenges = []; challengesLoadedAt = nil; challengesLoading = false; challengesError = nil
        groups = []; groupsLoadedAt = nil; groupsLoading = false; groupsError = nil
        budget = nil; budgetLoadedAt = nil; budgetLoading = false; budgetError = nil
        financialHealth = nil; financialHealthLoadedAt = nil; financialHealthLoading = false; financialHealthError = nil
        promotions = nil; promotionsLoadedAt = nil; promotionsLoading = false; promotionsError = nil
    }
}
