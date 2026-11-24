import Foundation

/// Liczenie terminów — czyste funkcje, bez stanu i sieci.
///
/// Dni do terminu liczymy z daty, a nie z `daysLeft` z serwera: apka potrafi
/// stać w tle całą noc i wczorajsze „zostały 2 dni" byłoby już nieprawdą.
enum ObligationSchedule {
    static let windowDays = 30

    static func day(_ iso: String, calendar: Calendar = .current) -> Date? {
        let parts = iso.prefix(10).split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3 else { return nil }
        var gregorian = Calendar(identifier: .gregorian)
        gregorian.timeZone = calendar.timeZone
        let comps = DateComponents(year: parts[0], month: parts[1], day: parts[2])
        guard comps.isValidDate(in: gregorian) else { return nil }
        return gregorian.date(from: comps)
    }

    static func daysLeft(_ obligation: AccountingObligation, now: Date = Date(), calendar: Calendar = .current) -> Int? {
        guard let due = day(obligation.dueDate, calendar: calendar) else { return obligation.daysLeft }
        return calendar.dateComponents([.day], from: calendar.startOfDay(for: now), to: calendar.startOfDay(for: due)).day
    }

    /// Otwarte po terminie (bez dolnej granicy) i w najbliższych 30 dniach.
    static func due(_ obligations: [AccountingObligation], now: Date = Date(), calendar: Calendar = .current) -> [AccountingObligation] {
        sorted(obligations.filter { item in
            guard item.isOpen, let days = daysLeft(item, now: now, calendar: calendar) else { return false }
            return days <= windowDays
        })
    }

    static func overdue(_ obligations: [AccountingObligation], now: Date = Date(), calendar: Calendar = .current) -> [AccountingObligation] {
        obligations.filter { $0.isOpen && (daysLeft($0, now: now, calendar: calendar) ?? 0) < 0 }
    }

    static func sorted(_ obligations: [AccountingObligation]) -> [AccountingObligation] {
        obligations.sorted { ($0.dueDate, $0.entityKey, $0.id) < ($1.dueDate, $1.entityKey, $1.id) }
    }

    struct Total: Equatable {
        let amount: Double
        /// Ile płatności nie ma podanej kwoty — suma ich nie obejmuje i ekran
        /// musi to powiedzieć. Zadania (JPK) nie są płatnościami.
        let missing: Int
    }

    static func total(_ obligations: [AccountingObligation]) -> Total {
        Total(
            amount: obligations.reduce(0.0) { $0 + ($1.amountDue ?? 0) },
            missing: obligations.filter { $0.amount == nil && !$0.isTask }.count
        )
    }
}

/// Plan lokalnych przypomnień: 3 dni przed terminem i w jego dniu, o 9:00.
/// Świadomie bez kwot — treść powiadomienia widać na zablokowanym ekranie.
enum ReminderPlan {
    static let limit = 40
    static let offsets = [3, 0]
    static let hour = 9
    static let identifierPrefix = "solvio.obligation."

    struct Item: Equatable {
        let identifier: String
        let obligationId: String
        let daysBefore: Int
        let fireDate: Date
        let kindLabel: String
        let entityName: String
        let dueDate: String
    }

    static func build(
        _ obligations: [AccountingObligation],
        now: Date = Date(),
        calendar: Calendar = .current
    ) -> [Item] {
        var seen = Set<String>()
        let items = obligations.filter(\.isOpen).flatMap { obligation -> [Item] in
            guard let due = ObligationSchedule.day(obligation.dueDate, calendar: calendar) else { return [] }
            return offsets.compactMap { offset in
                guard let day = calendar.date(byAdding: .day, value: -offset, to: due),
                      let fire = calendar.date(bySettingHour: hour, minute: 0, second: 0, of: day),
                      fire > now
                else { return nil }
                let identifier = "\(identifierPrefix)\(obligation.id).\(offset)"
                guard seen.insert(identifier).inserted else { return nil }
                return Item(
                    identifier: identifier, obligationId: obligation.id, daysBefore: offset, fireDate: fire,
                    kindLabel: obligation.kindLabel, entityName: obligation.entityName, dueDate: obligation.dueDate
                )
            }
        }
        return Array(items.sorted { ($0.fireDate, $0.identifier) < ($1.fireDate, $1.identifier) }.prefix(limit))
    }
}
