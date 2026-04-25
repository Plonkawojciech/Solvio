import Foundation
import SwiftUI

/// Holds the authenticated user's email. The actual session cookie
/// (`solvio_session` — HMAC-signed) is managed by
/// `HTTPCookieStorage.shared` which `ApiClient` reads on every call.
///
/// Backend contracts (see `/app/api/auth/**`):
/// - `POST /api/auth/session     { email }          → { ok, userId }`
/// - `POST /api/auth/demo        { }                → { success, redirect }`
/// - `GET  /api/auth/session/me                     → { email: string|null }`
/// - `DELETE /api/auth/session                      → { ok: true }`
///
/// The backend never returns the email on login — we carry the input
/// email forward. `/session/me` returns `{ email: null }` (not 401)
/// when logged out, so treat `nil` as "unauthenticated".
@MainActor
final class SessionStore: ObservableObject {
    struct CurrentUser: Codable, Equatable {
        let email: String
        let userId: String?
    }

    @Published private(set) var currentUser: CurrentUser?
    @Published private(set) var isRestoring: Bool = true

    private let storageKey = "solvio.session.user"

    var isAuthenticated: Bool { currentUser != nil }

    func restore() async {
        defer { isRestoring = false }
        if let stored = loadCachedUser() {
            currentUser = stored
            #if DEBUG
            print("[Session] Restored cached user: \(stored.email)")
            #endif
        } else {
            #if DEBUG
            print("[Session] No cached user found")
            #endif
        }
        await refresh()
    }

    /// Verify cookie is still valid with the server.
    func refresh() async {
        do {
            let me: SessionMe = try await ApiClient.shared.get("/api/auth/session/me")
            if let email = me.email, !email.isEmpty {
                let user = CurrentUser(email: email, userId: currentUser?.userId)
                currentUser = user
                saveCachedUser(user)
                #if DEBUG
                print("[Session] Verified: \(email)")
                #endif
            } else {
                #if DEBUG
                print("[Session] Server returned null email — logging out")
                #endif
                currentUser = nil
                clearCachedUser()
            }
        } catch ApiError.unauthorized {
            #if DEBUG
            print("[Session] 401 Unauthorized — logging out")
            #endif
            currentUser = nil
            clearCachedUser()
        } catch {
            #if DEBUG
            print("[Session] Refresh failed (keeping cache): \(error)")
            #endif
            // Keep cached user on flaky connections.
        }
    }

    /// Call from any ViewModel when receiving `.unauthorized` — forces re-login.
    func handleUnauthorized() {
        currentUser = nil
        clearCachedUser()
        ApiClient.shared.clearCookies()
    }

    /// Email-only login. `/api/auth/session` returns `{ok, userId}`;
    /// the email we sent is authoritative.
    ///
    /// We also send `lang` so the backend seeds default categories in
    /// the right language on first login (iOS users bypass the web-only
    /// `(protected)/layout.tsx` that does this seed on the web).
    func login(email: String) async throws {
        struct LoginBody: Encodable { let email: String; let lang: String }
        let trimmed = email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let lang = UserDefaults.standard.string(forKey: "solvio.language") ?? "pl"
        let response: SessionLoginResponse = try await ApiClient.shared.post(
            "/api/auth/session",
            body: LoginBody(email: trimmed, lang: lang)
        )
        let user = CurrentUser(email: trimmed, userId: response.userId)
        currentUser = user
        saveCachedUser(user)
    }

    /// Demo login returns `{success, redirect}` — we then call `/me`
    /// to discover the demo email (`demo@solvio.app`).
    func loginDemo() async throws {
        let response: DemoLoginResponse = try await ApiClient.shared.postEmpty("/api/auth/demo")
        guard response.success else {
            throw ApiError.unknown
        }
        let me: SessionMe = try await ApiClient.shared.get("/api/auth/session/me")
        let email = me.email ?? "demo@solvio.app"
        let user = CurrentUser(email: email, userId: nil)
        currentUser = user
        saveCachedUser(user)
    }

    func logout() async {
        _ = try? await ApiClient.shared.deleteVoid("/api/auth/session")
        currentUser = nil
        clearCachedUser()
        ApiClient.shared.clearCookies()
    }

    // MARK: - Persistence

    private func saveCachedUser(_ user: CurrentUser) {
        if let data = try? JSONEncoder().encode(user) {
            UserDefaults.standard.set(data, forKey: storageKey)
        }
    }

    private func loadCachedUser() -> CurrentUser? {
        guard let data = UserDefaults.standard.data(forKey: storageKey),
              let user = try? JSONDecoder().decode(CurrentUser.self, from: data) else {
            return nil
        }
        return user
    }

    private func clearCachedUser() {
        UserDefaults.standard.removeObject(forKey: storageKey)
    }
}
