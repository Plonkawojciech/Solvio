import Foundation

/// Mirror of `lib/format.ts` — identical semantics so the
/// iOS app prints the same strings as the PWA.
enum Fmt {
    // MARK: - Cached formatters

    private static let currencyFormatters = NSCache<NSString, NumberFormatter>()

    private static func currencyFormatter(for code: String) -> NumberFormatter {
        let key = code as NSString
        if let cached = currencyFormatters.object(forKey: key) { return cached }
        let f = NumberFormatter()
        f.numberStyle = .currency
        f.currencyCode = code
        f.maximumFractionDigits = 2
        f.minimumFractionDigits = 2
        currencyFormatters.setObject(f, forKey: key)
        return f
    }

    private static let iso8601Full: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()

    private static let iso8601Basic: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        return f
    }()

    private static let yyyyMMdd: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    private static let mediumDate: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale.current
        f.dateStyle = .medium
        return f
    }()

    private static let dayMonthFmt: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale.current
        f.setLocalizedDateFormatFromTemplate("dMMM")
        return f
    }()

    private static let dayMonthShortFmt: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale.current
        f.setLocalizedDateFormatFromTemplate("dM")
        return f
    }()

    // MARK: - Amount

    static func amount(_ value: Double, currency: String = "PLN") -> String {
        let f = currencyFormatter(for: currency)
        return f.string(from: NSNumber(value: value)) ?? String(format: "%.2f %@", value, currency)
    }

    static func amount(_ money: MoneyString, currency: String = "PLN") -> String {
        money.formatted(currency: currency)
    }

    static func amount(_ money: MoneyString?, currency: String = "PLN") -> String {
        guard let money else { return amount(0, currency: currency) }
        return money.formatted(currency: currency)
    }

    static func amount(_ string: String?, currency: String = "PLN") -> String {
        guard let s = string, let d = Double(s) else { return amount(0, currency: currency) }
        return amount(d, currency: currency)
    }

    // MARK: - Date

    static func parseISO(_ iso: String) -> Date? {
        iso8601Full.date(from: iso)
        ?? iso8601Basic.date(from: iso)
        ?? yyyyMMdd.date(from: String(iso.prefix(10)))
    }

    static func date(_ iso: String?) -> String {
        guard let iso, let date = parseISO(iso) else { return iso ?? "—" }
        return mediumDate.string(from: date)
    }

    static func dayMonth(_ iso: String?) -> String {
        guard let iso, let date = yyyyMMdd.date(from: String(iso.prefix(10))) else { return iso ?? "—" }
        return dayMonthFmt.string(from: date)
    }

    static func dayMonthShort(_ date: Date) -> String {
        dayMonthShortFmt.string(from: date)
    }

    static func initials(_ name: String) -> String {
        name.split(separator: " ")
            .prefix(2)
            .compactMap { $0.first.map(String.init) }
            .joined()
            .uppercased()
    }
}
