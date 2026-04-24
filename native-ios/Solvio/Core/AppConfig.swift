import Foundation

/// Runtime config loaded from `Config.plist` if present, else
/// falls back to the production Vercel URL. Keeps the production
/// URL out of git unless explicitly overridden for local dev.
enum AppConfig {
    /// Base URL of the Solvio Next.js API/app (no trailing slash).
    static let apiBaseURL: URL = {
        if let plist = Bundle.main.url(forResource: "Config", withExtension: "plist"),
           let data = try? Data(contentsOf: plist),
           let dict = try? PropertyListSerialization.propertyList(from: data, format: nil) as? [String: Any],
           let raw = dict["ApiBaseURL"] as? String,
           let url = URL(string: raw) {
            return url
        }
        return URL(string: "https://solvio-lac.vercel.app")!
    }()

    /// Session cookie name — must match `lib/session.ts` in the web app.
    static let sessionCookieName = "solvio_session"

    /// Default request timeout.
    static let requestTimeout: TimeInterval = 30

    /// Long-running request timeout (OCR, AI analysis, reports).
    static let longRequestTimeout: TimeInterval = 120

    /// Current app version for `User-Agent` header.
    static let appVersion: String = {
        let v = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0.0"
        let b = Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "1"
        return "\(v) (\(b))"
    }()
}
