import Foundation
import os

/// Jeden logger na całą apkę, spójny format: `[Obszar] komunikat`.
///
/// Idzie przez `os.Logger`, nie `print`, więc wpisy widać w Console.app także
/// w buildzie release i na urządzeniu z TestFlighta. `print` w `#if DEBUG`
/// znikał dokładnie tam, gdzie logi są najbardziej potrzebne — u Wojtka na
/// telefonie, kiedy skan paragonu się wywalił.
///
/// Poziom `error` i `warn` jest zawsze zapisywany; `debug` tylko w DEBUG,
/// żeby nie zaśmiecać logu urządzenia szczegółami z każdego przewinięcia listy.
enum Log {
    private static let subsystem = Bundle.main.bundleIdentifier ?? "com.programo.solvio"

    enum Area: String {
        case scan = "Scan"
        case api = "API"
        case session = "Session"
        case store = "Store"
        case crm = "CRM"
        case ui = "UI"
    }

    private static func logger(_ area: Area) -> Logger {
        Logger(subsystem: subsystem, category: area.rawValue)
    }

    static func debug(_ area: Area, _ message: String) {
        #if DEBUG
        logger(area).debug("[\(area.rawValue, privacy: .public)] \(message, privacy: .public)")
        #endif
    }

    static func info(_ area: Area, _ message: String) {
        logger(area).info("[\(area.rawValue, privacy: .public)] \(message, privacy: .public)")
    }

    static func warn(_ area: Area, _ message: String) {
        logger(area).warning("[\(area.rawValue, privacy: .public)] \(message, privacy: .public)")
    }

    /// Błąd wraz z jego przyczyną. `error` jest osobnym argumentem, żeby
    /// wywołujący nie musiał pamiętać o `String(describing:)` i żeby wszystkie
    /// wpisy błędów wyglądały tak samo.
    static func error(_ area: Area, _ message: String, _ error: Error? = nil) {
        let suffix = error.map { " — \(String(describing: $0))" } ?? ""
        logger(area).error("[\(area.rawValue, privacy: .public)] \(message, privacy: .public)\(suffix, privacy: .public)")
    }
}
