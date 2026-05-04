package com.programo.solvio.core.session

import android.content.Context
import android.content.SharedPreferences
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.programo.solvio.core.locale.AppLocale
import com.programo.solvio.core.locale.Lang
import com.programo.solvio.core.network.ApiClient
import com.programo.solvio.core.network.ApiError
import com.programo.solvio.core.model.SessionLoginResponse
import com.programo.solvio.core.model.SessionMe
import com.programo.solvio.core.model.DemoLoginResponse
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

/**
 * Mirror of iOS [SessionStore]. Holds the authenticated user's email +
 * userId in Compose state. Cookies live in [PersistentCookieJar] so the
 * `solvio_session` cookie is auto-replayed on every API call.
 */
class SessionStore(context: Context) {
    @Serializable
    data class CurrentUser(val email: String, val userId: String? = null)

    private val prefs: SharedPreferences =
        context.applicationContext.getSharedPreferences("solvio.prefs", Context.MODE_PRIVATE)
    private val json = Json { ignoreUnknownKeys = true; explicitNulls = false }

    var currentUser by mutableStateOf<CurrentUser?>(null)
        private set
    var isRestoring by mutableStateOf(true)
        private set

    val isAuthenticated: Boolean get() = currentUser != null

    suspend fun restore() {
        try {
            loadCachedUser()?.let { currentUser = it }
            refresh()
        } finally {
            isRestoring = false
        }
    }

    suspend fun refresh() {
        try {
            val me: SessionMe = ApiClient.get("/api/auth/session/me")
            val email = me.email
            if (!email.isNullOrEmpty()) {
                val user = CurrentUser(email = email, userId = currentUser?.userId)
                currentUser = user
                saveCachedUser(user)
            } else {
                currentUser = null
                clearCachedUser()
            }
        } catch (e: ApiError.Unauthorized) {
            currentUser = null
            clearCachedUser()
        } catch (_: Throwable) {
            // Keep cache on flaky connections
        }
    }

    fun handleUnauthorized() {
        currentUser = null
        clearCachedUser()
        ApiClient.clearCookies()
    }

    @Serializable
    private data class LoginBody(val email: String, val lang: String)

    suspend fun login(email: String) {
        val trimmed = email.trim().lowercase()
        val lang = (prefs.getString("solvio.language", null) ?: "pl")
        val response: SessionLoginResponse = ApiClient.post(
            "/api/auth/session",
            LoginBody(trimmed, lang),
        )
        val user = CurrentUser(trimmed, response.userId)
        currentUser = user
        saveCachedUser(user)
    }

    suspend fun loginDemo() {
        val response: DemoLoginResponse = ApiClient.postEmpty("/api/auth/demo")
        if (!response.success) throw ApiError.Unknown
        val me: SessionMe = ApiClient.get("/api/auth/session/me")
        val email = me.email ?: "demo@solvio.app"
        val user = CurrentUser(email = email, userId = null)
        currentUser = user
        saveCachedUser(user)
    }

    suspend fun logout() {
        runCatching { ApiClient.deleteVoid("/api/auth/session") }
        currentUser = null
        clearCachedUser()
        ApiClient.clearCookies()
    }

    private fun saveCachedUser(user: CurrentUser) {
        val raw = json.encodeToString(CurrentUser.serializer(), user)
        prefs.edit().putString(KEY, raw).apply()
    }

    private fun loadCachedUser(): CurrentUser? {
        val raw = prefs.getString(KEY, null) ?: return null
        return runCatching { json.decodeFromString(CurrentUser.serializer(), raw) }.getOrNull()
    }

    private fun clearCachedUser() {
        prefs.edit().remove(KEY).apply()
    }

    companion object {
        private const val KEY = "solvio.session.user"
    }
}

val LocalSessionStore = compositionLocalOf<SessionStore> { error("SessionStore not provided") }
