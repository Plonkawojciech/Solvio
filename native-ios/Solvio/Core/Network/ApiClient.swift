import Foundation

enum ApiError: Error, LocalizedError {
    case invalidURL
    case transport(Error)
    case decoding(Error)
    case unauthorized
    case forbidden
    case notFound
    case rateLimited
    case timeout
    case noConnection
    case server(status: Int, message: String?)
    case unknown

    var errorDescription: String? {
        switch self {
        case .invalidURL: return "Invalid URL"
        case .transport(let e): return e.localizedDescription
        case .decoding(let e):
            #if DEBUG
            return "Decode error: \(e)"
            #else
            return "Server returned unexpected data"
            #endif
        case .unauthorized: return "Session expired — log in again"
        case .forbidden: return "No access to this resource"
        case .notFound: return "Not found"
        case .rateLimited: return "Too many requests — wait a moment"
        case .timeout: return "Request timed out — check your connection"
        case .noConnection: return "No internet connection"
        case .server(let status, let msg):
            if let msg, !msg.isEmpty { return msg }
            return "Server error (\(status))"
        case .unknown: return "Unknown error"
        }
    }

    /// Whether the user can retry and potentially succeed.
    var isRetryable: Bool {
        switch self {
        case .timeout, .noConnection, .rateLimited, .server(500..., _): return true
        default: return false
        }
    }
}

/// Lightweight URLSession wrapper that handles Solvio's cookie-based
/// session automatically. Cookies set by `/api/auth/session` are
/// persisted by `HTTPCookieStorage.shared` and resent on every call,
/// matching the `credentials: 'include'` behavior of the web app.
final class ApiClient {
    static let shared = ApiClient()

    private let decoder: JSONDecoder = {
        let d = JSONDecoder()
        // Backend returns dates as ISO8601 strings in several places but
        // plain YYYY-MM-DD in others — we decode dates as plain String
        // and use `Fmt` on the UI side, so leave the default strategy.
        return d
    }()

    private let encoder: JSONEncoder = {
        let e = JSONEncoder()
        e.dateEncodingStrategy = .iso8601
        return e
    }()

    private let session: URLSession

    private init() {
        let config = URLSessionConfiguration.default
        config.httpCookieStorage = HTTPCookieStorage.shared
        config.httpCookieAcceptPolicy = .always
        config.httpShouldSetCookies = true
        config.timeoutIntervalForRequest = AppConfig.requestTimeout
        config.timeoutIntervalForResource = AppConfig.longRequestTimeout
        config.requestCachePolicy = .reloadIgnoringLocalCacheData
        self.session = URLSession(configuration: config)
    }

    // MARK: - Public helpers

    func get<T: Decodable>(_ path: String, query: [URLQueryItem] = []) async throws -> T {
        try await request(path: path, method: "GET", query: query, body: Optional<Empty>.none)
    }

    func post<B: Encodable, T: Decodable>(_ path: String, body: B) async throws -> T {
        try await request(path: path, method: "POST", body: body)
    }

    func postVoid<B: Encodable>(_ path: String, body: B) async throws {
        let _: EmptyResponse = try await request(path: path, method: "POST", body: body)
    }

    func postEmpty<T: Decodable>(_ path: String) async throws -> T {
        try await request(path: path, method: "POST", body: Optional<Empty>.none)
    }

    func postEmptyVoid(_ path: String) async throws {
        let _: EmptyResponse = try await request(path: path, method: "POST", body: Optional<Empty>.none)
    }

    func put<B: Encodable, T: Decodable>(_ path: String, body: B) async throws -> T {
        try await request(path: path, method: "PUT", body: body)
    }

    func putVoid<B: Encodable>(_ path: String, body: B) async throws {
        let _: EmptyResponse = try await request(path: path, method: "PUT", body: body)
    }

    func patch<B: Encodable, T: Decodable>(_ path: String, body: B) async throws -> T {
        try await request(path: path, method: "PATCH", body: body)
    }

