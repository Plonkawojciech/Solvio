import Foundation

/// Dla którego podmiotu powstaje nowy dokument.
enum EntityChoice: Equatable {
    case entity(String)
    case ask

    /// Filtr listy albo jedyny podmiot rozstrzyga sam; inaczej pytamy.
    static func resolve(filter: String?, entities: [AccountingEntity]) -> EntityChoice {
        if let filter, entities.contains(where: { $0.key == filter }) { return .entity(filter) }
        if entities.count == 1 { return .entity(entities[0].key) }
        return .ask
    }

    /// Ostatnio wybrany na górze, reszta w kolejności CRM-a.
    static func ordered(_ entities: [AccountingEntity], last: String?) -> [AccountingEntity] {
        entities.filter { $0.key == last } + entities.filter { $0.key != last }
    }
}

/// Ostatnio wybrany podmiot, osobno dla każdego konta.
struct LastEntity {
    var defaults: UserDefaults = .standard

    func get(_ account: String?) -> String? {
        account.flatMap { defaults.string(forKey: key($0)) }
    }

    func set(_ entity: String, account: String?) {
        if let account { defaults.set(entity, forKey: key(account)) }
    }

    private func key(_ account: String) -> String { "solvio.lastEntity.\(account)" }
}
