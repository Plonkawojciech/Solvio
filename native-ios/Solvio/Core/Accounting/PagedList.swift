import Foundation

/// Lista dociągana stronami, z pamięcią między wejściami na ekran.
///
/// Każde odświeżenie dostaje nowy znacznik; wynik starszego — albo strony
/// dociąganej do listy, która zdążyła się odświeżyć — jest odrzucany.
/// Błąd sieci nigdy nie czyści tego, co już widać.
@MainActor
final class PagedList<Item: Identifiable & Equatable>: ObservableObject where Item.ID: Hashable {
    @Published private(set) var items: [Item] = []
    @Published private(set) var loadedAt: Date?
    @Published private(set) var isLoading = false
    @Published private(set) var isLoadingMore = false
    @Published private(set) var failed = false
    @Published private(set) var loadMoreFailed = false

    private(set) var nextCursor: String?
    private let fetch: (String?) async throws -> AccountingPage<Item>
    private let onItems: ([Item]) -> Void
    private let ttl: TimeInterval = 60
    private var token = 0

    var hasMore: Bool { nextCursor != nil }

    init(
        onItems: @escaping ([Item]) -> Void = { _ in },
        fetch: @escaping (String?) async throws -> AccountingPage<Item>
    ) {
        self.fetch = fetch
        self.onItems = onItems
    }

    func ensureFresh() async {
        if let loadedAt, Date().timeIntervalSince(loadedAt) < ttl { return }
        if isLoading { return }
        await refresh()
    }

    func refresh() async {
        token += 1
        let mine = token
        isLoading = true
        isLoadingMore = false
        // Osobne zadanie: zniknięcie widoku anuluje jego `.task`, a nie ma
        // powodu, żeby anulowało też pobranie, które i tak zaraz się przyda.
        await Task {
            do {
                let page = try await fetch(nil)
                guard mine == token else { return }
                onItems(page.items)
                items = Self.merge([], page.items)
                nextCursor = page.nextCursor
                loadedAt = Date()
                failed = false
                loadMoreFailed = false
            } catch {
                guard mine == token else { return }
                // 404 też jest awarią: do list wchodzi się dopiero, gdy księgowość
                // odpowiedziała, a pusto bez błędu znaczyłoby „nic tu nie ma".
                if case ApiError.cancelled = error {
                    // Anulowanie to nie awaria.
                } else {
                    failed = true
                    Log.error(.crm, "nie udało się wczytać listy", error)
                }
            }
            if mine == token { isLoading = false }
        }.value
    }

    func loadMore() async {
        guard let cursor = nextCursor, !isLoading, !isLoadingMore else { return }
        let mine = token
        isLoadingMore = true
        await Task {
            do {
                let page = try await fetch(cursor)
                guard mine == token else { return }
                onItems(page.items)
                items = Self.merge(items, page.items)
                // Ten sam kursor drugi raz zapętliłby dociąganie w nieskończoność.
                nextCursor = page.nextCursor == cursor ? nil : page.nextCursor
                loadMoreFailed = false
            } catch {
                guard mine == token else { return }
                if case ApiError.cancelled = error {} else { loadMoreFailed = true }
            }
            if mine == token { isLoadingMore = false }
        }.value
    }

    func replace(_ item: Item) {
        guard let index = items.firstIndex(where: { $0.id == item.id }) else { return }
        items[index] = item
    }

    /// Wynik żądania w locie nie ma już dokąd wrócić.
    func invalidate() {
        token += 1
        items = []
        nextCursor = nil
        loadedAt = nil
        isLoading = false
        isLoadingMore = false
        failed = false
        loadMoreFailed = false
    }

    /// Dokleja stronę bez duplikatów: dokument dodany w trakcie przewijania
    /// przesuwa strony i ten sam wiersz potrafi przyjść dwa razy.
    static func merge(_ current: [Item], _ page: [Item]) -> [Item] {
        var seen = Set(current.map(\.id))
        return current + page.filter { seen.insert($0.id).inserted }
    }
}