    func patchVoid<B: Encodable>(_ path: String, body: B) async throws {
        let _: EmptyResponse = try await request(path: path, method: "PATCH", body: body)
    }

    func delete<B: Encodable, T: Decodable>(_ path: String, body: B) async throws -> T {
        try await request(path: path, method: "DELETE", body: body)
    }

    func deleteVoid(_ path: String) async throws {
        let _: EmptyResponse = try await request(path: path, method: "DELETE", body: Optional<Empty>.none)
    }

    func deleteVoid<B: Encodable>(_ path: String, body: B) async throws {
        let _: EmptyResponse = try await request(path: path, method: "DELETE", body: body)
    }

    /// Download raw bytes (used for generated reports, e-receipts).
    func download(_ path: String, query: [URLQueryItem] = []) async throws -> (Data, String?) {
        let url = try buildURL(path: path, query: query)
        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        applyDefaultHeaders(to: &request)
        let (data, response): (Data, URLResponse)
        do {
            (data, response) = try await session.data(for: request)
        } catch {
            throw Self.classifyTransport(error)
        }
        try validate(response, data: data)
        let filename = (response as? HTTPURLResponse)?.suggestedFilename
        return (data, filename)
    }

    /// Multipart upload (used by OCR receipt scan + HEIC convert).
    /// OCR expects the field name `"files"` (plural), not `"file"`.
    func upload<T: Decodable>(
        _ path: String,
        fileData: Data,
        filename: String,
        mimeType: String,
        fieldName: String = "file",
        extraFields: [String: String] = [:]
    ) async throws -> T {
        let url = try buildURL(path: path, query: [])
        let boundary = "----SolvioBoundary-\(UUID().uuidString)"

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        applyDefaultHeaders(to: &request)

        var body = Data()
        for (k, v) in extraFields {
            body.appendString("--\(boundary)\r\n")
            body.appendString("Content-Disposition: form-data; name=\"\(k)\"\r\n\r\n")
            body.appendString("\(v)\r\n")
        }
        body.appendString("--\(boundary)\r\n")
        body.appendString("Content-Disposition: form-data; name=\"\(fieldName)\"; filename=\"\(filename)\"\r\n")
        body.appendString("Content-Type: \(mimeType)\r\n\r\n")
        body.append(fileData)
        body.appendString("\r\n--\(boundary)--\r\n")

        request.httpBody = body
        request.timeoutInterval = AppConfig.longRequestTimeout

        let (data, response): (Data, URLResponse)
        do {
            (data, response) = try await session.data(for: request)
        } catch {
            throw Self.classifyTransport(error)
        }
        try validate(response, data: data)
        return try decode(data)
    }

    /// Text-only multipart form POST (used by `/api/reports/generate`).
    func postForm<T: Decodable>(
        _ path: String,
        fields: [String: String]
    ) async throws -> T {
        let url = try buildURL(path: path, query: [])
        let boundary = "----SolvioBoundary-\(UUID().uuidString)"

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        applyDefaultHeaders(to: &request)

        var body = Data()
        for (k, v) in fields {
            body.appendString("--\(boundary)\r\n")
            body.appendString("Content-Disposition: form-data; name=\"\(k)\"\r\n\r\n")
            body.appendString("\(v)\r\n")
        }
        body.appendString("--\(boundary)--\r\n")

        request.httpBody = body
        request.timeoutInterval = AppConfig.longRequestTimeout

        let (data, response): (Data, URLResponse)
        do {
            (data, response) = try await session.data(for: request)
        } catch {
            throw Self.classifyTransport(error)
        }
        try validate(response, data: data)
        return try decode(data)
    }

    func clearCookies() {
        if let cookies = HTTPCookieStorage.shared.cookies {
            for cookie in cookies { HTTPCookieStorage.shared.deleteCookie(cookie) }
        }
    }

    // MARK: - Private

