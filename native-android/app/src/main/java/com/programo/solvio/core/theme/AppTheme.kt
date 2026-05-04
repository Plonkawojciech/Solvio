package com.programo.solvio.core.theme

import android.content.Context
import android.content.SharedPreferences
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue

/**
 * Mirror of iOS [AppTheme]. Persists user-selected color scheme. Wraps
 * Compose state so Composables that read `mode` recompose on change.
 */
class AppThemeStore(context: Context) {
    private val prefs: SharedPreferences =
        context.applicationContext.getSharedPreferences("solvio.prefs", Context.MODE_PRIVATE)

    var mode by mutableStateOf(load())
        private set

    fun setMode(next: AppThemeMode) {
        if (mode == next) return
        mode = next
        prefs.edit().putString(KEY, next.name).apply()
    }

    fun cycle() {
        setMode(
            when (mode) {
                AppThemeMode.System -> AppThemeMode.Light
                AppThemeMode.Light -> AppThemeMode.Dark
                AppThemeMode.Dark -> AppThemeMode.System
                AppThemeMode.Evening -> AppThemeMode.System
            }
        )
    }

    private fun load(): AppThemeMode {
        val raw = prefs.getString(KEY, null) ?: return AppThemeMode.System
        return runCatching { AppThemeMode.valueOf(raw) }.getOrDefault(AppThemeMode.System)
    }

    companion object {
        private const val KEY = "solvio.theme"
    }
}

val LocalAppThemeStore = compositionLocalOf<AppThemeStore> { error("AppThemeStore not provided") }
