package com.programo.solvio.core

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

private val Context.themeStore by preferencesDataStore("solvio_theme")
private val THEME_KEY = stringPreferencesKey("solvio.theme")

/// User-selected color scheme — mirrors iOS `AppTheme.Mode`. Persists
/// the choice to DataStore so the next launch boots straight into the
/// chosen palette without flashing the system default.
class AppTheme(private val context: Context) {
    enum class Mode { System, Light, Dark, Evening }

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private val _mode = MutableStateFlow(Mode.System)
    val mode: StateFlow<Mode> = _mode

    init {
        scope.launch {
            val raw = context.themeStore.data.first()[THEME_KEY] ?: Mode.System.name
            _mode.value = runCatching { Mode.valueOf(raw) }.getOrDefault(Mode.System)
        }
    }

    fun set(mode: Mode) {
        _mode.value = mode
        scope.launch {
            context.themeStore.edit { it[THEME_KEY] = mode.name }
        }
    }
}
