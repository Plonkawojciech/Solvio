import Foundation

/// Linki do weba Solvio. Serwer podaje tylko ścieżkę, host dokładamy sami —
/// `//host` albo `/\host` przeniosłyby człowieka na obcą domenę, więc
/// przechodzi wyłącznie ścieżka od pojedynczego `/`.
enum SolvioWeb {
    static func url(path: String?, base: URL = AppConfig.apiBaseURL) -> URL? {
        guard let path, path.hasPrefix("/"), !path.hasPrefix("//") else { return nil }
        let forbidden = CharacterSet.whitespacesAndNewlines
            .union(.controlCharacters)
            .union(CharacterSet(charactersIn: "\\"))
        guard path.rangeOfCharacter(from: forbidden) == nil else { return nil }
        var root = base.absoluteString
        while root.hasSuffix("/") { root.removeLast() }
        guard let url = URL(string: root + path),
              url.scheme == base.scheme, url.host == base.host, url.port == base.port
        else { return nil }
        return url
    }

    /// Ekran podmiotu na webie, np. zakładka JPK.
    static func entityPath(_ key: String, tab: String? = nil) -> String? {
        guard key.range(of: "^[A-Za-z0-9_-]{1,40}$", options: .regularExpression) != nil else { return nil }
        return "/ksiegowosc/\(key)" + (tab.map { "?tab=\($0)" } ?? "")
    }

    static let bankPath = "/finanse/bank"
}
