import Foundation

/// Solvio stores monetary amounts as `decimal(12,2)` which the API
/// serialises as a JSON string ("1234.56"). `MoneyString` wraps a
/// `Decimal` + Codable logic so we don't have to write this boilerplate
/// on every model.
struct MoneyString: Codable, Hashable, CustomStringConvertible {
    let value: Decimal

    init(_ value: Decimal) { self.value = value }
    init(_ value: Double) { self.value = Decimal(value) }
    init(_ value: Int) { self.value = Decimal(value) }

    init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if let s = try? c.decode(String.self), let d = Decimal(string: s) {
            self.value = d
        } else if let n = try? c.decode(Double.self) {
            self.value = Decimal(n)
        } else if let n = try? c.decode(Int.self) {
            self.value = Decimal(n)
        } else {
            throw DecodingError.typeMismatch(MoneyString.self, DecodingError.Context(codingPath: c.codingPath, debugDescription: "Expected decimal number or numeric string"))
        }
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        try c.encode(description)
    }

    var double: Double { NSDecimalNumber(decimal: value).doubleValue }

    var description: String {
        var d = value
        var rounded = Decimal()
        NSDecimalRound(&rounded, &d, 2, .plain)
        return NSDecimalNumber(decimal: rounded).stringValue
    }

    func formatted(currency: String) -> String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.currencyCode = currency
        formatter.maximumFractionDigits = 2
        formatter.minimumFractionDigits = 2
        return formatter.string(from: NSDecimalNumber(decimal: value)) ?? "\(description) \(currency)"
    }

    static let zero = MoneyString(Decimal.zero)
    static func + (lhs: MoneyString, rhs: MoneyString) -> MoneyString { MoneyString(lhs.value + rhs.value) }
    static func - (lhs: MoneyString, rhs: MoneyString) -> MoneyString { MoneyString(lhs.value - rhs.value) }
}
