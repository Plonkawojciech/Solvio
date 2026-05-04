package com.programo.solvio.core.session

import com.programo.solvio.core.models.SessionMe
import com.programo.solvio.core.network.ApiClient
import com.programo.solvio.core.network.ApiError
import com.programo.solvio.core.network.AuthRepo
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

/// Holds the in-memory current user. The cookie itself is the source of
/// truth for being signed in (PersistentCookieJar) — `currentUser` is
/// just the surface API for screens to react to.
class SessionStore {
    private val _currentUser = MutableStateFlow<SessionMe?>(null)
    val currentUser: StateFlow<SessionMe?> = _currentUser

    suspend fun restore() {
        if (!ApiClient.get().hasSession()) {
            _currentUser.value = null
            return
        }
        try {
            _currentUser.value = AuthRepo.me()
        } catch (e: ApiError.Unauthorized) {
            _currentUser.value = null
            ApiClient.get().clearSession()
        } catch (_: Throwable) {
            // network error, leave whatever we had
        }
    }

    suspend fun signIn(email: String): Boolean {
        val me = AuthRepo.signIn(email)
        _currentUser.value = me
        return me.email != null
    }

    suspend fun demo(): Boolean {
        return runCatching { AuthRepo.demo() }
            .onSuccess { _currentUser.value = it }
            .isSuccess
    }

    suspend fun signOut() {
        runCatching { AuthRepo.signOut() }
        ApiClient.get().clearSession()
        _currentUser.value = null
    }
}