    private func request<B: Encodable, T: Decodable>(
        path: String,
        method: String,
        query: [URLQueryItem] = [],
        body: B?
    ) async throws -> T {
        let url = try buildURL(path: path, query: query)
        var request = URLRequest(url: url)
        request.httpMethod = method
        applyDefaultHeaders(to: &request)
        if let body = body, !(body is Empty) {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try encoder.encode(body)
        }

        let (data, response): (Data, URLResponse)
        do {
            (data, response) = try await session.data(for: request)
        } catch {
            throw Self.classifyTransport(error)
        }
        try validate(response, data: data)
        return try decode(data)
    }

    /// Map URLSession transport errors to user-friendly ApiError cases.
    static func classifyTransport(_ error: Error) -> ApiError {
        let nsError = error as NSError
        switch nsError.code {
        case NSURLErrorTimedOut:
            return .timeout
        case NSURLErrorNotConnectedToInternet,
             NSURLErrorNetworkConnectionLost,
             NSURLErrorDataNotAllowed:
            return .noConnection
        case NSURLErrorCannotFindHost,
             NSURLErrorCannotConnectToHost,
             NSURLErrorDNSLookupFailed:
            return .noConnection
        default:
            return .transport(error)
        }
    }

    private func buildURL(path: String, query: [URLQueryItem]) throws -> URL {
        guard var components = URLComponents(url: AppConfig.apiBaseURL.appendingPathComponent(path), resolvingAgainstBaseURL: false) else {
            throw ApiError.invalidURL
        }
        if !query.isEmpty {
            components.queryItems = query
        }
        guard let url = components.url else { throw ApiError.invalidURL }
        return url
    }

    private func applyDefaultHeaders(to request: inout URLRequest) {
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("Solvio-iOS/\(AppConfig.appVersion)", forHTTPHeaderField: "User-Agent")
        if let lang = Locale.preferredLanguages.first {
            request.setValue(String(lang.prefix(2)), forHTTPHeaderField: "Accept-Language")
        }
    }

    private func validate(_ response: URLResponse, data: Data? = nil) throws {
        guard let http = response as? HTTPURLResponse else { throw ApiError.unknown }
        guard !(200..<300).contains(http.statusCode) else { return }
        let msg = errorMessage(from: data)
        #if DEBUG
        let url = http.url?.absoluteString ?? "?"
        let preview = data.flatMap { String(data: $0, encoding: .utf8)?.prefix(300) } ?? ""
        print("[ApiClient] HTTP \(http.statusCode) \(url)\n  message: \(msg ?? "nil")\n  body: \(preview)")
        #endif
        switch http.statusCode {
        case 401: throw ApiError.unauthorized
        case 403: throw ApiError.forbidden
        case 404: throw ApiError.notFound
        case 429: throw ApiError.rateLimited
        default: throw ApiError.server(status: http.statusCode, message: msg)
        }
    }

    /// Parse backend `{ error: "..." }` / `{ message: "..." }` body for surfacing to the user.
    private func errorMessage(from data: Data?) -> String? {
        guard let data, !data.isEmpty else { return nil }
        struct Err: Decodable {
            let error: String?
            let message: String?
        }
        if let err = try? JSONDecoder().decode(Err.self, from: data) {
            if let e = err.error, !e.isEmpty { return e }
            if let m = err.message, !m.isEmpty { return m }
        }
        if let raw = String(data: data, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines), !raw.isEmpty {
            return String(raw.prefix(200))
        }
        return nil
    }

    private func decode<T: Decodable>(_ data: Data) throws -> T {
        if T.self == EmptyResponse.self, let empty = EmptyResponse() as? T {
            return empty
        }
        do {
            return try decoder.decode(T.self, from: data)
        } catch {
            #if DEBUG
            let preview = String(data: data, encoding: .utf8)?.prefix(500) ?? "(binary)"
            print("[ApiClient] Decode \(T.self) failed: \(error)\n  body: \(preview)")
            #endif
            throw ApiError.decoding(error)
        }
    }

    struct Empty: Encodable {}
    struct EmptyResponse: Decodable {}
}

private extension Data {
    mutating func appendString(_ s: String) {
        if let data = s.data(using: .utf8) { append(data) }
    }
}
