import Foundation
import UserNotifications

/// Tyle z `UNUserNotificationCenter`, ile potrzebują przypomnienia.
protocol ReminderCenter: Sendable {
    func requestAuthorization() async -> Bool
    func isAuthorized() async -> Bool
    func pendingIdentifiers() async -> [String]
    func add(identifier: String, title: String, body: String, date: DateComponents) async
    func remove(identifiers: [String]) async
    func removeDelivered(prefix: String) async
}

struct SystemReminderCenter: ReminderCenter {
    private var center: UNUserNotificationCenter { .current() }

    func requestAuthorization() async -> Bool {
        (try? await center.requestAuthorization(options: [.alert, .sound])) ?? false
    }

    func isAuthorized() async -> Bool {
        let status = await center.notificationSettings().authorizationStatus
        return status == .authorized || status == .provisional || status == .ephemeral
    }

    func pendingIdentifiers() async -> [String] {
        await center.pendingNotificationRequests().map(\.identifier)
    }

    func add(identifier: String, title: String, body: String, date: DateComponents) async {
        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        content.sound = .default
        let trigger = UNCalendarNotificationTrigger(dateMatching: date, repeats: false)
        do {
            try await center.add(UNNotificationRequest(identifier: identifier, content: content, trigger: trigger))
        } catch {
            Log.error(.store, "nie udało się zaplanować przypomnienia", error)
        }
    }

    func remove(identifiers: [String]) async {
        center.removePendingNotificationRequests(withIdentifiers: identifiers)
    }

    func removeDelivered(prefix: String) async {
        let ids = await center.deliveredNotifications().map(\.request.identifier).filter { $0.hasPrefix(prefix) }
        center.removeDeliveredNotifications(withIdentifiers: ids)
    }
}

/// Przypomnienia o terminach. Domyślnie wyłączone, ustawienie osobne dla
/// każdego konta; o zgodę iOS pytamy dopiero po włączeniu przełącznika.
@MainActor
final class ObligationReminders: ObservableObject {
    @Published private(set) var enabled = false
    /// Przełącznik włączony, ale iOS nie pozwala wysyłać powiadomień.
    @Published private(set) var blocked = false

    var locale: AppLocale?

    private let center: ReminderCenter
    private let defaults: UserDefaults
    private let now: () -> Date
    private var account: String?
    /// `nil` = w tym procesie terminy jeszcze nie przyszły. Planowanie z niczego
    /// skasowałoby przypomnienia zaplanowane przed restartem.
    private var obligations: [AccountingObligation]?
    private var generation = 0
    private var work: Task<Void, Never>?

    init(
        center: ReminderCenter = SystemReminderCenter(),
        defaults: UserDefaults = .standard,
        now: @escaping () -> Date = Date.init
    ) {
        self.center = center
        self.defaults = defaults
        self.now = now
    }

    private func key(_ account: String) -> String { "solvio.obligationReminders.\(account)" }
    /// Czyje przypomnienia są zaplanowane w systemie.
    private let ownerKey = "solvio.obligationReminders.owner"

    /// Zmiana konta zawsze zaczyna się od zdjęcia cudzych przypomnień. Zwykły
    /// start apki na to samo konto ich nie rusza — przeplanuje je pierwsze
    /// odświeżenie terminów.
    func setAccount(_ email: String?) {
        guard email != account || email == nil else { return }
        account = email
        obligations = nil
        blocked = false
        enabled = email.map { defaults.bool(forKey: key($0)) } ?? false
        if !enabled || defaults.string(forKey: ownerKey) != email { clear() }
    }

    func setEnabled(_ on: Bool) async {
        guard let account else { return }
        if on {
            let granted = await center.requestAuthorization()
            guard account == self.account else { return }
            blocked = !granted
            enabled = granted
            defaults.set(granted, forKey: key(account))
            if granted { schedule() }
        } else {
            enabled = false
            blocked = false
            defaults.set(false, forKey: key(account))
            // Terminy zostają w pamięci, żeby ponowne włączenie zadziałało od razu.
            cancelAll()
        }
    }

    /// Zgodę można cofnąć w ustawieniach iOS, kiedy apka tego nie widzi.
    func checkAuthorization() async {
        guard enabled else { return }
        blocked = !(await center.isAuthorized())
    }

    func update(_ obligations: [AccountingObligation]) {
        self.obligations = obligations
        schedule()
    }

    /// Po zmianie języka treść ma być w nowym języku.
    func reschedule() { schedule() }

    func clear() {
        obligations = nil
        cancelAll()
    }

    private func cancelAll() {
        defaults.removeObject(forKey: ownerKey)
        replace(with: [], removeDelivered: true)
    }

    /// Dla testów: poczekaj, aż kolejka zmian się opróżni.
    func settle() async { await work?.value }

    private func schedule() {
        guard enabled, let account, let obligations else { return }
        defaults.set(account, forKey: ownerKey)
        replace(with: ReminderPlan.build(obligations, now: now()), removeDelivered: false)
    }

    /// Zmiany idą jedna po drugiej, a nowsza unieważnia starszą — inaczej
    /// planowanie w locie dołożyłoby przypomnienia po wylogowaniu.
    private func replace(with plan: [ReminderPlan.Item], removeDelivered: Bool) {
        generation += 1
        let mine = generation
        let previous = work
        let texts = plan.map(text)
        work = Task { [center] in
            await previous?.value
            let stale = await center.pendingIdentifiers().filter { $0.hasPrefix(ReminderPlan.identifierPrefix) }
            await center.remove(identifiers: stale)
            if removeDelivered { await center.removeDelivered(prefix: ReminderPlan.identifierPrefix) }
            for (item, text) in zip(plan, texts) {
                guard mine == generation else { return }
                let date = Calendar.current.dateComponents([.year, .month, .day, .hour, .minute], from: item.fireDate)
                await center.add(identifier: item.identifier, title: text.title, body: text.body, date: date)
            }
        }
    }

    private func text(_ item: ReminderPlan.Item) -> (title: String, body: String) {
        let t = { (key: String) in self.locale?.t(key) ?? key }
        let title = t(item.daysBefore == 0 ? "company.reminder.today" : "company.reminder.soon")
        let body = [item.kindLabel, item.entityName, Fmt.dayMonth(item.dueDate)]
            .filter { !$0.isEmpty }
            .joined(separator: " · ")
        return (title, body)
    }
}
